import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type {
  ReplicationAgentResult,
  ReplicationUnit,
  ReplicationUnitType,
} from "@toiletpaper/simulator";

export type CodexSimulationBuildState =
  | "disabled"
  | "skipped"
  | "succeeded"
  | "failed"
  | "timeout";

export interface CodexSimulationBuild {
  state: CodexSimulationBuildState;
  attempted: boolean;
  reason: string;
  workdir?: string;
  command?: string[];
  files?: string[];
  exitCode?: number | null;
  durationMs?: number;
  stdoutTail?: string;
  stderrTail?: string;
  lastMessage?: string;
}

export interface CodexSimulationExecution {
  unit: ReplicationUnit;
  execution: ReplicationAgentResult;
}

const CODEX_ELIGIBLE_UNIT_TYPES = new Set<ReplicationUnitType>([
  "metric_recompute",
  "baseline_contrast",
  "ablation",
  "scaling_law",
  "equation_check",
  "statistical_significance",
  "simulation",
]);

function enabled() {
  return process.env.CODEX_SIMULATION_ENABLED === "1";
}

function maxUnitsPerRequest() {
  if (!enabled()) return 0;
  const parsed = Number.parseInt(
    process.env.CODEX_SIMULATION_MAX_UNITS_PER_REQUEST ?? "1",
    10,
  );
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(0, Math.min(parsed, 10));
}

function timeoutMs() {
  const parsed = Number.parseInt(
    process.env.CODEX_SIMULATION_TIMEOUT_MS ?? "180000",
    10,
  );
  if (!Number.isFinite(parsed)) return 180_000;
  return Math.max(30_000, Math.min(parsed, 900_000));
}

function sandboxMode() {
  return process.env.CODEX_SIMULATION_SANDBOX ?? "danger-full-access";
}

function safeSegment(value: string) {
  return value.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 120);
}

function tail(value: string, max = 8_000) {
  return value.length > max ? value.slice(value.length - max) : value;
}

function compactJson(value: unknown, max = 24_000) {
  const json = JSON.stringify(value, null, 2);
  if (json.length <= max) return json;
  return `${json.slice(0, max)}\n... truncated ...`;
}

async function readOptional(path: string, max = 16_000) {
  try {
    return tail(await readFile(path, "utf8"), max);
  } catch {
    return undefined;
  }
}

async function listFiles(root: string) {
  const files: string[] = [];

  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
      } else if (entry.isFile()) {
        files.push(relative(root, path));
      }
    }
  }

  await walk(root);
  return files.sort().slice(0, 200);
}

function hasGeneratedArtifact(files: string[]) {
  const fileSet = new Set(files);
  return (
    fileSet.has("simulation-spec.json") &&
    fileSet.has("result-template.json") &&
    (fileSet.has("run.py") || fileSet.has("run.ts"))
  );
}

function buildPrompt(unit: ReplicationUnit, execution: ReplicationAgentResult) {
  return `You are Codex building a scientific replication/simulation artifact for toiletpaper.dev.

Work only in the current directory. Do not read or write outside it. Do not fetch network resources.

Use the provided replication unit and deterministic agent result to create a concrete simulation or replication artifact. If the claim cannot be faithfully simulated with the available information, produce a blocked artifact that explains exactly what data, code, parameters, or physical model is missing.

Create these files:
- README.md: concise explanation of what the artifact tries to replicate.
- simulation-spec.json: machine-readable plan with claim, observables, assumptions, required inputs, algorithm, expected outputs, and blockers.
- run.py or run.ts: a runnable local script when enough information exists; otherwise a script that writes a structured insufficient-data result.
- result-template.json: the result shape that toiletpaper can ingest later.

Return a short final summary that names the files created and whether the artifact is runnable, blocked, or partial.

replication-unit.json:
${compactJson(unit)}

agent-execution.json:
${compactJson(execution)}
`;
}

function shouldAttemptCodexBuild(
  unit: ReplicationUnit,
  execution: ReplicationAgentResult,
) {
  if (!CODEX_ELIGIBLE_UNIT_TYPES.has(unit.unitType)) return false;
  if (unit.computeBudget.tier === "human") return false;
  if (execution.verdict === "system_error") return false;
  if (execution.verdict === "not_applicable" && execution.blockers.length > 0) {
    return false;
  }
  return true;
}

