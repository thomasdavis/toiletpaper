import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, normalize, resolve, relative, isAbsolute } from "node:path";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { simulationJobs } from "@toiletpaper/db";

type SimulationJob = typeof simulationJobs.$inferSelect;

export interface CodexDossierJob {
  id: string;
  state: string;
  totalUnits: number;
  completedUnits: number;
  failedUnits: number;
  startedAt: string | null;
  finishedAt: string | null;
  errorSummary: string | null;
  scope: string;
}

export interface CodexDossierFile {
  key: string;
  label: string;
  relativePath: string;
  required: boolean;
  phase: "input" | "runtime" | "output";
  exists: boolean;
  byteLength: number | null;
  updatedAt: string | null;
  sha256: string | null;
  hashStatus: "computed" | "missing" | "too_large" | "unavailable";
}

export interface CodexResultsSummary {
  exists: boolean;
  schemaVersion: string | null;
  status: string | null;
  expectedUnits: number;
  unitCount: number;
  uniqueUnitCount: number;
  missingUnitCount: number;
  verdictCounts: Record<string, number>;
  evidenceModeCounts: Record<string, number>;
  artifactRefCount: number;
}

export interface CodexCoverageReportSummary {
  exists: boolean;
  dontoStatementCount: number | null;
  replicationUnitCount: number | null;
  resultUnitCount: number | null;
  missingUnitCount: number | null;
  unitTypeCounts: Record<string, number>;
  blockedReasonCount: number | null;
}

export interface CodexReplicationDossier {
  schemaVersion: "toiletpaper.codex-replication-dossier.v1";
  paperId: string;
  workdir: string;
  job: CodexDossierJob;
  status: "running" | "auditable" | "incomplete" | "missing_workdir";
  coreFilesPresent: number;
  coreFilesRequired: number;
  files: CodexDossierFile[];
  generatedArtifacts: CodexDossierFile[];
  results: CodexResultsSummary;
  coverageReport: CodexCoverageReportSummary;
  checks: {
    workdirExists: boolean;
    inputsPresent: boolean;
    runtimeTracePresent: boolean;
    outputsPresent: boolean;
    resultsCoverAllUnits: boolean;
    coverageReportMatchesResults: boolean;
  };
}

const SAFE_PATH_PART_RE = /^[a-zA-Z0-9_-]+$/;
const DEFAULT_HASH_MAX_BYTES = 64 * 1024 * 1024;

const CORE_FILES: Array<
  Omit<
    CodexDossierFile,
    "exists" | "byteLength" | "updatedAt" | "sha256" | "hashStatus"
  >
> = [
  {
    key: "paper",
    label: "Paper manifest",
    relativePath: "paper.json",
    required: true,
    phase: "input",
  },
  {
    key: "paperText",
    label: "Extracted paper text",
    relativePath: "paper-text.txt",
    required: false,
    phase: "input",
  },
  {
    key: "dontoStatements",
    label: "Donto statements",
    relativePath: "donto-statements.json",
    required: true,
    phase: "input",
  },
  {
    key: "replicationUnits",
    label: "Replication units",
    relativePath: "replication-units.json",
    required: true,
    phase: "input",
  },
  {
    key: "deterministicExecutions",
    label: "Deterministic prechecks",
    relativePath: "deterministic-executions.json",
    required: true,
    phase: "input",
  },
  {
    key: "supplementalArtifacts",
    label: "Supplemental artifact manifest",
    relativePath: "supplemental-artifacts.json",
    required: true,
    phase: "input",
  },
  {
    key: "artifactGapManifest",
    label: "Missing artifact manifest",
    relativePath: "artifact-gap-manifest.json",
    required: true,
    phase: "input",
  },
  {
    key: "artifactGapCoverage",
    label: "Artifact gap coverage",
    relativePath: "artifact-gap-coverage.json",
    required: true,
    phase: "input",
  },
  {
    key: "prompt",
    label: "Codex prompt",
    relativePath: "prompt.md",
    required: true,
    phase: "runtime",
  },
  {
    key: "command",
    label: "Codex command",
    relativePath: "codex-command.json",
    required: true,
    phase: "runtime",
  },
  {
    key: "jobEvents",
    label: "Toiletpaper job events",
    relativePath: "toiletpaper-job-events.jsonl",
    required: true,
    phase: "runtime",
  },
  {
    key: "codexEvents",
    label: "Codex JSON events",
    relativePath: "codex-events.jsonl",
    required: true,
    phase: "runtime",
  },
  {
    key: "codexStderr",
    label: "Codex stderr",
    relativePath: "codex-stderr.log",
    required: false,
    phase: "runtime",
  },
  {
    key: "progress",
    label: "Progress snapshot",
    relativePath: "progress.json",
    required: false,
    phase: "runtime",
  },
  {
    key: "results",
    label: "Full-paper results",
    relativePath: "results.json",
    required: true,
    phase: "output",
  },
  {
    key: "coverageReport",
    label: "Coverage report",
    relativePath: "experiments/full_paper_replication/coverage_report.json",
    required: true,
    phase: "output",
  },
  // PRD-010 artifacts. Optional here so dossiers computed over pre-PRD-010
  // job workdirs do not retroactively flip to "incomplete"; new jobs list
  // both as required in the script's frozen snapshot.
  {
    key: "correspondenceManifest",
    label: "Correspondence manifest",
    relativePath: "correspondence-manifest.json",
    required: false,
    phase: "output",
  },
  {
    key: "replicationBundle",
    label: "Replication bundle",
    relativePath: "replication-bundle.json",
    required: false,
    phase: "output",
  },
  {
    key: "frozenDossier",
    label: "Frozen dossier snapshot",
    relativePath: "replication-dossier-snapshot.json",
    required: true,
    phase: "output",
  },
];

