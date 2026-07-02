import type {
  ReplicationBlocker,
  ReplicationUnit,
  ReplicationUnitType,
} from "./replication";

export type ReplicationExecutionVerdict =
  | "reproduced"
  | "contradicted"
  | "fragile"
  | "inconclusive"
  | "not_applicable"
  | "vacuous"
  | "system_error"
  | "untested";

export type ReplicationEvidenceMode =
  | "exact_artifact"
  | "independent_implementation"
  | "proxy_simulation"
  | "static_check"
  | "formal_proof"
  | "insufficient";

export type ReplicationExecutionState =
  | "planned"
  | "blocked"
  | "running"
  | "succeeded"
  | "failed";

export interface DigitalPhysicsQuantity {
  raw: string;
  value: number;
  normalizedValue: number;
  unit?: string;
  start: number;
  end: number;
}

export interface DigitalPhysicsConstraint {
  id: string;
  kind:
    | "observable_grounding"
    | "numeric_equality"
    | "ordering_relation"
    | "artifact_existence"
    | "dataset_existence"
    | "statistical_effect"
    | "external_execution";
  description: string;
  required: boolean;
  satisfied: boolean | null;
}

export interface DigitalPhysicsWorld {
  engine: "tp-digital-physics-v0";
  ontology: "subject-predicate-object-constraint";
  entities: string[];
  observables: string[];
  quantities: DigitalPhysicsQuantity[];
  constraints: DigitalPhysicsConstraint[];
  operations: string[];
}

export interface ReplicationAgentResult {
  agentId: string;
  agentName: string;
  executorVersion: string;
  unitId: string;
  unitType: ReplicationUnitType;
  verdict: ReplicationExecutionVerdict;
  state: ReplicationExecutionState;
  confidence: number;
  evidenceMode: ReplicationEvidenceMode;
  reason: string;
  observations: string[];
  measurements: Record<string, unknown>;
  artifacts: { kind: string; value: string; source: "claim" | "evidence" | "metadata" }[];
  blockers: ReplicationBlocker[];
  limitations: string[];
  digitalPhysics: DigitalPhysicsWorld;
}

interface ReplicationAgent {
  id: string;
  name: string;
  supports: ReplicationUnitType[];
  execute(unit: ReplicationUnit, world: DigitalPhysicsWorld): ReplicationAgentResult;
}

const EXECUTOR_VERSION = "2026-06-12.1";

const URL_RE = /\bhttps?:\/\/[^\s),;]+/gi;
const GITHUB_RE = /\bgithub\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/gi;
const DOI_RE = /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+/gi;
const NUMBER_RE =
  /(?<![A-Za-z0-9])[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:e[-+]?\d+)?\s*(?:%|kHz|Hz|MHz|GHz|ms|s|M|B|K|GB|MB|m|km|kg|N|years?|samples?|parameters?)?/gi;

function lower(text: string) {
  return text.toLowerCase();
}

function allText(unit: ReplicationUnit) {
  return [
    unit.claimText,
    unit.hypothesis,
    unit.expectedOutcome,
    ...unit.evidenceQuotes,
    ...unit.datasets.map((dataset) => dataset.name),
    ...unit.methods.map((method) => method.name),
    ...unit.baselines.map((baseline) => baseline.name),
    ...unit.parameters.map((parameter) => [parameter.name, parameter.value, parameter.unit].filter(Boolean).join(" ")),
    ...unit.metrics.map((metric) => [metric.name, metric.expected, metric.tolerance].filter(Boolean).join(" ")),
  ]
    .filter(Boolean)
    .join("\n");
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function cleanUrl(value: string) {
  return value.replace(/[.)\],;:]+$/, "");
}

