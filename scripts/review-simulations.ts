#!/usr/bin/env npx tsx
/**
 * review-simulations.ts — Adversarial code review of simulation scripts.
 *
 * A second Claude Code invocation reviews the simulation code written by the
 * first agent, checking for strawman tests, metric errors, data leakage,
 * unfair baselines, and other quality issues.
 *
 * Usage:
 *   npx tsx scripts/review-simulations.ts <paper_id>
 *
 * Reads:
 *   .simulations/<paper_id>/spec.md
 *   .simulations/<paper_id>/results.json
 *   .simulations/<paper_id>/sim_*.py
 *
 * Produces:
 *   .simulations/<paper_id>/review.json
 *
 * Merges review data into the simulations table metadata JSONB column.
 */

import postgres from "postgres";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://toiletpaper:toiletpaper@127.0.0.1:5434/toiletpaper";

const paperId = process.argv[2];
if (!paperId) {
  console.error("Usage: npx tsx scripts/review-simulations.ts <paper_id>");
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

async function main() {
  const workDir = join(process.cwd(), ".simulations", paperId);

  // ── Validate inputs ────────────────────────────────────────────────

  const specPath = join(workDir, "spec.md");
  const resultsPath = join(workDir, "results.json");

  if (!existsSync(specPath)) {
    console.error(`No spec.md found at ${specPath}`);
    process.exit(1);
  }
  if (!existsSync(resultsPath)) {
    console.error(`No results.json found at ${resultsPath}`);
    process.exit(1);
  }

  const simScripts = readdirSync(workDir).filter(
    (f) => f.startsWith("sim_") && f.endsWith(".py"),
  );

  console.log(`Paper ID:    ${paperId}`);
  console.log(`Work dir:    ${workDir}`);
  console.log(`Sim scripts: ${simScripts.length}`);

  // ── Build the review prompt ────────────────────────────────────────

  const reviewJsonPath = join(workDir, "review.json");

  const reviewPrompt = `You are reviewing simulation code written by another AI agent. Your job is adversarial: find every flaw.

Read these files in ${workDir}:
- spec.md (the original simulation spec with claims)
- results.json (the verdicts the first agent produced)
- All sim_*.py scripts (the simulation code)

For each simulation script, evaluate:

1. Does the code test the actual claim, or a strawman/simplified version?
2. Is the metric correct for what's being measured?
3. Is the baseline fair and properly implemented?
4. Is there data leakage between train and test?
5. Is the compute reduction so aggressive that results are meaningless?
6. Did it convert a theoretical claim into an invalid simulation?
7. Are random seeds set for reproducibility?
8. Does the statistical analysis support the verdict?

For each claim in results.json, produce a review entry:
- claim_id: string (the claim_id from results.json, or claim_index if no id)
- claim_index: number
- review_status: "approved" | "flagged" | "rejected"
- confidence_adjustment: number (-0.3 to +0.1) — how much to adjust the original confidence
- issues: string[] — specific problems found (empty array if none)
- verdict_change: null | "upgrade" | "downgrade" — should the verdict change?
- notes: string — one-sentence summary

Write the output as a JSON array to ${reviewJsonPath}.

Example output format:
[
  {
    "claim_id": "7a3f2b01-...",
    "claim_index": 0,
    "review_status": "approved",
    "confidence_adjustment": 0.0,
    "issues": [],
    "verdict_change": null,
    "notes": "Simulation correctly tests the scaling law with proper baseline comparison."
  },
  {
    "claim_id": "abc123",
    "claim_index": 1,
    "review_status": "flagged",
    "confidence_adjustment": -0.15,
    "issues": ["Baseline uses different hyperparameters than proposed model", "Only 2 epochs — too few for convergence"],
    "verdict_change": "downgrade",
    "notes": "Unfair baseline comparison undermines the 'reproduced' verdict."
  }
]

Be thorough and skeptical. A simulation that looks like it works but tests the wrong thing is worse than no simulation at all. Do not ask for confirmation — read the code, judge it, write review.json.`;

  // ── Invoke Claude Code as reviewer ─────────────────────────────────

  console.log("\nInvoking Claude Code as adversarial reviewer...\n");

  try {
    execSync(
      `claude --print -p "${reviewPrompt.replace(/"/g, '\\"')}" --dangerously-skip-permissions`,
      {
        cwd: workDir,
        stdio: "inherit",
        timeout: 15 * 60 * 1000, // 15 minutes
        env: { ...process.env, DATABASE_URL },
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Claude Code reviewer exited:", msg);
    // Non-fatal — we'll check if review.json was written
  }

  // ── Read and validate review.json ──────────────────────────────────

  if (!existsSync(reviewJsonPath)) {
    console.error("Review agent did not produce review.json");
    await sql.end();
    process.exit(1);
  }

  interface ReviewEntry {
    claim_id?: string;
    claim_index: number;
    review_status: "approved" | "flagged" | "rejected";
    confidence_adjustment: number;
    issues: string[];
    verdict_change: null | "upgrade" | "downgrade";
    notes: string;
  }

  let reviews: ReviewEntry[];
  try {
    const raw = readFileSync(reviewJsonPath, "utf-8");
    reviews = JSON.parse(raw) as ReviewEntry[];
    if (!Array.isArray(reviews)) {
      throw new Error("review.json is not an array");
    }
  } catch (e) {
    console.error(
      "Failed to parse review.json:",
      e instanceof Error ? e.message : e,
    );
    await sql.end();
    process.exit(1);
  }

  console.log(`\nReview complete: ${reviews.length} claim(s) reviewed\n`);

  // ── Summarize ──────────────────────────────────────────────────────

  const approved = reviews.filter((r) => r.review_status === "approved").length;
  const flagged = reviews.filter((r) => r.review_status === "flagged").length;
  const rejected = reviews.filter((r) => r.review_status === "rejected").length;

  console.log(`  Approved: ${approved}`);
  console.log(`  Flagged:  ${flagged}`);
  console.log(`  Rejected: ${rejected}`);

  for (const r of reviews) {
    const icon =
      r.review_status === "approved"
        ? "+"
        : r.review_status === "flagged"
          ? "!"
          : "X";
    console.log(
      `  [${icon}] Claim ${r.claim_index}: ${r.review_status} — ${r.notes}`,
    );
    if (r.issues.length > 0) {
      for (const issue of r.issues) {
        console.log(`      - ${issue}`);
      }
    }
  }

  // ── Log warnings for rejected claims ───────────────────────────────

  if (rejected > 0) {
    console.warn(
      `\nWARNING: ${rejected} claim(s) had their simulation REJECTED by the reviewer.`,
    );
    console.warn(
      "These verdicts should not be trusted without re-simulation.\n",
    );
  }

  // ── Merge review data into simulations metadata ────────────────────

  // Load results.json to match claim_ids
  const results = JSON.parse(readFileSync(resultsPath, "utf-8")) as Array<{
    claim_id?: string;
    claim_index: number;
  }>;

  const claims = await sql`SELECT * FROM claims WHERE paper_id = ${paperId} ORDER BY created_at`;

  let merged = 0;
  for (const review of reviews) {
    // Find the claim_id: prefer from review, fall back to results.json match
    let claimId = review.claim_id;
    if (!claimId) {
      const matchingResult = results.find(
        (r) => r.claim_index === review.claim_index,
      );
      claimId = matchingResult?.claim_id;
    }

    if (!claimId) {
      // Last resort: match by index into claims array
      const claim = claims[review.claim_index];
      claimId = claim?.id as string | undefined;
    }

    if (!claimId) {
      console.warn(
        `  Could not match review for claim_index=${review.claim_index} to a DB claim. Skipping.`,
      );
      continue;
    }

    // Find simulations for this claim and merge review into metadata
    const sims =
      await sql`SELECT id, metadata FROM simulations WHERE claim_id = ${claimId} ORDER BY created_at DESC LIMIT 1`;

    if (sims.length === 0) {
      console.warn(
        `  No simulation found for claim ${claimId}. Skipping review merge.`,
      );
      continue;
    }

    const sim = sims[0];
    const existingMeta =
      (sim.metadata as Record<string, unknown> | null) ?? {};
    const updatedMeta = {
      ...existingMeta,
      review: {
        review_status: review.review_status,
        confidence_adjustment: review.confidence_adjustment,
        issues: review.issues,
        verdict_change: review.verdict_change,
        notes: review.notes,
        reviewed_at: new Date().toISOString(),
      },
    };

    await sql`UPDATE simulations SET metadata = ${JSON.stringify(updatedMeta)}::jsonb WHERE id = ${sim.id}`;
    merged++;
  }

  console.log(`\nMerged review data into ${merged} simulation(s).`);

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
