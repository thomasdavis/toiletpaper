# PRD-009 · Donto-Native Local Replication Planner

| | |
|---|---|
| Status | Draft |
| Created | 2026-05-03 |
| Owner | toiletpaper engine |
| Related | PRD-001, PRD-002, PRD-004, PRD-005, PRD-006 |

## Problem

`toiletpaper` already has the bones of an automated replication
system: papers become claims, claims are routed to verifiers, verifier
results become verdicts, and Donto stores the evidence substrate. The
current implementation is still too narrow for large-scale paper
replication:

1. Extraction is OpenAI-first and claim-text-first. It does not consume
   Donto-native tier bundles from local models such as the Qwen Donto
   extractor.
2. The simulator schema is physics-shaped. It knows about equations,
   scaling laws, numerical predictions, and baseline contrasts, but not
   ML replication tasks such as dataset availability, train/eval
   scripts, baseline reproduction, ablation checks, seed sensitivity, or
   metric recomputation.
3. There is no explicit compilation step from a paper claim to a
   replication unit. `triageClaims` jumps from a textual claim to a
   `TestableClaim`, leaving no inspectable plan that says what artifact,
   dataset, metric, baseline, tolerance, compute budget, or blocker is
   required.
4. Donto proof obligations are not yet treated as first-class work
   items. They are mentioned in ingestion, but the simulation pipeline
   does not schedule or resolve them.
5. Local models are not integrated into the loop. For volume, privacy,
   and cost, the default path should be local extraction/planning with
   optional frontier-model escalation only for ambiguous or high-impact
   cases.

The result is a system that can verify some physics claims and
hand-built simulations, but cannot yet process thousands of ML/arXiv
papers into a steady stream of reproducible, auditable replication
attempts.

## Goals

1. Accept Donto-native paper bundles as input, including Qwen tier-pass
   outputs with `donto_import.statements`, `donto_tiers`, evidence
   quotes, confidence, and proof obligations.
2. Compile Donto statements into explicit `ReplicationUnit` records
   before any simulator/codegen runs.
3. Support ML/CS paper replication as a first-class domain, including
   LoRA/adapters papers, benchmark papers, training-method papers, and
   dataset/model-release claims.
4. Prefer local models for extraction, claim canonicalization,
   planning, verifier selection, and result interpretation. Frontier
   models may be used as optional escalation, not as the steady-state
   dependency.
5. Store every plan, blocker, run, artifact, verdict, and retry back in
   Donto so the replication lifecycle is inspectable and resumable.
6. Separate "claim was extracted" from "claim can be replicated" from
   "claim was actually replicated."

## Non-goals

- Guaranteeing full replication for every paper. The system should
  produce honest `blocked`, `not_applicable`, and `requires_artifact`
  states.
- Replacing existing physics/MHD simulators. They become verifier
  plugins behind the same planner interface.
- Trusting local-model outputs as ground truth. Local models propose
  plans; deterministic validators and source-grounding checks decide
  whether plans are runnable.
- Running arbitrary untrusted paper code outside a sandbox.

## Current foundation

Already present:

- `packages/extractor`: paper text extraction and LLM claim extraction.
- `packages/donto-client`: Donto document/claim/evidence helpers.
- `packages/simulator`: `TestableClaim`, algebraic checks, simulation
  codegen, runner, judges, and MHD-specific verifiers.
- `docs/prd/PRD-001`: domain routing and simulator registry design.
- `docs/prd/PRD-004`: extractor v2 with structured claim fields and
  testability.
- `docs/prd/PRD-005`: Donto reliability and evidence-substrate repair.
- `docs/prd/PRD-006`: async job pipeline and re-run support.

Missing:

- A Donto bundle import path.
- A general replication-plan schema.
- Local-model extraction/planning adapters.
- ML/CS verifier plugins.
- Proof-obligation scheduling and resolution.

## Proposed pipeline

```
Paper source
  → Paperclip/arXiv/PDF text
  → local Qwen Donto tier-pass extraction
  → source-grounding grader
  → Donto import statements + proof obligations
  → replication planner
  → replication units
  → verifier registry
  → deterministic checks / local codegen / sandboxed runs
  → verdicts + artifacts + unresolved obligations
  → Donto evidence graph
```

The important change is the middle compilation step:

```
Donto statement != replication task
Donto statement → normalized claim → replication unit(s)
```

One paper claim may yield multiple units:

- A metric claim becomes a metric-recompute unit.
- A baseline-comparison claim becomes baseline and proposed-method
  reproduction units plus a comparison unit.
- A theoretical rank-bound claim becomes theorem/derivation checking
  plus empirical sanity checks.
- An artifact claim becomes repository/dataset/model availability
  checks.
- A vague conclusion becomes a low-testability observation with a
  proof obligation, not a simulation.