function findArtifacts(unit: ReplicationUnit) {
  const text = allText(unit);
  const artifacts: ReplicationAgentResult["artifacts"] = [];

  for (const match of text.matchAll(URL_RE)) {
    artifacts.push({ kind: "url", value: cleanUrl(match[0]), source: "evidence" });
  }
  for (const match of text.matchAll(GITHUB_RE)) {
    artifacts.push({ kind: "repository", value: `https://${cleanUrl(match[0])}`, source: "evidence" });
  }
  for (const match of text.matchAll(DOI_RE)) {
    artifacts.push({ kind: "doi", value: cleanUrl(match[0]), source: "metadata" });
  }

  for (const required of unit.requiredArtifacts) {
    if (required.url) {
      artifacts.push({ kind: required.kind, value: required.url, source: "metadata" });
    }
  }

  return artifacts.filter(
    (artifact, index, all) =>
      all.findIndex((candidate) => candidate.kind === artifact.kind && candidate.value === artifact.value) === index,
  );
}

function normalizeNumber(raw: string) {
  const trimmed = raw.trim();
  const number = Number.parseFloat(trimmed.replace(/,/g, ""));
  if (!Number.isFinite(number)) return null;
  const suffix = trimmed.match(/[A-Za-z%]+$/)?.[0]?.toLowerCase();
  let normalizedValue = number;
  if (suffix === "k" || suffix === "khz") normalizedValue = number * 1_000;
  if (suffix === "m" || suffix === "mhz") normalizedValue = number * 1_000_000;
  if (suffix === "b" || suffix === "ghz") normalizedValue = number * 1_000_000_000;
  return { value: number, normalizedValue, unit: suffix };
}

function parseQuantities(text: string): DigitalPhysicsQuantity[] {
  const quantities: DigitalPhysicsQuantity[] = [];
  for (const match of text.matchAll(NUMBER_RE)) {
    const raw = match[0].trim();
    const parsed = normalizeNumber(raw);
    if (!parsed) continue;
    quantities.push({
      raw,
      value: parsed.value,
      normalizedValue: parsed.normalizedValue,
      unit: parsed.unit,
      start: match.index ?? 0,
      end: (match.index ?? 0) + raw.length,
    });
  }
  return quantities;
}

function evidenceText(unit: ReplicationUnit) {
  return unit.evidenceQuotes.join("\n");
}

function evidenceMentionsQuantity(unit: ReplicationUnit, quantity: DigitalPhysicsQuantity) {
  const evidence = evidenceText(unit);
  if (!evidence) return false;
  if (evidence.includes(quantity.raw)) return true;

  const evidenceQuantities = parseQuantities(evidence);
  return evidenceQuantities.some((candidate) => {
    const scale = Math.max(1, Math.abs(quantity.normalizedValue));
    return Math.abs(candidate.normalizedValue - quantity.normalizedValue) / scale < 0.001;
  });
}

function relationWords(unit: ReplicationUnit) {
  const text = lower(allText(unit));
  return {
    outperform: /(outperform|beats?|better|exceeds?|higher|highest|greater)/.test(text),
    underperform: /(worse|lower|less|underperform)/.test(text),
    difference: /(difference|contrast|compared|comparison|baseline)/.test(text),
  };
}

function namedDatasetEvidence(unit: ReplicationUnit) {
  const evidence = lower(evidenceText(unit));
  return unit.datasets.filter((dataset) => {
    const name = lower(dataset.name);
    return name.length > 1 && (evidence.includes(name) || lower(unit.claimText).includes(name));
  });
}

