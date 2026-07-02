import postgres from "postgres";

type DontoSql = ReturnType<typeof postgres>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface SimulationProvenanceInput {
  paperId: string;
  claimIri: string;
  verdict: string;
  reason: string;
  source: "codex-full-paper" | "codex-recovery" | "donto-graph" | "legacy";
  context?: string;
  jobId?: string | null;
  simulationId?: string | null;
  replicationUnitId?: string | null;
  sourceStatementIds?: string[];
  confidence?: number | null;
  evidenceMode?: string | null;
  limitations?: unknown;
  measurements?: unknown;
  artifacts?: unknown;
  workdir?: string | null;
  resultStatus?: string | null;
  unitType?: string | null;
  recovered?: boolean;
}

export interface ExistingSimulationStatementInput {
  paperId: string;
  context?: string;
  statementId: string;
  source: "legacy" | "donto-graph" | "codex-recovery";
  jobId?: string | null;
  simulationId?: string | null;
  replicationUnitId?: string | null;
  subject?: string | null;
  predicate?: string | null;
  value?: string | null;
}

export interface SimulationProvenanceResult {
  runId: string;
  statementIds: string[];
  linksCreated: number;
}

export function paperClaimsContext(paperId: string) {
  return `tp:paper:${paperId}:claims`;
}

export function dontoDsnFromEnv() {
  return process.env.DONTO_DSN || null;
}

export function createDontoSqlFromEnv() {
  const dsn = dontoDsnFromEnv();
  return dsn ? postgres(dsn, { max: 3 }) : null;
}

function jsonValue(value: unknown) {
  return value == null ? null : JSON.stringify(value);
}

function provenanceKey(input: {
  paperId: string;
  source: string;
  jobId?: string | null;
  simulationId?: string | null;
  replicationUnitId?: string | null;
}) {
  if (input.jobId) return `${input.source}:job:${input.jobId}`;
  if (input.simulationId) return `${input.source}:simulation:${input.simulationId}`;
  if (input.replicationUnitId) return `${input.source}:unit:${input.replicationUnitId}`;
  return `${input.source}:paper:${input.paperId}`;
}

function modelIdForSource(source: SimulationProvenanceInput["source"] | ExistingSimulationStatementInput["source"]) {
  switch (source) {
    case "codex-full-paper":
    case "codex-recovery":
      return "toiletpaper-codex-full-paper";
    case "donto-graph":
      return "toiletpaper-donto-graph-replication";
    default:
      return "toiletpaper-legacy-simulation-ingest";
  }
}

async function ensureSimulationRun(
  sql: DontoSql,
  input: {
    paperId: string;
    context: string;
    source: SimulationProvenanceInput["source"] | ExistingSimulationStatementInput["source"];
    jobId?: string | null;
    simulationId?: string | null;
    replicationUnitId?: string | null;
    workdir?: string | null;
    resultStatus?: string | null;
    recovered?: boolean;
  },
) {
  const key = provenanceKey(input);
  const modelId = modelIdForSource(input.source);
  const [existing] = await sql<{ run_id: string }[]>`
    SELECT run_id::text
    FROM donto_extraction_run
    WHERE context = ${input.context}
      AND model_id = ${modelId}
      AND metadata->>'toiletpaper_kind' = 'simulation_result_provenance'
      AND metadata->>'provenance_key' = ${key}
    ORDER BY started_at DESC
    LIMIT 1
  `;
  if (existing?.run_id) return existing.run_id;

  const metadata = {
    toiletpaper_kind: "simulation_result_provenance",
    provenance_key: key,
    paper_id: input.paperId,
    source: input.source,
    job_id: input.jobId ?? null,
    simulation_id: input.simulationId ?? null,
    replication_unit_id: input.replicationUnitId ?? null,
    workdir: input.workdir ?? null,
    result_status: input.resultStatus ?? null,
    recovered: Boolean(input.recovered),
  };

  const [created] = await sql<{ run_id: string }[]>`
    SELECT donto_start_extraction(
      ${modelId},
      ${"1.0.0"},
      ${null}::uuid,
      ${input.context},
      ${"scientific-paper-replication"},
      ${null}::double precision,
      ${null}::bigint,
      ${"simulation-result-statements"},
      ${sql.json({
        system: "toiletpaper",
        source: input.source,
        runner: input.jobId ? "codex" : "legacy",
      })}::jsonb,
      ${sql.json(metadata)}::jsonb
    )::text AS run_id
  `;
  return created.run_id;
}

