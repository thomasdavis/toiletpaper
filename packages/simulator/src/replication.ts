export type ReplicationDomain =
  | "ml"
  | "physics"
  | "math"
  | "biology"
  | "chemistry"
  | "materials"
  | "social_science"
  | "humanities"
  | "unknown";

export type ReplicationUnitType =
  | "metric_recompute"
  | "baseline_contrast"
  | "ablation"
  | "scaling_law"
  | "equation_check"
  | "artifact_availability"
  | "dataset_integrity"
  | "statistical_significance"
  | "theorem_check"
  | "citation_corroboration"
  | "simulation"
  | "human_review";

export type ReplicationState =
  | "planned"
  | "blocked"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface ReplicationArtifactRequirement {
  kind: "code" | "dataset" | "model" | "adapter" | "config" | "logs" | "paper";
  name: string;
  url?: string;
  required: boolean;
}

export interface DatasetRequirement {
  name: string;
  splits: string[];
  source?: string;
  preprocessing?: string;
}

export interface MethodRequirement {
  name: string;
  role: "baseline" | "proposed" | "ablation" | "measurement";
  implementationHint?: string;
}

export interface MetricRequirement {
  name: string;
  direction: "higher_is_better" | "lower_is_better" | "target_value" | "unknown";
  expected?: string;
  tolerance?: string;
}

export interface BaselineRequirement {
  name: string;
  expectedRelation: "outperformed_by_proposed" | "matches_proposed" | "unknown";
}

export interface ParameterRequirement {
  name: string;
  value?: string;
  unit?: string;
  required: boolean;
}

export interface ComputeBudget {
  tier: "algebraic" | "tiny" | "reduced" | "full" | "human";
  maxCpuHours?: number;
  maxGpuHours?: number;
  maxMemoryGb?: number;
}

export interface PlannerProvenance {
  plannerId: string;
  model?: string;
  version: string;
  source: "deterministic" | "local_model" | "frontier_model" | "human";
}

export interface ReplicationBlocker {
  code:
    | "needs-artifact-url"
    | "needs-dataset-license"
    | "needs-compute-budget"
    | "needs-hyperparameter-detail"
    | "needs-seed-count"
    | "needs-baseline-implementation"
    | "needs-human-method-review";
  detail: string;
  severity: "blocking" | "warning";
}

export interface ReplicationUnit {
  id: string;
  paperId: string;
  claimIri: string;
  sourceStatementIds: string[];
  domain: ReplicationDomain;
  unitType: ReplicationUnitType;
  claimText: string;
  evidenceQuotes: string[];
  hypothesis: string;
  expectedOutcome: string;
  falsificationCriteria: string[];
  requiredArtifacts: ReplicationArtifactRequirement[];
  datasets: DatasetRequirement[];
  methods: MethodRequirement[];
  metrics: MetricRequirement[];
  baselines: BaselineRequirement[];
  parameters: ParameterRequirement[];
  computeBudget: ComputeBudget;
  verifierCandidates: string[];
  planner: PlannerProvenance;
  state: ReplicationState;
  blockers: ReplicationBlocker[];
}

export interface DontoStatementInput {
  statementId?: string;
  subject: string;
  predicate: string;
  object_iri?: string | null;
  object_lit?: { v: string | number | boolean; dt?: string } | null;
  context?: string;
  donto_tier?: string;
  evidence_quote?: string;
  confidence?: number;
}

export interface DontoReplicationBundleInput {
  paperId: string;
  claimIriPrefix?: string;
  statements: DontoStatementInput[];
  planner?: Partial<PlannerProvenance>;
}

const ML_REPLICATION_PREDICATES = new Set([
  "ml:score",
  "ml:benchmark",
  "ml:evaluationSetting",
  "ml:outperforms",
  "ml:outperformsOn",
  "ml:finding",
  "ml:usesTechnique",
  "ml:baseModel",
  "ml:parameterCount",
]);