function buildDigitalPhysicsWorld(unit: ReplicationUnit): DigitalPhysicsWorld {
  const text = allText(unit);
  const quantities = parseQuantities(text);
  const artifacts = findArtifacts(unit);
  const datasetHits = namedDatasetEvidence(unit);
  const relations = relationWords(unit);
  const entities = unique([
    unit.claimIri,
    ...unit.datasets.map((dataset) => dataset.name),
    ...unit.methods.map((method) => method.name),
    ...unit.baselines.map((baseline) => baseline.name),
  ]);
  const observables = unique([
    unit.unitType,
    ...unit.metrics.map((metric) => metric.name),
    ...unit.parameters.map((parameter) => parameter.name),
  ]);

  const constraints: DigitalPhysicsConstraint[] = [
    {
      id: "source-grounding",
      kind: "observable_grounding",
      description: "The replication unit must be grounded in source evidence or explicit graph statements.",
      required: true,
      satisfied: unit.evidenceQuotes.length > 0 || unit.sourceStatementIds.length > 0,
    },
  ];

  if (unit.unitType === "equation_check" || unit.unitType === "metric_recompute") {
    constraints.push({
      id: "numeric-grounding",
      kind: "numeric_equality",
      description: "Reported numeric observables should appear in the evidence or graph-derived claim.",
      required: true,
      satisfied: quantities.length > 0 ? quantities.some((quantity) => evidenceMentionsQuantity(unit, quantity)) : null,
    });
  }

  if (unit.unitType === "baseline_contrast") {
    constraints.push({
      id: "ordering-relation",
      kind: "ordering_relation",
      description: "A comparative claim should encode an ordering relation between a proposed system and baseline.",
      required: true,
      satisfied: relations.outperform || relations.underperform || relations.difference,
    });
  }

  if (unit.unitType === "artifact_availability") {
    constraints.push({
      id: "artifact-existence",
      kind: "artifact_existence",
      description: "The paper should expose an implementation, code reference, model card, or software artifact.",
      required: true,
      satisfied: artifacts.length > 0 ? true : null,
    });
  }

  if (unit.unitType === "dataset_integrity") {
    constraints.push({
      id: "dataset-existence",
      kind: "dataset_existence",
      description: "The graph should name the dataset or benchmark being used.",
      required: true,
      satisfied: unit.datasets.length > 0 || datasetHits.length > 0,
    });
  }

  if (unit.unitType === "statistical_significance") {
    constraints.push({
      id: "statistical-effect",
      kind: "statistical_effect",
      description: "The claim should expose an effect direction, distributional claim, p-value, confidence interval, or test name.",
      required: true,
      satisfied: /(p\s*[<=>]|confidence interval|ci\b|significant|bimodal|unimodal|distribution|effect|correlation|regression|test)/i.test(text),
    });
  }

  if (unit.unitType === "metric_recompute" || unit.unitType === "baseline_contrast") {
    constraints.push({
      id: "external-execution",
      kind: "external_execution",
      description: "Faithful recomputation requires released code, dataset, config, or an equivalent executable artifact.",
      required: true,
      satisfied: artifacts.some((artifact) => artifact.kind === "url" || artifact.kind === "repository"),
    });
  }

  return {
    engine: "tp-digital-physics-v0",
    ontology: "subject-predicate-object-constraint",
    entities,
    observables,
    quantities,
    constraints,
    operations: [
      "construct_state_vector",
      "extract_numeric_observables",
      "bind_source_evidence",
      "evaluate_constraints",
      "emit_verdict",
    ],
  };
}

function executionState(verdict: ReplicationExecutionVerdict): ReplicationExecutionState {
  if (verdict === "system_error") return "failed";
  if (verdict === "not_applicable") return "blocked";
  if (verdict === "untested") return "planned";
  return "succeeded";
}

function result(
  unit: ReplicationUnit,
  world: DigitalPhysicsWorld,
  args: Omit<ReplicationAgentResult, "unitId" | "unitType" | "state" | "digitalPhysics"> & {
    state?: ReplicationExecutionState;
  },
): ReplicationAgentResult {
  return {
    ...args,
    unitId: unit.id,
    unitType: unit.unitType,
    state: args.state ?? executionState(args.verdict),
    digitalPhysics: world,
  };
}

function baseBlockers(unit: ReplicationUnit, detail?: string): ReplicationBlocker[] {
  if (unit.blockers.length > 0) return unit.blockers;
  if (!detail) return [];
  return [{ code: "needs-artifact-url", detail, severity: "blocking" }];
}

