/**
 * Replication gate order (PRD-010).
 *
 * Verdicts only COUNT after the gates before them are recorded and passed:
 *
 *   1. extraction     — claim/span extraction quality: the unit is bound to
 *                       real Donto statements and (ideally) evidence spans.
 *   2. compilation    — the unit compiled into something runnable, with
 *                       unresolved-artifact blockers surfaced, not hidden.
 *   3. correspondence — a machine-checkable receipt declares the system
 *                       actually simulated and binds it to the claim.
 *   4. execution      — the check actually ran and left evidence
 *                       (measurements / artifacts), not just an assertion.
 *   5. verdict        — admitted only when 1–4 passed; otherwise the raw
 *                       verdict is DEMOTED to `untested` and preserved as
 *                       `ungatedVerdict` so nothing is lost.
 *
 * A missing gate is a bounded negative receipt — never pressure to invent
 * defaults. This module is shared by the live ingest path
 * (scripts/run-codex-replication-job.ts) and the recovery path
 * (scripts/ingest-codex-results.ts) so the two can never drift.
 *
 * NOTE: demoted rows persist the executor's raw verdict under
 * `metadata.ungated_verdict`, deliberately NOT `metadata.original_verdict` —
 * normalizeVerdict() PROMOTES original_verdict when it is a signal value,
 * which would silently undo the demotion at read time.
 */

import type { ReplicationUnit } from "@toiletpaper/simulator";
import {
  claimCeilingFor,
  validateCorrespondenceReceipt,
  type ClaimCeiling,
  type CorrespondenceReceipt,
  type CorrespondenceValidation,
} from "./replication-correspondence";

export const REPLICATION_GATE_ORDER = [
  "extraction",
  "compilation",
  "correspondence",
  "execution",
  "verdict",
] as const;

export type ReplicationGateId = (typeof REPLICATION_GATE_ORDER)[number];

