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

// ── Fuzzy matching helpers ──────────────────────────────────────────

/** Levenshtein distance between two strings (bounded for perf). */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Limit computation for very long strings — compare first 200 chars
  const maxLen = 200;
  const sa = a.slice(0, maxLen);
  const sb = b.slice(0, maxLen);

  const m = sa.length;
  const n = sb.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);

  for (let i = 1; i <= m; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j]!;
      dp[j] = sa[i - 1] === sb[j - 1]
        ? prev
        : 1 + Math.min(prev, dp[j]!, dp[j - 1]!);
      prev = temp;
    }
  }
  return dp[n]!;
}

/** Normalized similarity score (0..1, higher = more similar). */
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length, 1);
  const dist = levenshtein(a.toLowerCase(), b.toLowerCase());
  return 1 - dist / Math.min(maxLen, 200);
}

/** Find the best matching claim for a given result text using multiple strategies. */
function findBestMatch(claims: Record<string, unknown>[], resultText: string | undefined): Record<string, unknown> | undefined {
  if (!resultText) return undefined;

  const normalized = resultText.trim().toLowerCase();

  // Strategy 1: Exact match on full text
  const exact = claims.find(c => (c.text as string).trim().toLowerCase() === normalized);
  if (exact) return exact;

  // Strategy 2: One text contains the other (handles truncation)
  const containsMatch = claims.find(c => {
    const ct = (c.text as string).trim().toLowerCase();
    return ct.includes(normalized) || normalized.includes(ct);
  });
  if (containsMatch) return containsMatch;

  // Strategy 3: Prefix match (first 60 chars)
  const prefix = normalized.slice(0, 60);
  const prefixMatch = claims.find(c =>
    (c.text as string).trim().toLowerCase().startsWith(prefix)
  );
  if (prefixMatch) return prefixMatch;

  // Strategy 4: Levenshtein similarity — pick the best above threshold
  let bestClaim: Record<string, unknown> | undefined;
  let bestScore = 0;
  const THRESHOLD = 0.6;

  for (const c of claims) {
    const score = similarity((c.text as string), resultText);
    if (score > bestScore) {
      bestScore = score;
      bestClaim = c;
    }
  }

  return bestScore >= THRESHOLD ? bestClaim : undefined;
}

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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    await fetch(`${DONTOSRV_URL}/assert`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subject, predicate, object_lit: objectLit, context }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function dontoAssertBatch(statements: Array<{ subject: string; predicate: string; object_lit: { v: string; dt: string }; context: string }>) {
  if (statements.length === 0) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    await fetch(`${DONTOSRV_URL}/assert/batch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ statements }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
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
    // Batch assert verdict quads
    const batch: Array<{ subject: string; predicate: string; object_lit: { v: string; dt: string }; context: string }> = [
      { subject: iri, predicate: "tp:simulationVerdict", object_lit: { v: r.verdict, dt: "xsd:string" }, context },
      { subject: iri, predicate: "tp:verdictReason", object_lit: { v: r.reason.slice(0, 500), dt: "xsd:string" }, context },
    ];
    if (r.measured_value != null) {
      batch.push({ subject: iri, predicate: "tp:measuredValue", object_lit: { v: String(r.measured_value), dt: "xsd:string" }, context });
    }
    if (r.expected_value != null) {
      batch.push({ subject: iri, predicate: "tp:expectedValue", object_lit: { v: String(r.expected_value), dt: "xsd:string" }, context });
    }
    await dontoAssertBatch(batch);

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
    claim_id?: string;
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
    not_evaluated_reason?: string;
    evidence_mode?: string;
    limitations?: string[];
    compute_tier?: "cpu" | "gpu";
    gpu_script?: string;
  }>;

  const claims = await sql`SELECT * FROM claims WHERE paper_id = ${paperId} ORDER BY created_at`;
  const [paper] = await sql`SELECT * FROM papers WHERE id = ${paperId}`;

  let stored = 0;
  let skipped = 0;
  let matchedById = 0;
  let matchedByText = 0;
  const matchedClaimIds = new Set<string>();
  for (const r of results) {
    let claim: Record<string, unknown> | undefined;

    // Strategy 0: Exact match by claim_id UUID (preferred — deterministic)
    if (r.claim_id) {
      claim = claims.find(c => (c.id as string) === r.claim_id);
      if (claim) {
        matchedById++;
      } else {
        console.warn(`  ⚠ claim_id="${r.claim_id}" not found in DB — falling back to text matching`);
      }
    }

    // Fallback: Match by text similarity (for old results without claim_id)
    if (!claim) {
      const unmatched = claims.filter(c => !matchedClaimIds.has(c.id as string));
      claim = findBestMatch(unmatched, r.claim_text)
        ?? findBestMatch(claims, r.claim_text); // fallback: allow re-match if all else fails
      if (claim) matchedByText++;
    }

    if (!claim) {
      console.warn(`  ⚠ No matching claim found for index=${r.claim_index}, text="${r.claim_text?.slice(0, 80) ?? "(none)"}". Skipping.`);
      skipped++;
      continue;
    }
    matchedClaimIds.add(claim.id as string);

    const dbVerdict = r.verdict === "reproduced" ? "confirmed"
      : r.verdict === "contradicted" ? "refuted"
      : "inconclusive"; // covers not_simulable, not_testable, not_evaluated, underdetermined, fragile

    // Validate evidence_mode against known values; null if unrecognised
    const VALID_EVIDENCE_MODES = ["exact_artifact", "independent_implementation", "proxy_simulation", "static_check", "formal_proof", "insufficient"];
    const evidenceMode = r.evidence_mode && VALID_EVIDENCE_MODES.includes(r.evidence_mode) ? r.evidence_mode : null;
    const limitations = Array.isArray(r.limitations) && r.limitations.length > 0 ? r.limitations : null;

    await sql`
      INSERT INTO simulations (id, claim_id, method, result, verdict, evidence_mode, limitations, metadata, created_at)
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
          ...(r.not_evaluated_reason ? { not_evaluated_reason: r.not_evaluated_reason } : {}),
        })}::jsonb,
        ${dbVerdict},
        ${evidenceMode},
        ${limitations},
        ${JSON.stringify({
          simulation_file: r.simulation_file,
          test_type: r.test_type,
          paper_id: paperId,
          original_verdict: r.verdict,
          ...(r.not_evaluated_reason ? { not_evaluated_reason: r.not_evaluated_reason } : {}),
          ...(r.compute_tier ? { compute_tier: r.compute_tier } : {}),
          ...(r.gpu_script ? { gpu_script: r.gpu_script } : {}),
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
  console.log(`  Matched by ID: ${matchedById} | Matched by text: ${matchedByText}`);
  console.log(`  Reproduced: ${reproduced} | Contradicted: ${contradicted} | Fragile: ${fragile} | Total: ${results.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