const artifactAvailabilityAgent: ReplicationAgent = {
  id: "artifact-availability-agent",
  name: "Artifact Availability Agent",
  supports: ["artifact_availability"],
  execute(unit, world) {
    const artifacts = findArtifacts(unit);
    const hasNamedSoftware = /(github|code|repository|library|package|software|implementation|model card|weights|checkpoint|optimizer|architecture)/i.test(
      allText(unit),
    );

    if (artifacts.length > 0) {
      return result(unit, world, {
        agentId: this.id,
        agentName: this.name,
        executorVersion: EXECUTOR_VERSION,
        verdict: "reproduced",
        confidence: 0.78,
        evidenceMode: "static_check",
        reason: "The graph/evidence contains explicit artifact references that a downstream executor can fetch or inspect.",
        observations: ["Found explicit artifact references.", "Did not execute artifact contents in this pass."],
        measurements: { artifactCount: artifacts.length },
        artifacts,
        blockers: [],
        limitations: ["Availability was checked from source text and graph metadata, not by cloning or executing the artifact."],
      });
    }

    if (hasNamedSoftware) {
      return result(unit, world, {
        agentId: this.id,
        agentName: this.name,
        executorVersion: EXECUTOR_VERSION,
        verdict: "inconclusive",
        confidence: 0.55,
        evidenceMode: "static_check",
        reason: "The graph names software or model machinery, but no fetchable artifact URL was found.",
        observations: ["Detected implementation-related terminology.", "No explicit URL or repository reference was available."],
        measurements: { artifactCount: 0 },
        artifacts,
        blockers: baseBlockers(unit, "Need a repository, model card, code archive, or equivalent artifact URL."),
        limitations: ["Cannot execute or inspect implementation without a concrete artifact location."],
      });
    }

    return result(unit, world, {
      agentId: this.id,
      agentName: this.name,
      executorVersion: EXECUTOR_VERSION,
      verdict: "untested",
      confidence: 0.4,
      evidenceMode: "insufficient",
      reason: "No implementation or artifact reference was found in the graph/evidence.",
      observations: [],
      measurements: { artifactCount: 0 },
      artifacts,
      blockers: baseBlockers(unit, "Need an artifact reference before checking availability."),
      limitations: ["Graph extraction may have missed artifact references if they appear outside extracted spans."],
    });
  },
};

const datasetIntegrityAgent: ReplicationAgent = {
  id: "dataset-integrity-agent",
  name: "Dataset Integrity Agent",
  supports: ["dataset_integrity"],
  execute(unit, world) {
    const artifacts = findArtifacts(unit);
    const hits = namedDatasetEvidence(unit);
    const datasetCount = unit.datasets.length;

    if (datasetCount > 0 && hits.length > 0) {
      return result(unit, world, {
        agentId: this.id,
        agentName: this.name,
        executorVersion: EXECUTOR_VERSION,
        verdict: "inconclusive",
        confidence: 0.68,
        evidenceMode: "static_check",
        reason: "The dataset claim is grounded in the source evidence, but the dataset itself was not downloaded or hash-verified.",
        observations: hits.map((dataset) => `Source evidence mentions dataset: ${dataset.name}`),
        measurements: { datasetCount, sourceMatchedDatasets: hits.map((dataset) => dataset.name) },
        artifacts,
        blockers: [],
        limitations: ["This checks graph/source consistency only; it does not validate dataset contents, license, split, or hash."],
      });
    }

    if (datasetCount > 0) {
      return result(unit, world, {
        agentId: this.id,
        agentName: this.name,
        executorVersion: EXECUTOR_VERSION,
        verdict: "inconclusive",
        confidence: 0.52,
        evidenceMode: "static_check",
        reason: "The graph names a dataset or benchmark, but source-span grounding was weak or absent.",
        observations: unit.datasets.map((dataset) => `Graph dataset: ${dataset.name}`),
        measurements: { datasetCount },
        artifacts,
        blockers: [],
        limitations: ["Need source span, dataset URL, split, and license before full integrity verification."],
      });
    }

    return result(unit, world, {
      agentId: this.id,
      agentName: this.name,
      executorVersion: EXECUTOR_VERSION,
      verdict: "untested",
      confidence: 0.35,
      evidenceMode: "insufficient",
      reason: "No concrete dataset or benchmark was extracted for this unit.",
      observations: [],
      measurements: { datasetCount: 0 },
      artifacts,
      blockers: baseBlockers(unit, "Need a named dataset, benchmark, split, or source before checking dataset integrity."),
      limitations: ["Cannot check dataset integrity without a dataset identity."],
    });
  },
};

