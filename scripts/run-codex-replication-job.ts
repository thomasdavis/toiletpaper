#!/usr/bin/env npx tsx
/**
 * Run a long-lived Codex full-paper replication job.
 *
 * This is intentionally a script, not a Next.js request handler. Replicating
 * a paper can take an hour or more, and the browser/API request should only
 * start the job and stream progress from simulation_logs.
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import postgres from "postgres";
import {
  executeReplicationUnit,
  type ReplicationAgentResult,
  type ReplicationUnit,
} from "@toiletpaper/simulator";
import {
  createDontoSqlFromEnv,
  recordSimulationResultProvenance,
} from "./lib/donto-simulation-provenance";
import { rowToUnit, type ReplicationUnitRow } from "./lib/replication-unit-row";
import {
  CORRESPONDENCE_MANIFEST_FILENAME,
  REPLICATION_BUNDLE_FILENAME,
  describeBundleFiles,
  loadCorrespondenceManifest,
  resolveReceiptCodeDigests,
  writeReplicationBundle,
} from "./lib/replication-bundle-io";
import {
  loadPaperArtifactManifest,
  paperArtifactDir,
  type PaperArtifactManifest,
} from "../apps/web/src/lib/paper-artifacts";
import { summarizeReplicationGapManifest } from "../apps/web/src/lib/replication-gap-manifest";
import { summarizeArtifactGapCoverage } from "../apps/web/src/lib/artifact-gap-coverage";
import { gateUnitVerdict } from "../apps/web/src/lib/replication-gates";
import type { BundleUnitInput } from "../apps/web/src/lib/replication-bundle";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://toiletpaper:toiletpaper@127.0.0.1:5434/toiletpaper";
const SIMULATOR_WORKDIR =
  process.env.SIMULATOR_WORKDIR ?? join("/tmp", "tp-simulations");
const UPLOADS_DIR =
  process.env.UPLOADS_DIR ?? join(process.cwd(), "uploads");
const PUBLIC_ORIGIN =
  process.env.TOILETPAPER_PUBLIC_ORIGIN ??
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.APP_URL ??
  "https://toiletpaper.dev";
const CODEX_BIN = process.env.CODEX_BIN ?? "codex";
const CODEX_TIMEOUT_MS = boundedInt(
  process.env.CODEX_FULL_PAPER_TIMEOUT_MS ??
    process.env.CODEX_SIMULATION_TIMEOUT_MS ??
    "7200000",
  60 * 60 * 1000,
  24 * 60 * 60 * 1000,
);
const CODEX_SANDBOX =
  process.env.CODEX_SIMULATION_SANDBOX ?? "danger-full-access";
const CODEX_DONTO_STATEMENT_LIMIT = boundedInt(
  process.env.CODEX_DONTO_STATEMENT_LIMIT ?? "50000",
  50_000,
  200_000,
);

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

interface SimulationSnapshotRow {
  id: string;
  claim_id: string;
  verdict: string | null;
  evidence_mode: string | null;
  result: unknown;
  metadata: unknown;
  limitations: string[] | null;
  created_at: Date;
  claim_text: string | null;
}

const COMMON_JOB_ARTIFACTS = [
  "src/replication_core.py",
  "src/full_paper_replication.mjs",
  "experiments/full_paper_replication/run_full_replication.py",
  "experiments/full_paper_replication/coverage_report.json",
  "experiments/full_paper_replication/replication_summary.md",
  "experiments/full_paper_replication/artifact_manifest.json",
  "replication-dossier-snapshot.json",
  "supplemental-artifacts.json",
  "artifact-gap-manifest.json",
  "artifact-gap-coverage.json",
  "correspondence-manifest.json",
  "replication-bundle.json",
];

const DOSSIER_SNAPSHOT_VERSION =
  "toiletpaper.codex-replication-dossier-snapshot.v1";
const DOSSIER_HASH_MAX_BYTES = boundedInt(
  process.env.CODEX_DOSSIER_HASH_MAX_BYTES ?? "67108864",
  64 * 1024 * 1024,
  1024 * 1024 * 1024,
);

const DOSSIER_CORE_FILES = [
  { relativePath: "paper.json", phase: "input", required: true },
  { relativePath: "paper-text.txt", phase: "input", required: false },
  { relativePath: "donto-statements.json", phase: "input", required: true },
  { relativePath: "replication-units.json", phase: "input", required: true },
  { relativePath: "deterministic-executions.json", phase: "input", required: true },
  { relativePath: "supplemental-artifacts.json", phase: "input", required: true },
  { relativePath: "artifact-gap-manifest.json", phase: "input", required: true },
  { relativePath: "artifact-gap-coverage.json", phase: "input", required: true },
  { relativePath: "prompt.md", phase: "runtime", required: true },
  { relativePath: "codex-command.json", phase: "runtime", required: true },
  { relativePath: "toiletpaper-job-events.jsonl", phase: "runtime", required: true },
  { relativePath: "codex-events.jsonl", phase: "runtime", required: true },
  { relativePath: "codex-stderr.log", phase: "runtime", required: false },
  { relativePath: "progress.json", phase: "runtime", required: false },
  { relativePath: "results.json", phase: "output", required: true },
  { relativePath: "correspondence-manifest.json", phase: "output", required: true },
  { relativePath: "replication-bundle.json", phase: "output", required: true },
  {
    relativePath: "experiments/full_paper_replication/coverage_report.json",
    phase: "output",
    required: true,
  },
] as const;

const DOSSIER_GENERATED_DIRS = ["src", "experiments"];

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

type DossierHashStatus = "computed" | "missing" | "too_large";
type DossierPhase = "input" | "runtime" | "output";

interface FrozenDossierFile {
  relativePath: string;
  phase: DossierPhase;
  required: boolean;
  exists: boolean;
  byteLength: number | null;
  updatedAt: string | null;
  sha256: string | null;
  hashStatus: DossierHashStatus;
}

async function describeDossierFile(input: {
  workdir: string;
  relativePath: string;
  phase: DossierPhase;
  required: boolean;
}): Promise<FrozenDossierFile> {
  const absolutePath = join(input.workdir, input.relativePath);
  try {
    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile()) {
      return {
        relativePath: input.relativePath,
        phase: input.phase,
        required: input.required,
        exists: false,
        byteLength: null,
        updatedAt: null,
        sha256: null,
        hashStatus: "missing",
      };
    }
    if (fileStat.size > DOSSIER_HASH_MAX_BYTES) {
      return {
        relativePath: input.relativePath,
        phase: input.phase,
        required: input.required,
        exists: true,
        byteLength: fileStat.size,
        updatedAt: fileStat.mtime.toISOString(),
        sha256: null,
        hashStatus: "too_large",
      };
    }
    const sha256 = createHash("sha256")
      .update(await readFile(absolutePath))
      .digest("hex");
    return {
      relativePath: input.relativePath,
      phase: input.phase,
      required: input.required,
      exists: true,
      byteLength: fileStat.size,
      updatedAt: fileStat.mtime.toISOString(),
      sha256,
      hashStatus: "computed",
    };
  } catch {
    return {
      relativePath: input.relativePath,
      phase: input.phase,
      required: input.required,
      exists: false,
      byteLength: null,
      updatedAt: null,
      sha256: null,
      hashStatus: "missing",
    };
  }
}

async function listGeneratedDossierFiles(workdir: string) {
  const files: FrozenDossierFile[] = [];

  async function visit(relativeDir: string) {
    const entries = await readdir(join(workdir, relativeDir), {
      withFileTypes: true,
    });
    for (const entry of entries) {
      const relativePath = join(relativeDir, entry.name);
      if (entry.isDirectory()) {
        if (files.length < 200) await visit(relativePath);
        continue;
      }
      if (!entry.isFile() || files.length >= 200) continue;
      files.push(
        await describeDossierFile({
          workdir,
          relativePath,
          phase: "output",
          required: false,
        }),
      );
    }
  }

  for (const relativeDir of DOSSIER_GENERATED_DIRS) {
    if (existsSync(join(workdir, relativeDir))) {
      await visit(relativeDir);
    }
  }

  return files;
}

async function writeFrozenDossierSnapshot(input: {
  paperId: string;
  jobId: string;
  workdir: string;
  resultStatus: string;
  exitCode: number | null;
  timedOut: boolean;
  totalUnits: number;
  ingested: number;
  failed: number;
  dontoStatements: number;
  dontoLinksCreated: number;
}) {
  const coreFiles = await Promise.all(
    DOSSIER_CORE_FILES.map((file) =>
      describeDossierFile({
        workdir: input.workdir,
        relativePath: file.relativePath,
        phase: file.phase,
        required: file.required,
      }),
    ),
  );
  const generatedArtifacts = await listGeneratedDossierFiles(input.workdir);
  const requiredFiles = coreFiles.filter((file) => file.required);
  const missingRequiredFiles = requiredFiles.filter((file) => !file.exists);
  const snapshot = {
    schemaVersion: DOSSIER_SNAPSHOT_VERSION,
    createdAt: new Date().toISOString(),
    paperId: input.paperId,
    jobId: input.jobId,
    workdir: input.workdir,
    resultStatus: input.resultStatus,
    exitCode: input.exitCode,
    timedOut: input.timedOut,
    totalUnits: input.totalUnits,
    ingested: input.ingested,
    failed: input.failed,
    dontoStatements: input.dontoStatements,
    dontoLinksCreated: input.dontoLinksCreated,
    hashMaxBytes: DOSSIER_HASH_MAX_BYTES,
    coreFilesPresent: requiredFiles.length - missingRequiredFiles.length,
    coreFilesRequired: requiredFiles.length,
    missingRequiredFiles: missingRequiredFiles.map((file) => file.relativePath),
    coreFiles,
    generatedArtifacts,
  };
  await writeFile(
    join(input.workdir, "replication-dossier-snapshot.json"),
    `${JSON.stringify(snapshot, null, 2)}\n`,
  );
  return snapshot;
}

interface PaperSourceManifest {
  storedUrl: string | null;
  sourceApiUrl: string;
  stagedPath: string | null;
  stagedFilename: string | null;
  stagedTextPath: string | null;
  stagedTextFilename: string | null;
  contentType: string | null;
  byteLength: number | null;
  error: string | null;
}

interface DontoStatementManifest {
  context: string;
  limit: number;
  count: number;
  statements: Array<{
    statement_id: string;
    subject: string;
    predicate: string;
    object_iri: string | null;
    object_lit: unknown;
    context: string;
    confidence: number | null;
    evidence_quote: string | null;
  }>;
  error: string | null;
}

interface StagedSupplementalArtifactManifest {
  schemaVersion: "toiletpaper.codex-supplemental-artifacts.v1";
  sourceManifest: PaperArtifactManifest;
  stagedRoot: string;
  bundleCount: number;
  fileCount: number;
  totalBytes: number;
  missingFiles: Array<{
    bundleId: string;
    originalName: string;
    relativePath: string;
    reason: string;
  }>;
  bundles: Array<{
    id: string;
    note: string | null;
    createdAt: string;
    fileCount: number;
    totalBytes: number;
    files: Array<{
      originalName: string;
      storedName: string;
      contentType: string;
      byteLength: number;
      sha256: string;
      source: {
        kind: "upload" | "url";
        url?: string;
        finalUrl?: string;
        fetchedAt?: string;
        status?: number;
      };
      sourceRelativePath: string;
      stagedRelativePath: string;
      stagedPath: string;
    }>;
  }>;
}

function arg(name: string) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

function boundedInt(value: string, fallback: number, max: number) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function simulationJobId(row: SimulationSnapshotRow) {
  const metadata = objectRecord(row.metadata);
  return typeof metadata?.job_id === "string" ? metadata.job_id : null;
}

function chooseSimulationSnapshotForGapCoverage(
  rows: SimulationSnapshotRow[],
  jobId: string,
) {
  const currentJobRows = rows.filter((row) => simulationJobId(row) === jobId);
  if (currentJobRows.length > 0) return currentJobRows;

  const graphRows = rows.filter((row) => simulationJobId(row) === null);
  if (graphRows.length > 0) return graphRows;

  return rows;
}

function claimIdForUnit(unit: ReplicationUnit) {
  const id = unit.sourceStatementIds[0];
  return id && UUID_RE.test(id) ? id : null;
}

function buildPrompt(workdir: string) {
  return `You are Codex running a full-paper scientific replication job for toiletpaper.dev.

This is allowed to take a long time. The target is the entire scientific paper, not a sample of headline claims. Replicate the paper as faithfully as the available artifacts allow. Do not stop after a scaffold. For every replication unit, either:
1. build and run a concrete check/simulation/recomputation, or
2. mark it blocked with precise missing artifacts and no inflated verdict.

Work only inside this directory:
${workdir}

Read these input files:
- paper.json
- donto-statements.json
- replication-units.json
- deterministic-executions.json
- supplemental-artifacts.json
- artifact-gap-manifest.json
- artifact-gap-coverage.json

The paper source is staged locally when available. Prefer local files from paper.json:
- source.stagedPath, usually paper-source.pdf
- source.stagedTextPath, usually paper-text.txt

User-supplied supplemental artifacts are staged when available:
- supplemental-artifacts.json lists every bundle, note, file name, checksum, and staged path.
- supplemental-artifacts/<bundle_id>/files/... contains datasets, scripts, images, input decks, raw measurements, and other files uploaded for this paper.
- Inspect these files before marking a unit blocked for missing data, code, parameters, trajectories, images, or configuration. If a file resolves a blocker, use it and cite the staged path in the unit result artifacts.
- artifact-gap-manifest.json lists the current missing artifact request groups inferred from blocked prior/current results.
- artifact-gap-coverage.json maps staged supplemental files to likely request groups. Treat these as candidate pointers only; verify file contents before using them as evidence.

Treat donto-statements.json as the extracted whole-paper knowledge graph. replication-units.json is the executable coverage worklist compiled from that graph. Do not ignore human_review units; if no specialized executor exists, preserve them as blocked or insufficient with exact reasons.

Write progress after each major step to progress.json:
{
  "status": "running",
  "completed_units": 0,
  "failed_units": 0,
  "current_unit_id": "...",
  "message": "..."
}

Build shared code under src/ and per-unit experiments under experiments/. Run the code you create when it is scientifically meaningful. Network use is allowed only to fetch public artifacts explicitly referenced by the paper/units. If a claim needs missing data, code, labels, checkpoints, or parameters, do not fake them; write a blocked result.

Before exiting, write results.json with this schema:
{
  "schema_version": "toiletpaper.codex-full-paper-results.v1",
  "status": "succeeded" | "partial" | "failed",
  "summary": {
    "total_units": number,
    "completed_units": number,
    "blocked_units": number,
    "failed_units": number
  },
  "units": [
    {
      "replication_unit_id": "string",
      "verdict": "reproduced" | "contradicted" | "fragile" | "inconclusive" | "not_applicable" | "vacuous" | "system_error" | "untested",
      "evidence_mode": "exact_artifact" | "independent_implementation" | "proxy_simulation" | "static_check" | "formal_proof" | "insufficient",
      "confidence": number,
      "reason": "string",
      "measurements": {},
      "artifacts": [],
      "limitations": []
    }
  ]
}

Also write experiments/full_paper_replication/coverage_report.json with:
{
  "donto_statement_count": number,
  "replication_unit_count": number,
  "result_unit_count": number,
  "missing_unit_ids": [],
  "unit_type_counts": {},
  "blocked_reasons": {}
}

results.json must include one unit entry for every replication unit. Keep the result scientifically conservative. The target is faithful full-paper replication, not a quick demo.

CORRESPONDENCE CONTRACT (required — verdicts do not count without it):

The single most common silent failure in agent-driven replication is running clean code that simulates a DIFFERENT system than the paper describes (changed operator ordering, initial/boundary conditions, discretization, units, random process, stopping rule, tolerance, or an undeclared proxy relation). To make claim-to-simulation correspondence auditable, also write ${CORRESPONDENCE_MANIFEST_FILENAME} before exiting:

{
  "schema_version": "toiletpaper.correspondence-manifest.v1",
  "receipts": [
    {
      "unit_id": "string (the replication_unit_id)",
      "binds": {
        "claim_iri": "string",
        "source_statement_ids": ["ONLY ids that appear on the unit — never invent bindings"],
        "evidence_spans": ["verbatim quote(s) the check operationalizes"]
      },
      "system": {
        "description": "what system your code ACTUALLY implements (not what the paper describes)",
        "equations": ["governing equations/relations as implemented"],
        "operator_ordering": ["update/operator order when it affects semantics"],
        "initial_conditions": "string", "boundary_conditions": "string",
        "discretization": "string", "units_system": "string",
        "random_process": { "kind": "none" | "seeded" | "unseeded", "seeds": [] },
        "stopping_rule": "string",
        "tolerances": [{ "name": "string", "value": "string", "kind": "absolute|relative|qualitative" }],
        "parameters": [{ "name": "string", "value": "string", "unit": "string" }]
      },
      "proxy": { "is_proxy": boolean, "relation": "what relation the proxy bears to the original system", "gap": "what it deliberately does not capture" },
      "falsifier": { "description": "smallest input/witness that would distinguish the paper's intended semantics from your implementation" },
      "code": [{ "path": "workdir-relative path to the script(s) that ran" }],
      "resolved_blockers": [{ "code": "needs-artifact-url", "resolution": "how it was resolved", "artifacts": ["staged path"] }],
      "declared_by": "codex"
    }
  ]
}

Rules for receipts:
- One receipt per unit you executed (any evidence_mode except insufficient). Blocked/insufficient units need no receipt — their honest state IS the missing evidence.
- For proxy_simulation results, "proxy": {"is_proxy": true, "relation": ...} is mandatory.
- If a stochastic computation ran, declare the seeds you pinned, or "kind": "unseeded" honestly.
- If you used a staged supplemental artifact to resolve a blocker, record it in resolved_blockers.
- Never restate the paper's description as the receipt: describe the system your code implements, so a reviewer can diff the two.

A unit result without a valid receipt will have its verdict demoted to untested at ingest — writing an honest receipt is how your work gets counted.`;
}

async function runProcess(
  command: string,
  args: string[],
  options: { cwd?: string; timeoutMs?: number } = {},
) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NO_COLOR: "1", PAGER: "cat" },
    });
    let stdout = "";
    let stderr = "";
    const timeout =
      options.timeoutMs && options.timeoutMs > 0
        ? setTimeout(() => {
            child.kill("SIGTERM");
            setTimeout(() => child.kill("SIGKILL"), 2_000).unref();
          }, options.timeoutMs)
        : null;
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      if (timeout) clearTimeout(timeout);
      resolve({ code: 1, stdout, stderr: error.message });
    });
    child.on("close", (code) => {
      if (timeout) clearTimeout(timeout);
      resolve({ code, stdout, stderr });
    });
  });
}

function paperSourceApiUrl(paperId: string) {
  const origin = PUBLIC_ORIGIN.replace(/\/$/, "");
  return `${origin}/api/papers/${paperId}/source`;
}

function paperDontoContext(paperId: string) {
  return `tp:paper:${paperId}:claims`;
}

async function stagePaperSource(
  paper: Record<string, unknown>,
  paperId: string,
  workdir: string,
): Promise<PaperSourceManifest> {
  const storedUrl = typeof paper.pdf_url === "string" ? paper.pdf_url : null;
  const manifest: PaperSourceManifest = {
    storedUrl,
    sourceApiUrl: paperSourceApiUrl(paperId),
    stagedPath: null,
    stagedFilename: null,
    stagedTextPath: null,
    stagedTextFilename: null,
    contentType: null,
    byteLength: null,
    error: null,
  };

  if (!storedUrl) {
    manifest.error = "paper row has no pdf_url";
    return manifest;
  }

  try {
    let sourcePath: string | null = null;
    let sourceExt = extname(storedUrl).toLowerCase() || ".pdf";

    if (storedUrl.startsWith("/uploads/")) {
      sourcePath = join(UPLOADS_DIR, basename(storedUrl));
    }

    if (!sourcePath) {
      manifest.error = `unsupported source location: ${storedUrl}`;
      return manifest;
    }

    const sourceStat = await stat(sourcePath);
    const stagedFilename = `paper-source${sourceExt}`;
    const stagedPath = join(workdir, stagedFilename);
    await copyFile(sourcePath, stagedPath);
    manifest.stagedPath = stagedPath;
    manifest.stagedFilename = stagedFilename;
    manifest.byteLength = sourceStat.size;
    manifest.contentType =
      sourceExt === ".pdf"
        ? "application/pdf"
        : sourceExt === ".md" || sourceExt === ".markdown"
          ? "text/markdown"
          : "application/octet-stream";

    if (sourceExt === ".pdf") {
      const textFilename = "paper-text.txt";
      const textPath = join(workdir, textFilename);
      const result = await runProcess(
        "pdftotext",
        ["-layout", stagedPath, textPath],
        { cwd: workdir, timeoutMs: 60_000 },
      );
      if (result.code === 0 && existsSync(textPath)) {
        manifest.stagedTextPath = textPath;
        manifest.stagedTextFilename = textFilename;
      }
    } else if (sourceExt === ".md" || sourceExt === ".markdown") {
      manifest.stagedTextPath = stagedPath;
      manifest.stagedTextFilename = stagedFilename;
    }
  } catch (e) {
    manifest.error = e instanceof Error ? e.message : String(e);
  }

  return manifest;
}

async function loadDontoStatementManifest(
  sql: ReturnType<typeof postgres> | null,
  paperId: string,
): Promise<DontoStatementManifest> {
  const context = paperDontoContext(paperId);
  const manifest: DontoStatementManifest = {
    context,
    limit: CODEX_DONTO_STATEMENT_LIMIT,
    count: 0,
    statements: [],
    error: null,
  };

  if (!sql) {
    manifest.error = "DONTO_DSN is not configured";
    return manifest;
  }

  try {
    const rows = await sql<DontoStatementManifest["statements"]>`
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
      LIMIT ${CODEX_DONTO_STATEMENT_LIMIT}
    `;
    manifest.statements = rows;
    manifest.count = rows.length;
  } catch (e) {
    manifest.error = e instanceof Error ? e.message : String(e);
  }

  return manifest;
}

function safeRelativeArtifactPath(relativePath: string) {
  return (
    relativePath.length > 0 &&
    !relativePath.startsWith("/") &&
    !relativePath.split(/[\\/]+/).includes("..")
  );
}

async function stageSupplementalArtifacts(
  paperId: string,
  workdir: string,
): Promise<StagedSupplementalArtifactManifest> {
  const sourceManifest = await loadPaperArtifactManifest(paperId);
  const sourceRoot = paperArtifactDir(paperId);
  const stagedRoot = join(workdir, "supplemental-artifacts");
  const staged: StagedSupplementalArtifactManifest = {
    schemaVersion: "toiletpaper.codex-supplemental-artifacts.v1",
    sourceManifest,
    stagedRoot,
    bundleCount: sourceManifest.bundleCount,
    fileCount: 0,
    totalBytes: 0,
    missingFiles: [],
    bundles: [],
  };

  await mkdir(stagedRoot, { recursive: true });

  for (const bundle of sourceManifest.bundles) {
    const stagedBundle: StagedSupplementalArtifactManifest["bundles"][number] = {
      id: bundle.id,
      note: bundle.note,
      createdAt: bundle.createdAt,
      fileCount: 0,
      totalBytes: 0,
      files: [],
    };

    for (const file of bundle.files) {
      if (!safeRelativeArtifactPath(file.relativePath)) {
        staged.missingFiles.push({
          bundleId: bundle.id,
          originalName: file.originalName,
          relativePath: file.relativePath,
          reason: "unsafe relative path",
        });
        continue;
      }

      const sourcePath = join(sourceRoot, file.relativePath);
      const stagedRelativePath = join("supplemental-artifacts", file.relativePath);
      const stagedPath = join(workdir, stagedRelativePath);
      if (!existsSync(sourcePath)) {
        staged.missingFiles.push({
          bundleId: bundle.id,
          originalName: file.originalName,
          relativePath: file.relativePath,
          reason: "source file missing",
        });
        continue;
      }

      await mkdir(dirname(stagedPath), { recursive: true });
      await copyFile(sourcePath, stagedPath);
      stagedBundle.files.push({
        originalName: file.originalName,
        storedName: file.storedName,
        contentType: file.contentType,
        byteLength: file.byteLength,
        sha256: file.sha256,
        source: file.source,
        sourceRelativePath: file.relativePath,
        stagedRelativePath,
        stagedPath,
      });
      stagedBundle.fileCount += 1;
      stagedBundle.totalBytes += file.byteLength;
      staged.fileCount += 1;
      staged.totalBytes += file.byteLength;
    }

    staged.bundles.push(stagedBundle);
  }

  return staged;
}

async function main() {
  const paperId = arg("--paper-id") ?? process.argv[2];
  const jobId = arg("--job-id");
  if (!paperId || !jobId) {
    console.error("Usage: run-codex-replication-job.ts --paper-id <id> --job-id <id>");
    process.exit(1);
  }

  const sql = postgres(DATABASE_URL, { max: 4 });
  const dontoSql = createDontoSqlFromEnv();
  let seq = 0;
  let jobEventsPath: string | null = null;
  const pendingLogs: Array<{ seq: number; eventType: string; payload: unknown }> = [];
  let flushPromise = Promise.resolve();

  async function flushLogs() {
    if (pendingLogs.length === 0) return;
    const batch = pendingLogs.splice(0, pendingLogs.length);
    for (const event of batch) {
      await sql`
        INSERT INTO simulation_logs (paper_id, seq, event_type, payload)
        VALUES (
          ${paperId},
          ${event.seq},
          ${event.eventType},
          ${sql.json(event.payload)}
        )
      `;
    }
  }

  function enqueueLog(eventType: string, payload: unknown) {
    const event = { seq: ++seq, eventType, payload };
    pendingLogs.push(event);
    if (jobEventsPath) {
      appendFileSync(jobEventsPath, `${JSON.stringify(event)}\n`);
    }
    if (pendingLogs.length >= 20) {
      flushPromise = flushPromise.then(flushLogs).catch(() => undefined);
    }
  }

  const flushTimer = setInterval(() => {
    flushPromise = flushPromise.then(flushLogs).catch(() => undefined);
  }, 2_000);

  async function updateJob(values: Record<string, unknown>) {
    const sets = Object.entries(values);
    if (sets.length === 0) return;
    await sql.unsafe(
      `UPDATE simulation_jobs SET ${sets
        .map(([key], idx) => `${key} = $${idx + 2}`)
        .join(", ")} WHERE id = $1`,
      [jobId, ...sets.map(([, value]) => value)],
    );
  }

  try {
    const [{ seq: maxSeq }] = await sql<{ seq: number }[]>`
      SELECT COALESCE(MAX(seq), 0)::int AS seq
      FROM simulation_logs
      WHERE paper_id = ${paperId}
    `;
    seq = maxSeq ?? 0;

    const [paper] = await sql`
      SELECT * FROM papers WHERE id = ${paperId}
    `;
    if (!paper) throw new Error(`Paper ${paperId} not found`);

    const rows = await sql<ReplicationUnitRow[]>`
      SELECT * FROM replication_units
      WHERE paper_id = ${paperId}
      ORDER BY created_at, id
    `;
    const units: ReplicationUnit[] = rows.map(rowToUnit);
    if (units.length === 0) {
      throw new Error(`No replication units found for paper ${paperId}`);
    }

    const simulationSnapshotRows = await sql<SimulationSnapshotRow[]>`
      SELECT
        s.id::text,
        s.claim_id::text,
        s.verdict,
        s.evidence_mode,
        s.result,
        s.metadata,
        s.limitations,
        s.created_at,
        c.text AS claim_text
      FROM simulations s
      JOIN claims c ON c.id = s.claim_id
      WHERE c.paper_id = ${paperId}
      ORDER BY s.created_at, s.id
    `;

    const executions: ReplicationAgentResult[] = units.map((unit) =>
      executeReplicationUnit(unit),
    );
    const workdir = join(
      SIMULATOR_WORKDIR,
      "codex-full-paper",
      paperId,
      jobId,
    );
    await mkdir(workdir, { recursive: true });

    await updateJob({
      state: "running",
      total_units: units.length,
      started_at: new Date(),
    });
    await sql`UPDATE papers SET status = 'simulating', updated_at = NOW() WHERE id = ${paperId}`;

    const source = await stagePaperSource(paper, paperId, workdir);
    const dontoStatementManifest = await loadDontoStatementManifest(dontoSql, paperId);
    const supplementalArtifacts = await stageSupplementalArtifacts(paperId, workdir);
    const gapSnapshotRows = chooseSimulationSnapshotForGapCoverage(
      simulationSnapshotRows,
      jobId,
    );
    const artifactGapManifest = summarizeReplicationGapManifest({
      units: units.map((unit) => ({
        id: unit.id,
        claimText: unit.claimText,
        unitType: unit.unitType,
        domain: unit.domain,
        sourceStatementIds: unit.sourceStatementIds,
        requiredArtifacts: unit.requiredArtifacts,
        blockers: unit.blockers,
      })),
      simulations: gapSnapshotRows.map((row) => ({
        id: row.id,
        claimId: row.claim_id,
        verdict: row.verdict,
        evidenceMode: row.evidence_mode,
        result: row.result,
        metadata: row.metadata,
        limitations: row.limitations,
        claimText: row.claim_text,
      })),
    });
    const artifactGapCoverage = summarizeArtifactGapCoverage({
      gapManifest: artifactGapManifest,
      artifactManifest: supplementalArtifacts.sourceManifest,
    });
    const paperManifest = {
      ...paper,
      source,
      source_api_url: source.sourceApiUrl,
      local_source_path: source.stagedPath,
      local_source_text_path: source.stagedTextPath,
      supplementalArtifacts: {
        manifestPath: join(workdir, "supplemental-artifacts.json"),
        stagedRoot: supplementalArtifacts.stagedRoot,
        bundleCount: supplementalArtifacts.bundleCount,
        fileCount: supplementalArtifacts.fileCount,
        totalBytes: supplementalArtifacts.totalBytes,
        missingFileCount: supplementalArtifacts.missingFiles.length,
      },
      artifactGapCoverage: {
        manifestPath: join(workdir, "artifact-gap-manifest.json"),
        coveragePath: join(workdir, "artifact-gap-coverage.json"),
        requestCount: artifactGapManifest.requestCount,
        candidateRequestCount: artifactGapCoverage.candidateRequestCount,
        matchedFileCount: artifactGapCoverage.matchedFileCount,
      },
      donto: {
        context: dontoStatementManifest.context,
        statementCount: dontoStatementManifest.count,
        statementLimit: dontoStatementManifest.limit,
        error: dontoStatementManifest.error,
      },
    };
    await writeFile(
      join(workdir, "paper.json"),
      `${JSON.stringify(paperManifest, null, 2)}\n`,
    );
    await writeFile(
      join(workdir, "donto-statements.json"),
      `${JSON.stringify(dontoStatementManifest, null, 2)}\n`,
    );
    await writeFile(
      join(workdir, "replication-units.json"),
      `${JSON.stringify(units, null, 2)}\n`,
    );
    await writeFile(
      join(workdir, "deterministic-executions.json"),
      `${JSON.stringify(executions, null, 2)}\n`,
    );
    await writeFile(
      join(workdir, "supplemental-artifacts.json"),
      `${JSON.stringify(supplementalArtifacts, null, 2)}\n`,
    );
    await writeFile(
      join(workdir, "artifact-gap-manifest.json"),
      `${JSON.stringify(artifactGapManifest, null, 2)}\n`,
    );
    await writeFile(
      join(workdir, "artifact-gap-coverage.json"),
      `${JSON.stringify(artifactGapCoverage, null, 2)}\n`,
    );
    await writeFile(
      join(workdir, "README.md"),
      `# Codex Full-Paper Replication\n\nPaper: ${paper.title}\n\nJob: ${jobId}\n\nUnits: ${units.length}\n\nSupplemental artifacts: ${supplementalArtifacts.fileCount} file(s) across ${supplementalArtifacts.bundleCount} bundle(s)\n\nArtifact gap coverage: ${artifactGapCoverage.candidateRequestCount} candidate request group(s), ${artifactGapCoverage.matchedFileCount} matched file(s)\n`,
    );
    jobEventsPath = join(workdir, "toiletpaper-job-events.jsonl");
    await writeFile(
      join(workdir, "codex-command.json"),
      `${JSON.stringify(
        {
          bin: CODEX_BIN,
          sandbox: CODEX_SANDBOX,
          timeoutMs: CODEX_TIMEOUT_MS,
          codexHome: process.env.CODEX_HOME ?? "~/.codex",
          note: "Codex runs non-ephemerally for full-paper jobs, so ~/.codex rollout/log state is retained.",
        },
        null,
        2,
      )}\n`,
    );

    enqueueLog("job_started", {
      jobId,
      paperId,
      title: paper.title,
      totalUnits: units.length,
      workdir,
      timeoutMs: CODEX_TIMEOUT_MS,
      source,
      dontoStatementCount: dontoStatementManifest.count,
      dontoStatementError: dontoStatementManifest.error,
      supplementalArtifactBundles: supplementalArtifacts.bundleCount,
      supplementalArtifactFiles: supplementalArtifacts.fileCount,
      supplementalArtifactMissingFiles: supplementalArtifacts.missingFiles.length,
      artifactGapRequests: artifactGapManifest.requestCount,
      artifactGapCandidateRequests: artifactGapCoverage.candidateRequestCount,
      artifactGapMatchedFiles: artifactGapCoverage.matchedFileCount,
    });

    const lastMessagePath = join(workdir, "codex-last-message.txt");
    const codexEventsPath = join(workdir, "codex-events.jsonl");
    const codexStderrPath = join(workdir, "codex-stderr.log");
    const args = [
      "exec",
      "--skip-git-repo-check",
      "--cd",
      workdir,
      "--output-last-message",
      lastMessagePath,
      "--json",
    ];
    if (CODEX_SANDBOX === "dangerously-bypass-approvals-and-sandbox") {
      args.push("--dangerously-bypass-approvals-and-sandbox");
    } else {
      args.push("--sandbox", CODEX_SANDBOX);
    }
    const model = process.env.CODEX_SIMULATION_MODEL;
    if (model) args.push("--model", model);
    args.push("-");

    const prompt = buildPrompt(workdir);
    await writeFile(join(workdir, "prompt.md"), prompt);

    let timedOut = false;
    let stdoutBuffer = "";
    let stderrTail = "";
    let progressMtime = 0;

    const progressTimer = setInterval(async () => {
      try {
        const progressPath = join(workdir, "progress.json");
        if (!existsSync(progressPath)) return;
        const current = await stat(progressPath);
        if (current.mtimeMs <= progressMtime) return;
        progressMtime = current.mtimeMs;
        const progress = JSON.parse(await readFile(progressPath, "utf8")) as {
          completed_units?: number;
          failed_units?: number;
        };
        enqueueLog("codex_progress", progress);
        await updateJob({
          completed_units: progress.completed_units ?? 0,
          failed_units: progress.failed_units ?? 0,
        });
      } catch {
        // Progress files are best effort while Codex writes them.
      }
    }, 15_000);

    const exitCode = await new Promise<number | null>((resolve, reject) => {
      const child = spawn(CODEX_BIN, args, {
        cwd: workdir,
        env: { ...process.env, NO_COLOR: "1", PAGER: "cat" },
        stdio: ["pipe", "pipe", "pipe"],
      });

      const timeout = setTimeout(() => {
        timedOut = true;
        enqueueLog("codex_timeout", { timeoutMs: CODEX_TIMEOUT_MS });
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
      }, CODEX_TIMEOUT_MS);

      child.stdout.on("data", (chunk) => {
        const text = String(chunk);
        appendFileSync(codexEventsPath, text);
        stdoutBuffer += text;
        const lines = stdoutBuffer.split("\n");
        stdoutBuffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            enqueueLog(String(parsed.type ?? "codex_event"), parsed);
          } catch {
            enqueueLog("codex_stdout", { text: line.slice(0, 4_000) });
          }
        }
      });
      child.stderr.on("data", (chunk) => {
        const text = String(chunk);
        appendFileSync(codexStderrPath, text);
        stderrTail = `${stderrTail}${text}`.slice(-12_000);
        enqueueLog("codex_stderr", { text: text.slice(0, 4_000) });
      });
      child.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timeout);
        resolve(code);
      });
      child.stdin.end(prompt);
    });

    clearInterval(progressTimer);
    await flushPromise.then(flushLogs);

    const resultsPath = join(workdir, "results.json");
    let ingested = 0;
    let failed = 0;
    let dontoStatements = 0;
    let dontoLinksCreated = 0;
    let resultStatus = timedOut ? "partial" : "succeeded";

    // PRD-010 gate 3 input: the agent-declared correspondence manifest.
    const correspondence = await loadCorrespondenceManifest(workdir);
    enqueueLog("correspondence_manifest_loaded", {
      jobId,
      path: correspondence.path,
      exists: correspondence.exists,
      receiptCount: correspondence.receiptCount,
      unparseableEntries: correspondence.unparseableEntries,
      error: correspondence.error,
    });

    const bundleUnits: BundleUnitInput[] = [];
    let demotedCount = 0;

    if (existsSync(resultsPath)) {
      const parsed = JSON.parse(await readFile(resultsPath, "utf8")) as {
        status?: string;
        units?: CodexUnitResult[];
      };
      resultStatus = parsed.status ?? resultStatus;
      const byId: Map<string, ReplicationUnit> = new Map(
        units.map((unit) => [unit.id, unit]),
      );
      const resultUnits = parsed.units ?? [];
      const seenUnitIds = new Set<string>();

      for (const result of resultUnits) {
        const unitId = result.replication_unit_id ?? result.unit_id;
        if (!unitId) continue;
        const unit = byId.get(unitId);
        if (!unit) continue;
        seenUnitIds.add(unit.id);
        const reason = result.reason ?? "Codex full-paper replication result.";
        const artifacts = mergedArtifacts(result.artifacts, workdir);

        // PRD-010 gate order: extraction → compilation → correspondence →
        // execution → verdict. Signal verdicts failing any gate are demoted
        // to untested with the raw verdict kept as ungated_verdict.
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
          enqueueLog("verdict_demoted", {
            jobId,
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
              status: result.status ?? resultStatus,
              confidence: result.confidence ?? null,
              measurements: result.measurements ?? null,
              artifacts,
              workdir,
              domain: unit.domain,
              unitType: unit.unitType,
              claimIri: unit.claimIri,
              sourceStatementIds: unit.sourceStatementIds,
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
                paperId,
                claimIri: unit.claimIri,
                verdict,
                reason,
                source: "codex-full-paper",
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
                resultStatus: result.status ?? resultStatus,
                unitType: unit.unitType,
              });
              dontoStatements += provenance.statementIds.length;
              dontoLinksCreated += provenance.linksCreated;
            } catch (e) {
              enqueueLog("donto_simulation_provenance_failed", {
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
        if (resultStatus === "succeeded") resultStatus = "partial";
        enqueueLog("codex_results_incomplete", {
          resultsPath,
          resultUnits: resultUnits.length,
          expectedUnits: units.length,
          missingUnitCount: missingUnitIds.length,
          missingUnitIds: missingUnitIds.slice(0, 200),
        });
      }

      // Coverage gaps must never read as reproduced: every unit without a
      // result enters the bundle as an explicit untested entry.
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
    } else {
      failed = units.length;
      resultStatus = timedOut ? "partial" : "failed";
      enqueueLog("codex_results_missing", { resultsPath, exitCode, stderrTail });
      for (const unit of units) {
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
          reason: "results.json was never written by the replication agent",
          simulationId: null,
          artifacts: [],
          missingResult: true,
        });
      }
    }

    const finishedAt = new Date();
    await updateJob({
      state: resultStatus === "failed" ? "failed" : "succeeded",
      completed_units: ingested,
      failed_units: failed,
      finished_at: finishedAt,
      error_summary:
        resultStatus === "failed"
          ? `Codex exited ${exitCode}; results.json missing or failed.`
          : resultStatus === "partial" && failed > 0
            ? `Codex produced partial results; ${failed} units missing or failed.`
          : null,
    });
    await sql`
      UPDATE papers
      SET status = ${resultStatus === "failed" ? "error" : "done"},
          updated_at = NOW()
      WHERE id = ${paperId}
    `;
    // PRD-010: write the content-addressed per-paper replication bundle —
    // the aggregation artifact a reviewer consumes. Built BEFORE the dossier
    // snapshot so the snapshot can hash the bundle file itself.
    try {
      const bundleFileList = DOSSIER_CORE_FILES.filter(
        (file) => file.relativePath !== REPLICATION_BUNDLE_FILENAME,
      ).map((file) => ({
        relativePath: file.relativePath,
        phase: file.phase,
      }));
      const bundleFiles = await describeBundleFiles({
        workdir,
        files: bundleFileList,
        maxBytes: DOSSIER_HASH_MAX_BYTES,
      });
      const sourceSha256 =
        bundleFiles.find(
          (file) => file.relativePath === source.stagedFilename,
        )?.sha256 ??
        (source.stagedFilename
          ? (
              await describeBundleFiles({
                workdir,
                files: [{ relativePath: source.stagedFilename, phase: "input" }],
                maxBytes: DOSSIER_HASH_MAX_BYTES,
              })
            )[0]?.sha256 ?? null
          : null);
      const bundleResult = await writeReplicationBundle({
        sql,
        workdir,
        build: {
          paper: {
            id: paperId,
            title: typeof paper.title === "string" ? paper.title : null,
            doi: typeof paper.doi === "string" ? paper.doi : null,
            arxivId: typeof paper.arxiv_id === "string" ? paper.arxiv_id : null,
            sourceSha256,
          },
          job: {
            id: jobId,
            resultStatus,
            exitCode,
            timedOut,
          },
          units: bundleUnits,
          dontoStatementCount: dontoStatementManifest.count,
          files: bundleFiles,
        },
      });
      enqueueLog("replication_bundle_written", {
        jobId,
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
      enqueueLog("replication_bundle_failed", {
        jobId,
        error: e instanceof Error ? e.message : String(e),
      });
    }

    const dossierSnapshotPath = join(workdir, "replication-dossier-snapshot.json");
    try {
      const dossierSnapshot = await writeFrozenDossierSnapshot({
        paperId,
        jobId,
        workdir,
        resultStatus,
        exitCode,
        timedOut,
        totalUnits: units.length,
        ingested,
        failed,
        dontoStatements,
        dontoLinksCreated,
      });
      enqueueLog("replication_dossier_snapshot_written", {
        jobId,
        path: dossierSnapshotPath,
        coreFilesPresent: dossierSnapshot.coreFilesPresent,
        coreFilesRequired: dossierSnapshot.coreFilesRequired,
        generatedArtifactCount: dossierSnapshot.generatedArtifacts.length,
      });
    } catch (e) {
      enqueueLog("replication_dossier_snapshot_failed", {
        jobId,
        path: dossierSnapshotPath,
        error: e instanceof Error ? e.message : String(e),
      });
    }
    enqueueLog("job_finished", {
      jobId,
      exitCode,
      timedOut,
      resultStatus,
      ingested,
      failed,
      demoted: demotedCount,
      dontoStatements,
      dontoLinksCreated,
      workdir,
    });
    appendFileSync(
      jobEventsPath,
      `${JSON.stringify({
        eventType: "job_finished",
        jobId,
        resultStatus,
        ingested,
        failed,
        dontoStatements,
        dontoLinksCreated,
        workdir,
        codexEventsPath,
        codexStderrPath,
        lastMessagePath,
        dossierSnapshotPath,
      })}\n`,
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    enqueueLog("job_failed", { jobId, error: message });
    await sql`
      UPDATE simulation_jobs
      SET state = 'failed',
          failed_units = GREATEST(total_units, failed_units),
          finished_at = NOW(),
          error_summary = ${message}
      WHERE id = ${jobId}
    `;
    await sql`
      UPDATE papers
      SET status = 'error', updated_at = NOW()
      WHERE id = ${paperId}
    `;
    process.exitCode = 1;
  } finally {
    clearInterval(flushTimer);
    await flushPromise.then(flushLogs).catch(() => undefined);
    if (dontoSql) await dontoSql.end({ timeout: 5 });
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
