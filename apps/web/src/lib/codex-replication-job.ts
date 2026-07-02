import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync } from "node:fs";
import { join, resolve } from "node:path";
import { and, desc, eq, inArray } from "drizzle-orm";
import { simulationJobs } from "@toiletpaper/db";
import { db } from "@/lib/db";

export interface CodexReplicationJobLaunch {
  enabled: boolean;
  started: boolean;
  jobId: string | null;
  state: string | null;
  reason: string;
}

function codexEnabled() {
  return process.env.CODEX_SIMULATION_ENABLED === "1";
}

function repoRoot() {
  const candidates = [
    process.env.TOILETPAPER_REPO_ROOT,
    "/mnt/donto-data/workspace/toiletpaper",
    resolve(process.cwd(), "../.."),
    process.cwd(),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (existsSync(join(candidate, "scripts/run-codex-replication-job.ts"))) {
      return candidate;
    }
  }

  return candidates[0] ?? process.cwd();
}

function timeoutMs() {
  const parsed = Number.parseInt(
    process.env.CODEX_FULL_PAPER_TIMEOUT_MS ??
      process.env.CODEX_SIMULATION_TIMEOUT_MS ??
      "7200000",
    10,
  );
  if (!Number.isFinite(parsed) || parsed <= 0) return 7_200_000;
  return parsed;
}

function simulatorWorkdir() {
  return process.env.SIMULATOR_WORKDIR ?? join("/tmp", "tp-simulations");
}

function launcherMode() {
  return process.env.CODEX_JOB_LAUNCHER ?? "web";
}

export async function startCodexFullPaperReplicationJob(
  paperId: string,
  totalUnits: number,
): Promise<CodexReplicationJobLaunch> {
  if (!codexEnabled()) {
    return {
      enabled: false,
      started: false,
      jobId: null,
      state: null,
      reason: "Codex full-paper replication is disabled.",
    };
  }

  const [active] = await db
    .select()
    .from(simulationJobs)
    .where(
      and(
        eq(simulationJobs.paperId, paperId),
        inArray(simulationJobs.state, ["queued", "running"]),
      ),
    )
    .orderBy(desc(simulationJobs.createdAt))
    .limit(1);

  if (active) {
    return {
      enabled: true,
      started: false,
      jobId: active.id,
      state: active.state,
      reason: "A Codex full-paper replication job is already active.",
    };
  }

  const [job] = await db
    .insert(simulationJobs)
    .values({
      paperId,
      scope: "full_codex_paper",
      scopeArgs: {
        backend: "codex",
        timeoutMs: timeoutMs(),
        maxRuntime: "hour_scale",
      },
      state: "queued",
      totalUnits,
      completedUnits: 0,
      failedUnits: 0,
      triggeredBy: "api:/api/simulate",
    })
    .returning();

  if (launcherMode() === "queue") {
    return {
      enabled: true,
      started: true,
      jobId: job.id,
      state: "queued",
      reason: "Queued a Codex full-paper replication job for the worker service.",
    };
  }

  const root = repoRoot();
  const workdir = join(
    simulatorWorkdir(),
    "codex-full-paper",
    paperId,
    job.id,
  );
  mkdirSync(workdir, { recursive: true });
  const launcherLog = join(workdir, "launcher.log");
  const launcherErr = join(workdir, "launcher.err");
  const stdoutFd = openSync(launcherLog, "a");
  const stderrFd = openSync(launcherErr, "a");

  const child = spawn(
    "/usr/bin/pnpm",
    [
      "exec",
      "tsx",
      "scripts/run-codex-replication-job.ts",
      "--paper-id",
      paperId,
      "--job-id",
      job.id,
    ],
    {
      cwd: root,
      detached: true,
      stdio: ["ignore", stdoutFd, stderrFd],
      env: {
        ...process.env,
        TOILETPAPER_REPO_ROOT: root,
        SIMULATOR_WORKDIR: simulatorWorkdir(),
      },
    },
  );
  child.unref();

  return {
    enabled: true,
    started: true,
    jobId: job.id,
    state: "queued",
    reason: "Started a detached Codex full-paper replication job.",
  };
}

export function codexFullPaperConfig() {
  return {
    enabled: codexEnabled(),
    launcher: launcherMode(),
    timeoutMs: timeoutMs(),
    sandbox: process.env.CODEX_SIMULATION_SANDBOX ?? "danger-full-access",
    bin: process.env.CODEX_BIN ?? "codex",
  };
}
