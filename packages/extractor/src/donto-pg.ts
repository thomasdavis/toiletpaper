import postgres from "postgres";

const DONTO_DSN =
  process.env.DONTO_DSN ??
  "postgres://donto:donto@127.0.0.1:55433/donto";

let _sql: ReturnType<typeof postgres> | null = null;

function pg() {
  if (!_sql) _sql = postgres(DONTO_DSN, { max: 3 });
  return _sql;
}

export async function startExtraction(opts: {
  model: string;
  version: string;
  revisionId: string;
  context: string;
  temperature?: number;
  toolchain?: string;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const sql = pg();
  const [row] = await sql`
    SELECT donto_start_extraction(
      ${opts.model},
      ${opts.version},
      ${opts.revisionId}::uuid,
      ${opts.context},
      ${"scientific-paper-extraction"},
      ${opts.temperature ?? 0.1},
      ${null}::bigint,
      ${"full-document"},
      ${JSON.stringify({ provider: opts.toolchain ?? "openai" })}::jsonb,
      ${JSON.stringify(opts.metadata ?? {})}::jsonb
    ) AS run_id
  `;
  return row.run_id as string;
}

export async function completeExtraction(
  runId: string,
  statementCount: number,
): Promise<void> {
  const sql = pg();
  await sql`
    SELECT donto_complete_extraction(
      ${runId}::uuid, ${"completed"}, ${statementCount}::bigint, ${0}::bigint
    )
  `;
}

export async function setConfidence(
  statementId: string,
  confidence: number,
  runId: string,
): Promise<void> {
  const sql = pg();
  await sql`
    SELECT donto_set_confidence(
      ${statementId}::uuid, ${confidence}, ${"extraction"}, ${runId}::uuid
    )
  `;
}

export async function createCharSpan(
  revisionId: string,
  start: number,
  end: number,
  surfaceText: string,
): Promise<string> {
  const sql = pg();
  const [row] = await sql`
    SELECT donto_create_char_span(
      ${revisionId}::uuid, ${start}, ${end}, ${surfaceText}
    ) AS span_id
  `;
  return row.span_id as string;
}

export async function linkEvidenceRun(
  statementId: string,
  runId: string,
  context: string,
): Promise<string> {
  const sql = pg();
  const [row] = await sql`
    SELECT donto_link_evidence_run(
      ${statementId}::uuid, ${runId}::uuid, ${"produced_by"}, ${context}
    ) AS link_id
  `;
  return row.link_id as string;
}

export async function linkEvidenceSpan(
  statementId: string,
  spanId: string,
  confidence: number | null,
  context: string,
): Promise<string> {
  const sql = pg();
  const [row] = await sql`
    SELECT donto_link_evidence_span(
      ${statementId}::uuid, ${spanId}::uuid, ${"extracted_from"},
      ${confidence}, ${context}
    ) AS link_id
  `;
  return row.link_id as string;
}

export async function assertArgument(
  sourceStmtId: string,
  targetStmtId: string,
  relation: string,
  context: string,
  strength: number | null,
): Promise<string> {
  const sql = pg();
  const [row] = await sql`
    SELECT donto_assert_argument(
      ${sourceStmtId}::uuid, ${targetStmtId}::uuid, ${relation},
      ${context}, ${strength}
    ) AS argument_id
  `;
  return row.argument_id as string;
}

export async function attachShapeReport(
  statementId: string,
  shapeIri: string,
  verdict: string,
  context: string,
): Promise<void> {
  const sql = pg();
  await sql`
    SELECT donto_attach_shape_report(
      ${statementId}::uuid, ${shapeIri}, ${verdict}, ${context}
    )
  `;
}

export async function autoValidate(context: string): Promise<{
  datatype_checks: number;
  numeric_checks: number;
  total: number;
}> {
  const sql = pg();
  const [row] = await sql`
    SELECT donto_auto_validate(${context}) AS result
  `;
  return row.result as { datatype_checks: number; numeric_checks: number; total: number };
}

export async function attachCertificate(
  statementId: string,
  kind: string,
  body: Record<string, unknown>,
): Promise<void> {
  const sql = pg();
  await sql`
    SELECT donto_attach_certificate(
      ${statementId}::uuid,
      ${kind},
      ${JSON.stringify(body)}::jsonb
    )
  `;
}

export async function recordVerification(
  statementId: string,
  verifier: string,
  ok: boolean,
): Promise<void> {
  const sql = pg();
  await sql`
    SELECT donto_record_verification(
      ${statementId}::uuid, ${verifier}, ${ok}
    )
  `;
}
