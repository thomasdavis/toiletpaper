#!/usr/bin/env npx tsx
/**
 * Add missing produced_by evidence links for paper-level metadata statements.
 *
 * Older Toiletpaper ingests asserted schema:name/schema:author/etc. before
 * collecting statement ids, so those metadata statements missed extraction-run
 * provenance. This script is additive: it never edits statements, and it only
 * links active paper-subject statements that currently lack a produced_by link
 * to an existing completed extraction run for the same paper context.
 */

import postgres from "postgres";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface ContextRow {
  context: string;
  paper_id: string;
}

interface MissingStatementRow {
  statement_id: string;
  subject: string;
  predicate: string;
}

function arg(name: string) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

function positionalPaperId() {
  return process.argv.slice(2).find((value) => !value.startsWith("--"));
}

function dontoDsn() {
  const dsn = process.env.DONTO_DSN;
  if (!dsn) {
    throw new Error("DONTO_DSN is required");
  }
  return dsn;
}

function paperContext(paperId: string) {
  return `tp:paper:${paperId}:claims`;
}

function paperIri(paperId: string) {
  return `tp:paper:${paperId}`;
}

function paperIdFromContext(context: string) {
  const match = context.match(/^tp:paper:([^:]+):claims$/);
  return match?.[1] ?? null;
}

async function contextsToBackfill(sql: postgres.Sql) {
  const requestedPaperId = arg("--paper-id") ?? positionalPaperId();
  if (requestedPaperId) {
    if (!UUID_RE.test(requestedPaperId)) {
      throw new Error(`invalid paper id: ${requestedPaperId}`);
    }
    return [{ context: paperContext(requestedPaperId), paper_id: requestedPaperId }];
  }

  const rows = await sql<{ context: string }[]>`
    SELECT DISTINCT context
    FROM donto_statement
    WHERE context LIKE 'tp:paper:%:claims'
      AND upper_inf(tx_time)
    ORDER BY context
  `;

  return rows.flatMap((row): ContextRow[] => {
    const paperId = paperIdFromContext(row.context);
    return paperId && UUID_RE.test(paperId)
      ? [{ context: row.context, paper_id: paperId }]
      : [];
  });
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const sql = postgres(dontoDsn(), { max: 2 });
  const summary: Array<{
    context: string;
    runId: string | null;
    missing: number;
    linked: number;
    dryRun: boolean;
    predicates: Record<string, number>;
  }> = [];

  try {
    for (const item of await contextsToBackfill(sql)) {
      const [run] = await sql<{ run_id: string }[]>`
        SELECT run_id::text
        FROM donto_extraction_run
        WHERE context = ${item.context}
          AND status = 'completed'
        ORDER BY started_at ASC
        LIMIT 1
      `;

      const missing = await sql<MissingStatementRow[]>`
        SELECT statement_id::text, subject, predicate
        FROM donto_statement s
        WHERE s.context = ${item.context}
          AND s.subject = ${paperIri(item.paper_id)}
          AND upper_inf(s.tx_time)
          AND NOT EXISTS (
            SELECT 1
            FROM donto_evidence_link el
            WHERE el.statement_id = s.statement_id
              AND el.link_type = 'produced_by'
              AND el.target_run_id IS NOT NULL
              AND upper_inf(el.tx_time)
          )
        ORDER BY predicate, statement_id
      `;

      const predicates: Record<string, number> = {};
      for (const row of missing) {
        predicates[row.predicate] = (predicates[row.predicate] ?? 0) + 1;
      }

      let linked = 0;
      if (run && !dryRun) {
        for (const row of missing) {
          await sql`
            SELECT donto_link_evidence_run(
              ${row.statement_id}::uuid,
              ${run.run_id}::uuid,
              ${"produced_by"},
              ${item.context}
            )
          `;
          linked += 1;
        }
      }

      summary.push({
        context: item.context,
        runId: run?.run_id ?? null,
        missing: missing.length,
        linked,
        dryRun,
        predicates,
      });
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  console.log(JSON.stringify({ summary }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
