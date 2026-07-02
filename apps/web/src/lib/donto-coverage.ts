import postgres from "postgres";

type DontoSql = ReturnType<typeof postgres>;

let dontoSqlClient: DontoSql | null = null;

export interface DontoEvidenceCoverage {
  context: string;
  statementCount: number;
  evidenceLinkedCount: number;
  producedByCount: number;
  spanLinkedCount: number;
  confidenceRatedCount: number;
  shapeAnnotatedCount: number;
  certificateCount: number;
  verifiedCertificateCount: number;
  argumentCount: number;
  obligationCount: number;
  openObligationCount: number;
  missingEvidenceCount: number;
  missingProducedByCount: number;
  missingSpanCount: number;
  missingConfidenceCount: number;
  missingShapeAnnotationCount: number;
  missingCertificateCount: number;
  linkTypeCounts: Array<{
    linkType: string;
    links: number;
    statements: number;
  }>;
  recentRuns: Array<{
    runId: string;
    modelId: string | null;
    status: string;
    statementsEmitted: number;
    annotationsEmitted: number;
    startedAt: string;
    completedAt: string | null;
  }>;
}

function getDontoSql(): DontoSql {
  const dsn = process.env.DONTO_DSN;
  if (!dsn) {
    throw new Error("DONTO_DSN is required to read Donto evidence coverage");
  }
  if (!dontoSqlClient) {
    dontoSqlClient = postgres(dsn, { max: 2 });
  }
  return dontoSqlClient;
}

function paperClaimsContext(paperId: string) {
  return `tp:paper:${paperId}:claims`;
}

function intValue(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function nonNegative(value: number) {
  return Math.max(0, value);
}

export async function getDontoEvidenceCoverage(
  paperId: string,
): Promise<DontoEvidenceCoverage> {
  const sql = getDontoSql();
  const context = paperClaimsContext(paperId);

  const [coverageRows, linkRows, runRows] = await Promise.all([
    sql<{
      statement_count: number | string;
      evidence_linked_count: number | string;
      produced_by_count: number | string;
      span_linked_count: number | string;
      confidence_rated_count: number | string;
      shape_annotated_count: number | string;
      certificate_count: number | string;
      verified_certificate_count: number | string;
      argument_count: number | string;
      obligation_count: number | string;
      open_obligation_count: number | string;
    }[]>`
      WITH s AS (
        SELECT statement_id
        FROM donto_statement
        WHERE context = ${context}
          AND upper_inf(tx_time)
      )
      SELECT
        (SELECT count(*) FROM s) AS statement_count,
        (
          SELECT count(DISTINCT statement_id)
          FROM donto_evidence_link
          WHERE statement_id IN (SELECT statement_id FROM s)
            AND upper_inf(tx_time)
        ) AS evidence_linked_count,
        (
          SELECT count(DISTINCT statement_id)
          FROM donto_evidence_link
          WHERE statement_id IN (SELECT statement_id FROM s)
            AND link_type = 'produced_by'
            AND target_run_id IS NOT NULL
            AND upper_inf(tx_time)
        ) AS produced_by_count,
        (
          SELECT count(DISTINCT statement_id)
          FROM donto_evidence_link
          WHERE statement_id IN (SELECT statement_id FROM s)
            AND target_span_id IS NOT NULL
            AND upper_inf(tx_time)
        ) AS span_linked_count,
        (
          SELECT count(DISTINCT statement_id)
          FROM donto_stmt_confidence
          WHERE statement_id IN (SELECT statement_id FROM s)
        ) AS confidence_rated_count,
        (
          SELECT count(DISTINCT statement_id)
          FROM donto_stmt_shape_annotation
          WHERE statement_id IN (SELECT statement_id FROM s)
            AND upper_inf(tx_time)
        ) AS shape_annotated_count,
        (
          SELECT count(DISTINCT statement_id)
          FROM donto_stmt_certificate
          WHERE statement_id IN (SELECT statement_id FROM s)
        ) AS certificate_count,
        (
          SELECT count(DISTINCT statement_id)
          FROM donto_stmt_certificate
          WHERE statement_id IN (SELECT statement_id FROM s)
            AND verified_ok IS TRUE
        ) AS verified_certificate_count,
        (
          SELECT count(*)
          FROM donto_argument
          WHERE context = ${context}
            AND upper_inf(tx_time)
        ) AS argument_count,
        (
          SELECT count(*)
          FROM donto_proof_obligation
          WHERE context = ${context}
        ) AS obligation_count,
        (
          SELECT count(*)
          FROM donto_proof_obligation
          WHERE context = ${context}
            AND status = 'open'
        ) AS open_obligation_count
    `,
    sql<{
      link_type: string;
      links: number | string;
      statements: number | string;
    }[]>`
      WITH s AS (
        SELECT statement_id
        FROM donto_statement
        WHERE context = ${context}
          AND upper_inf(tx_time)
      )
      SELECT
        link_type,
        count(*) AS links,
        count(DISTINCT statement_id) AS statements
      FROM donto_evidence_link
      WHERE statement_id IN (SELECT statement_id FROM s)
        AND upper_inf(tx_time)
      GROUP BY link_type
      ORDER BY links DESC, link_type ASC
    `,
    sql<{
      run_id: string;
      model_id: string | null;
      status: string;
      statements_emitted: number | string;
      annotations_emitted: number | string;
      started_at: Date;
      completed_at: Date | null;
    }[]>`
      SELECT
        run_id::text,
        model_id,
        status,
        statements_emitted,
        annotations_emitted,
        started_at,
        completed_at
      FROM donto_extraction_run
      WHERE context = ${context}
      ORDER BY started_at DESC
      LIMIT 6
    `,
  ]);

  const row = coverageRows[0];
  const statementCount = intValue(row?.statement_count);
  const evidenceLinkedCount = intValue(row?.evidence_linked_count);
  const producedByCount = intValue(row?.produced_by_count);
  const spanLinkedCount = intValue(row?.span_linked_count);
  const confidenceRatedCount = intValue(row?.confidence_rated_count);
  const shapeAnnotatedCount = intValue(row?.shape_annotated_count);
  const certificateCount = intValue(row?.certificate_count);

  return {
    context,
    statementCount,
    evidenceLinkedCount,
    producedByCount,
    spanLinkedCount,
    confidenceRatedCount,
    shapeAnnotatedCount,
    certificateCount,
    verifiedCertificateCount: intValue(row?.verified_certificate_count),
    argumentCount: intValue(row?.argument_count),
    obligationCount: intValue(row?.obligation_count),
    openObligationCount: intValue(row?.open_obligation_count),
    missingEvidenceCount: nonNegative(statementCount - evidenceLinkedCount),
    missingProducedByCount: nonNegative(statementCount - producedByCount),
    missingSpanCount: nonNegative(statementCount - spanLinkedCount),
    missingConfidenceCount: nonNegative(statementCount - confidenceRatedCount),
    missingShapeAnnotationCount: nonNegative(statementCount - shapeAnnotatedCount),
    missingCertificateCount: nonNegative(statementCount - certificateCount),
    linkTypeCounts: linkRows.map((link) => ({
      linkType: link.link_type,
      links: intValue(link.links),
      statements: intValue(link.statements),
    })),
    recentRuns: runRows.map((run) => ({
      runId: run.run_id,
      modelId: run.model_id,
      status: run.status,
      statementsEmitted: intValue(run.statements_emitted),
      annotationsEmitted: intValue(run.annotations_emitted),
      startedAt: run.started_at.toISOString(),
      completedAt: run.completed_at?.toISOString() ?? null,
    })),
  };
}
