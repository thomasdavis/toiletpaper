#!/usr/bin/env npx tsx
/**
 * Recover/finalize a Codex full-paper replication job from an existing
 * results.json file. This is used when Codex finished writing results but the
 * launcher process was interrupted before it could ingest them into Postgres.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";
import type { ReplicationUnit, ReplicationUnitType } from "@toiletpaper/simulator";
import {
  createDontoSqlFromEnv,
  recordSimulationResultProvenance,
} from "./lib/donto-simulation-provenance";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://toiletpaper:toiletpaper@127.0.0.1:5434/toiletpaper";
const SIMULATOR_WORKDIR =
  process.env.SIMULATOR_WORKDIR ?? join("/tmp", "tp-simulations");
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface ReplicationUnitRow {
  id: string;
  paper_id: string;
  claim_iri: string;
  source_statement_ids: string[];
  domain: ReplicationUnit["domain"];
  unit_type: ReplicationUnitType;
}

interface CodexUnitResult {
  replication_unit_id?: string;
  unit_id?: string;
  verdict?: string;
  evidence_mode?: string;
  confidence?: number;
  reason?: string;
  measurements?: unknown;
  artifacts?: unknown;
  limitations?: string[];
  status?: string;
}

const COMMON_JOB_ARTIFACTS = [
  "src/replication_core.py",
  "experiments/full_paper_replication/run_full_replication.py",
  "experiments/full_paper_replication/coverage_report.json",
  "experiments/full_paper_replication/replication_summary.md",
  "experiments/full_paper_replication/artifact_manifest.json",
  "supplemental-artifacts.json",
  "artifact-gap-manifest.json",
  "artifact-gap-coverage.json",
];

function mergedArtifacts(rawArtifacts: unknown, workdir: string) {
  const artifacts = new Set<string>();
  if (Array.isArray(rawArtifacts)) {
    for (const artifact of rawArtifacts) {
      if (typeof artifact === "string") artifacts.add(artifact);
    }
  }
  for (const artifact of COMMON_JOB_ARTIFACTS) {
    if (existsSync(join(workdir, artifact))) artifacts.add(artifact);
  }
  return [...artifacts];
}

function arg(name: string) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

function canonicalVerdict(value: unknown) {
  const verdict = typeof value === "string" ? value : "inconclusive";
  if (
    verdict === "reproduced" ||
    verdict === "contradicted" ||
    verdict === "fragile" ||
    verdict === "inconclusive" ||
    verdict === "not_applicable" ||
    verdict === "vacuous" ||
    verdict === "system_error" ||
    verdict === "untested"
  ) {
    return verdict;
  }
  return "inconclusive";
}

function canonicalEvidenceMode(value: unknown) {
  return typeof value === "string" && value.length > 0
    ? value
    : "proxy_simulation";
}

function claimIdForUnit(row: ReplicationUnitRow) {
  const id = row.source_statement_ids?.[0];
  return id && UUID_RE.test(id) ? id : null;
}

async function main() {
  const jobId = arg("--job-id") ?? process.argv[2];
  if (!jobId) {
    console.error("Usage: ingest-codex-results.ts --job-id <id>");
    process.exit(1);
  }

  const sql = postgres(DATABASE_URL, { max: 4 });
  const dontoSql = createDontoSqlFromEnv();
  try {
    const [job] = await sql<{
      id: string;
      paper_id: string;
      scope: string;
    }[]>`
      SELECT id, paper_id, scope
      FROM simulation_jobs
      WHERE id = ${jobId}
    `;
    if (!job) throw new Error(`simulation job ${jobId} not found`);
    if (job.scope !== "full_codex_paper") {
      throw new Error(`job ${jobId} has unsupported scope ${job.scope}`);
    }

    const workdir = join(
      SIMULATOR_WORKDIR,
      "codex-full-paper",
      job.paper_id,
      jobId,
    );
    const resultsPath = join(workdir, "results.json");
    if (!existsSync(resultsPath)) {
      throw new Error(`results.json not found at ${resultsPath}`);
    }

    const [{ seq: maxSeq }] = await sql<{ seq: number }[]>`
      SELECT COALESCE(MAX(seq), 0)::int AS seq
      FROM simulation_logs
      WHERE paper_id = ${job.paper_id}
    `;
    let seq = maxSeq ?? 0;
    async function log(eventType: string, payload: unknown) {
      seq += 1;
      await sql`
        INSERT INTO simulation_logs (paper_id, seq, event_type, payload)
        VALUES (${job.paper_id}, ${seq}, ${eventType}, ${sql.json(payload)})
      `;
    }

    await log("job_recovery_started", { jobId, workdir, resultsPath });

    const rows = await sql<ReplicationUnitRow[]>`
      SELECT id, paper_id, claim_iri, source_statement_ids, domain, unit_type
      FROM replication_units
      WHERE paper_id = ${job.paper_id}
      ORDER BY created_at, id
    `;
    const byId = new Map(rows.map((row) => [row.id, row]));

    const parsed = JSON.parse(await readFile(resultsPath, "utf8")) as {
      status?: string;
      units?: CodexUnitResult[];
    };
    const resultUnits = parsed.units ?? [];
    const seenUnitIds = new Set<string>();
    let ingested = 0;
    let failed = 0;
    let dontoStatements = 0;
    let dontoLinksCreated = 0;

    for (const result of resultUnits) {
      const unitId = result.replication_unit_id ?? result.unit_id;
      if (!unitId) continue;
      const unit = byId.get(unitId);
      if (!unit) continue;
      seenUnitIds.add(unit.id);
      const claimId = claimIdForUnit(unit);
      if (!claimId) continue;
      const verdict = canonicalVerdict(result.verdict);
      const reason = result.reason ?? "Recovered Codex full-paper replication result.";
      const artifacts = mergedArtifacts(result.artifacts, workdir);
      const [inserted] = await sql<{ id: string }[]>`
        INSERT INTO simulations (
          claim_id,
          method,
          simulator_id,
          result,
          verdict,
          evidence_mode,
          limitations,
          metadata
        )
        VALUES (
          ${claimId},
          ${`codex-full-paper-${unit.unit_type}`},
          ${"codex-full-paper"},
            ${sql.json({
              reason,
              replicationUnitId: unit.id,
              jobId,
              status: result.status ?? parsed.status ?? "recovered",
              confidence: result.confidence ?? null,
              measurements: result.measurements ?? null,
              artifacts,
              workdir,
              domain: unit.domain,
              unitType: unit.unit_type,
              claimIri: unit.claim_iri,
              sourceStatementIds: unit.source_statement_ids ?? [],
              recovered: true,
            })},
          ${verdict},
          ${canonicalEvidenceMode(result.evidence_mode)},
          ${result.limitations ?? []},
          ${sql.json({
            codex_full_paper: true,
            job_id: jobId,
            replication_unit_id: unit.id,
            workdir,
            claim_iri: unit.claim_iri,
            source_statement_ids: unit.source_statement_ids ?? [],
            source_statement_count: unit.source_statement_ids?.length ?? 0,
            domain: unit.domain,
            unit_type: unit.unit_type,
            original_verdict: verdict,
            recovered: true,
          })}
        )
        RETURNING id::text
      `;
      if (dontoSql) {
        try {
          const provenance = await recordSimulationResultProvenance(dontoSql, {
            paperId: job.paper_id,
            claimIri: unit.claim_iri,
            verdict,
            reason,
            source: "codex-recovery",
            jobId,
            simulationId: inserted.id,
            replicationUnitId: unit.id,
            sourceStatementIds: unit.source_statement_ids ?? [],
            confidence: result.confidence ?? null,
            evidenceMode: canonicalEvidenceMode(result.evidence_mode),
            limitations: result.limitations ?? [],
            measurements: result.measurements ?? null,
            artifacts,
            workdir,
            resultStatus: result.status ?? parsed.status ?? "recovered",
            unitType: unit.unit_type,
            recovered: true,
          });
          dontoStatements += provenance.statementIds.length;
          dontoLinksCreated += provenance.linksCreated;
        } catch (e) {
          await log("donto_simulation_provenance_failed", {
            jobId,
            replicationUnitId: unit.id,
            simulationId: inserted.id,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
      ingested += 1;
      if (verdict === "system_error") failed += 1;
    }

    const missingUnitIds = rows
      .filter((row) => !seenUnitIds.has(row.id))
      .map((row) => row.id);
    if (missingUnitIds.length > 0) {
      failed += missingUnitIds.length;
      await log("job_recovery_results_incomplete", {
        jobId,
        resultUnits: resultUnits.length,
        expectedUnits: rows.length,
        missingUnitCount: missingUnitIds.length,
        missingUnitIds: missingUnitIds.slice(0, 200),
      });
    }

    await sql`
      UPDATE simulation_jobs
      SET state = ${parsed.status === "failed" ? "failed" : "succeeded"},
          completed_units = ${ingested},
          failed_units = ${failed},
          finished_at = NOW(),
          error_summary = ${parsed.status === "failed"
            ? "Recovered failed results.json."
            : missingUnitIds.length > 0
              ? `Recovered partial results; ${missingUnitIds.length} units missing.`
              : null}
      WHERE id = ${jobId}
    `;
    await sql`
      UPDATE papers
      SET status = ${parsed.status === "failed" ? "error" : "done"},
          updated_at = NOW()
      WHERE id = ${job.paper_id}
    `;
    await log("job_finished", {
      jobId,
      recovered: true,
      resultStatus: parsed.status ?? "recovered",
      ingested,
      failed,
      dontoStatements,
      dontoLinksCreated,
      workdir,
    });

    console.log(
      JSON.stringify({
        jobId,
        paperId: job.paper_id,
        ingested,
        failed,
        dontoStatements,
        dontoLinksCreated,
        workdir,
      }),
    );
  } finally {
    if (dontoSql) await dontoSql.end({ timeout: 5 });
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
