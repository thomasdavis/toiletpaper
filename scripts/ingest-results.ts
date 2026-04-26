#!/usr/bin/env npx tsx
/**
 * ingest-results.ts — Read simulation results from Claude Code and store in DB + donto.
 *
 * Usage:
 *   npx tsx scripts/ingest-results.ts <paper_id>
 */

import postgres from "postgres";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://toiletpaper:toiletpaper@127.0.0.1:5432/toiletpaper";
const DONTOSRV_URL = process.env.DONTOSRV_URL ?? "http://localhost:7879";

const paperId = process.argv[2];
if (!paperId) {
  console.error("Usage: npx tsx scripts/ingest-results.ts <paper_id>");
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

async function main() {
  const resultsPath = join(process.cwd(), ".simulations", paperId, "results.json");

  if (!existsSync(resultsPath)) {
    console.error(`No results.json found at ${resultsPath}`);
    console.error(`Run the simulation first: cd .simulations/${paperId} && claude`);
    process.exit(1);
  }

  const results = JSON.parse(readFileSync(resultsPath, "utf-8")) as Array<{
    claim_index: number;
    claim_text: string;
    test_type: string;
    verdict: string;
    confidence: number;
    reason: string;
    measured_value?: number;
    expected_value?: number;
    simulation_file?: string;
    baseline_result?: string;
    proposed_result?: string;
  }>;

  const claims = await sql`SELECT * FROM claims WHERE paper_id = ${paperId} ORDER BY created_at`;
  const [paper] = await sql`SELECT * FROM papers WHERE id = ${paperId}`;

  let stored = 0;
  for (const r of results) {
    const claim = claims[r.claim_index];
    if (!claim) {
      console.warn(`  Claim index ${r.claim_index} out of range (${claims.length} claims)`);
      continue;
    }

    const dbVerdict = r.verdict === "reproduced" ? "confirmed"
      : r.verdict === "contradicted" ? "refuted"
      : "inconclusive";

    await sql`
      INSERT INTO simulations (id, claim_id, method, result, verdict, metadata, created_at)
      VALUES (
        gen_random_uuid(),
        ${claim.id},
        ${`claude-code-${r.test_type}`},
        ${JSON.stringify({
          reason: r.reason,
          measured: r.measured_value,
          expected: r.expected_value,
          confidence: r.confidence,
          baseline: r.baseline_result,
          proposed: r.proposed_result,
        })}::jsonb,
        ${dbVerdict},
        ${JSON.stringify({
          simulation_file: r.simulation_file,
          test_type: r.test_type,
          paper_id: paperId,
        })}::jsonb,
        NOW()
      )
    `;

    // Also assert verdict into donto if claim has an IRI
    if (claim.donto_subject_iri) {
      try {
        await fetch(`${DONTOSRV_URL}/assert`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            subject: claim.donto_subject_iri,
            predicate: "tp:simulationVerdict",
            object_lit: { v: r.verdict, dt: "xsd:string" },
            context: `tp:paper:${paperId}:claims`,
          }),
        });
      } catch (_e) { /* donto may be down */ }
    }

    const icon = r.verdict === "reproduced" ? "✓" : r.verdict === "contradicted" ? "✗" : "~";
    console.log(`  ${icon} [${r.verdict.padEnd(14)}] ${r.claim_text.slice(0, 80)}`);
    stored++;
  }

  await sql`UPDATE papers SET status = 'done', updated_at = NOW() WHERE id = ${paperId}`;
  await sql.end();

  const reproduced = results.filter((r) => r.verdict === "reproduced").length;
  const contradicted = results.filter((r) => r.verdict === "contradicted").length;
  const fragile = results.filter((r) => r.verdict === "fragile").length;

  console.log();
  console.log(`Stored ${stored} results for "${paper.title}"`);
  console.log(`  Reproduced: ${reproduced} | Contradicted: ${contradicted} | Fragile: ${fragile} | Total: ${results.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
