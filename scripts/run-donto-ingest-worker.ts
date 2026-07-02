#!/usr/bin/env npx tsx
/**
 * Durable Donto ingest worker. It keeps long LLM/donto-agent extraction out
 * of the Next.js web process.
 */

import { spawn } from "node:child_process";
import { join } from "node:path";
import postgres from "postgres";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://toiletpaper:toiletpaper@127.0.0.1:5434/toiletpaper";
const REPO_ROOT =
  process.env.TOILETPAPER_REPO_ROOT ?? "/mnt/donto-data/workspace/toiletpaper";
const POLL_MS = intEnv("DONTO_INGEST_WORKER_POLL_MS", 5_000);

type SqlClient = ReturnType<typeof postgres>;

function intEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function run(command: string, args: string[], cwd: string) {
  return new Promise<number | null>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, NO_COLOR: "1", PAGER: "cat" },
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", resolve);
  });
}

async function leaseQueuedPaper(sql: SqlClient) {
  const rows = await sql<{ paper_id: string }[]>`
    WITH next_paper AS (
      SELECT paper_id
      FROM paper_donto_ingest
      WHERE state = 'queued'
      ORDER BY updated_at
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    SELECT paper_id
    FROM paper_donto_ingest
    WHERE paper_id IN (SELECT paper_id FROM next_paper)
  `;
  return rows[0] ?? null;
}

async function main() {
  // Touch the repo root early so a bad WorkingDirectory fails loudly.
  join(REPO_ROOT, "package.json");
  const sql = postgres(DATABASE_URL, { max: 2 });
  const [{ locked }] = await sql<{ locked: boolean }[]>`
    SELECT pg_try_advisory_lock(1976030219) AS locked
  `;
  if (!locked) {
    console.error("[donto-worker] another Donto ingest worker holds the advisory lock");
    process.exit(2);
  }

  console.log(`[donto-worker] running repo=${REPO_ROOT} pollMs=${POLL_MS}`);

  for (;;) {
    try {
      const paper = await leaseQueuedPaper(sql);
      if (!paper) {
        await sleep(POLL_MS);
        continue;
      }
      console.log(`[donto-worker] starting paper ${paper.paper_id}`);
      const code = await run(
        "/usr/bin/pnpm",
        [
          "exec",
          "tsx",
          "scripts/run-donto-ingest-job.ts",
          "--paper-id",
          paper.paper_id,
        ],
        REPO_ROOT,
      );
      console.log(`[donto-worker] paper ${paper.paper_id} exited code=${code}`);
    } catch (e) {
      console.error("[donto-worker] loop error", e);
      await sleep(POLL_MS);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