const numericConstraintAgent: ReplicationAgent = {
  id: "numeric-constraint-agent",
  name: "Numeric Constraint Agent",
  supports: ["equation_check"],
  execute(unit, world) {
    const artifacts = findArtifacts(unit);
    const quantities = world.quantities;
    const grounded = quantities.filter((quantity) => evidenceMentionsQuantity(unit, quantity));

    if (quantities.length === 0) {
      return result(unit, world, {
        agentId: this.id,
        agentName: this.name,
        executorVersion: EXECUTOR_VERSION,
        verdict: "untested",
        confidence: 0.35,
        evidenceMode: "insufficient",
        reason: "No numeric observable was available to check.",
        observations: [],
        measurements: { quantityCount: 0 },
        artifacts,
        blockers: [],
        limitations: ["The statement may be qualitative despite being routed as an equation/check unit."],
      });
    }

    if (grounded.length > 0) {
      return result(unit, world, {
        agentId: this.id,
        agentName: this.name,
        executorVersion: EXECUTOR_VERSION,
        verdict: "reproduced",
        confidence: 0.76,
        evidenceMode: "static_check",
        reason: "The numeric observable is internally consistent with the source evidence and graph-derived claim.",
        observations: grounded.map((quantity) => `Grounded numeric observable: ${quantity.raw}`),
        measurements: {
          quantities: quantities.map((quantity) => ({
            raw: quantity.raw,
            normalizedValue: quantity.normalizedValue,
            unit: quantity.unit,
          })),
          grounded: grounded.map((quantity) => quantity.raw),
        },
        artifacts,
        blockers: [],
        limitations: ["This is a deterministic source/constraint check, not a full independent re-derivation from raw experimental data."],
      });
    }

    return result(unit, world, {
      agentId: this.id,
      agentName: this.name,
      executorVersion: EXECUTOR_VERSION,
      verdict: "inconclusive",
      confidence: 0.48,
      evidenceMode: "static_check",
      reason: "Numeric observables were extracted, but no matching source evidence span confirmed them.",
      observations: quantities.map((quantity) => `Ungrounded numeric observable: ${quantity.raw}`),
      measurements: { quantities: quantities.map((quantity) => quantity.raw) },
      artifacts,
      blockers: [],
      limitations: ["Need stronger source anchoring or executable derivation for a reproduced/contradicted verdict."],
    });
  },
};

