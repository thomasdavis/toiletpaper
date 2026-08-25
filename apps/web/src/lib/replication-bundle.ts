/**
 * Per-paper replication bundle (PRD-010).
 *
 * The bundle is the aggregation/index artifact a reviewer consumes: one
 * content-addressed manifest per (paper, job) that references every
 * replication unit, its correspondence receipt, its gate records, its
 * gated verdict, and the job's file digests. It mirrors the shape of the
 * rosetta proof-obligation bundle (artifact_id + sha256 over canonical
 * bytes + explicit claim boundaries).
 *
 * Two invariants, from the Rosetta advisory (HAM #188):
 *  - the bundle never merges per-unit claim ceilings or supersession
 *    histories — units evolve independently; the bundle only indexes them;
 *  - "full replication" means DECLARED COVERAGE of the selected executable
 *    obligation set — never an implicit claim that every paper statement
 *    was simulated. Coverage gaps must never read as reproduced.
 *
 * This module is pure: hashing over canonical JSON, no filesystem access.
 * Callers supply file digests (reusing the dossier's hashing).
 */

import { createHash } from "node:crypto";
import type { ReplicationUnit } from "@toiletpaper/simulator";
import type {
  ClaimCeiling,
  CorrespondenceReceipt,
} from "./replication-correspondence";
import type {
  CanonicalEvidenceMode,
  CanonicalVerdict,
  GatedVerdict,
  ReplicationGateRecord,
} from "./replication-gates";
import { REPLICATION_GATE_ORDER, isSignalVerdict } from "./replication-gates";

export const REPLICATION_BUNDLE_SCHEMA_VERSION =
  "toiletpaper.replication-bundle.v1" as const;

// ────────────────────────────────────────────────────────────────────────────
// Canonical JSON + content addressing
// ────────────────────────────────────────────────────────────────────────────

/**
 * Deterministic JSON: object keys sorted lexicographically at every level,
 * arrays kept in order, no insignificant whitespace. Stable across
 * re-serialization so the digest is meaningful.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (value === undefined) return "null";
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry ?? null)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort();
    const body = keys
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",");
    return `{${body}}`;
  }
  // functions/symbols/bigints have no place in a manifest
  return "null";
}

export function sha256OfCanonicalJson(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

// ────────────────────────────────────────────────────────────────────────────
// Bundle shapes
// ────────────────────────────────────────────────────────────────────────────

export interface BundleFileDigest {
  relativePath: string;
  phase: "input" | "runtime" | "output";
  sha256: string | null;
  byteLength: number | null;
  hashStatus: string;
}

export interface BundleUnitVerdict {
  value: CanonicalVerdict;
  evidenceMode: CanonicalEvidenceMode;
  claimCeiling: ClaimCeiling;
  confidence: number | null;
  reason: string | null;
  demoted: boolean;
  /** Raw executor verdict when demoted; never merged into counts. */
  ungatedVerdict: CanonicalVerdict | null;
  gateFailures: Array<{ gate: string; reasons: string[] }>;
}

export interface ReplicationBundleUnitEntry {
  unitId: string;
  claimIri: string;
  claimId: string | null;
  unitType: string;
  domain: string;
  sourceStatementIds: string[];
  evidenceQuoteCount: number;
  computeTier: string;
  gates: ReplicationGateRecord[];
  receipt: CorrespondenceReceipt | null;
  receiptValid: boolean;
  verdict: BundleUnitVerdict;
  simulationId: string | null;
  /** Unit-specific artifacts as reported by the executor, with digests when resolvable. */
  artifacts: Array<{ path: string; sha256: string | null }>;
  /** True when no result was returned for this unit at all. */
  missingResult: boolean;
}

export interface ReplicationBundleCoverage {
  dontoStatementCount: number;
  unitCount: number;
  /** Units whose compute tier is not "human" — the selected executable obligation set. */
  executableUnitCount: number;
  unitsWithResults: number;
  missingResultUnitIds: string[];
  verdicts: {
    gatedSignal: Record<"reproduced" | "contradicted" | "fragile" | "inconclusive", number>;
    meta: Record<"not_applicable" | "vacuous" | "system_error" | "untested", number>;
    /** Signal verdicts demoted for failing gates — counted separately, never pooled. */
    demotedSignalCount: number;
  };
  claimCeilings: Record<string, number>;
  evidenceModes: Record<string, number>;
  /** Denominator accounting: why blocked/unadmitted units are unadmitted. */
  gateFailureCounts: Record<string, number>;
  blockedReasons: Record<string, number>;
  /**
   * The honest headline: gated reproduced count over ALL units (not over
   * returned results) — coverage gaps can never read as reproduced.
   */
  reproducedRate: { numerator: number; denominator: number; value: number };
  declaredCoverage: string;
}

export interface ReplicationBundleManifest {
  schemaVersion: typeof REPLICATION_BUNDLE_SCHEMA_VERSION;
  artifactId: string;
  createdAt: string;
  gateOrder: readonly string[];
  paper: {
    id: string;
    title: string | null;
    doi: string | null;
    arxivId: string | null;
    sourceSha256: string | null;
  };
  job: {
    id: string;
    resultStatus: string;
    exitCode: number | null;
    timedOut: boolean;
  } | null;
  units: ReplicationBundleUnitEntry[];
  coverage: ReplicationBundleCoverage;
  files: BundleFileDigest[];
}

