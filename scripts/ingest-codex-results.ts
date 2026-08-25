#!/usr/bin/env npx tsx
/**
 * Recover/finalize a Codex full-paper replication job from an existing
 * results.json file. This is used when Codex finished writing results but the
 * launcher process was interrupted before it could ingest them into Postgres.
 *
 * PRD-010: this path applies the SAME gate order as the live path
 * (extraction → compilation → correspondence → execution → verdict) via the
 * shared replication-gates module, and writes the same per-paper
 * replication bundle — recovery must never be a way around the gates.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";
import type { ReplicationUnit } from "@toiletpaper/simulator";
import {
  createDontoSqlFromEnv,
  recordSimulationResultProvenance,
} from "./lib/donto-simulation-provenance";
import { rowToUnit, type ReplicationUnitRow } from "./lib/replication-unit-row";
import {
  describeBundleFiles,
  loadCorrespondenceManifest,
  resolveReceiptCodeDigests,
  writeReplicationBundle,
  REPLICATION_BUNDLE_FILENAME,
} from "./lib/replication-bundle-io";
import { gateUnitVerdict } from "../apps/web/src/lib/replication-gates";
import type { BundleUnitInput } from "../apps/web/src/lib/replication-bundle";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://toiletpaper:toiletpaper@127.0.0.1:5434/toiletpaper";
const SIMULATOR_WORKDIR =
  process.env.SIMULATOR_WORKDIR ?? join("/tmp", "tp-simulations");
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  "correspondence-manifest.json",
  "replication-bundle.json",
];

const BUNDLE_FILE_LIST: Array<{
  relativePath: string;
  phase: "input" | "runtime" | "output";
}> = [
  { relativePath: "paper.json", phase: "input" },
  { relativePath: "paper-text.txt", phase: "input" },
  { relativePath: "donto-statements.json", phase: "input" },
  { relativePath: "replication-units.json", phase: "input" },
  { relativePath: "deterministic-executions.json", phase: "input" },
  { relativePath: "supplemental-artifacts.json", phase: "input" },
  { relativePath: "artifact-gap-manifest.json", phase: "input" },
  { relativePath: "artifact-gap-coverage.json", phase: "input" },
  { relativePath: "prompt.md", phase: "runtime" },
  { relativePath: "codex-command.json", phase: "runtime" },
  { relativePath: "toiletpaper-job-events.jsonl", phase: "runtime" },
  { relativePath: "codex-events.jsonl", phase: "runtime" },
  { relativePath: "codex-stderr.log", phase: "runtime" },
  { relativePath: "progress.json", phase: "runtime" },
  { relativePath: "results.json", phase: "output" },
  { relativePath: "correspondence-manifest.json", phase: "output" },
  {
    relativePath: "experiments/full_paper_replication/coverage_report.json",
    phase: "output",
  },
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

function claimIdForUnit(unit: ReplicationUnit) {
  const id = unit.sourceStatementIds[0];
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
      SELECT * FROM replication_units
      WHERE paper_id = ${job.paper_id}
      ORDER BY created_at, id
    `;
    const units = rows.map(rowToUnit);
    const byId = new Map(units.map((unit) => [unit.id, unit]));

    const correspondence = await loadCorrespondenceManifest(workdir);
    await log("correspondence_manifest_loaded", {
      jobId,
      recovered: true,
      path: correspondence.path,
      exists: correspondence.exists,
      receiptCount: correspondence.receiptCount,
      unparseableEntries: correspondence.unparseableEntries,
      error: correspondence.error,
    });

    const parsed = JSON.parse(await readFile(resultsPath, "utf8")) as {
      status?: string;
      units?: CodexUnitResult[];
    };
    const resultUnits = parsed.units ?? [];
    const seenUnitIds = new Set<string>();
    const bundleUnits: BundleUnitInput[] = [];
    let ingested = 0;
    let failed = 0;
    let demotedCount = 0;
    let dontoStatements = 0;
    let dontoLinksCreated = 0;

    for (const result of resultUnits) {
      const unitId = result.replication_unit_id ?? result.unit_id;
      if (!unitId) continue;
      const unit = byId.get(unitId);
      if (!unit) continue;
      seenUnitIds.add(unit.id);
      const reason = result.reason ?? "Recovered Codex full-paper replication result.";
      const artifacts = mergedArtifacts(result.artifacts, workdir);

      const rawReceipt = correspondence.receipts.get(unit.id) ?? null;
      const receipt = rawReceipt
        ? await resolveReceiptCodeDigests(rawReceipt, workdir)
        : null;
      const gated = gateUnitVerdict({
        unit,
        rawVerdict: result.verdict,
        rawEvidenceMode: result.evidence_mode,
        receipt,
        executionEvidence: {
          measurements: result.measurements ?? null,
          reportedArtifacts: result.artifacts ?? null,
        },
      });
      if (gated.demoted) {
        demotedCount += 1;
        await log("verdict_demoted", {
          jobId,
          recovered: true,
          replicationUnitId: unit.id,
          ungatedVerdict: gated.ungatedVerdict,
          gateFailures: gated.gateFailures,
        });
      }
      const verdict = gated.verdict;

      const claimId = claimIdForUnit(unit);
      let simulationId: string | null = null;
      if (claimId) {
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
          ${`codex-full-paper-${unit.unitType}`},
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
              unitType: unit.unitType,
              claimIri: unit.claimIri,
              sourceStatementIds: unit.sourceStatementIds,
              recovered: true,
              gates: gated.gates,
              correspondenceReceipt: receipt,
            })},
          ${verdict},
          ${gated.evidenceMode},
          ${result.limitations ?? []},
          ${sql.json({
            codex_full_paper: true,
            job_id: jobId,
            replication_unit_id: unit.id,
            workdir,
            claim_iri: unit.claimIri,
            source_statement_ids: unit.sourceStatementIds,
            source_statement_count: unit.sourceStatementIds.length,
            domain: unit.domain,
            unit_type: unit.unitType,
            original_verdict: verdict,
            recovered: true,
            gated: true,
            demoted: gated.demoted,
            // NOT original_verdict: normalizeVerdict() would re-promote it.
            ungated_verdict: gated.ungatedVerdict,
            gate_failures: gated.gateFailures,
            claim_ceiling: gated.claimCeiling,
            correspondence_receipt_present: receipt !== null,
            correspondence_receipt_valid:
              gated.gates.find((gate) => gate.gate === "correspondence")
                ?.status === "passed",
          })}
        )
        RETURNING id::text
      `;
        simulationId = inserted.id;
        if (dontoSql) {
          try {
            const provenance = await recordSimulationResultProvenance(dontoSql, {
              paperId: job.paper_id,
              claimIri: unit.claimIri,
              verdict,
              reason,
              source: "codex-recovery",
              jobId,
              simulationId: inserted.id,
              replicationUnitId: unit.id,
              sourceStatementIds: unit.sourceStatementIds,
              confidence: result.confidence ?? null,
              evidenceMode: gated.evidenceMode,
              limitations: result.limitations ?? [],
              measurements: result.measurements ?? null,
              artifacts,
              workdir,
              resultStatus: result.status ?? parsed.status ?? "recovered",
              unitType: unit.unitType,
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

      bundleUnits.push({
        unit,
        gated,
        receipt,
        confidence: result.confidence ?? null,
        reason,
        simulationId,
        artifacts: artifacts.map((path) => ({ path, sha256: null })),
        missingResult: false,
      });
    }

    const missingUnitIds = units
      .filter((unit) => !seenUnitIds.has(unit.id))
      .map((unit) => unit.id);
    if (missingUnitIds.length > 0) {
      failed += missingUnitIds.length;
      await log("job_recovery_results_incomplete", {
        jobId,
        resultUnits: resultUnits.length,
        expectedUnits: units.length,
        missingUnitCount: missingUnitIds.length,
        missingUnitIds: missingUnitIds.slice(0, 200),
      });
    }

    // Coverage gaps must never read as reproduced: units without results
    // enter the bundle as explicit untested entries.
    for (const unit of units) {
      if (seenUnitIds.has(unit.id)) continue;
      bundleUnits.push({
        unit,
        gated: gateUnitVerdict({
          unit,
          rawVerdict: undefined,
          rawEvidenceMode: undefined,
          receipt: null,
          executionEvidence: { measurements: null, reportedArtifacts: null },
        }),
        receipt: null,
        confidence: null,
        reason: "no result was returned for this unit",
        simulationId: null,
        artifacts: [],
        missingResult: true,
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

    // PRD-010: the recovery path writes the same replication bundle.
    try {
      const [paper] = await sql<
        { title: string | null; doi: string | null; arxiv_id: string | null }[]
      >`
        SELECT title, doi, arxiv_id FROM papers WHERE id = ${job.paper_id}
      `;
      const bundleFiles = await describeBundleFiles({
        workdir,
        files: BUNDLE_FILE_LIST,
      });
      let dontoStatementCount = 0;
      try {
        const manifest = JSON.parse(
          await readFile(join(workdir, "donto-statements.json"), "utf8"),
        ) as { count?: number };
        dontoStatementCount =
          typeof manifest.count === "number" ? manifest.count : 0;
      } catch {
        // donto-statements.json missing/corrupt — count stays 0.
      }
      const bundleResult = await writeReplicationBundle({
        sql,
        workdir,
        build: {
          paper: {
            id: job.paper_id,
            title: paper?.title ?? null,
            doi: paper?.doi ?? null,
            arxivId: paper?.arxiv_id ?? null,
            sourceSha256: null,
          },
          job: {
            id: jobId,
            resultStatus: parsed.status ?? "recovered",
            exitCode: null,
            timedOut: false,
          },
          units: bundleUnits,
          dontoStatementCount,
          files: bundleFiles,
        },
      });
      await log("replication_bundle_written", {
        jobId,
        recovered: true,
        path: bundleResult.bundlePath,
        artifactId: bundleResult.bundle.manifest.artifactId,
        sha256: bundleResult.bundle.sha256,
        unitCount: bundleResult.bundle.manifest.coverage.unitCount,
        demotedSignalCount:
          bundleResult.bundle.manifest.coverage.verdicts.demotedSignalCount,
        missingResultUnits:
          bundleResult.bundle.manifest.coverage.missingResultUnitIds.length,
        dbInsert: bundleResult.dbInsert,
        dbError: bundleResult.dbError,
      });
    } catch (e) {
      await log("replication_bundle_failed", {
        jobId,
        recovered: true,
        error: e instanceof Error ? e.message : String(e),
      });
    }

    await log("job_finished", {
      jobId,
      recovered: true,
      resultStatus: parsed.status ?? "recovered",
      ingested,
      failed,
      demoted: demotedCount,
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
        demoted: demotedCount,
        dontoStatements,
        dontoLinksCreated,
        workdir,
        bundle: join(workdir, REPLICATION_BUNDLE_FILENAME),
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
