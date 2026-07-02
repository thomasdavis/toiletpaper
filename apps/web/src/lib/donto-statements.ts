import postgres from "postgres";
import type { DontoStatementInput } from "@toiletpaper/simulator";

type DontoSql = ReturnType<typeof postgres>;

let dontoSqlClient: DontoSql | null = null;

function getDontoSql(): DontoSql {
  const dsn = process.env.DONTO_DSN;
  if (!dsn) {
    throw new Error("DONTO_DSN is required to read graph statements");
  }
  if (!dontoSqlClient) {
    dontoSqlClient = postgres(dsn, { max: 2 });
  }
  return dontoSqlClient;
}

export function paperClaimsContext(paperId: string) {
  return `tp:paper:${paperId}:claims`;
}

export async function getDontoStatementsForPaper(
  paperId: string,
  opts: { limit?: number } = {},
): Promise<DontoStatementInput[]> {
  const sql = getDontoSql();
  const context = paperClaimsContext(paperId);
  const limit = Math.max(1, opts.limit ?? 10_000);

  const rows = await sql<{
    statement_id: string;
    subject: string;
    predicate: string;
    object_iri: string | null;
    object_lit: { v?: string | number | boolean; dt?: string } | null;
    context: string;
    confidence: number | null;
    evidence_quote: string | null;
  }[]>`
    SELECT
      s.statement_id::text,
      s.subject,
      s.predicate,
      s.object_iri,
      s.object_lit,
      s.context,
      c.confidence,
      ev.evidence_quote
    FROM donto_statement s
    LEFT JOIN donto_stmt_confidence c
      ON c.statement_id = s.statement_id
    LEFT JOIN LATERAL (
      SELECT sp.surface_text AS evidence_quote
      FROM donto_evidence_link el
      JOIN donto_span sp
        ON sp.span_id = el.target_span_id
      WHERE el.statement_id = s.statement_id
        AND upper_inf(el.tx_time)
        AND sp.surface_text IS NOT NULL
        AND length(sp.surface_text) > 0
      ORDER BY length(sp.surface_text) DESC
      LIMIT 1
    ) ev ON true
    WHERE s.context = ${context}
      AND upper_inf(s.tx_time)
    ORDER BY s.statement_id
    LIMIT ${limit}
  `;

  return rows.map((row) => ({
    statementId: row.statement_id,
    subject: row.subject,
    predicate: row.predicate,
    object_iri: row.object_iri,
    object_lit: row.object_lit
      ? {
          v: row.object_lit.v ?? "",
          dt: row.object_lit.dt,
        }
      : null,
    context: row.context,
    confidence: row.confidence ?? undefined,
    evidence_quote: row.evidence_quote ?? undefined,
  }));
}