function simulatorWorkdir() {
  return process.env.SIMULATOR_WORKDIR ?? join("/tmp", "tp-simulations");
}

function hashMaxBytes() {
  const parsed = Number.parseInt(
    process.env.CODEX_DOSSIER_HASH_MAX_BYTES ?? "",
    10,
  );
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_HASH_MAX_BYTES;
  return Math.min(parsed, 1024 * 1024 * 1024);
}

export function codexFullPaperWorkdir(paperId: string, jobId: string) {
  if (!SAFE_PATH_PART_RE.test(paperId) || !SAFE_PATH_PART_RE.test(jobId)) {
    throw new Error("invalid Codex job path");
  }
  return join(simulatorWorkdir(), "codex-full-paper", paperId, jobId);
}

function safeJoin(root: string, relativePath: string) {
  if (
    !relativePath ||
    relativePath.startsWith("/") ||
    relativePath.includes("\0") ||
    relativePath.includes("\\")
  ) {
    throw new Error("unsafe dossier path");
  }
  const rootPath = resolve(root);
  const targetPath = resolve(rootPath, relativePath);
  const inside = relative(rootPath, targetPath);
  if (!inside || inside.startsWith("..") || isAbsolute(inside)) {
    throw new Error("dossier path resolved outside the workdir");
  }
  return targetPath;
}

function safeDossierRelativePath(value: string) {
  if (
    !value ||
    value.startsWith("/") ||
    value.includes("\0") ||
    value.includes("\\")
  ) {
    return null;
  }
  const normalized = normalize(value);
  if (!normalized || normalized === "." || normalized.startsWith("..")) {
    return null;
  }
  return normalized;
}

