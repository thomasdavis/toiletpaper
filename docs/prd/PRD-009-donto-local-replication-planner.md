# PRD-009 · Donto-Native Local Replication Planner

| | |
|---|---|
| Status | Partially implemented |
| Created | 2026-05-03 |
| Updated | 2026-06-18 |
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

Implemented through 2026-06-13:

- `packages/extractor/src/donto-agent.ts` runs GLM-backed `donto-agent`
  extraction after compact claim extraction, with retry/backoff,
  denser overlapping scientific-paper chunks, and per-paper JSONL
  extraction logs.
- `apps/web/src/lib/donto-statements.ts` reads current paper-context
  statements directly from `DONTO_DSN`.
- `apps/web/src/lib/graph-replication.ts` builds replication plans from
  Donto statements, persists `replication_units`, materializes
  graph-derived `claims`, and writes graph-fed simulation rows with
  deterministic replication-agent verdicts.
- `packages/simulator/src/agents.ts` builds a digital-physics world
  model for each replication unit and runs registered deterministic
  agents for artifact availability, dataset integrity, numeric
  constraint checks, metric recomputation readiness, baseline contrast,
  and statistical feasibility.
- `packages/simulator/src/replication.ts` maps real Donto-agent
  predicates into replication unit types such as `metric_recompute`,
  `baseline_contrast`, `dataset_integrity`, `artifact_availability`,
  `equation_check`, `statistical_significance`, and `simulation`.
  Since 2026-06-18, it also preserves every non-bibliographic,
  non-provenance Donto statement as a replication unit. Statements that
  do not match a specialized deterministic verifier become
  `human_review` units with an explicit blocker instead of being
  dropped from paper coverage.
- `POST /api/papers/{id}/replication` now scans the Donto graph and
  persists units.
- `POST /api/simulate` prefers graph-fed simulation when Donto
  statements exist, starts an async Codex full-paper replication job
  when enabled, and falls back to the compact claim simulator only when
  the graph path is unavailable.
- `scripts/run-codex-replication-job.ts` runs hour-scale full-paper
  Codex replication outside the request path. It streams Codex JSON
  events to `simulation_logs`, writes `codex-events.jsonl`,
  `codex-stderr.log`, `toiletpaper-job-events.jsonl`, `progress.json`,
  `paper-source.pdf`, `paper-text.txt`, `donto-statements.json`,
  `replication-units.json`, and `results.json` under
  `$SIMULATOR_WORKDIR/codex-full-paper/{paper_id}/{job_id}`, and runs
  Codex non-ephemerally so `~/.codex` retains its normal session/log
  state. The runner stages the whole current Donto paper context for
  Codex and records partial jobs when `results.json` omits replication
  units.
- `CODEX_JOB_LAUNCHER=queue` plus
  `toiletpaper-codex-worker.service` moves hour-scale Codex processes
  into a separate systemd service. The web API enqueues
  `simulation_jobs`; the worker leases queued rows and runs
  `scripts/run-codex-replication-job.ts`, so web deploys do not kill
  active replications.
- `scripts/ingest-codex-results.ts` recovers completed workdirs that
  already contain `results.json` if a worker was interrupted before
  database finalization.
- `GET /api/papers/{id}/simulation-log` supports live SSE plus
  bounded `tail`, `before`, and `limit` polling. The paper page opens
  on the latest events, can page backward through long Codex sessions,
  and no longer has to replay the entire event stream from seq 1.
- `/papers/{id}` reads the latest `simulation_jobs` row and surfaces a
  durable Codex job summary in the processing panel: queued/running/
  succeeded state, total units, completed units, failed units, and
  start time.
- Paper pages and paper APIs use `currentSimulations(...)` as the
  default read model. The latest Codex full-paper job supersedes older
  Codex rows and deterministic graph placeholders for matching
  replication units, while historical rows remain in Postgres for audit
  and recovery.
- Paper overview/report pages and `/api/papers/{id}/full` expose
  `wholePaperCoverage`, a unit-based summary keyed by persisted
  `replication_units` rather than compact claim rows. It reports Donto
  statement count, source statements represented in units, covered units,
  missing unit results, unit type distribution, verdicts, evidence modes,
  and latest Codex job state.