export interface ReplicationGateRecord {
  gate: Exclude<ReplicationGateId, "verdict">;
  status: "passed" | "failed";
  reasons: string[];
  warnings: string[];
  observed: Record<string, unknown>;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ────────────────────────────────────────────────────────────────────────────
// Canonicalization — honest defaults
// ────────────────────────────────────────────────────────────────────────────

export const CANONICAL_VERDICTS = [
  "reproduced",
  "contradicted",
  "fragile",
  "inconclusive",
  "not_applicable",
  "vacuous",
  "system_error",
  "untested",
] as const;

export type CanonicalVerdict = (typeof CANONICAL_VERDICTS)[number];

const SIGNAL_VERDICTS = new Set<CanonicalVerdict>([
  "reproduced",
  "contradicted",
  "fragile",
  "inconclusive",
]);

/**
 * Canonicalize an executor-reported verdict. An unknown or missing verdict
 * is `untested` — NOT `inconclusive`: `inconclusive` is a signal verdict
 * ("a real test ran and could not decide"), which an absent/garbled verdict
 * has not earned.
 */
export function canonicalVerdict(value: unknown): CanonicalVerdict {
  if (
    typeof value === "string" &&
    (CANONICAL_VERDICTS as readonly string[]).includes(value)
  ) {
    return value as CanonicalVerdict;
  }
  return "untested";
}

export const CANONICAL_EVIDENCE_MODES = [
  "exact_artifact",
  "independent_implementation",
  "proxy_simulation",
  "static_check",
  "formal_proof",
  "insufficient",
] as const;

export type CanonicalEvidenceMode = (typeof CANONICAL_EVIDENCE_MODES)[number];

/**
 * Canonicalize an executor-reported evidence mode. A missing mode is
 * `insufficient` — NOT `proxy_simulation`: an undeclared method must never
 * be silently promoted into an evidence-producing one (memory #179:
 * insufficient never raises a claim level).
 */
export function canonicalEvidenceMode(value: unknown): CanonicalEvidenceMode {
  if (
    typeof value === "string" &&
    (CANONICAL_EVIDENCE_MODES as readonly string[]).includes(value)
  ) {
    return value as CanonicalEvidenceMode;
  }
  return "insufficient";
}

export function isSignalVerdict(verdict: CanonicalVerdict): boolean {
  return SIGNAL_VERDICTS.has(verdict);
}

// ────────────────────────────────────────────────────────────────────────────
// Gate 1 — extraction
// ────────────────────────────────────────────────────────────────────────────

export function evaluateExtractionGate(
  unit: ReplicationUnit,
): ReplicationGateRecord {
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (unit.sourceStatementIds.length === 0) {
    reasons.push("unit is bound to no Donto source statements");
  } else if (!UUID_RE.test(unit.sourceStatementIds[0] ?? "")) {
    reasons.push(
      "unit's primary source statement id is not a statement UUID; the result cannot be attached to a claim",
    );
  }

  if (unit.evidenceQuotes.length === 0) {
    warnings.push(
      "unit has no extracted evidence quotes; span anchoring is missing for this claim",
    );
  }

  return {
    gate: "extraction",
    status: reasons.length === 0 ? "passed" : "failed",
    reasons,
    warnings,
    observed: {
      sourceStatementCount: unit.sourceStatementIds.length,
      evidenceQuoteCount: unit.evidenceQuotes.length,
      plannerId: unit.planner.plannerId,
      plannerSource: unit.planner.source,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Gate 2 — compilation (unresolved-artifact blockers surfaced)
// ────────────────────────────────────────────────────────────────────────────

export function evaluateCompilationGate(
  unit: ReplicationUnit,
  receipt: CorrespondenceReceipt | null,
): ReplicationGateRecord {
  const reasons: string[] = [];
  const warnings: string[] = [];

  const blocking = unit.blockers.filter(
    (blocker) => blocker.severity === "blocking",
  );
  const resolvedCodes = new Set(
    (receipt?.resolvedBlockers ?? []).map((resolution) => resolution.code),
  );
  const unresolved = blocking.filter(
    (blocker) => !resolvedCodes.has(blocker.code),
  );

  for (const blocker of unresolved) {
    reasons.push(`unresolved blocking blocker ${blocker.code}: ${blocker.detail}`);
  }
  for (const blocker of unit.blockers) {
    if (blocker.severity === "warning") {
      warnings.push(`${blocker.code}: ${blocker.detail}`);
    }
  }

  return {
    gate: "compilation",
    status: reasons.length === 0 ? "passed" : "failed",
    reasons,
    warnings,
    observed: {
      blockerCount: unit.blockers.length,
      blockingBlockerCount: blocking.length,
      resolvedBlockerCount: blocking.length - unresolved.length,
      resolvedBlockerCodes: [...resolvedCodes],
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Gate 3 — correspondence
// ────────────────────────────────────────────────────────────────────────────

export function evaluateCorrespondenceGate(
  unit: ReplicationUnit,
  receipt: CorrespondenceReceipt | null,
  evidenceMode: CanonicalEvidenceMode,
  validation?: CorrespondenceValidation,
): ReplicationGateRecord {
  const resolved =
    validation ?? validateCorrespondenceReceipt(receipt, unit, evidenceMode);
  return {
    gate: "correspondence",
    status: resolved.valid ? "passed" : "failed",
    reasons: resolved.errors,
    warnings: resolved.warnings,
    observed: {
      receiptPresent: receipt !== null,
      declaredBy: receipt?.declaredBy ?? null,
      boundStatementCount: receipt?.binds.sourceStatementIds.length ?? 0,
      boundEvidenceSpanCount: receipt?.binds.evidenceSpans.length ?? 0,
      codeRefCount: receipt?.code.length ?? 0,
      hasFalsifier: Boolean(receipt?.falsifier),
      proxyDeclared: receipt?.proxy.isProxy ?? false,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Gate 4 — execution
// ────────────────────────────────────────────────────────────────────────────

export interface ExecutionEvidence {
  /** Executor-reported measurements (BEFORE any defaulting). */
  measurements: unknown;
  /**
   * Executor-reported artifacts as reported (BEFORE merging in the
   * common workdir files, which would make every unit look executed).
   */
  reportedArtifacts: unknown;
}

function hasEntries(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).length > 0;
  }
  return false;
}

export function evaluateExecutionGate(
  evidence: ExecutionEvidence,
): ReplicationGateRecord {
  const measurementsPresent = hasEntries(evidence.measurements);
  const artifactsPresent = hasEntries(evidence.reportedArtifacts);
  const reasons: string[] = [];

  if (!measurementsPresent && !artifactsPresent) {
    reasons.push(
      "no execution evidence: the result reports neither measurements nor unit-specific artifacts",
    );
  }

  return {
    gate: "execution",
    status: reasons.length === 0 ? "passed" : "failed",
    reasons,
    warnings: [],
    observed: {
      measurementsPresent,
      reportedArtifactsPresent: artifactsPresent,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Gate 5 — verdict admission
// ────────────────────────────────────────────────────────────────────────────

export interface GatedVerdict {
  /** The verdict that should be persisted / counted. */
  verdict: CanonicalVerdict;
  evidenceMode: CanonicalEvidenceMode;
  /** True when a signal verdict was demoted for failing gates. */
  demoted: boolean;
  /** The executor's raw verdict when demoted (metadata.ungated_verdict). */
  ungatedVerdict: CanonicalVerdict | null;
  /** Which gates failed, with reasons — the audit trail for the demotion. */
  gateFailures: Array<{ gate: string; reasons: string[] }>;
  claimCeiling: ClaimCeiling;
  gates: ReplicationGateRecord[];
}

export interface GateUnitVerdictInput {
  unit: ReplicationUnit;
  rawVerdict: unknown;
  rawEvidenceMode: unknown;
  receipt: CorrespondenceReceipt | null;
  executionEvidence: ExecutionEvidence;
}

/**
 * Run the full gate order for one unit result and decide the verdict that
 * may be persisted. Meta verdicts pass through unchanged (they are already
 * honest "no useful answer" receipts); signal verdicts are admitted only
 * when every prior gate passed AND the evidence mode is evidence-producing.
 */
export function gateUnitVerdict(input: GateUnitVerdictInput): GatedVerdict {
  const rawVerdict = canonicalVerdict(input.rawVerdict);
  const evidenceMode = canonicalEvidenceMode(input.rawEvidenceMode);

  const receiptValidation = validateCorrespondenceReceipt(
    input.receipt,
    input.unit,
    evidenceMode,
  );
  const gates: ReplicationGateRecord[] = [
    evaluateExtractionGate(input.unit),
    evaluateCompilationGate(input.unit, input.receipt),
    evaluateCorrespondenceGate(
      input.unit,
      input.receipt,
      evidenceMode,
      receiptValidation,
    ),
    evaluateExecutionGate(input.executionEvidence),
  ];

  const failures = gates
    .filter((record) => record.status === "failed")
    .map((record) => ({ gate: record.gate, reasons: record.reasons }));

  const receiptValid = receiptValidation.valid;
  const claimCeiling = claimCeilingFor(evidenceMode, receiptValid);

  if (!isSignalVerdict(rawVerdict)) {
    return {
      verdict: rawVerdict,
      evidenceMode,
      demoted: false,
      ungatedVerdict: null,
      gateFailures: failures,
      claimCeiling,
      gates,
    };
  }

  const demotionReasons: Array<{ gate: string; reasons: string[] }> = [
    ...failures,
  ];
  if (evidenceMode === "insufficient") {
    demotionReasons.push({
      gate: "verdict",
      reasons: [
        "signal verdict with evidence mode 'insufficient' can never count (insufficient never raises a claim level)",
      ],
    });
  }

  if (demotionReasons.length > 0) {
    return {
      verdict: "untested",
      evidenceMode,
      demoted: true,
      ungatedVerdict: rawVerdict,
      gateFailures: demotionReasons,
      claimCeiling,
      gates,
    };
  }

  return {
    verdict: rawVerdict,
    evidenceMode,
    demoted: false,
    ungatedVerdict: null,
    gateFailures: [],
    claimCeiling,
    gates,
  };
}