async function statFile(
  workdir: string,
  file: Omit<
    CodexDossierFile,
    "exists" | "byteLength" | "updatedAt" | "sha256" | "hashStatus"
  >,
): Promise<CodexDossierFile> {
  try {
    const absolutePath = safeJoin(workdir, file.relativePath);
    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile()) {
      return {
        ...file,
        exists: false,
        byteLength: null,
        updatedAt: null,
        sha256: null,
        hashStatus: "missing",
      };
    }
    if (fileStat.size > hashMaxBytes()) {
      return {
        ...file,
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
      ...file,
      exists: true,
      byteLength: fileStat.size,
      updatedAt: fileStat.mtime.toISOString(),
      sha256,
      hashStatus: "computed",
    };
  } catch {
    return {
      ...file,
      exists: false,
      byteLength: null,
      updatedAt: null,
      sha256: null,
      hashStatus: "missing",
    };
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function isRecord(value: Record<string, unknown> | null): value is Record<string, unknown> {
  return value !== null;
}

function countBy(values: string[]) {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

async function readJson(workdir: string, relativePath: string) {
  try {
    return JSON.parse(await readFile(safeJoin(workdir, relativePath), "utf8"));
  } catch {
    return null;
  }
}

function summarizeResults(
  parsed: unknown,
  jobTotalUnits: number,
  coverageReplicationUnitCount: number | null,
): CodexResultsSummary {
  const root = record(parsed);
  const units = Array.isArray(root?.units) ? root.units : [];
  const unitRecords = units.map(record).filter(isRecord);
  const summary = record(root?.summary);
  const unitIds = new Set(
    unitRecords
      .map((unit) =>
        typeof unit.replication_unit_id === "string"
          ? unit.replication_unit_id
          : typeof unit.unit_id === "string"
            ? unit.unit_id
            : null,
      )
      .filter((unitId): unitId is string => Boolean(unitId)),
  );
  const expectedUnits =
    jobTotalUnits ||
    coverageReplicationUnitCount ||
    (typeof summary?.total_units === "number" ? summary.total_units : 0);
  const artifactRefs = new Set<string>();
  for (const unit of unitRecords) {
    if (Array.isArray(unit.artifacts)) {
      for (const artifact of unit.artifacts) {
        if (typeof artifact === "string" && artifact.trim()) {
          artifactRefs.add(artifact);
        }
      }
    }
  }

  return {
    exists: Boolean(root),
    schemaVersion:
      typeof root?.schema_version === "string" ? root.schema_version : null,
    status: typeof root?.status === "string" ? root.status : null,
    expectedUnits,
    unitCount: units.length,
    uniqueUnitCount: unitIds.size,
    missingUnitCount:
      expectedUnits > 0 ? Math.max(0, expectedUnits - unitIds.size) : 0,
    verdictCounts: countBy(
      unitRecords.map((unit) =>
        typeof unit.verdict === "string" ? unit.verdict : "unknown",
      ),
    ),
    evidenceModeCounts: countBy(
      unitRecords.map((unit) =>
        typeof unit.evidence_mode === "string" ? unit.evidence_mode : "unknown",
      ),
    ),
    artifactRefCount: artifactRefs.size,
  };
}

function numericRecord(value: unknown): Record<string, number> {
  const source = record(value);
  if (!source) return {};
  return Object.fromEntries(
    Object.entries(source).filter((entry): entry is [string, number] =>
      typeof entry[1] === "number",
    ),
  );
}

function summarizeCoverageReport(parsed: unknown): CodexCoverageReportSummary {
  const root = record(parsed);
  const missingUnitIds = Array.isArray(root?.missing_unit_ids)
    ? root.missing_unit_ids
    : null;
  const blockedReasons = record(root?.blocked_reasons);
  return {
    exists: Boolean(root),
    dontoStatementCount:
      typeof root?.donto_statement_count === "number"
        ? root.donto_statement_count
        : null,
    replicationUnitCount:
      typeof root?.replication_unit_count === "number"
        ? root.replication_unit_count
        : null,
    resultUnitCount:
      typeof root?.result_unit_count === "number" ? root.result_unit_count : null,
    missingUnitCount: missingUnitIds ? missingUnitIds.length : null,
    unitTypeCounts: numericRecord(root?.unit_type_counts),
    blockedReasonCount: blockedReasons ? Object.keys(blockedReasons).length : null,
  };
}

const GENERATED_ARTIFACT_DIRS = ["src", "experiments"];

async function listGeneratedArtifacts(workdir: string): Promise<CodexDossierFile[]> {
  const files: CodexDossierFile[] = [];
  async function visit(relativeDir: string) {
    const entries = await readdir(safeJoin(workdir, relativeDir), {
      withFileTypes: true,
    });
    for (const entry of entries) {
      const relativePath = join(relativeDir, entry.name);
      if (entry.isDirectory()) {
        if (files.length < 100) await visit(relativePath);
        continue;
      }
      if (!entry.isFile() || files.length >= 100) continue;
      files.push(
        await statFile(workdir, {
          key: `generated:${relativePath}`,
          label: entry.name,
          relativePath,
          required: false,
          phase: "output",
        }),
      );
    }
  }

  for (const relativeDir of GENERATED_ARTIFACT_DIRS) {
    if (existsSync(safeJoin(workdir, relativeDir))) {
      await visit(relativeDir);
    }
  }
  return files;
}

function serializeJob(job: SimulationJob): CodexDossierJob {
  return {
    id: job.id,
    state: job.state,
    totalUnits: job.totalUnits,
    completedUnits: job.completedUnits,
    failedUnits: job.failedUnits,
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    errorSummary: job.errorSummary,
    scope: job.scope,
  };
}

export async function summarizeCodexWorkdirDossier(input: {
  paperId: string;
  job: SimulationJob;
  workdir?: string;
}): Promise<CodexReplicationDossier> {
  const workdir = input.workdir ?? codexFullPaperWorkdir(input.paperId, input.job.id);
  const workdirExists = existsSync(workdir);
  const files = await Promise.all(CORE_FILES.map((file) => statFile(workdir, file)));
  const coverageReport = summarizeCoverageReport(
    await readJson(workdir, "experiments/full_paper_replication/coverage_report.json"),
  );
  const results = summarizeResults(
    await readJson(workdir, "results.json"),
    input.job.totalUnits,
    coverageReport.replicationUnitCount,
  );
  const generatedArtifacts = workdirExists
    ? await listGeneratedArtifacts(workdir)
    : [];
  const requiredFiles = files.filter((file) => file.required);
  const coreFilesPresent = requiredFiles.filter((file) => file.exists).length;
  const inputFiles = requiredFiles.filter((file) => file.phase === "input");
  const runtimeFiles = requiredFiles.filter((file) => file.phase === "runtime");
  const outputFiles = requiredFiles.filter((file) => file.phase === "output");
  const inputsPresent = inputFiles.every((file) => file.exists);
  const runtimeTracePresent = runtimeFiles.every((file) => file.exists);
  const outputsPresent = outputFiles.every((file) => file.exists);
  const resultsCoverAllUnits =
    results.expectedUnits > 0 && results.missingUnitCount === 0;
  const coverageReportMatchesResults =
    coverageReport.exists &&
    coverageReport.resultUnitCount != null &&
    coverageReport.resultUnitCount === results.uniqueUnitCount &&
    (coverageReport.missingUnitCount ?? results.missingUnitCount) ===
      results.missingUnitCount;
  const active =
    input.job.state === "queued" || input.job.state === "running";
  const status = !workdirExists
    ? "missing_workdir"
    : active
      ? "running"
      : inputsPresent &&
          runtimeTracePresent &&
          outputsPresent &&
          resultsCoverAllUnits &&
          coverageReportMatchesResults
        ? "auditable"
        : "incomplete";

  return {
    schemaVersion: "toiletpaper.codex-replication-dossier.v1",
    paperId: input.paperId,
    workdir,
    job: serializeJob(input.job),
    status,
    coreFilesPresent,
    coreFilesRequired: requiredFiles.length,
    files,
    generatedArtifacts,
    results,
    coverageReport,
    checks: {
      workdirExists,
      inputsPresent,
      runtimeTracePresent,
      outputsPresent,
      resultsCoverAllUnits,
      coverageReportMatchesResults,
    },
  };
}

export async function latestCodexReplicationDossier(paperId: string) {
  const [job] = await db
    .select()
    .from(simulationJobs)
    .where(eq(simulationJobs.paperId, paperId))
    .orderBy(desc(simulationJobs.createdAt))
    .limit(1);
  if (!job) return null;
  return summarizeCodexWorkdirDossier({ paperId, job });
}

export async function resolveCodexDossierFile(input: {
  paperId: string;
  relativePath: string;
}) {
  const requestedPath = safeDossierRelativePath(input.relativePath);
  if (!requestedPath) return null;

  const dossier = await latestCodexReplicationDossier(input.paperId);
  if (!dossier) return null;

  const file = [...dossier.files, ...dossier.generatedArtifacts].find((item) => {
    const itemPath = safeDossierRelativePath(item.relativePath);
    return item.exists && itemPath === requestedPath;
  });
  if (!file) return null;

  return {
    dossier,
    file,
    absolutePath: safeJoin(dossier.workdir, file.relativePath),
  };
}
