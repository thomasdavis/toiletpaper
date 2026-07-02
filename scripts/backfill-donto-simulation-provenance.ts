#!/usr/bin/env npx tsx
/**
 * Backfill Donto provenance for simulation result statements.
 *
 * This has two additive repairs:
 * 1. Assert current latest-Codex verdict/reason rows into Donto and link
 *    them to a Donto production run keyed by the Codex job id.
 * 2. Link old active tp:simulationVerdict/tp:verdictReason statements that
 *    predate provenance to a legacy simulation-ingest run.
 *
 * It never rewrites or retracts existing statements.
 */

import postgres from "postgres";
import {
  createDontoSqlFromEnv,
  linkExistingSimulationStatementProvenance,
  paperClaimsContext,
  recordSimulationResultProvenance,
} from "./lib/donto-simulation-provenance";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://toiletpaper:toiletpaper@127.0.0.1:5434/toiletpaper";

interface CodexSimulationRow {
  paper_id: string;
  claim_iri: string;
  simulation_id: string;
  verdict: string;
  reason: string | null;
  job_id: string;
  replication_unit_id: string | null;
  source_statement_ids: string[] | null;
  confidence: string | number | null;
  evidence_mode: string | null;
  limitations: string[] | null;
  measurements: unknown;
  artifacts: unknown;
  workdir: string | null;
  result_status: string | null;
  unit_type: string | null;
}

interface LegacyMissingRow {
  paper_id: string;
  context: string;
  statement_id: string;
  subject: string;
  predicate: string;
  value: string | null;
}

function arg(name: string) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function optionalPaperFilter(paperId?: string) {
  return paperId ? paperClaimsContext(paperId) : null;
}

function numberOrNull(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

async function fetchLatestCodexRows(
  sql: ReturnType<typeof postgres>,
  paperId?: string,
) {
  const paperFilter = paperId ?? null;
  return sql<CodexSimulationRow[]>`
    WITH latest_jobs AS (
      SELECT DISTINCT ON (paper_id)
        id::text AS id,
        paper_id
      FROM simulation_jobs
      WHERE scope = 'full_codex_paper'
        AND state = 'succeeded'
      ORDER BY paper_id, created_at DESC
    )
    SELECT
      p.id::text AS paper_id,
      c.donto_subject_iri AS claim_iri,
      s.id::text AS simulation_id,
      s.verdict::text AS verdict,
      s.result->>'reason' AS reason,
      COALESCE(s.metadata->>'job_id', s.result->>'jobId') AS job_id,
      COALESCE(s.metadata->>'replication_unit_id', s.result->>'replicationUnitId') AS replication_unit_id,
      ru.source_statement_ids,
      s.result->>'confidence' AS confidence,
      s.evidence_mode,
      s.limitations,
      s.result->'measurements' AS measurements,
      s.result->'artifacts' AS artifacts,
      s.result->>'workdir' AS workdir,
      s.result->>'status' AS result_status,
      ru.unit_type
    FROM simulations s
    JOIN claims c ON c.id = s.claim_id
    JOIN papers p ON p.id = c.paper_id
    JOIN latest_jobs lj ON lj.paper_id = p.id
    LEFT JOIN replication_units ru
      ON ru.id = COALESCE(s.metadata->>'replication_unit_id', s.result->>'replicationUnitId')
    WHERE c.donto_subject_iri IS NOT NULL
      AND s.verdict IS NOT NULL
      AND COALESCE(s.metadata->>'job_id', s.result->>'jobId') = lj.id
      AND (${paperFilter}::uuid IS NULL OR p.id = ${paperFilter}::uuid)
    ORDER BY p.id, s.created_at, s.id
  `;
}

async function fetchLegacyMissingRows(
  sql: ReturnType<typeof postgres>,
  paperId?: string,
) {
  const contextFilter = optionalPaperFilter(paperId);
  return sql<LegacyMissingRow[]>`
    SELECT
      substring(s.context from '^tp:paper:([^:]+):claims$') AS paper_id,
      s.context,
      s.statement_id::text AS statement_id,
      s.subject,
      s.predicate,
      s.object_lit->>'v' AS value
    FROM donto_statement s
    WHERE s.predicate IN ('tp:simulationVerdict', 'tp:verdictReason')
      AND upper_inf(s.tx_time)
      AND (${contextFilter}::text IS NULL OR s.context = ${contextFilter})
      AND NOT EXISTS (
        SELECT 1
        FROM donto_evidence_link el
        WHERE el.statement_id = s.statement_id
          AND el.link_type = 'produced_by'
          AND upper_inf(el.tx_time)
      )
    ORDER BY s.context, s.subject, s.predicate
  `;
}

async function main() {
  const paperId = arg("--paper-id");
  const dryRun = hasFlag("--dry-run");
  const skipCodex = hasFlag("--skip-codex");
  const skipLegacy = hasFlag("--skip-legacy");

  const dbSql = postgres(DATABASE_URL, { max: 3 });
  const dontoSql = createDontoSqlFromEnv();
  if (!dontoSql) {
    throw new Error("DONTO_DSN is required for Donto simulation provenance backfill");
  }

  const summary = {
    dryRun,
    paperId: paperId ?? null,
    codexRowsSeen: 0,
    codexRowsLinked: 0,
    codexStatements: 0,
    codexLinksCreated: 0,
    legacyRowsSeen: 0,
    legacyRowsLinked: 0,
  };

  try {
    if (!skipCodex) {
      const rows = await fetchLatestCodexRows(dbSql, paperId);
      summary.codexRowsSeen = rows.length;
      if (!dryRun) {
        for (const row of rows) {
          const result = await recordSimulationResultProvenance(dontoSql, {
            paperId: row.paper_id,
            claimIri: row.claim_iri,
            verdict: row.verdict,
            reason: row.reason ?? "Codex full-paper replication result.",
            source: "codex-full-paper",
            jobId: row.job_id,
            simulationId: row.simulation_id,
            replicationUnitId: row.replication_unit_id,
            sourceStatementIds: row.source_statement_ids ?? [],
            confidence: numberOrNull(row.confidence),
            evidenceMode: row.evidence_mode,
            limitations: row.limitations ?? [],
            measurements: row.measurements,
            artifacts: row.artifacts,
            workdir: row.workdir,
            resultStatus: row.result_status,
            unitType: row.unit_type,
          });
          summary.codexRowsLinked += 1;
          summary.codexStatements += result.statementIds.length;
          summary.codexLinksCreated += result.linksCreated;
        }
      }
    }

    if (!skipLegacy) {
      const rows = await fetchLegacyMissingRows(dontoSql, paperId);
      summary.legacyRowsSeen = rows.length;
      if (!dryRun) {
        for (const row of rows) {
          const result = await linkExistingSimulationStatementProvenance(dontoSql, {
            paperId: row.paper_id,
            context: row.context,
            statementId: row.statement_id,
            source: "legacy",
            subject: row.subject,
            predicate: row.predicate,
            value: row.value,
          });
          if (result.created) summary.legacyRowsLinked += 1;
        }
      }
    }

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await dbSql.end({ timeout: 5 });
    await dontoSql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