const metricRecomputeAgent: ReplicationAgent = {
  id: "metric-recompute-agent",
  name: "Metric Recompute Agent",
  supports: ["metric_recompute"],
  execute(unit, world) {
    const artifacts = findArtifacts(unit);
    const quantities = world.quantities;
    const grounded = quantities.filter((quantity) => evidenceMentionsQuantity(unit, quantity));
    const hasExecutableArtifacts = artifacts.some((artifact) => artifact.kind === "repository" || artifact.kind === "url");

    if (hasExecutableArtifacts) {
      return result(unit, world, {
        agentId: this.id,
        agentName: this.name,
        executorVersion: EXECUTOR_VERSION,
        verdict: "inconclusive",
        confidence: 0.6,
        evidenceMode: "static_check",
        reason: "Executable artifacts are referenced, but this pass did not yet run the code/data recomputation sandbox.",
        observations: ["Found artifact references for a future recomputation run."],
        measurements: { artifactCount: artifacts.length, quantities: quantities.map((quantity) => quantity.raw) },
        artifacts,
        blockers: [],
        limitations: ["Needs sandboxed artifact fetch, environment build, dataset resolution, and metric execution for a reproduced/contradicted verdict."],
      });
    }

    if (grounded.length > 0) {
      return result(unit, world, {
        agentId: this.id,
        agentName: this.name,
        executorVersion: EXECUTOR_VERSION,
        verdict: "inconclusive",
        confidence: 0.58,
        evidenceMode: "static_check",
        reason: "The reported metric value is source-grounded, but faithful recomputation is blocked by missing executable artifacts.",
        observations: grounded.map((quantity) => `Reported metric grounded in source evidence: ${quantity.raw}`),
        measurements: { grounded: grounded.map((quantity) => quantity.raw), quantityCount: quantities.length },
        artifacts,
        blockers: baseBlockers(unit, "Need code, dataset, configuration, and seed policy before recomputing the metric."),
        limitations: ["Source-grounded extraction is not the same as independent metric recomputation."],
      });
    }

    return result(unit, world, {
      agentId: this.id,
      agentName: this.name,
      executorVersion: EXECUTOR_VERSION,
      verdict: "not_applicable",
      confidence: 0.5,
      evidenceMode: "insufficient",
      reason: "Faithful metric recomputation is blocked because no executable artifacts or grounded reported metric were available.",
      observations: [],
      measurements: { quantityCount: quantities.length, artifactCount: artifacts.length },
      artifacts,
      blockers: baseBlockers(unit, "Need code, dataset, configuration, and a reported metric value before recomputation."),
      limitations: ["No digital recomputation can run without data/code or a grounded numeric target."],
    });
  },
};

const baselineContrastAgent: ReplicationAgent = {
  id: "baseline-contrast-agent",
  name: "Baseline Contrast Agent",
  supports: ["baseline_contrast"],
  execute(unit, world) {
    const artifacts = findArtifacts(unit);
    const relations = relationWords(unit);
    const hasRelation = relations.outperform || relations.underperform || relations.difference;
    const baselineCount = unit.baselines.length;

    if (hasRelation && baselineCount > 0) {
      return result(unit, world, {
        agentId: this.id,
        agentName: this.name,
        executorVersion: EXECUTOR_VERSION,
        verdict: "inconclusive",
        confidence: 0.58,
        evidenceMode: "static_check",
        reason: "The graph contains a comparative relation and baseline identity, but no executable fair-budget comparison was run.",
        observations: unit.baselines.map((baseline) => `Baseline candidate: ${baseline.name}`),
        measurements: { baselineCount, relation: relations },
        artifacts,
        blockers: baseBlockers(unit, "Need baseline implementation, proposed implementation, dataset, and evaluation budget before rerunning the contrast."),
        limitations: ["Static comparative parsing cannot establish reproduction without rerunning both sides under matched conditions."],
      });
    }

    return result(unit, world, {
      agentId: this.id,
      agentName: this.name,
      executorVersion: EXECUTOR_VERSION,
      verdict: "not_applicable",
      confidence: 0.45,
      evidenceMode: "insufficient",
      reason: "The comparative claim lacks enough baseline or relation structure for a digital contrast.",
      observations: [],
      measurements: { baselineCount, relation: relations },
      artifacts,
      blockers: baseBlockers(unit, "Need a named baseline, proposed method, dataset, and evaluation recipe."),
      limitations: ["Cannot fairly compare systems without both implementations and an evaluation protocol."],
    });
  },
};