## New schema: `ReplicationUnit`

```ts
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
```

This should live in `@toiletpaper/simulator` or a new
`@toiletpaper/replication` package once implementation begins.

## ML/CS replication unit fields

For ML papers, the planner must extract:

- **Task:** e.g. GLUE, SQuAD, MT-Bench, continual learning, adapter
  rank allocation.
- **Dataset:** name, split, sample count, license, download/source,
  preprocessing.
- **Model:** base checkpoint, architecture, parameter count,
  quantization, tokenizer.
- **Training recipe:** optimizer, learning rate, schedule, batch size,
  epochs/steps, seeds, LoRA rank/alpha/dropout/target modules.
- **Baselines:** named baseline methods and expected metrics.
- **Metric:** exact metric name, direction, tolerance, aggregation, and
  statistical test.
- **Compute budget:** expected GPU/CPU/VRAM/time, and whether a small
  proxy replication is acceptable.
- **Artifacts:** code repo, model weights, adapters, dataset hashes,
  config files, logs.

For a LoRA/adapters paper, a good replication unit looks like:

```json
{
  "unitType": "baseline_contrast",
  "domain": "ml",
  "hypothesis": "Adaptive rank allocation improves average GLUE score at matched trainable-parameter budget.",
  "expectedOutcome": "GeLoRA average GLUE score exceeds uniform-rank LoRA and adapter baselines within the same parameter budget.",
  "falsificationCriteria": [
    "Uniform-rank LoRA matches or exceeds GeLoRA under the same hyperparameter search budget.",
    "GeLoRA improvement disappears across 5 random seeds.",
    "Reported parameter budget differs from reproduced configuration by >5%."
  ],
  "datasets": [{"name": "GLUE", "splits": ["train", "validation", "test"]}],
  "metrics": [{"name": "GLUE average", "direction": "higher_is_better"}],
  "baselines": ["LoRA", "AdaLoRA", "SoRA", "Houlsby Adapter", "Pfeiffer Adapter"],
  "computeBudget": {"tier": "reduced", "maxGpuHours": 24}
}
```

## Local model roles

Local models should be used in bounded roles:

1. **Extractor:** Qwen Donto tier-pass extraction over Paperclip/arXiv
   text. Output must be source-grounded and valid Donto JSON.
2. **Planner:** Convert grounded Donto statements into
   `ReplicationUnit` candidates. The planner prompt must prefer
   `blocked` over hallucinating artifacts.
3. **Router:** Select verifier candidates from a registry, using
   deterministic domain/category guards first and model scoring only as
   a tie-breaker.
4. **Codegen assistant:** Generate small local verification harnesses
   for eligible units. Generated code must run in the PRD-003 sandbox
   and emit a fixed JSON result schema.
5. **Result explainer:** Summarize deterministic outputs for the UI,
   with no authority to change the verdict enum.

Recommended default stack:

- Qwen 3.5 2B Base + Donto schema LoRA for extraction/planning.
- Optional Qwen SAE probes for debugging why tiers or plan fields fail.
- Local embedding model for claim/artifact deduplication.
- Frontier model escalation only when the planner returns
  `requires_human_review` on high-priority claims.

## Verifier registry extensions

PRD-001's simulator registry should become a broader verifier registry:

```ts
export interface VerifierSpec {
  id: string;
  name: string;
  domains: ReplicationDomain[];
  unitTypes: ReplicationUnitType[];
  applies(unit: ReplicationUnit): VerifierInput | null;
  run(input: VerifierInput, ctx: VerifierContext): Promise<VerifierResult>;
}
```

Initial ML verifiers:

| ID | Unit types | What it does |
|---|---|---|
| `artifact-availability` | `artifact_availability` | Checks code/model/dataset URLs, licenses, hashes, and package metadata. |
| `metric-table-parser` | `metric_recompute`, `baseline_contrast` | Extracts reported numbers from tables and checks internal consistency. |
| `small-proxy-repro` | `baseline_contrast`, `ablation` | Runs a reduced dataset/epoch reproduction to test directionality. |
| `config-replay` | `metric_recompute` | Replays released configs when repo and checkpoints are available. |
| `stat-sanity` | `statistical_significance` | Recomputes p-values, CIs, seed variance, and effect sizes when raw values are present. |
| `theory-shape-check` | `theorem_check`, `equation_check` | Checks algebraic consistency and flags missing assumptions. |

Each verifier must declare:

- Required artifacts.
- Network requirements.
- Compute budget.
- Determinism level.
- Verdict mapping rules.
- What counts as `blocked` vs `contradicted`.

## Donto storage contract

Each replication unit should be represented in Donto:

