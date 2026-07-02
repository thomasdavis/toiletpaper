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

export type ComputeTier = "cpu" | "gpu";

export interface ComputeBudget {
  tier: "algebraic" | "tiny" | "reduced" | "full" | "human";
  /** Runtime compute tier — "cpu" for CPU-only execution, "gpu" for GPU-required claims */
  computeTier?: ComputeTier;
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

const BIBLIOGRAPHIC_PREDICATES = new Set([
  "affiliatedwith",
  "aliasof",
  "authorof",
  "citation",
  "citationlabel",
  "contributed",
  "contributedrole",
  "editorof",
  "fundedby",
  "fundedvia",
  "grantedby",
  "gratefulto",
  "hasarticleNumber".toLowerCase(),
  "hasauthor",
  "hasdoi",
  "haseditor",
  "hasemail",
  "haskeyword",
  "hasorcid",
  "haspagerange",
  "haspages",
  "haspublicationdate",
  "haspublicationyear",
  "haspublisher",
  "hastitle",
  "hasvolume",
  "iscorrespondingauthor",
  "partof",
  "providedby",
  "published",
  "publishedby",
  "publishedin",
  "rdf:type",
  "rdfs:label",
  "reportedIn".toLowerCase(),
  "schema:author",
  "schema:description",
  "schema:name",
]);

const INTERNAL_METADATA_PREDICATES = new Set([
  "tp:category",
  "tp:confidence",
  "tp:evidence",
  "tp:expectedvalue",
  "tp:extractedfrom",
  "tp:measuredvalue",
  "tp:predicate",
  "tp:simulationverdict",
  "tp:unit",
  "tp:value",
  "tp:verdictreason",
]);

const EXACT_PREDICATE_ALIASES: Record<string, ReplicationUnitType> = {
  "ml:score": "metric_recompute",
  "ml:benchmark": "baseline_contrast",
  "ml:evaluationsetting": "dataset_integrity",
  "ml:outperforms": "baseline_contrast",
  "ml:outperformson": "baseline_contrast",
  "ml:finding": "statistical_significance",
  "ml:usestechnique": "artifact_availability",
  "ml:basemodel": "artifact_availability",
  "ml:parametercount": "equation_check",
  outperforms: "baseline_contrast",
  outperformson: "baseline_contrast",
  outperformsoncetaceantasks: "baseline_contrast",
  outperformsonTask: "baseline_contrast",
  performanceishigheston: "baseline_contrast",
  transferperformanceworsethan: "baseline_contrast",
  separatesecotypeworsethan: "baseline_contrast",
  evaluatedon: "dataset_integrity",
  evaluatedondataset: "dataset_integrity",
  usedtoevaluate: "dataset_integrity",
  sourcedfromdataset: "dataset_integrity",
  trainedondataset: "dataset_integrity",
  hasaucscoreontask: "metric_recompute",
  hasmodelparametercount: "equation_check",
  hasparametercount: "equation_check",
  hasembeddingdimension: "equation_check",
  hassamplerate: "equation_check",
  haswindowsize: "equation_check",
  usestechnique: "artifact_availability",
  usesarchitecture: "artifact_availability",
  usesmeanpooling: "artifact_availability",
  usesoptimizer: "artifact_availability",
  generatedusinglibrary: "artifact_availability",
  finding: "statistical_significance",
  demonstrates: "statistical_significance",
};

export function buildReplicationUnitsFromDonto(
  input: DontoReplicationBundleInput,
): ReplicationUnit[] {
  const bySubject = new Map<string, DontoStatementInput[]>();
  for (const statement of input.statements) {
    const statements = bySubject.get(statement.subject) ?? [];
    statements.push(statement);
    bySubject.set(statement.subject, statements);
  }

  return input.statements
    .map((statement, index) => {
      const unitType = unitTypeForPredicate(statement.predicate);
      if (!unitType) return null;
      return buildScientificReplicationUnit(
        input,
        statement,
        unitType,
        index,
        bySubject.get(statement.subject) ?? [],
      );
    })
    .filter((unit): unit is ReplicationUnit => Boolean(unit));
}

function buildScientificReplicationUnit(
  input: DontoReplicationBundleInput,
  statement: DontoStatementInput,
  unitType: ReplicationUnitType,
  index: number,
  subjectFacts: DontoStatementInput[],
): ReplicationUnit {
  const evidenceQuote = statement.evidence_quote ? [statement.evidence_quote] : [];
  const claimText = renderStatement(statement);
  const blockers = blockersForUnit(unitType);

  return {
    id: statement.statementId
      ? `${input.paperId}:replication:${statement.statementId}`
      : `${input.paperId}:replication:${index}`,
    paperId: input.paperId,
    claimIri: statement.subject || `${input.claimIriPrefix ?? "tp:claim"}:${input.paperId}:${index}`,
    sourceStatementIds: statement.statementId ? [statement.statementId] : [],
    domain: domainForStatement(statement),
    unitType,
    claimText,
    evidenceQuotes: evidenceQuote,
    hypothesis: hypothesisForStatement(statement, claimText),
    expectedOutcome: expectedOutcomeForStatement(statement, claimText),
    falsificationCriteria: falsificationCriteriaForUnit(unitType),
    requiredArtifacts: artifactRequirementsForUnit(unitType),
    datasets: datasetRequirementsForStatement(statement, subjectFacts),
    methods: methodRequirementsForStatement(statement, subjectFacts),
    metrics: metricRequirementsForStatement(statement),
    baselines: baselineRequirementsForStatement(statement, subjectFacts),
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

function predicateKey(predicate: string): string {
  return predicate.trim().toLowerCase();
}

function predicateLocalName(predicate: string): string {
  const parts = predicate.split(/[#:]/);
  return (parts[parts.length - 1] ?? predicate).trim();
}

function friendlyTerm(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/^https?:\/\/[^#/]+[#/]/, "")
    .replace(/^[a-z]+:/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function humanPredicate(predicate: string): string {
  const local = predicateLocalName(predicate);
  return local
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .toLowerCase();
}

function objectText(statement: DontoStatementInput): string | null {
  if (statement.object_lit) return String(statement.object_lit.v);
  if (statement.object_iri) return statement.object_iri;
  return null;
}

function renderStatement(statement: DontoStatementInput): string {
  const object = objectText(statement);
  return [
    friendlyTerm(statement.subject),
    humanPredicate(statement.predicate),
    object ? friendlyTerm(String(object)) : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function unitTypeForPredicate(predicate: string): ReplicationUnitType | null {
  if (ML_REPLICATION_PREDICATES.has(predicate)) {
    return EXACT_PREDICATE_ALIASES[predicateKey(predicate)] ?? "human_review";
  }

  const key = predicateKey(predicate);
  if (BIBLIOGRAPHIC_PREDICATES.has(key) || INTERNAL_METADATA_PREDICATES.has(key)) {
    return null;
  }
  if (EXACT_PREDICATE_ALIASES[key]) return EXACT_PREDICATE_ALIASES[key];

  const local = predicateLocalName(predicate).toLowerCase();
  if (BIBLIOGRAPHIC_PREDICATES.has(local) || INTERNAL_METADATA_PREDICATES.has(local)) {
    return null;
  }

  if (
    /(outperform|better|worse|highest|beats?|exceeds?|compare|improve|increase|decrease|reduce|enhance|surpass|lower|higher|greater|less|relative|versus|vs)/.test(
      local,
    )
  ) {
    return "baseline_contrast";
  }
  if (
    /(dataset|benchmark|evaluation|evaluated|trainedon|sourcedfrom|sample|cohort|specimen|corpus|repository|archive|source)/.test(
      local,
    )
  ) {
    return "dataset_integrity";
  }
  if (
    /(simulate|simulation|modeled|modelled|dynamics|evolution|diffusion|transport|flow|reaction|phase|transition|trajectory|orbit|wave|particle|fluid|thermal|mechanical|fracture|crack|grain|interface)/.test(
      local,
    )
  ) {
    return "simulation";
  }
  if (
    /(equation|formula|law|derive|calculated|computed|predicted|proportional|scaling|ratio|coefficient|constant|parameter|dimension|length|width|height|thickness|diameter|radius|area|volume|mass|weight|density|temperature|pressure|concentration|dose|ph|energy|force|stress|strain|modulus|strength|hardness|viscosity|conductivity|resistance|voltage|current|field|frequency|wavelength|speed|velocity|acceleration|time|duration|percentage|percent|rate|count|auc|accuracy|precision|recall|f1|score|metric|samplerate|windowsize)/.test(
      local,
    )
  ) {
    return /(equation|formula|law|derive|calculated|computed|parameter|dimension|count|ratio|coefficient|constant)/.test(local)
      ? "equation_check"
      : "metric_recompute";
  }
  if (
    /(uses?|architecture|optimizer|technique|pooling|model|library|implementation|software|instrument|apparatus|protocol|method|procedure|fabricated|prepared|synthesized|measuredwith)/.test(
      local,
    )
  ) {
    return "artifact_availability";
  }
  if (/(pvalue|p-value|significant|confidence|interval|correlation|regression|distribution|variance|mean|median|finding|demonstrat|show|indicat|support|observe|suggest|associate|effect)/.test(local)) {
    return "statistical_significance";
  }

  return "human_review";
}

function domainForStatement(statement: DontoStatementInput): ReplicationDomain {
  const text = `${statement.subject} ${statement.predicate} ${objectText(statement) ?? ""}`.toLowerCase();
  if (/(model|dataset|auc|embedding|classifier|baseline|benchmark|perch|birdnet|aves|gmwm|surfperch|parameter|optimizer)/.test(text)) {
    return "ml";
  }
  if (/(whale|orca|bioacoustic|species|vocal|coda|ecotype|dataset)/.test(text)) {
    return "biology";
  }
  if (/(physics|magnetic|viscosity|dynamo|reconnection|mhd|reynolds)/.test(text)) {
    return "physics";
  }
  if (/(graphene|aluminum|aluminium|alloy|composite|polymer|ceramic|microstructure|tensile|fracture|grain|nanotube|oxide|metal|material|specimen|modulus|hardness)/.test(text)) {
    return "materials";
  }
  if (/(chemical|chemistry|catalyst|reaction|molecule|compound|solvent|ph|concentration|synthesis|electrolyte|oxidation|reduction)/.test(text)) {
    return "chemistry";
  }
  if (/(theorem|lemma|proof|corollary|conjecture|bounded|converges|matrix|manifold|topology|algebra|geometry)/.test(text)) {
    return "math";
  }
  if (/(cell|protein|gene|rna|dna|organism|clinical|patient|species|enzyme|assay|genome|phenotype)/.test(text)) {
    return "biology";
  }
  return "unknown";
}

function hypothesisForStatement(statement: DontoStatementInput, claimText: string): string {
  const unitType = unitTypeForPredicate(statement.predicate);
  if (unitType === "baseline_contrast") {
    return `${statement.subject} outperforms ${claimText} under the paper's reported evaluation setting.`;
  }
  if (unitType === "metric_recompute") {
    return `${statement.subject} achieves the reported metric value ${claimText}.`;
  }
  if (unitType === "equation_check") {
    return `${statement.subject} has the reported parameter count of ${claimText}.`;
  }
  if (unitType === "statistical_significance") {
    return `The finding "${claimText}" for ${statement.subject} holds under independent statistical evaluation.`;
  }
  if (unitType === "simulation") {
    return `A digital physics model can reproduce or falsify the reported statement: ${claimText}.`;
  }
  if (unitType === "human_review") {
    return `The paper statement is preserved as a replication work item requiring method-aware interpretation: ${claimText}.`;
  }
  return `${statement.subject} claim can be independently checked: ${claimText}.`;
}

function expectedOutcomeForStatement(statement: DontoStatementInput, claimText: string): string {
  const unitType = unitTypeForPredicate(statement.predicate);
  if (unitType === "metric_recompute") return `Recomputed metric matches ${claimText} within declared tolerance.`;
  if (unitType === "baseline_contrast") return `Proposed method beats baseline in the same direction as reported.`;
  if (unitType === "equation_check") return `Model architecture or formula yields ${claimText}.`;
  if (unitType === "statistical_significance") return `Statistical significance and effect direction match the reported finding.`;
  if (unitType === "simulation") return "A reduced or exact digital model reproduces the qualitative or quantitative behavior reported by the paper.";
  if (unitType === "human_review") return "A verifier either maps the statement to executable artifacts or records a precise blocker.";
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
  if (unitType === "equation_check") {
    return [
      "Computed value differs from reported value beyond rounding.",
      "Model config does not produce the stated architecture.",
    ];
  }
  if (unitType === "statistical_significance") {
    return [
      "Reported p-value or confidence interval cannot be reproduced from provided data.",
      "Effect size is not significant under corrected multiple-comparison testing.",
    ];
  }
  if (unitType === "simulation") {
    return [
      "A digital model with the paper's stated assumptions fails to reproduce the reported trend.",
      "Required boundary conditions, material parameters, or dynamical equations are absent.",
    ];
  }
  if (unitType === "human_review") {
    return [
      "The statement cannot be mapped to a concrete artifact, measurement, equation, dataset, or simulation procedure.",
      "A specialized verifier identifies contradictory source evidence or missing method detail.",
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
  if (unitType === "simulation") {
    return [
      { kind: "paper", name: "source paper evidence", required: true },
      { kind: "config", name: "model assumptions, parameters, and boundary conditions", required: true },
    ];
  }
  return [{ kind: "paper", name: "source paper evidence", required: true }];
}

function datasetRequirementsForStatement(
  statement: DontoStatementInput,
  subjectFacts: DontoStatementInput[],
): DatasetRequirement[] {
  const datasetFacts = subjectFacts.filter((fact) =>
    /(dataset|benchmark|evaluatedon|sourcedfrom|trainedon)/i.test(fact.predicate),
  );
  if (datasetFacts.length > 0) {
    return datasetFacts.map((fact) => ({
      name: friendlyTerm(objectText(fact) ?? "reported dataset"),
      splits: [],
    }));
  }
  if (unitTypeForPredicate(statement.predicate) === "dataset_integrity") {
    return [{ name: objectText(statement) ?? "reported benchmark", splits: [] }];
  }
  return [];
}

function methodRequirementsForStatement(
  statement: DontoStatementInput,
  subjectFacts: DontoStatementInput[],
): MethodRequirement[] {
  const methodFacts = subjectFacts.filter((fact) =>
    /(uses?|architecture|optimizer|technique|model|pooling|library)/i.test(fact.predicate),
  );
  if (methodFacts.length > 0) {
    return methodFacts.slice(0, 5).map((fact) => ({
      name: friendlyTerm(objectText(fact) ?? fact.subject),
      role: "proposed",
    }));
  }
  return [{ name: statement.subject, role: "proposed" }];
}

function metricRequirementsForStatement(statement: DontoStatementInput): MetricRequirement[] {
  if (statement.predicate === "ml:score") {
    return [{ name: "reported metric", direction: "unknown", expected: objectText(statement) ?? undefined }];
  }
  const unitType = unitTypeForPredicate(statement.predicate);
  if (unitType === "metric_recompute" || unitType === "equation_check") {
    return [{
      name: friendlyTerm(predicateLocalName(statement.predicate)) || "reported observable",
      direction: "unknown",
      expected: objectText(statement) ?? undefined,
    }];
  }
  return [];
}

function baselineRequirementsForStatement(
  statement: DontoStatementInput,
  subjectFacts: DontoStatementInput[],
): BaselineRequirement[] {
  if (unitTypeForPredicate(statement.predicate) === "baseline_contrast") {
    return [{
      name: friendlyTerm(objectText(statement) ?? "reported baseline"),
      expectedRelation: "outperformed_by_proposed",
    }];
  }

  const comparisonFacts = subjectFacts.filter((fact) =>
    /(comparedwith|baseline|outperform)/i.test(fact.predicate),
  );
  if (comparisonFacts.length > 0) {
    return comparisonFacts.slice(0, 5).map((fact) => ({
      name: friendlyTerm(objectText(fact) ?? "reported baseline"),
      expectedRelation: "unknown",
    }));
  }
  return [];
}

function parameterRequirementsForStatement(statement: DontoStatementInput): ParameterRequirement[] {
  if (statement.predicate === "ml:parameterCount") {
    return [{ name: "parameter count", value: objectText(statement) ?? undefined, required: true }];
  }
  const unitType = unitTypeForPredicate(statement.predicate);
  if (unitType === "equation_check" || unitType === "simulation") {
    return [{
      name: friendlyTerm(predicateLocalName(statement.predicate)) || "reported parameter",
      value: objectText(statement) ?? undefined,
      required: unitType === "simulation",
    }];
  }
  return [];
}

function computeBudgetForUnit(unitType: ReplicationUnitType): ComputeBudget {
  if (unitType === "metric_recompute" || unitType === "baseline_contrast") {
    return { tier: "reduced", computeTier: "gpu", maxGpuHours: 24, maxMemoryGb: 48 };
  }
  if (unitType === "artifact_availability" || unitType === "dataset_integrity") {
    return { tier: "tiny", computeTier: "cpu", maxCpuHours: 1 };
  }
  if (unitType === "equation_check") {
    return { tier: "algebraic", computeTier: "cpu", maxCpuHours: 0.1 };
  }
  if (unitType === "statistical_significance") {
    return { tier: "tiny", computeTier: "cpu", maxCpuHours: 2, maxMemoryGb: 8 };
  }
  if (unitType === "simulation") {
    return { tier: "reduced", computeTier: "cpu", maxCpuHours: 4, maxMemoryGb: 16 };
  }
  return { tier: "human" };
}

function verifierCandidatesForUnit(unitType: ReplicationUnitType): string[] {
  if (unitType === "metric_recompute") return ["metric-table-parser", "config-replay", "small-proxy-repro"];
  if (unitType === "baseline_contrast") return ["metric-table-parser", "small-proxy-repro", "stat-sanity"];
  if (unitType === "artifact_availability") return ["artifact-availability"];
  if (unitType === "dataset_integrity") return ["artifact-availability", "dataset-integrity"];
  if (unitType === "equation_check") return ["theory-shape-check", "config-replay"];
  if (unitType === "statistical_significance") return ["stat-sanity", "metric-table-parser"];
  if (unitType === "simulation") return ["digital-physics-reduced-model", "theory-shape-check"];
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
  if (unitType === "simulation") {
    return [
      {
        code: "needs-hyperparameter-detail",
        detail: "Need the paper's governing equations, boundary conditions, material constants, or equivalent assumptions for faithful simulation.",
        severity: "warning",
      },
    ];
  }
  if (unitType === "human_review") {
    return [
      {
        code: "needs-human-method-review",
        detail: "No specialized deterministic verifier matched this extracted fact; keep it in the full-paper worklist for Codex/manual method reconstruction.",
        severity: "blocking",
      },
    ];
  }
  return [];
}