const statisticalFeasibilityAgent: ReplicationAgent = {
  id: "statistical-feasibility-agent",
  name: "Statistical Feasibility Agent",
  supports: ["statistical_significance"],
  execute(unit, world) {
    const artifacts = findArtifacts(unit);
    const text = allText(unit);
    const hasStatistic = /(p\s*[<=>]|confidence interval|ci\b|significant|regression|correlation|dip test|bimodal|unimodal|distribution|effect)/i.test(text);
    const quantities = world.quantities;

    if (hasStatistic) {
      return result(unit, world, {
        agentId: this.id,
        agentName: this.name,
        executorVersion: EXECUTOR_VERSION,
        verdict: "inconclusive",
        confidence: 0.62,
        evidenceMode: "static_check",
        reason: "The graph exposes a statistical effect/test shape, but raw samples or summary tables are needed for independent significance recomputation.",
        observations: ["Detected statistical/effect language in the graph or evidence."],
        measurements: { quantities: quantities.map((quantity) => quantity.raw), hasStatistic },
        artifacts,
        blockers: [],
        limitations: ["Needs raw data or sufficient summary statistics to recompute p-values, intervals, corrections, and effect sizes."],
      });
    }

    return result(unit, world, {
      agentId: this.id,
      agentName: this.name,
      executorVersion: EXECUTOR_VERSION,
      verdict: "untested",
      confidence: 0.4,
      evidenceMode: "insufficient",
      reason: "No statistical test, effect direction, or sufficient summary data was detected.",
      observations: [],
      measurements: { quantityCount: quantities.length },
      artifacts,
      blockers: [],
      limitations: ["The graph may contain a broad finding rather than a recomputable statistical claim."],
    });
  },
};

const defaultAgent: ReplicationAgent = {
  id: "digital-physics-general-agent",
  name: "Digital Physics General Agent",
  supports: [
    "ablation",
    "scaling_law",
    "theorem_check",
    "citation_corroboration",
    "simulation",
    "human_review",
  ],
  execute(unit, world) {
    const artifacts = findArtifacts(unit);
    return result(unit, world, {
      agentId: this.id,
      agentName: this.name,
      executorVersion: EXECUTOR_VERSION,
      verdict: "untested",
      state: unit.blockers.length > 0 ? "blocked" : "planned",
      confidence: 0.35,
      evidenceMode: "insufficient",
      reason: "A digital world model was built, but no specialized executor is registered for this unit type yet.",
      observations: world.constraints.map((constraint) => `${constraint.id}: ${constraint.satisfied}`),
      measurements: { constraintCount: world.constraints.length, quantityCount: world.quantities.length },
      artifacts,
      blockers: unit.blockers,
      limitations: ["Specialized executor not yet implemented for this replication unit type."],
    });
  },
};

const AGENTS: ReplicationAgent[] = [
  artifactAvailabilityAgent,
  datasetIntegrityAgent,
  numericConstraintAgent,
  metricRecomputeAgent,
  baselineContrastAgent,
  statisticalFeasibilityAgent,
  defaultAgent,
];

function selectAgent(unit: ReplicationUnit) {
  return AGENTS.find((agent) => agent.supports.includes(unit.unitType)) ?? defaultAgent;
}

export function executeReplicationUnit(unit: ReplicationUnit): ReplicationAgentResult {
  try {
    const world = buildDigitalPhysicsWorld(unit);
    return selectAgent(unit).execute(unit, world);
  } catch (e) {
    const world: DigitalPhysicsWorld = {
      engine: "tp-digital-physics-v0",
      ontology: "subject-predicate-object-constraint",
      entities: [unit.claimIri],
      observables: [unit.unitType],
      quantities: [],
      constraints: [],
      operations: ["executor_error"],
    };
    return result(unit, world, {
      agentId: "executor-error",
      agentName: "Executor Error",
      executorVersion: EXECUTOR_VERSION,
      verdict: "system_error",
      confidence: 0,
      evidenceMode: "insufficient",
      reason: `Replication agent failed: ${e instanceof Error ? e.message : String(e)}`,
      observations: [],
      measurements: {},
      artifacts: [],
      blockers: [],
      limitations: ["The executor crashed before producing a scientific result."],
    });
  }
}

export function executeReplicationUnits(units: ReplicationUnit[]): ReplicationAgentResult[] {
  return units.map((unit) => executeReplicationUnit(unit));
}