- `rdf:type tp:ReplicationUnit`
- `tp:testsClaim <claimIri>`
- `tp:unitType "baseline_contrast"`
- `tp:domain "ml"`
- `tp:expectedOutcome "..."`
- `tp:falsificationCriterion "..."`
- `tp:requiresArtifact <artifactIri>`
- `tp:hasVerifierCandidate "small-proxy-repro"`
- `tp:state "planned|blocked|queued|..."`

Verifier results should assert:

- `tp:ReplicationRun`
- `tp:runOf <replicationUnitIri>`
- `tp:verdict <reproduced|contradicted|fragile|...>`
- `tp:confidence`
- `tp:producedArtifact <artifactIri>`
- `tp:supports` / `tp:rebuts` links back to source claim statements.

Unresolved requirements become proof obligations:

- `needs-artifact-url`
- `needs-dataset-license`
- `needs-compute-budget`
- `needs-hyperparameter-detail`
- `needs-seed-count`
- `needs-baseline-implementation`
- `needs-human-method-review`

## State machine

```
extracted
  → source_supported
  → planned
  → blocked | queued
  → running
  → reproduced | contradicted | fragile | inconclusive | system_error
  → argued
  → certified
```

`blocked` is not a failure. It is the honest outcome when the paper
does not provide enough information or artifacts to run a replication.

## Database additions

```sql
CREATE TABLE replication_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id uuid NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  claim_id uuid NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  claim_iri text NOT NULL,
  domain text NOT NULL,
  unit_type text NOT NULL,
  hypothesis text NOT NULL,
  expected_outcome text NOT NULL,
  falsification_criteria jsonb NOT NULL DEFAULT '[]',
  requirements jsonb NOT NULL DEFAULT '{}',
  verifier_candidates text[] NOT NULL DEFAULT '{}',
  state text NOT NULL DEFAULT 'planned',
  blockers jsonb NOT NULL DEFAULT '[]',
  planner_model text NOT NULL,
  planner_version text NOT NULL,
  donto_context text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX replication_units_paper_idx ON replication_units (paper_id);
CREATE INDEX replication_units_state_idx ON replication_units (state);
CREATE INDEX replication_units_domain_type_idx ON replication_units (domain, unit_type);
```

`simulation_jobs` from PRD-006 should later be generalized to
`replication_jobs`, but the first implementation can enqueue
replication units through the existing simulation job infrastructure.

## Implementation phases

### P0 — Design and import path

- Add Donto bundle import for Qwen tier-pass JSON.
- Persist extracted Donto statements into the existing claims table
  with source evidence and testability.
- Add `replication_units` table and TypeScript schema.
- Implement a deterministic `buildReplicationUnitsFromDonto()` that
  handles `ml:score`, `ml:benchmark`, `ml:outperforms`,
  `ml:evaluationSetting`, `ml:usesTechnique`, and `schema:citation`.

### P1 — Local planner

- Add local Qwen planner wrapper.
- Planner input: grounded Donto statements + paper metadata + extracted
  artifact hints.
- Planner output: `ReplicationUnit[]` JSON schema.
- Validate planner output deterministically: evidence present,
  falsification criteria non-empty, artifact blockers explicit.
- Store planner provenance and confidence in Donto.

### P2 — ML verifier plugins

- Implement `artifact-availability`, `metric-table-parser`, and
  `stat-sanity`.
- Add `small-proxy-repro` for carefully bounded ML experiments
  (default: tiny subset, max 1 GPU hour, no network except allowlisted
  artifact fetches).
- Add sandbox policies from PRD-003.

### P3 — Scale loop

- Paperclip/arXiv batch ingestion.
- Priority queue by testability, artifact availability, and compute
  cost.
- Cross-paper deduplication of identical benchmark claims.
- Nightly local-model extraction and planning.
- Human review queue for high-value blocked claims.

## Acceptance criteria

- A Donto tier-pass JSON file from the local Qwen extractor can be
  imported without calling OpenAI.
- A LoRA/adapters paper produces at least one `ReplicationUnit` for:
  artifact availability, baseline contrast, metric recomputation, and
  hyperparameter/detail completeness.
- Claims with missing code or dataset URLs produce `blocked` units with
  explicit proof obligations, not fake simulations.
- The planner can run fully offline after Paperclip text has been
  cached locally.
- The UI can show "replicable now", "blocked by missing artifact", and
  "needs human review" separately from verdicts.
- Every replication unit has Donto links back to source statements and
  evidence quotes.

## Open questions

- Should the replication planner live in `@toiletpaper/simulator` or a
  new `@toiletpaper/replication` package?
- How much of the Donto tier vocabulary should be mirrored in Postgres
  versus queried from dontosrv on demand?
- What is the default local model for planning once Qwen is too weak or
  too verbose for a domain?
- Should small-proxy ML reproductions be considered `fragile` by
  default unless they run full seeds/datasets?
- How do we cache large dataset/model artifacts across many papers
  without turning toiletpaper into an artifact mirror?