- Replication readiness treats `inconclusive` results with
  `insufficient` evidence as blocked. This keeps missing raw data,
  images, trajectories, code, configs, and other faithful-replication
  artifacts visible instead of undercounting them as merely neutral
  current results.
- Paper overview/report pages and APIs expose a Missing Artifact
  Manifest. `/api/papers/{id}/artifact-manifest` returns the
  machine-readable manifest, and `/api/papers/{id}/full` embeds it as
  `artifactManifest`. The manifest groups blocked current results into
  concrete artifact requests such as MD input decks, potential files,
  atomistic structures, trajectories, microscopy images, raw
  measurements, fitting artifacts, clean source, Monte Carlo code,
  datasets, configs, seeds, and artifact URLs. Generic boilerplate
  limitations are filtered before counting request kinds.
- Supplemental artifact bundles now let operators respond to that
  manifest without leaving the paper. `GET /api/papers/{id}/artifact-bundles`
  lists uploaded source bundles, and `POST` accepts multipart files,
  public HTTP(S) artifact URLs, and an optional note. URL imports reject
  credentials, non-HTTP schemes, and localhost/private-network
  addresses. Files are stored under
  `$PAPER_ARTIFACTS_DIR/{paper_id}/` or
  `$SIMULATOR_WORKDIR/paper-artifacts/{paper_id}/` with original names,
  sanitized names, byte lengths, content types, source provenance, final
  fetched URLs/status, and SHA-256 hashes. Each stored file is
  retrievable by manifest ID at
  `/api/papers/{id}/artifact-bundles/{bundleId}/files/{fileId}`, with
  response headers carrying bundle/file IDs, source kind, content type,
  content length, and SHA-256. Each Codex full-paper job stages the
  bundles into
  `supplemental-artifacts/`, writes `supplemental-artifacts.json`, and
  instructs Codex to inspect those files before marking units blocked
  for missing datasets, code, input decks, trajectories, images,
  measurements, or configuration.
- Missing-artifact APIs now include `artifactGapCoverage`, a candidate
  map from stored artifact files back to request kinds. It uses file
  names, content types, bundle notes, URL provenance, and common
  scientific extensions to identify likely matches. Candidate coverage
  is deliberately not a verdict; it only prioritizes files for Codex or
  human inspection on the next replication run.
- `/api/papers/{id}/replication-dossier` and the paper overview/report
  pages now audit the latest Codex full-paper workdir. The dossier checks
  required input manifests, runtime traces, `results.json`,
  `coverage_report.json`, generated experiment artifacts, result-unit
  coverage, and coverage-report/result consistency, so a full-paper job
  is visible as an operational artifact trail rather than only a set of
  database verdict rows. `/api/papers/{id}/full` embeds the same object
  as `replicationDossier`; files already listed by the latest dossier
  are downloadable at
  `/api/papers/{id}/replication-dossier/files/{relativePath}`, including
  generated `src/` code and `experiments/` outputs. The dossier records
  SHA-256 hashes for files up to the configured hash-size cap, and file
  downloads return the hash when it was computed. New Codex jobs also
  write `replication-dossier-snapshot.json` at job finish; future
  `auditable` status requires that frozen snapshot as an output.
- UI verdict summaries separate signal verdicts from meta verdicts so
  `untested` and `not_applicable` graph rows appear as "No Signal" and
  do not inflate tested/reproduced/contradicted counts.

Validation snapshot, 2026-06-13:

- Paper: `c75b96b4-5c8e-4a8f-bf4c-2af6ba7423d9`, "Perch 2.0
  transfers whale to underwater tasks".
- Rich Donto ingest: 2,354 live statements in
  `tp:paper:{id}:claims`, generated from 9 GLM/donto-agent chunks
  with 1,339 rich facts, 816 anchored facts, and 2,315 evidence links.
