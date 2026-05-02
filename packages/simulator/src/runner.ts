import { writeFile, mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SimulationResult, TestableClaim, DataPoint } from "./schema";
import { checkDimensions } from "./algebraic";

const exec = promisify(execFile);

/**
 * Where the runner writes generated python scripts and reads the
 * stdout/stderr it produces. Cloud Run's filesystem is read-only
 * outside `/tmp`, so we honour the `SIMULATOR_WORKDIR` env var
 * (PRD-003) and fall back to a per-process tmp dir. The legacy
 * `process.cwd()/.simulations` path is never used; setting it caused
 * tier-2 EACCES failures on production for every paper.
 */
const WORK_DIR =
  process.env.SIMULATOR_WORKDIR ??
  join("/tmp", "tp-simulations");
const TIMEOUT_MS = 30_000;

interface RawSimResult {
  baseline: { x: number[]; y: number[] };
  proposed: { x: number[]; y: number[] };
  fitted_exponent: number | null;
  fitted_exponent_error: number | null;
  convergence: { resolutions: number[]; errors: number[] };
  conservation: { quantities: { name: string; max_drift: number }[] };
  execution_time: number;
}

export async function runSimulation(
  code: string,
  claim: TestableClaim,
): Promise<SimulationResult> {
  await mkdir(WORK_DIR, { recursive: true });
  const scriptId = randomUUID();
  const scriptPath = join(WORK_DIR, `sim_${scriptId}.py`);

  try {
    await writeFile(scriptPath, code, "utf-8");

    const startTime = Date.now();
    const { stdout, stderr } = await exec("python3", [scriptPath], {
      timeout: TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, PYTHONPATH: "" },
    });

    const execTime = Date.now() - startTime;

    if (stderr) {
      console.error(`Simulation stderr for ${claim.claimId}:`, stderr.slice(0, 500));
    }

    const jsonMatch = stdout.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return makeErrorResult(claim, `No JSON output from simulation. stdout: ${stdout.slice(0, 200)}`);
    }

    const raw = JSON.parse(jsonMatch[0]) as RawSimResult;
    return buildResult(claim, raw, execTime);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("TIMEOUT") || msg.includes("timed out")) {
      return makeErrorResult(claim, `Simulation timed out after ${TIMEOUT_MS / 1000}s`);
    }
    return makeErrorResult(claim, `Simulation failed: ${msg.slice(0, 300)}`);
  } finally {
    try { await unlink(scriptPath); } catch (_e) { /* cleanup */ }
  }
}

function buildResult(claim: TestableClaim, raw: RawSimResult, execTime: number): SimulationResult {
  const baselineData: DataPoint[] = raw.baseline.x.map((x, i) => ({
    x, y: raw.baseline.y[i],
  }));
  const proposedData: DataPoint[] = raw.proposed.x.map((x, i) => ({
    x, y: raw.proposed.y[i],
  }));

  const dimCheck = checkDimensions(claim);

  const convErrors = raw.convergence?.errors ?? [];
  const convergencePassed = convErrors.length >= 2
    ? convErrors[convErrors.length - 1] < convErrors[0]
    : true;

  let convergenceOrder: number | undefined;
  if (convErrors.length >= 2 && raw.convergence.resolutions.length >= 2) {
    const r1 = raw.convergence.resolutions[0];
    const r2 = raw.convergence.resolutions[raw.convergence.resolutions.length - 1];
    const e1 = convErrors[0];
    const e2 = convErrors[convErrors.length - 1];
    if (e1 > 0 && e2 > 0 && r1 > 0 && r2 > 0) {
      convergenceOrder = Math.log(e1 / e2) / Math.log(r2 / r1);
    }
  }

  const conservationPassed = (raw.conservation?.quantities ?? []).every(
    (q) => q.max_drift < 0.01,
  );

  let verdict: SimulationResult["verdict"] = "pending";
  let verdictReason = "";

  if (claim.exponent != null && raw.fitted_exponent != null) {
    const error = Math.abs(raw.fitted_exponent - claim.exponent);
    const relError = Math.abs(error / claim.exponent);

    if (relError < 0.05) {
      verdict = "reproduced";
      verdictReason = `Fitted exponent ${raw.fitted_exponent.toFixed(3)} matches expected ${claim.exponent} within 5% (error: ${(relError * 100).toFixed(1)}%)`;
    } else if (relError < 0.15) {
      verdict = "numerically_fragile";
      verdictReason = `Fitted exponent ${raw.fitted_exponent.toFixed(3)} close to expected ${claim.exponent} but >5% error (${(relError * 100).toFixed(1)}%)`;
    } else {
      verdict = "contradicted";
      verdictReason = `Fitted exponent ${raw.fitted_exponent.toFixed(3)} differs from expected ${claim.exponent} by ${(relError * 100).toFixed(1)}%`;
    }
  } else if (proposedData.length > 0 && baselineData.length > 0) {
    verdict = "reproduced";
    verdictReason = "Simulation completed with baseline and proposed model output";
  } else {
    verdict = "underdetermined";
    verdictReason = "Insufficient data to determine verdict";
  }

  if (!convergencePassed) {
    verdict = "numerically_fragile";
    verdictReason += ". WARNING: convergence test failed";
  }

  if (!conservationPassed) {
    verdict = "numerically_fragile";
    verdictReason += ". WARNING: conservation check failed";
  }

  return {
    claimId: claim.claimId,
    tier: 2,
    baselineData,
    proposedData,
    fittedExponent: raw.fitted_exponent ?? undefined,
    fittedExponentError: raw.fitted_exponent_error ?? undefined,
    expectedExponent: claim.exponent,
    dimensionalCheck: dimCheck,
    convergenceCheck: {
      passed: convergencePassed,
      resolutions: raw.convergence?.resolutions ?? [],
      errors: convErrors,
      convergenceOrder,
      detail: convergencePassed
        ? `Converging at order ${convergenceOrder?.toFixed(1) ?? "N/A"}`
        : "Errors did not decrease with resolution",
    },
    conservationCheck: {
      passed: conservationPassed,
      quantities: (raw.conservation?.quantities ?? []).map((q) => ({
        name: q.name,
        maxDrift: q.max_drift,
        passed: q.max_drift < 0.01,
      })),
    },
    verdict,
    verdictReason,
    plots: [
      {
        title: `${claim.statement.slice(0, 60)}...`,
        xLabel: claim.variables?.find((v) => v.role === "independent")?.symbol ?? "x",
        yLabel: claim.variables?.find((v) => v.role === "dependent")?.symbol ?? "y",
        logX: claim.claimType === "scaling_law",
        logY: claim.claimType === "scaling_law",
        datasets: [
          { label: "Baseline", points: baselineData, style: "line" },
          { label: "Proposed", points: proposedData, style: "line" },
        ],
      },
    ],
    executionTime: execTime,
  };
}

function makeErrorResult(claim: TestableClaim, reason: string): SimulationResult {
  return {
    claimId: claim.claimId,
    tier: 2,
    baselineData: [],
    proposedData: [],
    dimensionalCheck: checkDimensions(claim),
    convergenceCheck: { passed: false, resolutions: [], errors: [], detail: reason },
    conservationCheck: { passed: false, quantities: [] },
    verdict: "not_simulable",
    verdictReason: reason,
    plots: [],
    executionTime: 0,
  };
}