export interface ReplicationBundle {
  manifest: ReplicationBundleManifest;
  /** sha256 over the manifest's canonical JSON bytes. */
  sha256: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Builder
// ────────────────────────────────────────────────────────────────────────────

export interface BundleUnitInput {
  unit: ReplicationUnit;
  gated: GatedVerdict;
  receipt: CorrespondenceReceipt | null;
  confidence: number | null;
  reason: string | null;
  simulationId: string | null;
  artifacts: Array<{ path: string; sha256: string | null }>;
  missingResult: boolean;
}

export interface BuildReplicationBundleInput {
  paper: {
    id: string;
    title?: string | null;
    doi?: string | null;
    arxivId?: string | null;
    sourceSha256?: string | null;
  };
  job: {
    id: string;
    resultStatus: string;
    exitCode: number | null;
    timedOut: boolean;
  } | null;
  units: BundleUnitInput[];
  dontoStatementCount: number;
  files: BundleFileDigest[];
  createdAt?: string;
}

function claimIdForUnit(unit: ReplicationUnit): string | null {
  const id = unit.sourceStatementIds[0];
  return id &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
    ? id
    : null;
}

function bump(record: Record<string, number>, key: string) {
  record[key] = (record[key] ?? 0) + 1;
}

export function replicationBundleArtifactId(paperId: string, jobId: string | null) {
  return jobId
    ? `tp.replication.${paperId}.${jobId}`
    : `tp.replication.${paperId}.graph`;
}

export function buildReplicationBundle(
  input: BuildReplicationBundleInput,
): ReplicationBundle {
  const entries: ReplicationBundleUnitEntry[] = input.units.map((item) => ({
    unitId: item.unit.id,
    claimIri: item.unit.claimIri,
    claimId: claimIdForUnit(item.unit),
    unitType: item.unit.unitType,
    domain: item.unit.domain,
    sourceStatementIds: [...item.unit.sourceStatementIds],
    evidenceQuoteCount: item.unit.evidenceQuotes.length,
    computeTier: item.unit.computeBudget.tier,
    gates: item.gated.gates,
    receipt: item.receipt,
    receiptValid:
      item.gated.gates.find((gate) => gate.gate === "correspondence")
        ?.status === "passed",
    verdict: {
      value: item.gated.verdict,
      evidenceMode: item.gated.evidenceMode,
      claimCeiling: item.gated.claimCeiling,
      confidence: item.confidence,
      reason: item.reason,
      demoted: item.gated.demoted,
      ungatedVerdict: item.gated.ungatedVerdict,
      gateFailures: item.gated.gateFailures,
    },
    simulationId: item.simulationId,
    artifacts: item.artifacts,
    missingResult: item.missingResult,
  }));

  const coverage: ReplicationBundleCoverage = {
    dontoStatementCount: input.dontoStatementCount,
    unitCount: entries.length,
    executableUnitCount: entries.filter((entry) => entry.computeTier !== "human")
      .length,
    unitsWithResults: entries.filter((entry) => !entry.missingResult).length,
    missingResultUnitIds: entries
      .filter((entry) => entry.missingResult)
      .map((entry) => entry.unitId),
    verdicts: {
      gatedSignal: { reproduced: 0, contradicted: 0, fragile: 0, inconclusive: 0 },
      meta: { not_applicable: 0, vacuous: 0, system_error: 0, untested: 0 },
      demotedSignalCount: 0,
    },
    claimCeilings: {},
    evidenceModes: {},
    gateFailureCounts: {},
    blockedReasons: {},
    reproducedRate: { numerator: 0, denominator: entries.length, value: 0 },
    declaredCoverage:
      "Coverage is declared over the compiled replication-unit set only. " +
      "This bundle does not claim that every paper statement was simulated; " +
      "unit ceilings are per-unit and are never merged into a paper-level claim.",
  };

  for (const entry of entries) {
    const verdict = entry.verdict.value;
    if (isSignalVerdict(verdict)) {
      coverage.verdicts.gatedSignal[
        verdict as keyof typeof coverage.verdicts.gatedSignal
      ] += 1;
    } else {
      coverage.verdicts.meta[verdict as keyof typeof coverage.verdicts.meta] += 1;
    }
    if (entry.verdict.demoted) coverage.verdicts.demotedSignalCount += 1;
    bump(coverage.claimCeilings, entry.verdict.claimCeiling);
    bump(coverage.evidenceModes, entry.verdict.evidenceMode);
    for (const failure of entry.verdict.gateFailures) {
      bump(coverage.gateFailureCounts, failure.gate);
    }
    for (const gate of entry.gates) {
      if (gate.gate === "compilation" && gate.status === "failed") {
        for (const reason of gate.reasons) {
          const code = reason.match(/blocker ([a-z-]+):/)?.[1] ?? "other";
          bump(coverage.blockedReasons, code);
        }
      }
    }
  }
  coverage.reproducedRate.numerator = coverage.verdicts.gatedSignal.reproduced;
  coverage.reproducedRate.value =
    coverage.reproducedRate.denominator === 0
      ? 0
      : coverage.reproducedRate.numerator / coverage.reproducedRate.denominator;

  const manifest: ReplicationBundleManifest = {
    schemaVersion: REPLICATION_BUNDLE_SCHEMA_VERSION,
    artifactId: replicationBundleArtifactId(input.paper.id, input.job?.id ?? null),
    createdAt: input.createdAt ?? new Date().toISOString(),
    gateOrder: REPLICATION_GATE_ORDER,
    paper: {
      id: input.paper.id,
      title: input.paper.title ?? null,
      doi: input.paper.doi ?? null,
      arxivId: input.paper.arxivId ?? null,
      sourceSha256: input.paper.sourceSha256 ?? null,
    },
    job: input.job,
    units: entries,
    coverage,
    files: input.files,
  };

  return { manifest, sha256: sha256OfCanonicalJson(manifest) };
}