- Graph planner: 401 replication units from the Donto context
  (`artifact_availability` 74, `baseline_contrast` 64,
  `dataset_integrity` 59, `equation_check` 68,
  `metric_recompute` 97, `statistical_significance` 39).
- Codex full-paper job `743af9ad-b97b-4ffd-bfef-ff306d5d15c8`
  staged the source PDF/text, generated a Python replication harness,
  parsed Table 1 and Table 2, probed the Hoplite GitHub artifact, and
  ingested 401 unit results with zero system failures.
- Final job verdicts: 141 reproduced, 10 fragile, 2 contradicted, 248
  inconclusive/blocked. The blocked units are primarily honest metric
  recomputation/performance-comparison claims requiring raw audio,
  labels/splits, seeds, embeddings/checkpoints, and exact configs.

Validation snapshot, 2026-06-17:

- The Perch 2.0 whale paper lifecycle is now evidence-based end to end:
  6 of 11 stages complete, 4 partial, and 1 blocked.
- Production-run provenance is complete for that paper:
  2,637/2,637 active statements are linked to extraction or simulation
  production runs after the metadata and simulation provenance
  backfills.
- Latest Codex result rows now have Donto `tp:simulationVerdict` and
  `tp:verdictReason` statements linked to a production run keyed by job
  `743af9ad-b97b-4ffd-bfef-ff306d5d15c8`, with evidence metadata
  pointing back to simulation rows, replication units, artifacts, and
  the workdir.
- Partial stages remain honest readiness signals rather than failures:
  1,374/2,637 statements are span anchored, 173/2,637 have shape
  validation annotations, 438/2,637 have confidence overlays, and
  16/2,637 have verified certificates.
- The next planner/provenance gap is artifact-level simulation
  provenance: hashes, environment manifests, dataset/license checks, and
  execution traces for every executable result.

Validation snapshot, 2026-06-18:

- Fresh upload smoke paper:
  `f1971dfa-b8e3-45e3-8027-cdb872099b9c`, a graphene/aluminum
  composite fixture PDF.
- Rich Donto ingest completed from 3 GLM/donto-agent chunks with 559
  rich facts, 386 anchored facts, zero skipped facts, and no quality
  warnings or retries.
- Final app ingest counters for that paper: 19 compact claims, 719
  Donto statements, 402 spans, and 1,121 evidence links.
- The planner now treats these statements as the paper substrate for
  replication coverage. Specialized predicates become executable/static
  units; unsupported scientific facts remain visible as blocked
  `human_review` units instead of disappearing from the worklist.
- Graph planner output for the smoke paper: 711 statements scanned and
  286 replication units created (`human_review` 146, `metric_recompute`
  50, `simulation` 39, `artifact_availability` 22, `equation_check`
  14, `baseline_contrast` 12, `dataset_integrity` 2,
  `statistical_significance` 1).
- Codex full-paper job `ca7d8dd6-22e7-4174-8a6a-88b7494a76e7`
  consumed `donto-statements.json`, `replication-units.json`, the
  staged source PDF/text, and deterministic executions. It emitted
  `results.json`, `progress.json`, `src/full_paper_replication.mjs`,
  `coverage_report.json`, `extracted_facts.json`, and
  `consistency_checks.json`.
- Final Codex smoke result: 286/286 unique unit results, zero missing
  units, zero system failures, 191 reproduced, 8 fragile, 2
  contradicted, and 85 inconclusive/blocked. The job row is succeeded;
  the Codex result status remains `partial` because real replication
  blockers remain for MD inputs, LAMMPS potential files, HRTEM images,
  EMA fitting code/equations, Monte Carlo implementation details, and
  fabrication/measurement batch records.
- Donto simulation provenance for that smoke job added 572 Donto
  verdict/reason statements and 386 evidence links keyed to the Codex
  job, simulation rows, and replication units.

Missing:

- External Donto bundle import path separate from live `DONTO_DSN`.
- Multi-worker prioritization, cancellation, retry policy, and
  resource-aware scheduling beyond the current single systemd worker.
- Deeper ML/CS verifier plugins that can fetch artifacts, build
  environments, and execute released code under policy.
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
