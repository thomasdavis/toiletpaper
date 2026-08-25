/**
 * Correspondence receipts (PRD-010).
 *
 * The highest-risk failure in agent-driven replication is the
 * paper-to-simulation correspondence layer: generated code can run cleanly
 * yet silently simulate a DIFFERENT system than the paper describes
 * (altered operator ordering, initial/boundary conditions, discretization,
 * units, random process, stopping rule, tolerance, or proxy relation).
 * A qualifier cannot recover truth from complete-looking receipts of the
 * wrong proposition.
 *
 * A CorrespondenceReceipt is the machine-checkable artifact that closes
 * that gap for one replication unit. It binds the unit to the source Donto
 * statement ids and evidence spans it operationalizes, and declares the
 * system that was ACTUALLY simulated — so claim↔simulation correspondence
 * can be audited after the fact instead of guessed.
 *
 * Validation here is deliberately structural (presence, referential
 * integrity against the unit, mode-consistency). Semantic adequacy — "is
 * this discretization faithful to the paper?" — is the qualifier's job and
 * must not be approximated with string heuristics.
 */

import type {
  ReplicationBlocker,
  ReplicationUnit,
} from "@toiletpaper/simulator";
import type {
  DigitalPhysicsWorld,
  ReplicationAgentResult,
  ReplicationEvidenceMode,
} from "@toiletpaper/simulator";

export const CORRESPONDENCE_RECEIPT_SCHEMA_VERSION =
  "toiletpaper.correspondence-receipt.v1" as const;

/** How the receipt binds to the knowledge graph it operationalizes. */
export interface CorrespondenceBinding {
  claimIri: string;
  /** Donto statement ids this unit's check operationalizes. */
  sourceStatementIds: string[];
  /** Evidence spans (verbatim quotes) the check is anchored to. */
  evidenceSpans: string[];
}

export interface CorrespondenceParameter {
  name: string;
  value: string;
  unit?: string;
}

export interface CorrespondenceTolerance {
  name: string;
  value: string;
  /** absolute | relative | qualitative | other free-form descriptor */
  kind?: string;
}

/**
 * Declaration of the random process actually used. "none" means the
 * computation is deterministic; "seeded" requires the seeds that were used;
 * "unseeded" is an honest admission that stochastic behavior was not pinned.
 */
export interface CorrespondenceRandomProcess {
  kind: "none" | "seeded" | "unseeded";
  seeds?: Array<number | string>;
  description?: string;
}

/**
 * The system that was ACTUALLY simulated / checked — not the system the
 * paper describes. Divergence between the two is what the qualifier audits.
 */
export interface SimulatedSystemManifest {
  /** One-paragraph description of the implemented system. */
  description: string;
  /** Governing equations / relations implemented, as written in code. */
  equations: string[];
  /** Operator/update ordering when it affects semantics (e.g. splitting). */
  operatorOrdering?: string[];
  initialConditions?: string;
  boundaryConditions?: string;
  discretization?: string;
  /** Unit system used internally (e.g. "SI", "natural units", "dataset native"). */
  unitsSystem?: string;
  randomProcess: CorrespondenceRandomProcess;
  /** Termination criterion for iterative computation. */
  stoppingRule?: string;
  tolerances: CorrespondenceTolerance[];
  parameters: CorrespondenceParameter[];
}

/** Explicit proxy declaration — required whenever the check is a proxy. */
export interface CorrespondenceProxyDeclaration {
  isProxy: boolean;
  /** What relation the proxy bears to the original system (required if isProxy). */
  relation?: string;
  /** What the proxy deliberately does NOT capture. */
  gap?: string;
}

/**
 * The smallest input/witness that would distinguish the intended semantics
 * from the implemented proxy (obstruction-inventory day-one practice).
 */
export interface CorrespondenceFalsifier {
  description: string;
  witness?: string;
}

export interface CorrespondenceCodeRef {
  path: string;
  sha256?: string | null;
}