export function buildReplicationUnitsFromDonto(
  input: DontoReplicationBundleInput,
): ReplicationUnit[] {
  return input.statements
    .filter((statement) => ML_REPLICATION_PREDICATES.has(statement.predicate))
    .map((statement, index) => buildMlReplicationUnit(input, statement, index));
}

function buildMlReplicationUnit(
  input: DontoReplicationBundleInput,
  statement: DontoStatementInput,
  index: number,
): ReplicationUnit {
  const evidenceQuote = statement.evidence_quote ? [statement.evidence_quote] : [];
  const claimText = objectText(statement) ?? statement.subject;
  const unitType = unitTypeForPredicate(statement.predicate);
  const blockers = blockersForUnit(unitType);

  return {
    id: `${input.paperId}:replication:${index}`,
    paperId: input.paperId,
    claimIri: `${input.claimIriPrefix ?? "tp:claim"}:${input.paperId}:${index}`,
    sourceStatementIds: statement.statementId ? [statement.statementId] : [],
    domain: "ml",
    unitType,
    claimText,
    evidenceQuotes: evidenceQuote,
    hypothesis: hypothesisForStatement(statement, claimText),
    expectedOutcome: expectedOutcomeForStatement(statement, claimText),
    falsificationCriteria: falsificationCriteriaForUnit(unitType),
    requiredArtifacts: artifactRequirementsForUnit(unitType),
    datasets: datasetRequirementsForStatement(statement),
    methods: methodRequirementsForStatement(statement),
    metrics: metricRequirementsForStatement(statement),
    baselines: baselineRequirementsForStatement(statement),
    parameters: parameterRequirementsForStatement(statement),
    computeBudget: computeBudgetForUnit(unitType),
    verifierCandidates: verifierCandidatesForUnit(unitType),
    planner: {
      plannerId: input.planner?.plannerId ?? "deterministic-donto-ml-v0",
      model: input.planner?.model,
      version: input.planner?.version ?? "0.1.0",
      source: input.planner?.source ?? "deterministic",
    },
    state: blockers.some((blocker) => blocker.severity === "blocking") ? "blocked" : "planned",
    blockers,
  };
}

function objectText(statement: DontoStatementInput): string | null {
  if (statement.object_lit) return String(statement.object_lit.v);
  if (statement.object_iri) return statement.object_iri;
  return null;
}

function unitTypeForPredicate(predicate: string): ReplicationUnitType {
  if (predicate === "ml:score") return "metric_recompute";
  if (predicate === "ml:benchmark" || predicate === "ml:outperformsOn") return "baseline_contrast";
  if (predicate === "ml:outperforms") return "baseline_contrast";
  if (predicate === "ml:evaluationSetting") return "dataset_integrity";
  if (predicate === "ml:usesTechnique" || predicate === "ml:baseModel") return "artifact_availability";
  return "human_review";
}

function hypothesisForStatement(statement: DontoStatementInput, claimText: string): string {
  if (statement.predicate === "ml:outperforms") {
    return `${statement.subject} outperforms ${claimText} under the paper's reported evaluation setting.`;
  }
  if (statement.predicate === "ml:score") {
    return `${statement.subject} achieves the reported metric value ${claimText}.`;
  }
  return `${statement.subject} claim can be independently checked: ${claimText}.`;
}

function expectedOutcomeForStatement(statement: DontoStatementInput, claimText: string): string {
  if (statement.predicate === "ml:score") return `Recomputed metric matches ${claimText} within declared tolerance.`;
  if (statement.predicate === "ml:outperforms") return `Proposed method beats baseline in the same direction as reported.`;
  return "Verifier either reproduces the claim, identifies a blocker, or emits a non-signal verdict.";
}