async function completeRun(sql: DontoSql, runId: string) {
  const [row] = await sql<{ statements: number | string }[]>`
    SELECT count(DISTINCT statement_id) AS statements
    FROM donto_evidence_link
    WHERE target_run_id = ${runId}::uuid
      AND link_type = 'produced_by'
      AND upper_inf(tx_time)
  `;
  await sql`
    SELECT donto_complete_extraction(
      ${runId}::uuid,
      ${"completed"},
      ${Number(row?.statements ?? 0)}::bigint,
      ${0}::bigint
    )
  `;
}

async function assertLiteralStatement(
  sql: DontoSql,
  input: {
    subject: string;
    predicate: string;
    value: string;
    context: string;
  },
) {
  const [row] = await sql<{ statement_id: string }[]>`
    SELECT donto_assert(
      ${input.subject},
      ${input.predicate},
      ${null}::text,
      ${sql.json({ v: input.value, dt: "xsd:string" })}::jsonb,
      ${input.context},
      ${"asserted"},
      ${0},
      ${null}::date,
      ${null}::date,
      ${"toiletpaper:simulation-provenance"}
    )::text AS statement_id
  `;
  return row.statement_id;
}

async function linkProducedBy(
  sql: DontoSql,
  input: {
    statementId: string;
    runId: string;
    context: string;
    metadata: Record<string, unknown>;
  },
) {
  const [existing] = await sql<{ link_id: string }[]>`
    SELECT link_id::text
    FROM donto_evidence_link
    WHERE statement_id = ${input.statementId}::uuid
      AND link_type = 'produced_by'
      AND target_run_id = ${input.runId}::uuid
      AND upper_inf(tx_time)
    LIMIT 1
  `;
  if (existing?.link_id) {
    await sql`
      UPDATE donto_evidence_link
      SET metadata = metadata || ${sql.json(input.metadata)}::jsonb
      WHERE link_id = ${existing.link_id}::uuid
    `;
    return false;
  }

  await sql`
    INSERT INTO donto_evidence_link (
      statement_id,
      link_type,
      target_run_id,
      confidence,
      context,
      metadata
    )
    VALUES (
      ${input.statementId}::uuid,
      ${"produced_by"},
      ${input.runId}::uuid,
      ${null}::double precision,
      ${input.context},
      ${sql.json(input.metadata)}::jsonb
    )
  `;
  return true;
}

async function findArgumentTarget(
  sql: DontoSql,
  input: {
    context: string;
    claimIri: string;
    sourceStatementIds: string[];
  },
) {
  const candidateId = input.sourceStatementIds.find((id) => UUID_RE.test(id));
  if (candidateId) {
    const [target] = await sql<{ statement_id: string }[]>`
      SELECT statement_id::text
      FROM donto_statement
      WHERE statement_id = ${candidateId}::uuid
        AND context = ${input.context}
        AND upper_inf(tx_time)
      LIMIT 1
    `;
    if (target?.statement_id) return target.statement_id;
  }

  const [target] = await sql<{ statement_id: string }[]>`
    SELECT statement_id::text
    FROM donto_statement
    WHERE subject = ${input.claimIri}
      AND context = ${input.context}
      AND predicate IN ('tp:claimText', 'rdfs:label', 'schema:name')
      AND upper_inf(tx_time)
    ORDER BY
      CASE predicate
        WHEN 'tp:claimText' THEN 0
        WHEN 'rdfs:label' THEN 1
        ELSE 2
      END
    LIMIT 1
  `;
  return target?.statement_id ?? null;
}