/** A blocker the executor claims to have resolved, and how. */
export interface CorrespondenceBlockerResolution {
  code: ReplicationBlocker["code"];
  resolution: string;
  /** Staged artifact path(s) that resolved it, when applicable. */
  artifacts?: string[];
}

export interface CorrespondenceReceipt {
  schemaVersion: typeof CORRESPONDENCE_RECEIPT_SCHEMA_VERSION;
  unitId: string;
  binds: CorrespondenceBinding;
  system: SimulatedSystemManifest;
  proxy: CorrespondenceProxyDeclaration;
  falsifier?: CorrespondenceFalsifier;
  code: CorrespondenceCodeRef[];
  resolvedBlockers: CorrespondenceBlockerResolution[];
  declaredBy: "codex" | "deterministic-executor" | "human";
  declaredAt: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Claim ceiling (memory #179): a verdict is always scoped to its declared
// method; the ceiling states the strongest kind of claim the evidence mode
// can support. `insufficient` never raises a claim level.
// ────────────────────────────────────────────────────────────────────────────

export type ClaimCeiling =
  | "none"
  | "static_text_consistency"
  | "proxy_dynamics"
  | "independent_reimplementation"
  | "original_artifact_reexecution"
  | "formal_statement_proof";

const CEILING_BY_MODE: Record<string, ClaimCeiling> = {
  exact_artifact: "original_artifact_reexecution",
  independent_implementation: "independent_reimplementation",
  proxy_simulation: "proxy_dynamics",
  static_check: "static_text_consistency",
  formal_proof: "formal_statement_proof",
  insufficient: "none",
};

/** Modes whose checks execute code (as opposed to reading text). */
const EXECUTABLE_MODES = new Set<string>([
  "exact_artifact",
  "independent_implementation",
  "proxy_simulation",
]);

/**
 * The strongest claim this evidence mode can support, given whether a valid
 * correspondence receipt exists. Without an auditable receipt, executable
 * modes cap at static_text_consistency: we can see that code ran, but not
 * that it simulated the claimed system.
 */
export function claimCeilingFor(
  evidenceMode: string,
  receiptValid: boolean,
): ClaimCeiling {
  const ceiling = CEILING_BY_MODE[evidenceMode] ?? "none";
  if (!receiptValid && EXECUTABLE_MODES.has(evidenceMode)) {
    return "static_text_consistency";
  }
  return ceiling;
}

// ────────────────────────────────────────────────────────────────────────────
// Validation
// ────────────────────────────────────────────────────────────────────────────

export interface CorrespondenceValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

/**
 * Parse an untrusted (agent-written) receipt object into a typed receipt.
 * Returns null when the object is not even structurally a receipt; use
 * validateCorrespondenceReceipt for the real gate decision.
 */
export function parseCorrespondenceReceipt(
  raw: unknown,
): CorrespondenceReceipt | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const unitId =
    (record.unitId ?? record.unit_id ?? record.replication_unit_id) as
      | string
      | undefined;
  if (!isNonEmptyString(unitId)) return null;

  const bindsRaw = (record.binds ?? {}) as Record<string, unknown>;
  const systemRaw = (record.system ?? record.simulated_system ?? {}) as Record<
    string,
    unknown
  >;
  const proxyRaw = (record.proxy ?? {}) as Record<string, unknown>;
  const randomRaw = (systemRaw.randomProcess ??
    systemRaw.random_process ??
    {}) as Record<string, unknown>;
  const falsifierRaw = record.falsifier as Record<string, unknown> | undefined;

  const randomKind = randomRaw.kind;
  const randomProcess: CorrespondenceRandomProcess = {
    kind:
      randomKind === "none" || randomKind === "seeded" || randomKind === "unseeded"
        ? randomKind
        : "unseeded",
    seeds: Array.isArray(randomRaw.seeds)
      ? randomRaw.seeds.filter(
          (seed): seed is number | string =>
            typeof seed === "number" || typeof seed === "string",
        )
      : undefined,
    description: isNonEmptyString(randomRaw.description)
      ? randomRaw.description
      : undefined,
  };

  const toleranceEntries = Array.isArray(systemRaw.tolerances)
    ? systemRaw.tolerances
    : [];
  const parameterEntries = Array.isArray(systemRaw.parameters)
    ? systemRaw.parameters
    : [];
  const codeEntries = Array.isArray(record.code) ? record.code : [];
  const resolvedEntries = Array.isArray(
    record.resolvedBlockers ?? record.resolved_blockers,
  )
    ? ((record.resolvedBlockers ?? record.resolved_blockers) as unknown[])
    : [];

  const declaredBy = record.declaredBy ?? record.declared_by;

  return {
    schemaVersion: CORRESPONDENCE_RECEIPT_SCHEMA_VERSION,
    unitId,
    binds: {
      claimIri: isNonEmptyString(bindsRaw.claimIri ?? bindsRaw.claim_iri)
        ? String(bindsRaw.claimIri ?? bindsRaw.claim_iri)
        : "",
      sourceStatementIds: stringArray(
        bindsRaw.sourceStatementIds ?? bindsRaw.source_statement_ids,
      ),
      evidenceSpans: stringArray(
        bindsRaw.evidenceSpans ?? bindsRaw.evidence_spans,
      ),
    },
    system: {
      description: isNonEmptyString(systemRaw.description)
        ? systemRaw.description
        : "",
      equations: stringArray(systemRaw.equations),
      operatorOrdering: Array.isArray(
        systemRaw.operatorOrdering ?? systemRaw.operator_ordering,
      )
        ? stringArray(systemRaw.operatorOrdering ?? systemRaw.operator_ordering)
        : undefined,
      initialConditions: isNonEmptyString(
        systemRaw.initialConditions ?? systemRaw.initial_conditions,
      )
        ? String(systemRaw.initialConditions ?? systemRaw.initial_conditions)
        : undefined,
      boundaryConditions: isNonEmptyString(
        systemRaw.boundaryConditions ?? systemRaw.boundary_conditions,
      )
        ? String(systemRaw.boundaryConditions ?? systemRaw.boundary_conditions)
        : undefined,
      discretization: isNonEmptyString(systemRaw.discretization)
        ? systemRaw.discretization
        : undefined,
      unitsSystem: isNonEmptyString(
        systemRaw.unitsSystem ?? systemRaw.units_system,
      )
        ? String(systemRaw.unitsSystem ?? systemRaw.units_system)
        : undefined,
      randomProcess,
      stoppingRule: isNonEmptyString(
        systemRaw.stoppingRule ?? systemRaw.stopping_rule,
      )
        ? String(systemRaw.stoppingRule ?? systemRaw.stopping_rule)
        : undefined,
      tolerances: toleranceEntries
        .map((entry) => entry as Record<string, unknown>)
        .filter((entry) => isNonEmptyString(entry?.name))
        .map((entry) => ({
          name: String(entry.name),
          value: isNonEmptyString(entry.value) ? String(entry.value) : "",
          kind: isNonEmptyString(entry.kind) ? String(entry.kind) : undefined,
        })),
      parameters: parameterEntries
        .map((entry) => entry as Record<string, unknown>)
        .filter((entry) => isNonEmptyString(entry?.name))
        .map((entry) => ({
          name: String(entry.name),
          value:
            entry.value === undefined || entry.value === null
              ? ""
              : String(entry.value),
          unit: isNonEmptyString(entry.unit) ? String(entry.unit) : undefined,
        })),
    },
    proxy: {
      isProxy: Boolean(proxyRaw.isProxy ?? proxyRaw.is_proxy),
      relation: isNonEmptyString(proxyRaw.relation)
        ? proxyRaw.relation
        : undefined,
      gap: isNonEmptyString(proxyRaw.gap) ? proxyRaw.gap : undefined,
    },
    falsifier:
      falsifierRaw && isNonEmptyString(falsifierRaw.description)
        ? {
            description: falsifierRaw.description,
            witness: isNonEmptyString(falsifierRaw.witness)
              ? falsifierRaw.witness
              : undefined,
          }
        : undefined,
    code: codeEntries
      .map((entry) => entry as Record<string, unknown>)
      .filter((entry) => isNonEmptyString(entry?.path))
      .map((entry) => ({
        path: String(entry.path),
        sha256: isNonEmptyString(entry.sha256) ? String(entry.sha256) : null,
      })),
    resolvedBlockers: resolvedEntries
      .map((entry) => entry as Record<string, unknown>)
      .filter(
        (entry) =>
          isNonEmptyString(entry?.code) && isNonEmptyString(entry?.resolution),
      )
      .map((entry) => ({
        code: String(entry.code) as ReplicationBlocker["code"],
        resolution: String(entry.resolution),
        artifacts: Array.isArray(entry.artifacts)
          ? stringArray(entry.artifacts)
          : undefined,
      })),
    declaredBy:
      declaredBy === "deterministic-executor" || declaredBy === "human"
        ? declaredBy
        : "codex",
    declaredAt: isNonEmptyString(record.declaredAt ?? record.declared_at)
      ? String(record.declaredAt ?? record.declared_at)
      : new Date().toISOString(),
  };
}

/**
 * Structural validation of a receipt against the unit it claims to cover.
 *
 * Errors invalidate the receipt (the correspondence gate fails). Warnings
 * are recorded for the qualifier but do not invalidate.
 */
export function validateCorrespondenceReceipt(
  receipt: CorrespondenceReceipt | null,
  unit: ReplicationUnit,
  evidenceMode: string,
): CorrespondenceValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!receipt) {
    return {
      valid: false,
      errors: ["no correspondence receipt was provided for this unit"],
      warnings,
    };
  }

  if (receipt.unitId !== unit.id) {
    errors.push(
      `receipt unitId ${receipt.unitId} does not match unit ${unit.id}`,
    );
  }

  // Binding integrity: the receipt must bind real statements of this unit —
  // an executor must not invent bindings.
  if (receipt.binds.sourceStatementIds.length === 0) {
    errors.push("receipt binds no source statement ids");
  } else {
    const known = new Set(unit.sourceStatementIds);
    const foreign = receipt.binds.sourceStatementIds.filter(
      (id) => !known.has(id),
    );
    if (foreign.length > 0) {
      errors.push(
        `receipt binds statement ids not on the unit: ${foreign.join(", ")}`,
      );
    }
  }

  if (
    receipt.binds.claimIri &&
    unit.claimIri &&
    receipt.binds.claimIri !== unit.claimIri
  ) {
    warnings.push(
      `receipt claimIri ${receipt.binds.claimIri} differs from unit claimIri ${unit.claimIri}`,
    );
  }

  if (receipt.binds.evidenceSpans.length === 0) {
    if (unit.evidenceQuotes.length > 0) {
      warnings.push(
        "receipt cites no evidence spans although the unit has evidence quotes",
      );
    }
  } else if (unit.evidenceQuotes.length > 0) {
    const quoteSet = new Set(unit.evidenceQuotes);
    const matched = receipt.binds.evidenceSpans.filter((span) =>
      quoteSet.has(span),
    );
    if (matched.length === 0) {
      warnings.push(
        "none of the receipt's evidence spans matches the unit's extracted quotes",
      );
    }
  }

  // The simulated-system manifest must describe SOMETHING concrete.
  if (!isNonEmptyString(receipt.system.description)) {
    errors.push("receipt declares no simulated-system description");
  }

  const executable = EXECUTABLE_MODES.has(evidenceMode);
  if (executable) {
    if (
      receipt.system.equations.length === 0 &&
      receipt.system.parameters.length === 0
    ) {
      errors.push(
        "executable evidence mode requires the receipt to declare equations or parameters of the implemented system",
      );
    }
    if (receipt.code.length === 0) {
      errors.push(
        "executable evidence mode requires at least one code reference in the receipt",
      );
    }
    if (
      receipt.system.randomProcess.kind === "seeded" &&
      (!receipt.system.randomProcess.seeds ||
        receipt.system.randomProcess.seeds.length === 0)
    ) {
      errors.push("randomProcess.kind is 'seeded' but no seeds are declared");
    }
    if (receipt.system.randomProcess.kind === "unseeded") {
      warnings.push(
        "stochastic computation ran without pinned seeds; reruns may not reproduce",
      );
    }
    if (
      receipt.system.tolerances.length === 0 &&
      !receipt.system.stoppingRule
    ) {
      warnings.push(
        "receipt declares neither tolerances nor a stopping rule; comparison thresholds are unauditable",
      );
    }
  }

  if (evidenceMode === "proxy_simulation") {
    if (!receipt.proxy.isProxy) {
      errors.push(
        "evidence mode is proxy_simulation but the receipt does not declare itself a proxy",
      );
    }
    if (!isNonEmptyString(receipt.proxy.relation)) {
      errors.push(
        "proxy receipts must declare the relation the proxy bears to the original system",
      );
    }
  } else if (receipt.proxy.isProxy && !isNonEmptyString(receipt.proxy.relation)) {
    warnings.push("receipt marks itself a proxy without stating the relation");
  }

  if (!receipt.falsifier) {
    warnings.push(
      "receipt has no falsifier/obstruction inventory (smallest witness distinguishing intended from implemented semantics)",
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ────────────────────────────────────────────────────────────────────────────
// Deterministic-executor receipts
// ────────────────────────────────────────────────────────────────────────────

function describeWorld(world: DigitalPhysicsWorld): string {
  const constraints = world.constraints.length;
  const observables = world.observables.length;
  return (
    `Deterministic static check over the extracted claim graph: ` +
    `${constraints} constraint(s) evaluated against ${observables} observable(s) ` +
    `using engine ${world.engine} (${world.ontology}). ` +
    `No paper dynamics were executed; the checked system is the claim text and ` +
    `its extracted quantities, not the paper's underlying system.`
  );
}

/**
 * Derive a receipt for a deterministic executor run. The deterministic
 * executor knows exactly what it checked (its constraint set), so its
 * receipt is machine-derived rather than agent-declared.
 */
export function deriveDeterministicReceipt(
  unit: ReplicationUnit,
  execution: ReplicationAgentResult,
): CorrespondenceReceipt {
  const world = execution.digitalPhysics;
  return {
    schemaVersion: CORRESPONDENCE_RECEIPT_SCHEMA_VERSION,
    unitId: unit.id,
    binds: {
      claimIri: unit.claimIri,
      sourceStatementIds: [...unit.sourceStatementIds],
      evidenceSpans: [...unit.evidenceQuotes],
    },
    system: {
      description: describeWorld(world),
      equations: world.constraints.map(
        (constraint) => `${constraint.kind}: ${constraint.description}`,
      ),
      randomProcess: { kind: "none" },
      tolerances: [],
      parameters: world.quantities.map((quantity) => ({
        name: quantity.unit
          ? `extracted quantity (${quantity.unit})`
          : "extracted quantity",
        value: quantity.raw,
        unit: quantity.unit,
      })),
    },
    proxy: {
      isProxy: false,
    },
    falsifier: {
      description:
        "A source span whose extracted quantities violate an evaluated constraint would flip this static check.",
    },
    code: [
      {
        path: `@toiletpaper/simulator#${execution.agentId}@${execution.executorVersion}`,
        sha256: null,
      },
    ],
    resolvedBlockers: [],
    declaredBy: "deterministic-executor",
    declaredAt: new Date().toISOString(),
  };
}
