# toiletpaper

**Upload papers. Extract claims. Build a Donto graph. Plan honest replications.**

toiletpaper is an adversarial scientific paper replication engine. It takes a research paper, extracts compact claims plus a dense Donto statement graph, compiles graph statements into replication units, and records whether each unit can be executed, is blocked on artifacts, or has produced a real signal verdict.

Every claim, replication unit, simulation result, and argument is tied back to [donto](https://github.com/thomasdavis/donto) — a bitemporal paraconsistent knowledge graph that tracks what we know, when we learned it, and how confident we are.

## What it does

```
Paper (PDF/Markdown)
  → Compact claim extraction with the configured LLM
  → Rich donto-agent extraction into hundreds/thousands of graph statements
  → Donto statements stored with spans, evidence links, confidence, and context
  → Non-metadata graph statements compiled into explicit replication units
  → Units routed by type: metric_recompute / baseline_contrast / dataset_integrity / artifact_availability / equation_check / statistical_significance / simulation / human_review
  → Runnable executors emit signal verdicts: reproduced / contradicted / fragile / inconclusive
  → Missing executors or missing artifacts emit meta verdicts: untested / not_applicable / vacuous / system_error
  → Results remain linked to source Donto statement IDs and replication unit IDs
```

## Results

Four papers have been processed:

| Paper | Claims | Reproduced | Contradicted | Fragile |
|-------|--------|------------|--------------|---------|
| Paper 0 — Algebra of Synchronization Failure | 111 | 45 | 32 | 13 |
| Paper I — Astrophysical Bivector Dynamics | 177 | 74 | 46 | 13 |
| KAN: Kolmogorov-Arnold Networks | 102 | 24 | 3 | 18 |
| MEMORA: Harmonic Memory Representation | 58 | 19 | 0 | 0 |

### Key findings

**KAN paper**: Grid scaling claim G^{-4} measured as G^{-1.5} (right direction, wrong magnitude). 100x accuracy claim contradicted (1.4x measured). Catastrophic forgetting claim reproduced — KAN forgets 3.2x vs MLP 171x. Depth advantage reproduced with proper training (was initially contradicted due to insufficient epochs).

**Physics papers**: Reconnection rate v_rec/v_A flattens to ~0.065 at high Lundquist number, independent of S — confirmed by our MHD solver with machine-precision energy conservation (0.000% drift).

**MEMORA paper**: 0 contradictions. Complexity formulas algebraically verified. RAG and KG proved to be special cases of MEMORA by construction.

## Architecture

```
apps/web/              Next.js 15 · React 19 · Tailwind v4 · App Router
packages/db/           Drizzle ORM — papers, claims, simulations (Postgres)
packages/extractor/    PDF parsing · compact LLM claims · GLM/donto-agent graph extraction · Donto ingest
packages/simulator/    Claim triage · graph replication planning · algebraic checks · MHD solver · scientific judge
packages/donto-client/ Typed wrappers for all 30+ dontosrv endpoints
packages/ui/           33-component design system (CVA + tailwind-merge)
```

### MHD Solver

Built from scratch in TypeScript:

- HLL Riemann solver for 8-wave ideal MHD
- Second-order TVD Runge-Kutta with minmod limiter
- Resistive diffusion source terms
- Coriolis + tidal forces for shearing box MRI
- Mean-field alpha-effect for 2D dynamo
- Validated on Orszag-Tang vortex: convergence order 2.29, energy conservation to machine precision

### Donto Integration

Every step of the pipeline writes to or reads from donto's evidence substrate:

- **Extraction**: document registration, paper metadata, text revision, agent binding, extraction run provenance
- **Claims**: typed quads with confidence overlay, span anchoring, shape validation
- **Graph planning**: Donto statements are read from the paper context and compiled into `replication_units`
- **Simulation**: graph-fed and Codex rows carry `source_statement_ids`, `replication_unit_id`, unit type/domain, blockers, verifier candidates, workdir, and result provenance
- **Lifecycle**: 11-stage maturity tracking from observation to formal verification

Graph-fed simulations are intentionally conservative. The planner treats the Donto graph as the paper substrate: after filtering bibliographic and internal provenance predicates, every remaining paper fact becomes a replication unit. Recognized predicates get specialized unit types; everything else is preserved as `human_review` so full-paper coverage is visible instead of silently dropped. A row with `untested` means the graph produced a concrete unit but no executor is registered yet. A row with `not_applicable` or `inconclusive` plus `insufficient` evidence means a faithful check is blocked by missing code, data, config, seeds, raw measurements, images, trajectories, or equivalent artifacts. These rows are displayed as "No Signal" or blocked readiness in the UI and are not counted as reproduced, contradicted, fragile, or tested.

## Pages

| Route | Description |
|-------|-------------|
| `/` | Dashboard — papers, claims, simulations, donto stats |
| `/papers` | Paper list with verdict summaries per paper |
| `/papers/:id` | Paper detail with sub-nav: Overview, Report, Annotated, Simulations |
| `/papers/:id/report` | Tabbed verdict report with whole-paper graph coverage and contradicted claims first |
| `/papers/:id/annotated` | Split-pane view: paper text with highlighted claims + margin verdict cards |
| `/papers/:id/simulations` | Filterable simulation results table |
| `/papers/:id/simulations/:simId` | Individual simulation detail with source code viewer |
| `/api/papers/:id/artifact-manifest` | Machine-readable missing artifact manifest for blocked replication units |
| `/api/papers/:id/artifact-bundles` | List or upload supplemental paper artifacts for future full-paper replication runs |
| `/api/papers/:id/artifact-bundles/:bundleId/files/:fileId` | Download a stored supplemental artifact by manifest bundle/file ID |
| `/api/papers/:id/replication-dossier` | Audit latest Codex full-paper job files, result coverage, and coverage-report consistency |
| `/api/papers/:id/replication-dossier/files/*path` | Download an existing Codex job dossier file listed by the latest dossier |
| `/upload` | Drag & drop PDF/Markdown upload with auto-extraction |
| `/styleguide` | Component reference with design tokens |

### Debug Mode

Toggle "Debug: ON" in the navbar to show raw JSON dumps of all data on every page — papers, claims, simulations, donto responses. Useful for inspecting the pipeline.

## Quick start

```bash
# Prerequisites: Docker, Node 22+, pnpm, Rust (for donto)
git clone https://github.com/thomasdavis/toiletpaper
cd toiletpaper

# Start databases and install
./scripts/setup.sh

# Start dontosrv (separate terminal, from the donto repo)
cd ../donto
DONTO_DSN=postgres://donto:donto@127.0.0.1:55433/donto \
DONTO_BIND=127.0.0.1:7879 \
cargo run -p dontosrv

# Start the web app
cp .env.example .env  # Add your OpenAI-compatible LLM key
pnpm dev              # http://localhost:3001
```

### Upload a paper

```bash
# Via the web UI
open http://localhost:3001/upload

# Via curl
curl -X POST http://localhost:3001/api/upload \
  -F "file=@paper.pdf;type=application/pdf"
```

### Run simulations

The upload route auto-extracts compact claims and runs rich Donto ingest. To run graph-fed replication planning and simulation materialization:

```bash
# Via the API. When Donto statements exist, this materializes graph
# replication rows quickly, then starts an async Codex full-paper job.
curl -X POST http://localhost:3001/api/simulate \
  -H 'content-type: application/json' \
  -d '{"paper_id":"<id>"}'
```

Enable both flags for simulation controls and API execution:

```bash
SIMULATION_GENERATION_ENABLED=1
NEXT_PUBLIC_SIMULATION_GENERATION_ENABLED=1
```

Rich Donto extraction uses the installed `donto-agent` after compact
claim extraction. For scientific papers the deployed defaults split the
paper into smaller overlapping windows and allow more gleaning passes:

```bash
DONTO_AGENT_BIN=/home/ajax/bin/donto-agent
DONTO_AGENT_PROVIDER=glm
DONTO_AGENT_MODEL=glm-4.7
DONTO_AGENT_KEY_FILE=/etc/donto/glm.key
DONTO_AGENT_CHUNK_CHARS=3500
DONTO_AGENT_CHUNK_OVERLAP_CHARS=700
DONTO_AGENT_MAX_PASSES=8
DONTO_AGENT_MAX_TOKENS=12000
DONTO_AGENT_LOG_DIR=/mnt/donto-data/toiletpaper/extractions
DONTO_AGENT_RETRY_ATTEMPTS=4
DONTO_AGENT_MIN_ANCHORED_RATIO=0.2
DONTO_AGENT_MIN_FACTS_PER_1K_CHARS=18
DONTO_INGEST_LAUNCHER=queue
```

Each rich extraction writes:

```bash
$DONTO_AGENT_LOG_DIR/<paper_id>/donto-agent-chunks.jsonl
$DONTO_AGENT_LOG_DIR/<paper_id>/donto-agent-summary.json
$DONTO_AGENT_LOG_DIR/<paper_id>/chunks/chunk-001.txt
```

The `chunks/` directory stores the exact text sent to `donto-agent`
for each pass. The JSONL events and summary include `chunkPath`, so a
sparse or suspicious extraction can be audited against the exact input
window instead of reconstructing it from the source PDF.

Successful process exit is not treated as sufficient proof that a
chunk is good. The wrapper scores every `donto-agent` chunk for provider
partial-output warnings, zero facts, fact density per 1,000 input
characters, and anchor ratio. Weak chunks are retried using the same
durable append-only log. If all attempts remain weak, the chunk is
accepted as `chunk_degraded` rather than hidden, because partial facts
may already have been inserted into Donto and should stay auditable.
The paper page shows repair/degraded counts in the Donto Agent panel,
and the summary records `qualityWarnings` plus `qualityRetryCount` per
chunk.

Paper text views also prefer this persisted chunk cache. When
`/api/papers/<paper_id>/text` or the annotated paper page can read
`$DONTO_AGENT_LOG_DIR/<paper_id>/chunks`, the service stitches the
overlapping windows back together and returns `source:
donto-agent-chunks`. It only falls back to parsing the source PDF when no
chunk cache exists. This makes ordinary viewing/debugging deterministic
and avoids re-running PDF extraction on every annotated-page request.

On the deployed instance, queued Donto ingest is owned by a separate
systemd worker:

```bash
sudo systemctl status toiletpaper-donto-ingest-worker.service
journalctl -u toiletpaper-donto-ingest-worker.service -f
```

This keeps long GLM/donto-agent extraction outside the web service
cgroup. The retry endpoint can still be forced to run synchronously with
`?sync=true` for debugging.

For full-paper replication, the deployed instance can use the local Codex
CLI authenticated with the ChatGPT subscription on the box. This is
separate from the GLM key used for extraction. A started job is tracked
in `simulation_jobs`, streams events through
`/api/papers/<id>/simulation-log?stream=1`, and writes files under:

```bash
$SIMULATOR_WORKDIR/codex-full-paper/<paper_id>/<job_id>/
```

The job directory contains:

- `paper-source.pdf` or `paper-source.md` — staged copy of the uploaded source.
- `paper-text.txt` — best-effort extracted text for Codex to inspect locally.
- `donto-statements.json` — the extracted whole-paper Donto graph for the paper context.
- `replication-units.json` — the full coverage worklist compiled from that graph.
- `supplemental-artifacts.json` — staged manifest of user-supplied datasets, scripts, input decks, images, trajectories, raw measurements, and configuration files.
- `supplemental-artifacts/<bundle_id>/files/...` — immutable copies of uploaded artifact bundle files for this job.
- `artifact-gap-manifest.json` — current missing artifact request groups inferred from blocked prior/current results.
- `artifact-gap-coverage.json` — candidate map from staged supplemental files to those request groups.
- `codex-events.jsonl` — raw `codex exec --json` event stream.
- `codex-stderr.log` — stderr and CLI warnings.
- `toiletpaper-job-events.jsonl` — Toiletpaper progress events.
- `progress.json` — Codex-updated current progress when available.
- `results.json` — final machine-ingestible full-paper results.
- `codex-command.json` — exact command/runtime metadata.
- `replication-dossier-snapshot.json` — frozen job-finish audit snapshot with file sizes, mtimes, hashes, generated artifacts, and result counts.

Codex is instructed to emit one `results.json` entry for every
replication unit and to write
`experiments/full_paper_replication/coverage_report.json`. If Codex
omits units, the worker records a partial job with missing-unit counts
instead of treating the run as complete.

Paper overview and report pages expose a Full Paper Replication Dossier
for the latest Codex job. `GET /api/papers/<id>/replication-dossier`
checks the job workdir for required inputs (`paper.json`,
`donto-statements.json`, `replication-units.json`, artifact manifests),
runtime trace files (`prompt.md`, `codex-command.json`,
`codex-events.jsonl`, `toiletpaper-job-events.jsonl`), and outputs
(`results.json`, `experiments/full_paper_replication/coverage_report.json`).
It parses result-unit IDs, verdict/evidence distributions, missing-unit
counts, and coverage-report consistency so operators can distinguish an
auditable full-paper run from a run that merely wrote database rows. The
same object is embedded on `/api/papers/<id>/full` as
`replicationDossier`. Files listed in the dossier are inspectable through
`/api/papers/<id>/replication-dossier/files/<relative_path>`, which only
serves paths already present in the latest dossier's core/generated file
lists, including Codex-generated `src/` code and `experiments/` outputs.
The dossier records SHA-256 hashes for files up to
`CODEX_DOSSIER_HASH_MAX_BYTES` (64 MiB by default), and file downloads
return `x-dossier-sha256` when a hash was computed. New Codex jobs also
write `replication-dossier-snapshot.json` into the workdir at job finish;
future `auditable` status requires that frozen snapshot as an output.

The log API also supports bounded polling for UI and operator tools:

```bash
# Latest events first, suitable for opening an active job view.
curl '/api/papers/<id>/simulation-log?tail=1&limit=200'

# Page backward from a known event sequence.
curl '/api/papers/<id>/simulation-log?before=<seq>&limit=200'
```

The paper processing panel reads the latest `simulation_jobs` row and
shows the durable Codex job state, total units, completed units, failed
units, and start time. This is separate from transient SSE connection
state; a browser refresh can recover the current job position.

Paper views and paper APIs use a current-simulation read model: if a
paper has a latest Codex full-paper job, the UI shows that job's
simulation rows. Historical rows from older jobs remain in Postgres for
audit/debugging but do not inflate current verdict counts. During an
active job, deterministic graph rows can fill gaps until Codex writes
replacement results for those replication units.

Paper overview and report pages show a Whole Paper Coverage panel. It
uses persisted `replication_units` as the authority, joins current
simulation rows by `replication_unit_id`, and reports Donto statements,
source statements represented in the worklist, covered units, missing
unit results, verdict distribution, evidence modes, and unit type counts.
The same summary is exposed as `wholePaperCoverage` on
`/api/papers/<id>/full`.

Paper overview, report, and simulation pages also show a Replication
Readiness panel. The same summary is exposed as `replicationReadiness`
on `/api/papers/<id>/full` and `/api/papers/<id>/simulations`. It counts
current simulation rows that are blocked by missing artifacts,
prerequisites, or `inconclusive` results with `insufficient` evidence,
groups the missing artifact kinds, and records the top blockers needed
for faithful recomputation. When older rows did not store structured
readiness arrays, the summarizer conservatively derives labels such as
experiment artifacts, code, model card, data, and artifact URL from the
simulation reason text.

Paper overview and report pages also show a Missing Artifact Manifest.
This is exposed as JSON at `/api/papers/<id>/artifact-manifest` and as
`artifactManifest` on `/api/papers/<id>/full`. It groups blocked current
results into concrete requests such as molecular-dynamics input decks,
interatomic potential files, atomistic structures, trajectories,
microscopy images, raw measurements, fitting scripts, clean equation
source, Monte Carlo code, datasets, configs, seeds, and artifact URLs.
Generic boilerplate limitations are filtered out so counts reflect
specific missing inputs named by the result reason, limitation text, or
replication-unit blockers.

Paper overview and report pages also include a Supplemental Artifacts
panel. `GET /api/papers/<id>/artifact-bundles` returns the current
bundle manifest, and `POST /api/papers/<id>/artifact-bundles` accepts
`multipart/form-data` with one or more `files`, one or more public HTTP(S)
artifact `url` values, and an optional `note`. URL imports reject
credentials, non-HTTP schemes, and localhost/private-network addresses.
Bundles are stored under `$PAPER_ARTIFACTS_DIR/<paper_id>/` or, by
default, `$SIMULATOR_WORKDIR/paper-artifacts/<paper_id>/`. Every stored
file records original name, sanitized stored name, byte length,
content type, SHA-256 hash, and source provenance (`upload` or `url`
with final redirected URL/status when fetched). Each manifest entry is
also addressable at
`/api/papers/<id>/artifact-bundles/<bundle_id>/files/<file_id>`, which
streams only files listed in the manifest and returns audit headers such
as `x-artifact-sha256`, bundle/file IDs, source kind, content type, and
content length. The next Codex full-paper run stages those bundles into
`supplemental-artifacts/` and writes `supplemental-artifacts.json`, so
Codex must inspect supplied files before marking a unit blocked for
missing data/code/configuration. The same manifest is exposed on
`/api/papers/<id>/full` as `artifactBundles`, and
`/api/papers/<id>/artifact-manifest` includes it next to the
missing-artifact request list.

The missing-artifact APIs also expose `artifactGapCoverage`, a
candidate map from uploaded/imported files back to Missing Artifact
Manifest request kinds. The map uses filenames, content types, bundle
notes, and URL provenance to show likely coverage such as LAMMPS input
decks, AIREBO/EAM potential files, trajectories, raw measurements,
image data, source code, configs, and artifact URLs. This is not treated
as proof of resolution: it only tells operators and Codex which files to
inspect first on the next full-paper run.

The Evidence Graph tab exposes Donto substrate coverage for each paper:
total active graph statements, statements linked to production runs,
statements anchored to source spans, confidence-overlay coverage, link
type counts, and recent extraction/simulation runs. The same coverage object is
returned from `/api/papers/<id>/donto?section=evidence` and
`/api/papers/<id>/full` under `donto.coverage`, so downstream operators
can distinguish "many facts exist" from "many facts are fully anchored
and confidence-rated."

Paper metadata triples are provenance-bearing graph statements too. New
ingests link document type, title, abstract/description, and author
triples to the same completed extraction run as claim and rich-agent
statements. Existing paper contexts can be checked and repaired
additively with:

```bash
DONTO_DSN=<donto-postgres-url> pnpm exec tsx scripts/backfill-donto-metadata-provenance.ts --dry-run
DONTO_DSN=<donto-postgres-url> pnpm exec tsx scripts/backfill-donto-metadata-provenance.ts
```

The backfill only adds missing `produced_by` links for active paper-level
metadata statements when a completed extraction run already exists. It
does not rewrite statements or fabricate extraction evidence.

Simulation verdict and reason statements are also first-class Donto
facts. Codex full-paper ingestion asserts `tp:simulationVerdict` and
`tp:verdictReason`, links them to a Donto production run keyed by the
Codex job id, records the simulation row id and replication unit id in
the evidence-link metadata, and attaches confidence/argument overlays
where available. Existing rows can be checked and repaired with:

```bash
DONTO_DSN=<donto-postgres-url> DATABASE_URL=<toiletpaper-postgres-url> pnpm exec tsx scripts/backfill-donto-simulation-provenance.ts --dry-run
DONTO_DSN=<donto-postgres-url> DATABASE_URL=<toiletpaper-postgres-url> pnpm exec tsx scripts/backfill-donto-simulation-provenance.ts
```

That script is additive. It asserts missing current Codex verdict/reason
facts and links old orphaned simulation verdict/reason statements to a
legacy simulation-ingest production run instead of misattributing them
to extraction.

Codex result rows can be backfilled with the persisted replication-unit
context used by reports:

```bash
DATABASE_URL=<toiletpaper-postgres-url> pnpm exec tsx scripts/backfill-codex-unit-metadata.ts --dry-run
DATABASE_URL=<toiletpaper-postgres-url> pnpm exec tsx scripts/backfill-codex-unit-metadata.ts
```

On the production instance, the 2026-06-18 backfill updated 1,181
historical Codex full-paper rows; a follow-up dry run reported zero
rows missing `metadata.unit_type` or `result.unitType`.

Lifecycle progress in that tab is evidence-based, not a raw statement
threshold. `/api/papers/<id>/lifecycle` now reports complete, partial,
pending, or blocked stages from Donto run provenance, span links, shape
validation annotations, confidence overlays, certificates, proof
obligations, and the current full-paper simulation job.

Simulation detail pages expose declared text/code Codex artifacts from
each result row. The source endpoint accepts only safe relative paths
listed in `result.artifacts` or legacy `metadata.simulation_file`, and
only for text-like extensions, so generated harness files such as
`src/replication_core.py` are inspectable without opening arbitrary or
binary files from the workdir.

Codex ingestion also attaches common job-level artifacts when present,
including `coverage_report.json`, `replication_summary.md`,
`artifact_manifest.json`, and the shared replication runner/core files.
These are visible from current simulation detail pages and remain tied
to the specific Codex job that generated them.

Codex full-paper jobs are intentionally long-running. Configure:

```bash
CODEX_SIMULATION_ENABLED=1
CODEX_JOB_LAUNCHER=queue
CODEX_FULL_PAPER_TIMEOUT_MS=7200000
CODEX_SIMULATION_SANDBOX=danger-full-access
CODEX_HOME=/home/ajax/.codex
CODEX_DONTO_STATEMENT_LIMIT=50000
```

Full-paper jobs do not use `codex exec --ephemeral`, so Codex also
retains its normal session/log inventory under `~/.codex`.

On the deployed instance, queued jobs are owned by a separate systemd
worker:

```bash
sudo systemctl status toiletpaper-codex-worker.service
journalctl -u toiletpaper-codex-worker.service -f
```

The web service should run with `CODEX_JOB_LAUNCHER=queue`; that keeps
hour-scale Codex jobs outside the web service cgroup, so deploying or
restarting Next.js does not kill active replication work. If a worker is
interrupted after Codex wrote `results.json`, recover the database rows
with:

```bash
pnpm exec tsx scripts/ingest-codex-results.ts --job-id <job_id>
```

The legacy Claude Code workflow is still available for hand-built simulations:

```bash
# Via Claude Code (builds simulations from scratch)
npx tsx scripts/prep-simulation.ts <paper_id>
cd .simulations/<paper_id>
claude  # "Read spec.md and simulate every testable claim"
npx tsx scripts/ingest-results.ts <paper_id>
```

### Smoke test

The smoke script can verify an existing paper, wait for Donto ingest, and run the graph-fed simulation path:

```bash
PAPER_ID=<paper_id> RUN_SIMULATION=1 pnpm smoke:upload
```

Current deployed-instance checks:

| Paper | Donto statements | Replication units | Codex result |
|-------|------------------|-------------------|--------------|
| Perch 2.0 transfers whale to underwater tasks | 2,637 | 401 | 141 reproduced, 10 fragile, 2 contradicted, 248 blocked/inconclusive, 0 failed |
| The phonology of sperm whale coda vowels | 1,345 | 125 | 49 not applicable, 76 untested |
| Graphene-reinforced aluminum thermal conductivity fixture | 719 | 286 | 191 reproduced, 8 fragile, 2 contradicted, 85 blocked/inconclusive, 0 failed |

For the Perch 2.0 whale paper, the latest full-paper Codex job staged
the original PDF plus extracted text, parsed the manuscript tables,
probed the Hoplite GitHub artifact, generated a Python replication
harness, and ingested all 401 unit records into Postgres. The 248
blocked units are mainly honest AUC/performance recomputations that
need raw audio, labels/splits, seeds, embeddings/checkpoints, and exact
evaluation configs before they can be marked reproduced.

As of 2026-06-18, future rich extractions also run through the explicit
quality gate described above. The GLM stream-drop issue seen in one
historic whale-paper chunk would now trigger repair attempts and appear
in the UI as a repaired or degraded chunk instead of being silently
accepted as a normal success.

The graphene/aluminum smoke paper was uploaded on 2026-06-18 after the
quality gate and whole-paper planner changes. It produced 559 rich
donto-agent facts across three chunks, 719 final Donto statements, 286
replication units, and Codex job
`ca7d8dd6-22e7-4174-8a6a-88b7494a76e7`. That job staged
`donto-statements.json`, emitted one result per unit with no missing
IDs, and added 572 Donto simulation-provenance statements plus 386
evidence links.

## Databases

| Service | Port | Purpose |
|---------|------|---------|
| Postgres | 5434 | Papers, claims, simulation results |
| Donto Postgres | 55433 | Knowledge graph quad store |
| dontosrv | 7879 | Donto HTTP sidecar (Rust + optional Lean 4 engine) |

### Donto lifecycle

Each paper context progresses through 11 evidence-backed stages:

```
ingested → produced → asserted → evidence_linked →
validated → simulated → verdict_issued → argued →
confidence_set → certified → obligations_clear
```

The Perch 2.0 whale paper currently reports 6 complete stages, 4 partial
stages, and 1 blocked stage. Production provenance is complete: 2,637 of
2,637 active statements are linked to extraction or simulation production
runs. The partial stages are intentional truthfulness signals: 1,374 of
2,637 statements are span anchored, 173 have shape validation
annotations, 438 have confidence overlays, and 16 have verified
certificates. The blocked stage is 7 open proof obligations.

The sperm-whale paper's 16 legacy simulation verdict/reason statements
are now linked to a legacy simulation-ingest production run, so it has
1,345 of 1,345 active statements with `produced_by` provenance. The next
Donto lifecycle repair is deeper artifact-level simulation provenance:
hashes, environment manifests, dataset/license checks, and generated
harness traces for every executable result.

## Design system

33 components with an academic scientific aesthetic:

- **Typography**: Serif headings (Georgia), monospace data, sans-serif body
- **Colors**: Paper whites (#FAFAF8), charcoal ink (#1A1A1A), slate blues (#4A6FA5), forest greens (#2D6A4F), brick reds (#9B2226), ochre ambers (#B07D2B)
- **Verdict colors**: Green (reproduced), red (contradicted/system error), amber (fragile/inconclusive), gray (untested/not applicable/vacuous)
- **Help tooltips**: "?" icons throughout explaining technical concepts

View the styleguide at `/styleguide`.

## Three-reviewer audit

The KAN paper results were audited by three independent agents:

- **Hostile Reviewer** (senior ML professor): Found threshold gerrymandering, wrong test functions, single-seed non-reproducibility
- **Paper Author** (simulated Ziming Liu): Pointed out unfair tests — PDE-specific claims tested on function fitting, missing grid extension with coefficient transfer
- **Systems Auditor**: Found critical claim-index mapping bug (results attributed to wrong claims), verdict information loss ("fragile" collapsed to "inconclusive")

All findings were fixed. The claim mapping now uses text matching, fragile verdicts are preserved, conflicting verdicts show warnings.

## Project stats

| Metric | Value |
|--------|-------|
| TypeScript files | 112 |
| Lines of code | 14,485 |
| UI components | 33 |
| API routes | 13 |
| Pages | 8 |
| MHD solver lines | 1,343 |
| Papers processed | 4 |
| Total claims tested | 448 |
| Integration test lines | 650 |

## Tech stack

Next.js 15 · React 19 · Tailwind CSS v4 · Drizzle ORM · PostgreSQL 16 · GLM/OpenAI-compatible LLM APIs · donto (bitemporal quad store) · Turborepo · pnpm · Vitest · TypeScript 5.7

## License

MIT
