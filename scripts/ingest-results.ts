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

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://toiletpaper:toiletpaper@127.0.0.1:5434/toiletpaper";
const DONTOSRV_URL = process.env.DONTOSRV_URL ?? "http://localhost:7879";
const DONTO_DSN = process.env.DONTO_DSN ?? "postgres://donto:donto@127.0.0.1:55433/donto";

const paperId = process.argv[2];
if (!paperId) {
  console.error("Usage: npx tsx scripts/ingest-results.ts <paper_id>");
  process.exit(1);
}

const sql = postgres(DATABASE_URL);
const dontoSql = postgres(DONTO_DSN);

// ── Donto helpers ───────────────────────────────────────────────────

async function dontoAssert(subject: string, predicate: string, objectLit: { v: string; dt: string }, context: string) {
  await fetch(`${DONTOSRV_URL}/assert`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ subject, predicate, object_lit: objectLit, context }),
  });
}

async function getClaimStatementId(iri: string): Promise<string | null> {
  const rows = await dontoSql`
    SELECT statement_id FROM donto_statement
    WHERE subject = ${iri}
      AND predicate = 'tp:claimText'
      AND upper(tx_time) IS NULL
    LIMIT 1
  `;
  return rows.length > 0 ? rows[0].statement_id : null;
}

async function getSimVerdictStatementId(iri: string): Promise<string | null> {
  const rows = await dontoSql`
    SELECT statement_id FROM donto_statement
    WHERE subject = ${iri}
      AND predicate = 'tp:simulationVerdict'
      AND upper(tx_time) IS NULL
    LIMIT 1
  `;
  return rows.length > 0 ? rows[0].statement_id : null;
}

async function assertArgument(sourceStmt: string, targetStmt: string, relation: string, context: string, strength: number) {
  await dontoSql`SELECT donto_assert_argument(${sourceStmt}, ${targetStmt}, ${relation}, ${context}, ${strength})`;
}

async function setConfidence(stmtId: string, confidence: number, source: string) {
  await dontoSql`SELECT donto_set_confidence(${stmtId}, ${confidence}, ${source}, null)`;
}

async function attachCertificate(stmtId: string, certType: string, body: Record<string, unknown>) {
  await dontoSql`SELECT donto_attach_certificate(${stmtId}, ${certType}, ${JSON.stringify(body)}::jsonb)`;
}

async function emitObligation(statementId: string, obligationType: string, context: string) {
  await fetch(`${DONTOSRV_URL}/obligations/emit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ statement_id: statementId, obligation_type: obligationType, context }),
  });
}

// ── Donto ingestion for a single result ─────────────────────────────

async function ingestToDonto(
  claim: Record<string, unknown>,
  r: {
    verdict: string;
    reason: string;
    confidence: number;
    measured_value?: number;
    expected_value?: number;
  },
) {
  const iri = claim.donto_subject_iri as string;
  if (!iri) return;

  const context = `tp:paper:${paperId}:claims`;

  try {
    // 1. Assert verdict quad
    await dontoAssert(iri, "tp:simulationVerdict", { v: r.verdict, dt: "xsd:string" }, context);

    // 2. Assert reason quad
    await dontoAssert(iri, "tp:verdictReason", { v: r.reason, dt: "xsd:string" }, context);

    // 3. Assert measured/expected if available
    if (r.measured_value != null) {
      await dontoAssert(iri, "tp:measuredValue", { v: String(r.measured_value), dt: "xsd:string" }, context);
    }
    if (r.expected_value != null) {
      await dontoAssert(iri, "tp:expectedValue", { v: String(r.expected_value), dt: "xsd:string" }, context);
    }

    // 4. Wire argument via SQL
    const claimStmtId = await getClaimStatementId(iri);
    const verdictStmtId = await getSimVerdictStatementId(iri);

    if (claimStmtId && verdictStmtId) {
      const relation = r.verdict === "reproduced" ? "supports" : r.verdict === "contradicted" ? "rebuts" : null;
      if (relation) {
        const strength = r.verdict === "reproduced" ? Math.min(r.confidence, 1.0) : Math.min(r.confidence * 0.8, 1.0);
        await assertArgument(verdictStmtId, claimStmtId, relation, context, strength);
      }

      // 5. Update confidence
      if (r.verdict === "contradicted") {
        await setConfidence(claimStmtId, 0.3, "simulation");
      } else if (r.verdict === "reproduced") {
        await setConfidence(claimStmtId, 0.95, "simulation");
      }

      // 6. Attach certificate for reproduced claims with high confidence
      if (r.verdict === "reproduced" && r.confidence > 0.7) {
        await attachCertificate(claimStmtId, "simulation_verification", {
          verdict: r.verdict,
          confidence: r.confidence,
          measured: r.measured_value,
          expected: r.expected_value,
          reason: r.reason,
          paper_id: paperId,
          verified_at: new Date().toISOString(),
        });
      }

      // 7. Emit obligation for fragile claims
      if (r.verdict === "fragile" || r.verdict === "numerically_fragile") {
        await emitObligation(claimStmtId, "needs-replication", context);
      }
    }
  } catch (e) {
    console.warn(`  [donto] Failed to ingest verdict for ${iri}: ${e instanceof Error ? e.message : e}`);
  }
}

// ── Main ────────────────────────────────────────────────────────────

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
  let skipped = 0;
  for (const r of results) {
    // Match by claim text instead of index — claim_index values are unreliable
    const claim = claims.find(c =>
      c.text.slice(0, 50) === r.claim_text?.slice(0, 50)
    ) ?? claims.find(c =>
      r.claim_text && c.text.includes(r.claim_text.slice(0, 30))
    );
    if (!claim) {
      console.warn(`  ⚠ No matching claim found for index=${r.claim_index}, text="${r.claim_text?.slice(0, 80) ?? "(none)"}". Skipping.`);
      skipped++;
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
          original_verdict: r.verdict,
        })}::jsonb,
        NOW()
      )
    `;

    // Ingest full verdict into donto (quads, arguments, confidence, certificates, obligations)
    await ingestToDonto(claim, r);

    const icon = r.verdict === "reproduced" ? "✓" : r.verdict === "contradicted" ? "✗" : "~";
    console.log(`  ${icon} [${r.verdict.padEnd(14)}] ${r.claim_text.slice(0, 80)}`);
    stored++;
  }

  await sql`UPDATE papers SET status = 'done', updated_at = NOW() WHERE id = ${paperId}`;
  await sql.end();
  await dontoSql.end();

  const reproduced = results.filter((r) => r.verdict === "reproduced").length;
  const contradicted = results.filter((r) => r.verdict === "contradicted").length;
  const fragile = results.filter((r) => r.verdict === "fragile").length;

  console.log();
  console.log(`Stored ${stored} results for "${paper.title}"${skipped > 0 ? ` (${skipped} skipped — no matching claim)` : ""}`);
  console.log(`  Reproduced: ${reproduced} | Contradicted: ${contradicted} | Fragile: ${fragile} | Total: ${results.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
