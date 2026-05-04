#!/usr/bin/env npx tsx
/**
 * run-gpu-claims.ts — Execute GPU-requiring simulation scripts on Cloud Run Jobs.
 *
 * Reads results.json for a paper, finds claims with compute_tier: "gpu" that
 * have not yet been evaluated, runs each gpu_*.py script on a Cloud Run Job
 * with an NVIDIA L4 GPU, collects results, and merges them back.
 *
 * Usage:
 *   npx tsx scripts/run-gpu-claims.ts <paper_id> [--dry-run]
 *
 * Environment:
 *   GCP_PROJECT     — GCP project ID (default: apex-494316)
 *   GCP_REGION      — Cloud Run region (default: us-central1)
 *   UPLOADS_BUCKET  — GCS bucket for simulation artifacts
 *
 * Cost safety:
 *   - Cloud Run Jobs terminate when done (no idle charges)
 *   - Max task timeout: 15 minutes per job
 *   - Max retries: 0 (fail fast, don't retry and double costs)
 *   - Max concurrent GPU jobs: 3
 *   - Every job is deleted after execution
 *   - L4 GPU cost: ~$0.30/min = ~$4.50 for a 15-min max job
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";

// ── Configuration ──────────────────────────────────────────────────────

const GCP_PROJECT = process.env.GCP_PROJECT ?? "apex-494316";
const GCP_REGION = process.env.GCP_REGION ?? "us-central1";
const UPLOADS_BUCKET = process.env.UPLOADS_BUCKET ?? "";
const MAX_CONCURRENT_JOBS = 3;
const JOB_TIMEOUT = "15m";
const GPU_TYPE = "nvidia-l4";
const GPU_COUNT = 1;
const CPU_COUNT = 8;
const MEMORY = "32Gi";
// Base image with Python 3.12 — scripts install their own deps
const BASE_IMAGE = "python:3.12-slim";

const paperId = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

if (!paperId) {
  console.error("Usage: npx tsx scripts/run-gpu-claims.ts <paper_id> [--dry-run]");
  process.exit(1);
}

// ── Types ──────────────────────────────────────────────────────────────

interface SimResult {
  claim_id: string;
  claim_index: number;
  claim_text: string;
  test_type: string;
  verdict: string;
  evidence_mode?: string;
  limitations?: string[];
  confidence: number;
  reason: string;
  measured_value?: number;
  expected_value?: number;
  simulation_file?: string;
  baseline_result?: string;
  proposed_result?: string;
  not_evaluated_reason?: string;
  compute_tier?: "cpu" | "gpu";
  gpu_script?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────

function shortId(): string {
  return randomBytes(4).toString("hex");
}

function jobName(paperId: string, claimIndex: number): string {
  // Cloud Run job names: lowercase, alphanumeric, hyphens, max 63 chars
  const paperShort = paperId.slice(0, 8);
  return `tp-gpu-${paperShort}-c${claimIndex}-${shortId()}`.toLowerCase();
}

function run(cmd: string, opts?: { timeout?: number; ignoreError?: boolean }): string {
  const timeout = opts?.timeout ?? 60_000;
  try {
    return execSync(cmd, {
      timeout,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (e) {
    if (opts?.ignoreError) return "";
    throw e;
  }
}

function uploadScriptToGCS(localPath: string, gcsPath: string): void {
  console.log(`  Uploading ${localPath} -> gs://${UPLOADS_BUCKET}/${gcsPath}`);
  run(`gcloud storage cp "${localPath}" "gs://${UPLOADS_BUCKET}/${gcsPath}" --quiet`);
}

function createAndRunJob(name: string, scriptGcsUrl: string): { success: boolean; logs: string } {
  console.log(`  Creating Cloud Run Job: ${name}`);

  // The entrypoint: download the script from GCS, install deps, run it
  // Using a startup script approach since Cloud Run Jobs can't mount GCS directly
  const entrypoint = [
    "apt-get update -qq && apt-get install -y -qq curl > /dev/null 2>&1",
    `gcloud storage cp "${scriptGcsUrl}" /tmp/gpu_sim.py 2>/dev/null || curl -sfo /tmp/gpu_sim.py "${scriptGcsUrl}"`,
    "python3 /tmp/gpu_sim.py",
  ].join(" && ");

  // Create the job
  const createCmd = [
    "gcloud run jobs create", name,
    `--project=${GCP_PROJECT}`,
    `--region=${GCP_REGION}`,
    `--image=${BASE_IMAGE}`,
    `--task-timeout=${JOB_TIMEOUT}`,
    "--max-retries=0",
    `--gpu=${GPU_COUNT}`,
    `--gpu-type=${GPU_TYPE}`,
    `--cpu=${CPU_COUNT}`,
    `--memory=${MEMORY}`,
    '--command=bash',
    `--args=-c,${entrypoint}`,
    `--set-env-vars=SCRIPT_GCS_URL=${scriptGcsUrl}`,
    "--quiet",
  ].join(" ");

  run(createCmd, { timeout: 120_000 });

  // Execute and wait for completion
  console.log(`  Executing job ${name} (waiting for completion, max ${JOB_TIMEOUT})...`);
  try {
    run(
      `gcloud run jobs execute ${name} --wait --project=${GCP_PROJECT} --region=${GCP_REGION} --quiet`,
      { timeout: 20 * 60 * 1000 }, // 20 min timeout (15 min job + buffer)
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`  Job ${name} execution failed: ${msg.slice(0, 200)}`);
    cleanupJob(name);
    return { success: false, logs: msg.slice(0, 2000) };
  }

  // Collect logs (the script prints JSON to stdout as its last line)
  let logs = "";
  try {
    logs = run(
      `gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=${name}" ` +
      `--project=${GCP_PROJECT} --limit=200 --format="value(textPayload)"`,
      { timeout: 30_000 },
    );
  } catch (_e) {
    console.warn(`  Could not fetch logs for ${name}`);
  }

  // Cleanup: always delete the job
  cleanupJob(name);

  return { success: true, logs };
}

function cleanupJob(name: string): void {
  console.log(`  Cleaning up job: ${name}`);
  run(
    `gcloud run jobs delete ${name} --project=${GCP_PROJECT} --region=${GCP_REGION} --quiet`,
    { timeout: 60_000, ignoreError: true },
  );
}

function extractJsonFromLogs(logs: string): SimResult | null {
  // GPU scripts print a JSON object as their last stdout line
  // Search from the end of logs for a JSON object
  const lines = logs.split("\n").reverse();
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        return JSON.parse(trimmed) as SimResult;
      } catch (_e) {
        continue;
      }
    }
  }
  return null;
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  const simRoot = join(process.cwd(), ".simulations");
  const workDir = join(simRoot, paperId);
  const resultsPath = join(workDir, "results.json");

  if (!existsSync(resultsPath)) {
    console.error(`No results.json at ${resultsPath}`);
    console.error("Run simulate-paper.ts first.");
    process.exit(1);
  }

  const results: SimResult[] = JSON.parse(readFileSync(resultsPath, "utf-8"));

  // Find GPU claims that need execution
  const gpuClaims = results.filter(r =>
    r.compute_tier === "gpu" &&
    r.verdict === "not_evaluated" &&
    r.not_evaluated_reason === "compute_unavailable" &&
    r.gpu_script
  );

  if (gpuClaims.length === 0) {
    console.log("No GPU claims found in results.json. Nothing to do.");
    return;
  }

  console.log(`Found ${gpuClaims.length} GPU claim(s) to execute.`);
  console.log(`Project: ${GCP_PROJECT} | Region: ${GCP_REGION}`);
  console.log(`GPU: ${GPU_TYPE} x${GPU_COUNT} | CPU: ${CPU_COUNT} | Memory: ${MEMORY}`);
  console.log(`Max timeout per job: ${JOB_TIMEOUT}`);
  console.log(`Max concurrent jobs: ${MAX_CONCURRENT_JOBS}`);
  console.log();

  if (!UPLOADS_BUCKET) {
    console.error("UPLOADS_BUCKET is not set. GPU scripts must be uploaded to GCS first.");
    console.error("Set UPLOADS_BUCKET=<your-bucket> and re-run.");
    process.exit(1);
  }

  // Validate that all GPU scripts exist locally
  const missingScripts: string[] = [];
  for (const claim of gpuClaims) {
    const scriptPath = join(workDir, claim.gpu_script!);
    if (!existsSync(scriptPath)) {
      missingScripts.push(claim.gpu_script!);
    }
  }

  if (missingScripts.length > 0) {
    console.error(`Missing GPU scripts in ${workDir}:`);
    for (const s of missingScripts) console.error(`  - ${s}`);
    process.exit(1);
  }

  // Cost estimate
  const estimatedMinutes = gpuClaims.length * 10; // conservative: 10 min avg per job
  const estimatedCost = (estimatedMinutes * 0.30).toFixed(2);
  console.log(`Estimated cost: ~$${estimatedCost} (${gpuClaims.length} jobs x ~10 min x $0.30/min)`);
  console.log(`Worst case:     ~$${(gpuClaims.length * 15 * 0.30).toFixed(2)} (all jobs hit 15 min timeout)`);
  console.log();

  if (dryRun) {
    console.log("=== DRY RUN — no jobs will be created ===");
    console.log();
    for (const claim of gpuClaims) {
      console.log(`  Claim ${claim.claim_index}: ${claim.claim_text.slice(0, 80)}`);
      console.log(`    Script: ${claim.gpu_script}`);
      console.log(`    Would create Cloud Run Job with L4 GPU`);
      console.log();
    }
    console.log("Re-run without --dry-run to execute.");
    return;
  }

  // Process GPU claims in batches to limit concurrency
  const updatedResults = [...results];
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < gpuClaims.length; i += MAX_CONCURRENT_JOBS) {
    const batch = gpuClaims.slice(i, i + MAX_CONCURRENT_JOBS);
    console.log(`--- Batch ${Math.floor(i / MAX_CONCURRENT_JOBS) + 1} (${batch.length} job(s)) ---`);

    // Upload scripts to GCS
    for (const claim of batch) {
      const localScript = join(workDir, claim.gpu_script!);
      const gcsKey = `simulations/${paperId}/${claim.gpu_script}`;
      uploadScriptToGCS(localScript, gcsKey);
    }

    // Run jobs sequentially within each batch (Cloud Run handles scheduling)
    // Sequential execution is intentional: GPU quota is limited, and we want
    // to observe each job's outcome before starting the next to avoid
    // burning through quota on a systematic failure.
    for (const claim of batch) {
      const name = jobName(paperId, claim.claim_index);
      const scriptGcsUrl = `gs://${UPLOADS_BUCKET}/simulations/${paperId}/${claim.gpu_script}`;

      console.log(`\n  Claim ${claim.claim_index}: ${claim.claim_text.slice(0, 60)}...`);

      const { success, logs } = createAndRunJob(name, scriptGcsUrl);

      if (success) {
        const gpuResult = extractJsonFromLogs(logs);
        if (gpuResult) {
          // Merge GPU result back into the main results
          const idx = updatedResults.findIndex(r =>
            r.claim_id === claim.claim_id || r.claim_index === claim.claim_index
          );
          if (idx >= 0) {
            updatedResults[idx] = {
              ...updatedResults[idx],
              ...gpuResult,
              compute_tier: "gpu",
              evidence_mode: gpuResult.evidence_mode ?? "independent_implementation",
              limitations: [
                ...(gpuResult.limitations ?? []),
                "executed on Cloud Run L4 GPU",
              ],
            };
            console.log(`  Result: ${gpuResult.verdict} (confidence: ${gpuResult.confidence})`);
            succeeded++;
          }
        } else {
          console.warn(`  Job completed but no JSON result found in logs.`);
          failed++;
        }
      } else {
        console.error(`  Job failed for claim ${claim.claim_index}.`);
        // Update the result to reflect the failure
        const idx = updatedResults.findIndex(r =>
          r.claim_id === claim.claim_id || r.claim_index === claim.claim_index
        );
        if (idx >= 0) {
          updatedResults[idx] = {
            ...updatedResults[idx],
            verdict: "not_evaluated",
            not_evaluated_reason: "compute_unavailable",
            reason: `GPU job failed: ${logs.slice(0, 200)}`,
          };
        }
        failed++;
      }
    }
  }

  // Write updated results back
  writeFileSync(resultsPath, JSON.stringify(updatedResults, null, 2));

  console.log();
  console.log("=== GPU Claims Summary ===");
  console.log(`  Total GPU claims: ${gpuClaims.length}`);
  console.log(`  Succeeded: ${succeeded}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Results written to: ${resultsPath}`);

  if (succeeded > 0) {
    console.log();
    console.log("Run ingest-results.ts to update the database:");
    console.log(`  npx tsx scripts/ingest-results.ts ${paperId}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