function falsificationCriteriaForUnit(unitType: ReplicationUnitType): string[] {
  if (unitType === "metric_recompute") {
    return [
      "Recomputed metric differs from the reported value outside tolerance.",
      "Reported split, dataset, or preprocessing cannot be matched.",
    ];
  }
  if (unitType === "baseline_contrast") {
    return [
      "Baseline matches or exceeds the proposed method under the same compute and tuning budget.",
      "Reported improvement disappears across the required random seeds.",
    ];
  }
  return ["Required artifacts or assumptions are unavailable after reasonable search."];
}

function artifactRequirementsForUnit(unitType: ReplicationUnitType): ReplicationArtifactRequirement[] {
  if (unitType === "artifact_availability") {
    return [{ kind: "code", name: "paper implementation or model card", required: true }];
  }
  if (unitType === "metric_recompute" || unitType === "baseline_contrast") {
    return [
      { kind: "code", name: "training/evaluation code", required: true },
      { kind: "dataset", name: "evaluation dataset", required: true },
      { kind: "config", name: "hyperparameter/config file", required: true },
    ];
  }
  return [{ kind: "paper", name: "source paper evidence", required: true }];
}

function datasetRequirementsForStatement(statement: DontoStatementInput): DatasetRequirement[] {
  if (statement.predicate === "ml:benchmark" || statement.predicate === "ml:outperformsOn") {
    return [{ name: objectText(statement) ?? "reported benchmark", splits: [] }];
  }
  return [];
}

function methodRequirementsForStatement(statement: DontoStatementInput): MethodRequirement[] {
  if (statement.predicate === "ml:usesTechnique") {
    return [{ name: objectText(statement) ?? statement.subject, role: "proposed" }];
  }
  return [{ name: statement.subject, role: "proposed" }];
}

function metricRequirementsForStatement(statement: DontoStatementInput): MetricRequirement[] {
  if (statement.predicate === "ml:score") {
    return [{ name: "reported metric", direction: "unknown", expected: objectText(statement) ?? undefined }];
  }
  return [];
}

function baselineRequirementsForStatement(statement: DontoStatementInput): BaselineRequirement[] {
  if (statement.predicate === "ml:outperforms") {
    return [{ name: objectText(statement) ?? "reported baseline", expectedRelation: "outperformed_by_proposed" }];
  }
  return [];
}

function parameterRequirementsForStatement(statement: DontoStatementInput): ParameterRequirement[] {
  if (statement.predicate === "ml:parameterCount") {
    return [{ name: "parameter count", value: objectText(statement) ?? undefined, required: true }];
  }
  return [];
}

function computeBudgetForUnit(unitType: ReplicationUnitType): ComputeBudget {
  if (unitType === "metric_recompute" || unitType === "baseline_contrast") {
    return { tier: "reduced", maxGpuHours: 24, maxMemoryGb: 48 };
  }
  if (unitType === "artifact_availability" || unitType === "dataset_integrity") {
    return { tier: "tiny", maxCpuHours: 1 };
  }
  return { tier: "human" };
}

function verifierCandidatesForUnit(unitType: ReplicationUnitType): string[] {
  if (unitType === "metric_recompute") return ["metric-table-parser", "config-replay", "small-proxy-repro"];
  if (unitType === "baseline_contrast") return ["metric-table-parser", "small-proxy-repro", "stat-sanity"];
  if (unitType === "artifact_availability") return ["artifact-availability"];
  if (unitType === "dataset_integrity") return ["artifact-availability", "dataset-integrity"];
  return ["human-review"];
}

function blockersForUnit(unitType: ReplicationUnitType): ReplicationBlocker[] {
  if (unitType === "metric_recompute" || unitType === "baseline_contrast") {
    return [
      {
        code: "needs-artifact-url",
        detail: "Need code, dataset, or released configuration before running a faithful replication.",
        severity: "blocking",
      },
      {
        code: "needs-seed-count",
        detail: "Need reported seed count or acceptable replication seed policy.",
        severity: "warning",
      },
    ];
  }
  return [];
}
