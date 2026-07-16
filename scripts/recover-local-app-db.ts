#!/usr/bin/env npx tsx
/**
 * Rebuild Toiletpaper's local read-model database from durable sources.
 *
 * Donto is authoritative for paper identities, parsed source revisions, and
 * compact claims. The simulation workdir is authoritative for replication
 * units, Codex results, and job event streams. The checked-in legacy
 * `.simulations` directory preserves two earlier studies. This command never
 * mutates Donto and never overwrites a recovered source file with different
 * content.
 *
 * Usage:
 *   pnpm exec tsx scripts/recover-local-app-db.ts          # inventory only
 *   pnpm exec tsx scripts/recover-local-app-db.ts --apply  # idempotent restore
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  mkdir,
  readdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, join } from "node:path";
import postgres from "postgres";

const APPLY = process.argv.includes("--apply");
const DATABASE_URL = process.env.DATABASE_URL;
const DONTO_DSN = process.env.DONTO_DSN;
const UPLOADS_DIR = process.env.UPLOADS_DIR ?? "/mnt/donto-data/toiletpaper/uploads";
const SIMULATOR_WORKDIR =
  process.env.SIMULATOR_WORKDIR ?? "/mnt/donto-data/toiletpaper/simulations";
const REPO_ROOT = process.env.TOILETPAPER_REPO_ROOT ?? process.cwd();
const LEGACY_SIM_DIR = join(REPO_ROOT, ".simulations");
const FULL_PAPER_DIR = join(SIMULATOR_WORKDIR, "codex-full-paper");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JsonObject = Record<string, unknown>;

interface DontoContextRow {
  iri: string;
  id: string;
  created_at: Date;
}

interface DontoDocumentRow {
  document_id: string;
  label: string | null;
  media_type: string;
  creators: unknown;
  metadata: JsonObject;
  document_created_at: Date;
  revision_id: string;
  body: string | null;
  body_inline: string | null;
  parser_version: string | null;
  revision_created_at: Date;
}

interface DontoStatementRow {
  statement_id: string;
  subject: string;
  predicate: string;
  object_iri: string | null;
  object_lit: JsonObject | null;
  created_at: Date;
}

interface PaperSnapshot {
  id: string;
  title?: string;
  authors?: string[];
  abstract?: string | null;
  pdf_url?: string | null;
  status?: string;
  domain?: string;
  domain_confidence?: number | null;
  domain_classified_at?: string | null;
  page_count?: number | null;
  body_char_count?: number | null;
  extractor_model?: string | null;
  extractor_version?: string | null;
  parser_version?: string | null;
  year?: number | null;
  venue?: string | null;
  arxiv_id?: string | null;
  doi?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface ReplicationUnit {
  id: string;
  paperId: string;
  claimIri: string;
  sourceStatementIds: string[];
  domain: string;
  unitType: string;
  claimText: string;
  evidenceQuotes?: string[];
  hypothesis: string;
  expectedOutcome: string;
  falsificationCriteria?: string[];
  requiredArtifacts?: unknown;
  datasets?: unknown;
  methods?: unknown;
  metrics?: Array<{ expected?: unknown }>;
  baselines?: unknown;
  parameters?: Array<{ value?: unknown }>;
  computeBudget: unknown;
  verifierCandidates?: string[];
  planner: unknown;
  state: string;
  blockers?: unknown;
}

interface CodexResult {
  replication_unit_id?: string;
  unit_id?: string;
  verdict?: string;
  evidence_mode?: string;
  confidence?: number | null;
  reason?: string;
  measurements?: unknown;
  artifacts?: unknown;
  limitations?: string[];
  status?: string;
}

interface JobArtifact {
  id: string;
  paperId: string;
  dir: string;
  units: ReplicationUnit[];
  results: CodexResult[];
  resultStatus: string;
  paper: PaperSnapshot | null;
  events: Array<{ seq: number; eventType: string; payload: unknown }>;
  startedAt: Date;
  finishedAt: Date;
  mtimeMs: number;
}

interface RecoveredPaper {
  id: string;
  title: string;
  authors: string[];
  abstract: string | null;
  pdfUrl: string | null;
  status: "uploaded" | "extracted" | "done";
  domain: string;
  domainConfidence: number | null;
  domainClassifiedAt: Date | null;
  pageCount: number | null;
  bodyCharCount: number | null;
  extractorModel: string | null;
  extractorVersion: string | null;
  parserVersion: string | null;
  year: number | null;
  venue: string | null;
  arxivId: string | null;
  doi: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface RecoveredClaim {
  id: string;
  paperId: string;
  text: string;
  dontoSubjectIri: string | null;
  status: "asserted" | "simulated";
  confidence: number | null;
  category: string;
  testability: number | null;
  testabilityReason: string | null;
  predicate: string | null;
  value: string | null;
  unit: string | null;
  evidence: string | null;
  extractorModel: string | null;
  extractorVersion: string | null;
  createdAt: Date;
}

interface RecoveredSimulation {
  id: string;
  claimId: string;
  method: string;
  simulatorId: string;
  result: unknown;
  verdict: string;
  evidenceMode: string;
  limitations: string[];
  metadata: unknown;
  createdAt: Date;
}

function asString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function asJson(value: unknown): postgres.JSONValue {
  return JSON.parse(JSON.stringify(value ?? null)) as postgres.JSONValue;
}

function literalValue(row: DontoStatementRow): string | null {
  return asString(row.object_lit?.v) ?? row.object_iri;
}

function stableUuid(seed: string) {
  const bytes = createHash("sha256").update(seed).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function dateOr(value: unknown, fallback: Date) {
  if (typeof value !== "string") return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? fallback : parsed;
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
  ) return verdict;
  if (verdict === "pass" || verdict === "supported") return "reproduced";
  if (verdict === "not_supported") return "contradicted";
  if (verdict === "partial") return "fragile";
  if (verdict === "not_simulable") return "not_applicable";
  return "inconclusive";
}

async function directories(path: string) {
  if (!existsSync(path)) return [];
  const entries = await readdir(path, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function maybeJson<T>(path: string): Promise<T | null> {
  return existsSync(path) ? readJson<T>(path) : null;
}

async function jobTimeRange(dir: string) {
  const entries = await readdir(dir, { withFileTypes: true });
  const times = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map(async (entry) => (await stat(join(dir, entry.name))).mtimeMs),
  );
  const fallback = (await stat(dir)).mtimeMs;
  return {
    min: new Date(times.length ? Math.min(...times) : fallback),
    max: new Date(times.length ? Math.max(...times) : fallback),
    mtimeMs: times.length ? Math.max(...times) : fallback,
  };
}

async function loadJobArtifacts(): Promise<JobArtifact[]> {
  const jobs: JobArtifact[] = [];
  for (const paperId of await directories(FULL_PAPER_DIR)) {
    for (const jobId of await directories(join(FULL_PAPER_DIR, paperId))) {
      if (!UUID_RE.test(paperId) || !UUID_RE.test(jobId)) continue;
      const dir = join(FULL_PAPER_DIR, paperId, jobId);
      const units = (await maybeJson<ReplicationUnit[]>(join(dir, "replication-units.json"))) ?? [];
      const resultDoc = await maybeJson<{ status?: string; units?: CodexResult[] }>(
        join(dir, "results.json"),
      );
      const paper = await maybeJson<PaperSnapshot>(join(dir, "paper.json"));
      const events: JobArtifact["events"] = [];
      const eventPath = join(dir, "toiletpaper-job-events.jsonl");
      if (existsSync(eventPath)) {
        for (const line of (await readFile(eventPath, "utf8")).split("\n")) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as {
            seq?: number;
            eventType?: string;
            payload?: unknown;
          };
          if (Number.isInteger(event.seq) && event.eventType) {
            events.push({ seq: event.seq!, eventType: event.eventType, payload: event.payload ?? {} });
          }
        }
      }
      const times = await jobTimeRange(dir);
      jobs.push({
        id: jobId,
        paperId,
        dir,
        units,
        results: resultDoc?.units ?? [],
        resultStatus: resultDoc?.status ?? "failed",
        paper,
        events,
        startedAt: times.min,
        finishedAt: times.max,
        mtimeMs: times.mtimeMs,
      });
    }
  }
  return jobs.sort((a, b) => a.mtimeMs - b.mtimeMs);
}

function latestPaperSnapshots(jobs: JobArtifact[]) {
  const snapshots = new Map<string, PaperSnapshot>();
  for (const job of jobs) {
    if (!job.paper) continue;
    const current = snapshots.get(job.paperId);
    const currentTime = current?.updated_at ? Date.parse(current.updated_at) : 0;
    const candidateTime = job.paper.updated_at ? Date.parse(job.paper.updated_at) : job.mtimeMs;
    if (!current || candidateTime >= currentTime) snapshots.set(job.paperId, job.paper);
  }
  return snapshots;
}

async function nearestUpload(createdAt: Date, reserved: Set<string>) {
  if (!existsSync(UPLOADS_DIR)) return null;
  let best: { path: string; delta: number } | null = null;
  for (const name of await readdir(UPLOADS_DIR)) {
    if (!name.toLowerCase().endsWith(".pdf") || reserved.has(name)) continue;
    const path = join(UPLOADS_DIR, name);
    const delta = Math.abs((await stat(path)).mtimeMs - createdAt.valueOf());
    if (delta <= 15 * 60_000 && (!best || delta < best.delta)) best = { path, delta };
  }
  if (best) reserved.add(basename(best.path));
  return best?.path ?? null;
}

async function writeRecoveredSource(paperId: string, body: string) {
  const filename = `recovered-${paperId}.md`;
  const path = join(UPLOADS_DIR, filename);
  if (existsSync(path)) {
    const existing = await readFile(path, "utf8");
    if (existing !== body) {
      throw new Error(`refusing to overwrite divergent recovered source: ${path}`);
    }
  } else if (APPLY) {
    await mkdir(UPLOADS_DIR, { recursive: true });
    await writeFile(path, body, { flag: "wx" });
  }
  return `/uploads/${filename}`;
}

function metadataValues(statements: DontoStatementRow[], subject: string, predicate: string) {
  return statements
    .filter((row) => row.subject === subject && row.predicate === predicate)
    .map(literalValue)
    .filter((value): value is string => value !== null);
}

function claimCategoryForUnit(unit: ReplicationUnit) {
  if (unit.unitType === "baseline_contrast") return "comparative";
  if (unit.unitType === "metric_recompute" || unit.unitType === "equation_check") {
    return "quantitative";
  }
  if (unit.unitType === "artifact_availability" || unit.unitType === "dataset_integrity") {
    return "methodological";
  }
  return "theoretical";
}

function parseLegacySpec(text: string) {
  const title = text.match(/^# Simulation Spec:\s*(.+)$/m)?.[1]?.trim() ?? "Untitled legacy study";
  const paperId = text.match(/^\*\*Paper ID:\*\*\s*(.+)$/m)?.[1]?.trim() ?? "";
  const authors =
    text.match(/^\*\*Authors:\*\*\s*(.+)$/m)?.[1]?.split(",").map((v) => v.trim()).filter(Boolean) ?? [];
  const abstract = text.match(/^\*\*Abstract:\*\*\s*(.+)$/m)?.[1]?.trim() ?? null;
  const claims: Array<{ index: number; text: string; confidence: number | null }> = [];
  const pattern = /### Claim (\d+) \([^)]*\)\s+\*\*Text:\*\*\s*([\s\S]*?)\s+\*\*Confidence:\*\*\s*([^\n]+)\s+\*\*Donto IRI:\*\*\s*([^\n]+)/g;
  for (const match of text.matchAll(pattern)) {
    const confidence = Number(match[3]);
    claims.push({
      index: Number(match[1]),
      text: match[2].trim(),
      confidence: Number.isFinite(confidence) ? confidence : null,
    });
  }
  return { title, paperId, authors, abstract, claims };
}

async function main() {
  if (!DONTO_DSN) throw new Error("DONTO_DSN is required");
  if (APPLY && !DATABASE_URL) throw new Error("DATABASE_URL is required with --apply");

  const donto = postgres(DONTO_DSN, { max: 3 });
  const jobs = await loadJobArtifacts();
  const snapshots = latestPaperSnapshots(jobs);
  const reservedUploads = new Set<string>();
  for (const snapshot of snapshots.values()) {
    if (snapshot.pdf_url?.startsWith("/uploads/")) reservedUploads.add(basename(snapshot.pdf_url));
  }

  const papers = new Map<string, RecoveredPaper>();
  const claims = new Map<string, RecoveredClaim>();
  const ingestRows: Array<{
    paperId: string;
    state: "succeeded" | "skipped";
    documentId: string;
    revisionId: string;
    statementCount: number;
    updatedAt: Date;
  }> = [];
  let recoveredSourceCount = 0;

  try {
    const contexts = await donto<DontoContextRow[]>`
      SELECT
        iri,
        substring(iri from '^tp:paper:([^:]+):claims$') AS id,
        created_at
      FROM donto_context
      WHERE iri ~ '^tp:paper:[0-9a-f-]+:claims$'
      ORDER BY created_at
    `;

    for (const context of contexts) {
      if (!UUID_RE.test(context.id)) continue;
      const paperIri = `tp:paper:${context.id}`;
      const [document] = await donto<DontoDocumentRow[]>`
        SELECT
          d.document_id::text,
          d.label,
          d.media_type,
          d.creators,
          d.metadata,
          d.created_at AS document_created_at,
          r.revision_id::text,
          r.body,
          r.body_inline,
          r.parser_version,
          r.created_at AS revision_created_at
        FROM donto_document d
        JOIN LATERAL (
          SELECT *
          FROM donto_document_revision
          WHERE document_id = d.document_id
          ORDER BY revision_number DESC
          LIMIT 1
        ) r ON true
        WHERE d.iri = ${paperIri}
      `;
      if (!document) throw new Error(`Donto document missing for ${paperIri}`);

      const statements = await donto<DontoStatementRow[]>`
        SELECT
          statement_id::text,
          subject,
          predicate,
          object_iri,
          object_lit,
          lower(tx_time) AS created_at
        FROM donto_statement
        WHERE context = ${context.iri}
          AND upper_inf(tx_time)
        ORDER BY lower(tx_time), statement_id
      `;
      const snapshot = snapshots.get(context.id);
      const body = document.body ?? document.body_inline ?? "";
      let pdfUrl = snapshot?.pdf_url ?? null;
      if (pdfUrl?.startsWith("/uploads/") && !existsSync(join(UPLOADS_DIR, basename(pdfUrl)))) {
        pdfUrl = null;
      }
      if (!pdfUrl && document.media_type === "application/pdf") {
        const candidate = await nearestUpload(context.created_at, reservedUploads);
        if (candidate) pdfUrl = `/uploads/${basename(candidate)}`;
      }
      if (!pdfUrl && body) {
        pdfUrl = await writeRecoveredSource(context.id, body);
        recoveredSourceCount += 1;
      }

      const title =
        snapshot?.title ||
        metadataValues(statements, paperIri, "schema:name")[0] ||
        document.label ||
        paperIri;
      const authors =
        snapshot?.authors?.filter(Boolean) ??
        metadataValues(statements, paperIri, "schema:author");
      const abstract =
        snapshot?.abstract ||
        metadataValues(statements, paperIri, "schema:description")[0] ||
        null;
      const hasCompletedJob = jobs.some((job) => job.paperId === context.id && job.results.length > 0);
      const compactSubjects = new Set(
        statements.filter((row) => row.predicate === "tp:claimText").map((row) => row.subject),
      );
      const status = hasCompletedJob ? "done" : compactSubjects.size > 0 ? "extracted" : "uploaded";
      const createdAt = dateOr(snapshot?.created_at, context.created_at);
      const updatedAt = dateOr(snapshot?.updated_at, document.revision_created_at);

      papers.set(context.id, {
        id: context.id,
        title,
        authors,
        abstract,
        pdfUrl,
        status,
        domain: snapshot?.domain ?? "unknown",
        domainConfidence: snapshot?.domain_confidence ?? null,
        domainClassifiedAt: snapshot?.domain_classified_at
          ? dateOr(snapshot.domain_classified_at, updatedAt)
          : null,
        pageCount: snapshot?.page_count ?? null,
        bodyCharCount: snapshot?.body_char_count ?? (body ? body.length : null),
        extractorModel: snapshot?.extractor_model ?? null,
        extractorVersion: snapshot?.extractor_version ?? null,
        parserVersion: snapshot?.parser_version ?? document.parser_version,
        year: snapshot?.year ?? null,
        venue: snapshot?.venue ?? null,
        arxivId: snapshot?.arxiv_id ?? null,
        doi: snapshot?.doi ?? null,
        createdAt,
        updatedAt,
      });

      for (const subject of compactSubjects) {
        const match = subject.match(/^tp:claim:([0-9a-f-]+)$/i);
        if (!match || !UUID_RE.test(match[1])) continue;
        const value = (predicate: string) => metadataValues(statements, subject, predicate)[0] ?? null;
        const confidence = Number(value("tp:confidence"));
        const created = statements.find((row) => row.subject === subject)?.created_at ?? createdAt;
        claims.set(match[1], {
          id: match[1],
          paperId: context.id,
          text: value("tp:claimText") ?? "",
          dontoSubjectIri: subject,
          status: "asserted",
          confidence: Number.isFinite(confidence) ? confidence : null,
          category: value("tp:category") ?? "unknown",
          testability: null,
          testabilityReason: null,
          predicate: value("tp:predicate"),
          value: value("tp:value"),
          unit: value("tp:unit"),
          evidence: value("tp:evidence"),
          extractorModel: snapshot?.extractor_model ?? null,
          extractorVersion: snapshot?.extractor_version ?? null,
          createdAt: created,
        });
      }

      ingestRows.push({
        paperId: context.id,
        state: statements.length > 0 ? "succeeded" : "skipped",
        documentId: document.document_id,
        revisionId: document.revision_id,
        statementCount: statements.length,
        updatedAt,
      });
    }
  } finally {
    await donto.end({ timeout: 5 });
  }

  const currentUnits = new Map<string, ReplicationUnit>();
  const latestUnitJob = new Map<string, JobArtifact>();
  for (const job of jobs) {
    if (job.units.length === 0) continue;
    const current = latestUnitJob.get(job.paperId);
    if (!current || job.mtimeMs > current.mtimeMs) latestUnitJob.set(job.paperId, job);
  }
  for (const job of latestUnitJob.values()) {
    for (const unit of job.units) currentUnits.set(unit.id, unit);
  }

  for (const unit of currentUnits.values()) {
    const claimId = unit.sourceStatementIds?.[0];
    if (!claimId || !UUID_RE.test(claimId)) continue;
    claims.set(claimId, {
      id: claimId,
      paperId: unit.paperId,
      text: unit.claimText,
      dontoSubjectIri: unit.claimIri,
      status: "simulated",
      confidence: null,
      category: claimCategoryForUnit(unit),
      testability: null,
      testabilityReason: null,
      predicate: unit.unitType,
      value: asString(unit.metrics?.[0]?.expected ?? unit.parameters?.[0]?.value),
      unit: null,
      evidence: unit.evidenceQuotes?.[0] ?? unit.expectedOutcome,
      extractorModel: "donto-graph",
      extractorVersion: "replication-v1",
      createdAt: latestUnitJob.get(unit.paperId)?.startedAt ?? new Date(),
    });
  }

  const simulations: RecoveredSimulation[] = [];
  for (const job of jobs) {
    const byId = new Map(job.units.map((unit) => [unit.id, unit]));
    for (const result of job.results) {
      const unitId = result.replication_unit_id ?? result.unit_id;
      const unit = unitId ? byId.get(unitId) : null;
      if (!unit) continue;
      const claimId = unit.sourceStatementIds?.[0];
      if (!claimId || !UUID_RE.test(claimId)) continue;
      simulations.push({
        id: stableUuid(`codex-result:${job.id}:${unit.id}`),
        claimId,
        method: `codex-full-paper-${unit.unitType}`,
        simulatorId: "codex-full-paper",
        result: {
          reason: result.reason ?? "Recovered Codex full-paper replication result.",
          replicationUnitId: unit.id,
          jobId: job.id,
          status: result.status ?? job.resultStatus,
          confidence: result.confidence ?? null,
          measurements: result.measurements ?? null,
          artifacts: result.artifacts ?? [],
          workdir: job.dir,
          domain: unit.domain,
          unitType: unit.unitType,
          claimIri: unit.claimIri,
          sourceStatementIds: unit.sourceStatementIds,
          recovered: true,
        },
        verdict: canonicalVerdict(result.verdict),
        evidenceMode: result.evidence_mode || "proxy_simulation",
        limitations: result.limitations ?? [],
        metadata: {
          codex_full_paper: true,
          job_id: job.id,
          replication_unit_id: unit.id,
          workdir: job.dir,
          claim_iri: unit.claimIri,
          source_statement_ids: unit.sourceStatementIds,
          source_statement_count: unit.sourceStatementIds.length,
          domain: unit.domain,
          unit_type: unit.unitType,
          original_verdict: canonicalVerdict(result.verdict),
          recovered: true,
        },
        createdAt: job.finishedAt,
      });
    }
  }

  let legacyPaperCount = 0;
  let legacyClaimCount = 0;
  for (const paperId of await directories(LEGACY_SIM_DIR)) {
    if (!UUID_RE.test(paperId)) continue;
    const dir = join(LEGACY_SIM_DIR, paperId);
    const specPath = join(dir, "spec.md");
    const resultPath = join(dir, "results.json");
    if (!existsSync(specPath) || !existsSync(resultPath)) continue;
    const spec = parseLegacySpec(await readFile(specPath, "utf8"));
    if (spec.paperId !== paperId) throw new Error(`legacy paper id mismatch in ${specPath}`);
    const results = await readJson<Array<JsonObject>>(resultPath);
    const times = await jobTimeRange(dir);
    papers.set(paperId, {
      id: paperId,
      title: spec.title,
      authors: spec.authors,
      abstract: spec.abstract,
      pdfUrl: null,
      status: "done",
      domain: "unknown",
      domainConfidence: null,
      domainClassifiedAt: null,
      pageCount: null,
      bodyCharCount: null,
      extractorModel: null,
      extractorVersion: "legacy-artifact-recovery",
      parserVersion: null,
      year: null,
      venue: null,
      arxivId: null,
      doi: null,
      createdAt: times.min,
      updatedAt: times.max,
    });
    legacyPaperCount += 1;
    const specClaims = new Map(spec.claims.map((claim) => [claim.index, claim]));
    for (const result of results) {
      const index = Number(result.claim_index);
      if (!Number.isInteger(index)) continue;
      const claim = specClaims.get(index);
      const claimId = stableUuid(`legacy-claim:${paperId}:${index}`);
      claims.set(claimId, {
        id: claimId,
        paperId,
        text: claim?.text ?? asString(result.claim_text) ?? "",
        dontoSubjectIri: null,
        status: "simulated",
        confidence: claim?.confidence ?? (typeof result.confidence === "number" ? result.confidence : null),
        category: asString(result.test_type) ?? "unknown",
        testability: null,
        testabilityReason: null,
        predicate: asString(result.test_type),
        value: asString(result.measured_value),
        unit: null,
        evidence: asString(result.reason),
        extractorModel: null,
        extractorVersion: "legacy-artifact-recovery",
        createdAt: times.min,
      });
      simulations.push({
        id: stableUuid(`legacy-simulation:${paperId}:${index}`),
        claimId,
        method: `legacy-${asString(result.test_type) ?? "simulation"}`,
        simulatorId: "legacy-artifact-recovery",
        result: { ...result, recoveredFrom: resultPath },
        verdict: canonicalVerdict(result.verdict),
        evidenceMode: "proxy_simulation",
        limitations: [],
        metadata: {
          legacy_artifact_recovery: true,
          paper_id: paperId,
          claim_index: index,
          workdir: dir,
        },
        createdAt: times.max,
      });
      legacyClaimCount += 1;
    }
  }

  const summary = {
    apply: APPLY,
    papers: papers.size,
    dontoPapers: papers.size - legacyPaperCount,
    legacyPapers: legacyPaperCount,
    claims: claims.size,
    legacyClaims: legacyClaimCount,
    replicationUnits: currentUnits.size,
    codexJobs: jobs.length,
    completedCodexJobs: jobs.filter((job) => job.results.length > 0).length,
    codexResults: simulations.length - legacyClaimCount,
    legacyResults: legacyClaimCount,
    simulations: simulations.length,
    jobEvents: jobs.reduce((sum, job) => sum + job.events.length, 0),
    recoveredSources: recoveredSourceCount,
  };

  if (!APPLY) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const app = postgres(DATABASE_URL!, { max: 4 });
  try {
    await app.begin(async (sql) => {
      for (const paper of papers.values()) {
        await sql`
          INSERT INTO papers (
            id, title, authors, abstract, pdf_url, status, domain,
            domain_confidence, domain_classified_at, page_count,
            body_char_count, extractor_model, extractor_version,
            parser_version, year, venue, arxiv_id, doi, created_at, updated_at
          ) VALUES (
            ${paper.id}::uuid, ${paper.title}, ${paper.authors}, ${paper.abstract},
            ${paper.pdfUrl}, ${paper.status}, ${paper.domain},
            ${paper.domainConfidence}, ${paper.domainClassifiedAt}, ${paper.pageCount},
            ${paper.bodyCharCount}, ${paper.extractorModel}, ${paper.extractorVersion},
            ${paper.parserVersion}, ${paper.year}, ${paper.venue}, ${paper.arxivId},
            ${paper.doi}, ${paper.createdAt}, ${paper.updatedAt}
          )
          ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            authors = EXCLUDED.authors,
            abstract = EXCLUDED.abstract,
            pdf_url = EXCLUDED.pdf_url,
            status = EXCLUDED.status,
            domain = EXCLUDED.domain,
            domain_confidence = EXCLUDED.domain_confidence,
            domain_classified_at = EXCLUDED.domain_classified_at,
            page_count = EXCLUDED.page_count,
            body_char_count = EXCLUDED.body_char_count,
            extractor_model = EXCLUDED.extractor_model,
            extractor_version = EXCLUDED.extractor_version,
            parser_version = EXCLUDED.parser_version,
            year = EXCLUDED.year,
            venue = EXCLUDED.venue,
            arxiv_id = EXCLUDED.arxiv_id,
            doi = EXCLUDED.doi,
            updated_at = EXCLUDED.updated_at
        `;
      }

      for (const claim of claims.values()) {
        await sql`
          INSERT INTO claims (
            id, paper_id, text, donto_subject_iri, status, confidence,
            category, testability, testability_reason, predicate, value, unit,
            evidence, extractor_model, extractor_version, created_at
          ) VALUES (
            ${claim.id}::uuid, ${claim.paperId}::uuid, ${claim.text},
            ${claim.dontoSubjectIri}, ${claim.status}, ${claim.confidence},
            ${claim.category}, ${claim.testability}, ${claim.testabilityReason},
            ${claim.predicate}, ${claim.value}, ${claim.unit}, ${claim.evidence},
            ${claim.extractorModel}, ${claim.extractorVersion}, ${claim.createdAt}
          )
          ON CONFLICT (id) DO UPDATE SET
            paper_id = EXCLUDED.paper_id,
            text = EXCLUDED.text,
            donto_subject_iri = EXCLUDED.donto_subject_iri,
            status = EXCLUDED.status,
            confidence = EXCLUDED.confidence,
            category = EXCLUDED.category,
            testability = EXCLUDED.testability,
            testability_reason = EXCLUDED.testability_reason,
            predicate = EXCLUDED.predicate,
            value = EXCLUDED.value,
            unit = EXCLUDED.unit,
            evidence = EXCLUDED.evidence,
            extractor_model = EXCLUDED.extractor_model,
            extractor_version = EXCLUDED.extractor_version
        `;
      }

      for (const row of ingestRows) {
        await sql`
          INSERT INTO paper_donto_ingest (
            paper_id, state, attempts, last_attempt_at, last_error_code,
            last_error_message, document_id, revision_id, statement_count,
            updated_at
          ) VALUES (
            ${row.paperId}::uuid, ${row.state}, 1, ${row.updatedAt},
            ${row.state === "skipped" ? "recovered-no-current-statements" : null},
            ${row.state === "skipped"
              ? "Donto preserves the paper revision but no current claim statements."
              : null},
            ${row.documentId}, ${row.revisionId}, ${row.statementCount}, ${row.updatedAt}
          )
          ON CONFLICT (paper_id) DO UPDATE SET
            state = EXCLUDED.state,
            attempts = EXCLUDED.attempts,
            last_attempt_at = EXCLUDED.last_attempt_at,
            last_error_code = EXCLUDED.last_error_code,
            last_error_message = EXCLUDED.last_error_message,
            document_id = EXCLUDED.document_id,
            revision_id = EXCLUDED.revision_id,
            statement_count = EXCLUDED.statement_count,
            updated_at = EXCLUDED.updated_at
        `;
      }

      for (const unit of currentUnits.values()) {
        const claimId = unit.sourceStatementIds?.[0];
        await sql`
          INSERT INTO replication_units (
            id, paper_id, claim_id, claim_iri, source_statement_ids, domain,
            unit_type, claim_text, evidence_quotes, hypothesis, expected_outcome,
            falsification_criteria, required_artifacts, datasets, methods,
            metrics, baselines, parameters, compute_budget, verifier_candidates,
            planner, state, blockers, created_at, updated_at
          ) VALUES (
            ${unit.id}, ${unit.paperId}::uuid,
            ${claimId && UUID_RE.test(claimId) ? claimId : null}::uuid,
            ${unit.claimIri}, ${unit.sourceStatementIds ?? []}, ${unit.domain},
            ${unit.unitType}, ${unit.claimText}, ${unit.evidenceQuotes ?? []},
            ${unit.hypothesis}, ${unit.expectedOutcome},
            ${unit.falsificationCriteria ?? []}, ${sql.json(asJson(unit.requiredArtifacts ?? []))},
            ${sql.json(asJson(unit.datasets ?? []))}, ${sql.json(asJson(unit.methods ?? []))},
            ${sql.json(asJson(unit.metrics ?? []))}, ${sql.json(asJson(unit.baselines ?? []))},
            ${sql.json(asJson(unit.parameters ?? []))}, ${sql.json(asJson(unit.computeBudget))},
            ${unit.verifierCandidates ?? []}, ${sql.json(asJson(unit.planner))},
            ${unit.state}, ${sql.json(asJson(unit.blockers ?? []))}, NOW(), NOW()
          )
          ON CONFLICT (id) DO UPDATE SET
            claim_id = EXCLUDED.claim_id,
            claim_iri = EXCLUDED.claim_iri,
            source_statement_ids = EXCLUDED.source_statement_ids,
            domain = EXCLUDED.domain,
            unit_type = EXCLUDED.unit_type,
            claim_text = EXCLUDED.claim_text,
            evidence_quotes = EXCLUDED.evidence_quotes,
            hypothesis = EXCLUDED.hypothesis,
            expected_outcome = EXCLUDED.expected_outcome,
            falsification_criteria = EXCLUDED.falsification_criteria,
            required_artifacts = EXCLUDED.required_artifacts,
            datasets = EXCLUDED.datasets,
            methods = EXCLUDED.methods,
            metrics = EXCLUDED.metrics,
            baselines = EXCLUDED.baselines,
            parameters = EXCLUDED.parameters,
            compute_budget = EXCLUDED.compute_budget,
            verifier_candidates = EXCLUDED.verifier_candidates,
            planner = EXCLUDED.planner,
            state = EXCLUDED.state,
            blockers = EXCLUDED.blockers,
            updated_at = NOW()
        `;
      }

      for (const job of jobs) {
        const failed = job.results.filter((result) => canonicalVerdict(result.verdict) === "system_error").length;
        await sql`
          INSERT INTO simulation_jobs (
            id, paper_id, scope, scope_args, state, total_units,
            completed_units, failed_units, started_at, finished_at,
            triggered_by, error_summary, created_at
          ) VALUES (
            ${job.id}::uuid, ${job.paperId}::uuid, 'full_codex_paper',
            ${sql.json(asJson({ recoveredFrom: job.dir }))},
            ${job.results.length > 0 ? "succeeded" : "failed"}, ${job.units.length},
            ${job.results.length}, ${failed}, ${job.startedAt}, ${job.finishedAt},
            'artifact-recovery',
            ${job.results.length > 0 ? null : "Recovered empty job directory; original terminal state unavailable."},
            ${job.startedAt}
          )
          ON CONFLICT (id) DO UPDATE SET
            state = EXCLUDED.state,
            total_units = EXCLUDED.total_units,
            completed_units = EXCLUDED.completed_units,
            failed_units = EXCLUDED.failed_units,
            started_at = EXCLUDED.started_at,
            finished_at = EXCLUDED.finished_at,
            error_summary = EXCLUDED.error_summary
        `;
        for (const event of job.events) {
          await sql`
            INSERT INTO simulation_logs (paper_id, seq, event_type, payload, created_at)
            SELECT ${job.paperId}::uuid, ${event.seq}, ${event.eventType},
                   ${sql.json(asJson(event.payload))}, ${job.startedAt}
            WHERE NOT EXISTS (
              SELECT 1 FROM simulation_logs
              WHERE paper_id = ${job.paperId}::uuid
                AND seq = ${event.seq}
                AND event_type = ${event.eventType}
            )
          `;
        }
      }

      for (const simulation of simulations) {
        await sql`
          INSERT INTO simulations (
            id, claim_id, method, simulator_id, result, verdict,
            evidence_mode, limitations, metadata, created_at
          ) VALUES (
            ${simulation.id}::uuid, ${simulation.claimId}::uuid, ${simulation.method},
            ${simulation.simulatorId}, ${sql.json(asJson(simulation.result))},
            ${simulation.verdict}, ${simulation.evidenceMode},
            ${simulation.limitations}, ${sql.json(asJson(simulation.metadata))},
            ${simulation.createdAt}
          )
          ON CONFLICT (id) DO UPDATE SET
            claim_id = EXCLUDED.claim_id,
            method = EXCLUDED.method,
            simulator_id = EXCLUDED.simulator_id,
            result = EXCLUDED.result,
            verdict = EXCLUDED.verdict,
            evidence_mode = EXCLUDED.evidence_mode,
            limitations = EXCLUDED.limitations,
            metadata = EXCLUDED.metadata
        `;
      }
    });

    const [verified] = await app<{
      papers: number;
      claims: number;
      simulations: number;
      jobs: number;
      units: number;
      logs: number;
    }[]>`
      SELECT
        (SELECT count(*)::int FROM papers) AS papers,
        (SELECT count(*)::int FROM claims) AS claims,
        (SELECT count(*)::int FROM simulations) AS simulations,
        (SELECT count(*)::int FROM simulation_jobs) AS jobs,
        (SELECT count(*)::int FROM replication_units) AS units,
        (SELECT count(*)::int FROM simulation_logs) AS logs
    `;
    console.log(JSON.stringify({ ...summary, verified }, null, 2));
  } finally {
    await app.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