async function assertVerdictArgument(
  sql: DontoSql,
  input: {
    verdictStatementId: string;
    targetStatementId: string | null;
    verdict: string;
    confidence: number | null;
    context: string;
    evidence: Record<string, unknown>;
  },
) {
  if (!input.targetStatementId) return;
  const relation =
    input.verdict === "reproduced"
      ? "supports"
      : input.verdict === "contradicted"
        ? "rebuts"
        : null;
  if (!relation) return;
  const strength =
    typeof input.confidence === "number"
      ? Math.max(0, Math.min(1, input.confidence))
      : null;
  await sql`
    SELECT donto_assert_argument(
      ${input.verdictStatementId}::uuid,
      ${input.targetStatementId}::uuid,
      ${relation},
      ${input.context},
      ${strength}::double precision,
      ${null}::uuid,
      ${sql.json(input.evidence)}::jsonb
    )
  `;
}

function provenanceMetadata(input: SimulationProvenanceInput) {
  return {
    toiletpaper_kind: "simulation_result_statement",
    source: input.source,
    paper_id: input.paperId,
    job_id: input.jobId ?? null,
    simulation_id: input.simulationId ?? null,
    replication_unit_id: input.replicationUnitId ?? null,
    source_statement_ids: input.sourceStatementIds ?? [],
    evidence_mode: input.evidenceMode ?? null,
    limitations: input.limitations ?? null,
    measurements_json: jsonValue(input.measurements),
    artifacts: input.artifacts ?? null,
    workdir: input.workdir ?? null,
    result_status: input.resultStatus ?? null,
    unit_type: input.unitType ?? null,
    recovered: Boolean(input.recovered),
  };
}

export async function recordSimulationResultProvenance(
  sql: DontoSql,
  input: SimulationProvenanceInput,
): Promise<SimulationProvenanceResult> {
  const context = input.context ?? paperClaimsContext(input.paperId);
  const runId = await ensureSimulationRun(sql, { ...input, context });
  const metadata = provenanceMetadata(input);

  const statementIds = [
    await assertLiteralStatement(sql, {
      subject: input.claimIri,
      predicate: "tp:simulationVerdict",
      value: input.verdict,
      context,
    }),
  ];

  if (input.reason.trim().length > 0) {
    statementIds.push(
      await assertLiteralStatement(sql, {
        subject: input.claimIri,
        predicate: "tp:verdictReason",
        value: input.reason,
        context,
      }),
    );
  }

  let linksCreated = 0;
  for (const statementId of statementIds) {
    const created = await linkProducedBy(sql, {
      statementId,
      runId,
      context,
      metadata,
    });
    if (created) linksCreated += 1;
    if (typeof input.confidence === "number" && Number.isFinite(input.confidence)) {
      await sql`
        SELECT donto_set_confidence(
          ${statementId}::uuid,
          ${Math.max(0, Math.min(1, input.confidence))},
          ${"model"},
          ${runId}::uuid
        )
      `;
    }
  }

  const targetStatementId = await findArgumentTarget(sql, {
    context,
    claimIri: input.claimIri,
    sourceStatementIds: input.sourceStatementIds ?? [],
  });
  await assertVerdictArgument(sql, {
    verdictStatementId: statementIds[0],
    targetStatementId,
    verdict: input.verdict,
    confidence: input.confidence ?? null,
    context,
    evidence: metadata,
  });

  await completeRun(sql, runId);
  return { runId, statementIds, linksCreated };
}

export async function linkExistingSimulationStatementProvenance(
  sql: DontoSql,
  input: ExistingSimulationStatementInput,
): Promise<{ runId: string; created: boolean }> {
  const context = input.context ?? paperClaimsContext(input.paperId);
  const runId = await ensureSimulationRun(sql, { ...input, context });
  const created = await linkProducedBy(sql, {
    statementId: input.statementId,
    runId,
    context,
    metadata: {
      toiletpaper_kind: "legacy_simulation_result_statement",
      source: input.source,
      paper_id: input.paperId,
      job_id: input.jobId ?? null,
      simulation_id: input.simulationId ?? null,
      replication_unit_id: input.replicationUnitId ?? null,
      subject: input.subject ?? null,
      predicate: input.predicate ?? null,
      value: input.value ?? null,
    },
  });
  await completeRun(sql, runId);
  return { runId, created };
}