async function runCodex(
  unit: ReplicationUnit,
  execution: ReplicationAgentResult,
): Promise<CodexSimulationBuild> {
  const root =
    process.env.SIMULATOR_WORKDIR ?? join("/tmp", "tp-simulations");
  const workdir = join(
    root,
    "codex",
    safeSegment(unit.paperId),
    safeSegment(unit.id),
    `build-${Date.now()}`,
  );
  const lastMessagePath = join(workdir, "codex-last-message.txt");
  await mkdir(workdir, { recursive: true });
  await writeFile(
    join(workdir, "replication-unit.json"),
    `${JSON.stringify(unit, null, 2)}\n`,
  );
  await writeFile(
    join(workdir, "agent-execution.json"),
    `${JSON.stringify(execution, null, 2)}\n`,
  );
  const prompt = buildPrompt(unit, execution);
  await writeFile(join(workdir, "prompt.md"), prompt);

  const bin = process.env.CODEX_BIN ?? "codex";
  const args = [
    "exec",
    "--skip-git-repo-check",
    "--ephemeral",
    "--cd",
    workdir,
    "--output-last-message",
    lastMessagePath,
  ];
  const sandbox = sandboxMode();
  if (sandbox === "dangerously-bypass-approvals-and-sandbox") {
    args.push("--dangerously-bypass-approvals-and-sandbox");
  } else {
    args.push("--sandbox", sandbox);
  }
  const model = process.env.CODEX_SIMULATION_MODEL;
  if (model) args.push("--model", model);
  args.push("-");

  const started = Date.now();
  const limit = timeoutMs();
  let stdout = "";
  let stderr = "";
  let timedOut = false;

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: workdir,
      env: { ...process.env, NO_COLOR: "1", PAGER: "cat" },
      stdio: ["pipe", "pipe", "pipe"],
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2_000).unref();
    }, limit);

    child.stdout.on("data", (chunk) => {
      stdout = tail(stdout + String(chunk));
    });
    child.stderr.on("data", (chunk) => {
      stderr = tail(stderr + String(chunk));
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
    child.stdin.end(prompt);
  });

  const files = await listFiles(workdir);
  const lastMessage = await readOptional(lastMessagePath);
  const durationMs = Date.now() - started;
  const artifactCreated = hasGeneratedArtifact(files);

  if (timedOut && !(exitCode === 0 && artifactCreated)) {
    return {
      state: "timeout",
      attempted: true,
      reason: `Codex simulation builder timed out after ${limit}ms.`,
      workdir,
      command: [bin, ...args],
      files,
      exitCode,
      durationMs,
      stdoutTail: stdout,
      stderrTail: stderr,
      lastMessage,
    };
  }

  return {
    state: exitCode === 0 && artifactCreated ? "succeeded" : "failed",
    attempted: true,
    reason:
      exitCode === 0 && artifactCreated
        ? "Codex created a bounded simulation artifact for this replication unit."
        : exitCode === 0
          ? "Codex exited without creating the required simulation artifact files."
          : "Codex simulation builder exited with a non-zero status.",
    workdir,
    command: [bin, ...args],
    files,
    exitCode,
    durationMs,
    stdoutTail: stdout,
    stderrTail: stderr,
    lastMessage,
  };
}

export async function buildCodexSimulationsForExecutions(
  executions: CodexSimulationExecution[],
) {
  const results = new Map<string, CodexSimulationBuild>();

  if (!enabled()) {
    return results;
  }

  let remaining = maxUnitsPerRequest();
  if (remaining === 0) {
    return results;
  }

  for (const { unit, execution } of executions) {
    if (remaining <= 0) break;
    if (!shouldAttemptCodexBuild(unit, execution)) continue;
    remaining -= 1;
    try {
      results.set(unit.id, await runCodex(unit, execution));
    } catch (e) {
      results.set(unit.id, {
        state: "failed",
        attempted: true,
        reason: `Codex simulation builder failed to start: ${
          e instanceof Error ? e.message : String(e)
        }`,
      });
    }
  }

  return results;
}

export function codexSimulationConfig() {
  return {
    enabled: enabled(),
    maxUnitsPerRequest: maxUnitsPerRequest(),
    timeoutMs: timeoutMs(),
    bin: process.env.CODEX_BIN ?? "codex",
    model: process.env.CODEX_SIMULATION_MODEL ?? null,
    sandbox: sandboxMode(),
  };
}
