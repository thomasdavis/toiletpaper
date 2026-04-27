#!/usr/bin/env npx tsx
/**
 * prep-simulation.ts — Prepare a simulation workspace for Claude Code.
 *
 * Usage:
 *   npx tsx scripts/prep-simulation.ts <paper_id>
 *
 * This writes the spec and a CLAUDE.md into .simulations/<paper_id>/,
 * then you cd there and run `claude` to have it build the simulations.
 */

import postgres from "postgres";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://toiletpaper:toiletpaper@127.0.0.1:5434/toiletpaper";
const DONTOSRV_URL = process.env.DONTOSRV_URL ?? "http://localhost:7879";

const paperId = process.argv[2];
if (!paperId) {
  console.error("Usage: npx tsx scripts/prep-simulation.ts <paper_id>");
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

async function main() {
  const [paper] = await sql`SELECT * FROM papers WHERE id = ${paperId}`;
  if (!paper) { console.error(`Paper ${paperId} not found`); process.exit(1); }

  const claims = await sql`SELECT * FROM claims WHERE paper_id = ${paperId} ORDER BY created_at`;

  // Enrich from donto
  const enriched = [];
  for (const claim of claims) {
    const data: Record<string, string> = {};
    if (claim.donto_subject_iri) {
      try {
        const resp = await fetch(`${DONTOSRV_URL}/history/${encodeURIComponent(claim.donto_subject_iri)}`);
        if (resp.ok) {
          const h = await resp.json() as { rows: Array<{ predicate: string; object_lit?: { v: unknown }; object_iri?: string }> };
          for (const r of h.rows) {
            const v = String(r.object_lit?.v ?? r.object_iri ?? "");
            if (r.predicate.startsWith("tp:")) data[r.predicate.slice(3)] = v;
          }
        }
      } catch (_e) { /* */ }
    }
    enriched.push({ id: claim.id, text: claim.text, confidence: claim.confidence, ...data });
  }

  const workDir = join(process.cwd(), ".simulations", paperId);
  mkdirSync(workDir, { recursive: true });

  // Write CLAUDE.md for the simulation workspace
  let claudeMd = `# Simulation workspace: ${paper.title}\n\n`;
  claudeMd += `## What to do\n\n`;
  claudeMd += `Build and run physics/ML simulations to test every testable claim from this paper.\n`;
  claudeMd += `Read spec.md for the full list of claims. For each one:\n\n`;
  claudeMd += `1. Decide if it's testable (scaling_law, numerical_prediction, comparative, algebraic, ml_benchmark)\n`;
  claudeMd += `2. Write a simulation from scratch in Python (numpy/scipy, or PyTorch for ML)\n`;
  claudeMd += `3. Always implement BOTH baseline and proposed models\n`;
  claudeMd += `4. Run it and check convergence + conservation\n`;
  claudeMd += `5. Write verdict to results.json\n\n`;
  claudeMd += `## Rules\n\n`;
  claudeMd += `- Build everything from scratch. No pre-built solvers unless you wrote them here.\n`;
  claudeMd += `- Every simulation needs a baseline comparison.\n`;
  claudeMd += `- Every numerical result needs a convergence check.\n`;
  claudeMd += `- Use dimensional analysis before running anything.\n`;
  claudeMd += `- Don't skip hard claims — build the physics you need.\n\n`;
  claudeMd += `## Output format\n\n`;
  claudeMd += `Write results to results.json as a JSON array of objects with:\n`;
  claudeMd += `claim_index, claim_text, test_type, verdict, confidence, reason, measured_value, expected_value, simulation_file\n`;

  writeFileSync(join(workDir, "CLAUDE.md"), claudeMd);

  // Write spec.md
  let spec = `# ${paper.title}\n\n`;
  spec += `**Authors:** ${(paper.authors ?? []).join(", ")}\n`;
  spec += `**Abstract:** ${paper.abstract ?? ""}\n\n`;
  spec += `---\n\n`;

  for (const [i, c] of enriched.entries()) {
    spec += `## Claim ${i + 1}: ${(c.category ?? "unknown").toUpperCase()}\n\n`;
    spec += `> ${c.text}\n\n`;
    if (c.value) spec += `- **Value:** ${c.value} ${c.unit ?? ""}\n`;
    if (c.evidence) spec += `- **Evidence:** ${c.evidence}\n`;
    if (c.predicate) spec += `- **Predicate:** ${c.predicate}\n`;
    spec += `- **Confidence:** ${c.confidence ?? "?"}\n\n`;
  }

  writeFileSync(join(workDir, "spec.md"), spec);

  await sql.end();

  console.log(`╔══════════════════════════════════════════════════════════╗`);
  console.log(`║  Simulation workspace ready                             ║`);
  console.log(`╠══════════════════════════════════════════════════════════╣`);
  console.log(`║  Paper: ${paper.title.slice(0, 47).padEnd(47)} ║`);
  console.log(`║  Claims: ${String(claims.length).padEnd(46)} ║`);
  console.log(`║  Dir: ${workDir.slice(-50).padEnd(49)} ║`);
  console.log(`╚══════════════════════════════════════════════════════════╝`);
  console.log();
  console.log(`  cd ${workDir}`);
  console.log(`  claude`);
  console.log();
  console.log(`Then tell Claude: "Read spec.md and simulate every testable claim."`);
}

main().catch((e) => { console.error(e); process.exit(1); });
