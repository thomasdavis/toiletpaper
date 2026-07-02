#!/usr/bin/env npx tsx
/**
 * Durable Codex full-paper job worker.
 *
 * Keep this as a separate systemd service from the Next.js web service. The
 * web API can enqueue `simulation_jobs` rows, while this worker owns the
 * hour-scale Codex process. Restarting/deploying the web service then cannot
 * kill active replication work.
 */

import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://toiletpaper:toiletpaper@127.0.0.1:5434/toiletpaper";
const SIMULATOR_WORKDIR =
  process.env.SIMULATOR_WORKDIR ?? join("/tmp", "tp-simulations");
const REPO_ROOT =
  process.env.TOILETPAPER_REPO_ROOT ?? "/mnt/donto-data/workspace/toiletpaper";
const POLL_MS = intEnv("CODEX_JOB_WORKER_POLL_MS", 5_000);
const RECOVERY_GRACE_MS = intEnv("CODEX_JOB_RECOVERY_GRACE_MS", 60_000);
const WORKER_LOG_DIR =
  process.env.CODEX_JOB_WORKER_LOG_DIR ??
  join(SIMULATOR_WORKDIR, "codex-full-paper-worker");
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

async function recoverCompletedRunningJobs(sql: SqlClient) {
  const rows = await sql<{ id: string; paper_id: string }[]>`
    SELECT id, paper_id
    FROM simulation_jobs
    WHERE scope = 'full_codex_paper'
      AND state = 'running'
      AND finished_at IS NULL
    ORDER BY started_at NULLS LAST, created_at
    LIMIT 10
  `;

  for (const row of rows) {
    const workdir = join(
      SIMULATOR_WORKDIR,
      "codex-full-paper",
      row.paper_id,
      row.id,
    );
    const resultsPath = join(workdir, "results.json");
    if (!existsSync(resultsPath)) continue;
    const ageMs = Date.now() - statSync(resultsPath).mtimeMs;
    if (ageMs < RECOVERY_GRACE_MS) continue;
    console.log(
      `[worker] recovering completed running job ${row.id} from ${resultsPath}`,
    );
    await run(
      "/usr/bin/pnpm",
      ["exec", "tsx", "scripts/ingest-codex-results.ts", "--job-id", row.id],
      REPO_ROOT,
    );
  }
}

async function leaseQueuedJob(sql: SqlClient) {
  const rows = await sql<{ id: string; paper_id: string }[]>`
    WITH next_job AS (
      SELECT id
      FROM simulation_jobs
      WHERE scope = 'full_codex_paper'
        AND state = 'queued'
      ORDER BY created_at
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    SELECT id, paper_id
    FROM simulation_jobs
    WHERE id IN (SELECT id FROM next_job)
  `;
  return rows[0] ?? null;
}

async function main() {
  await mkdir(WORKER_LOG_DIR, { recursive: true });
  const sql = postgres(DATABASE_URL, { max: 2 });
  const [{ locked }] = await sql<{ locked: boolean }[]>`
    SELECT pg_try_advisory_lock(1976030218) AS locked
  `;
  if (!locked) {
    console.error("[worker] another Codex job worker holds the advisory lock");
    process.exit(2);
  }

  console.log(
    `[worker] Codex job worker running repo=${REPO_ROOT} pollMs=${POLL_MS}`,
  );

  for (;;) {
    try {
      await recoverCompletedRunningJobs(sql);
      const job = await leaseQueuedJob(sql);
      if (!job) {
        await sleep(POLL_MS);
        continue;
      }
      console.log(`[worker] starting job ${job.id} paper=${job.paper_id}`);
      const code = await run(
        "/usr/bin/pnpm",
        [
          "exec",
          "tsx",
          "scripts/run-codex-replication-job.ts",
          "--paper-id",
          job.paper_id,
          "--job-id",
          job.id,
        ],
        REPO_ROOT,
      );
      console.log(`[worker] job ${job.id} exited code=${code}`);
    } catch (e) {
      console.error("[worker] loop error", e);
      await sleep(POLL_MS);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
