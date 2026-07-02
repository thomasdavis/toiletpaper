# PRD-005 · Donto Integration Reliability and Postgres Mirror

| | |
|---|---|
| Status | Partially implemented |
| Created | 2026-05-02 |
| Updated | 2026-06-13 |
| Owner | toiletpaper engine |
| Related | PRD-004, PRD-006, PRD-008 |

## Problem

For the Tuṣāra upload, **0 of 90 claims** ended up in Donto.
Cloud Run logs show:

```
Donto ingestion failed (continuing without):
  dontosrv /agents/bind: 422 unknown
```

The `ingestPaperIntoDonto` step in the upload route catches all
errors and continues, leaving the paper "successfully uploaded" with
zero quad coverage. Symptoms:

- The homepage *advertises* "every claim is a graph", but the paper's
  graph is empty.
- The /papers/[id] detail page silently omits the Donto context info
  card; the user has no way to know that Donto failed for this paper.
- The structured fields (`category`, `value`, `unit`, `predicate`,
  `evidence`) live only in Donto today, so a Donto failure means the
  pipeline loses information that other steps depend on.
- The `dontosrv-/agents/bind 422` is a real bug but it doesn't get
  triaged because the route swallows it.

There is also no per-paper Donto health badge, no dashboard alert
when ingest fails for >0% of new uploads, and no replay mechanism for
papers whose ingest failed.

## Goals

1. A Donto outage is loud — operators see it within minutes, users
   see it on the paper detail page within seconds.
2. Donto ingest failures are recoverable — there is a single command
   to re-ingest a paper whose initial ingest failed.
3. Toiletpaper's verdict pipeline does not depend on Donto being up.
   Structured claim fields live in Postgres too (PRD-004); Donto adds
   bitemporal/argument/lineage features on top.
4. The `/agents/bind 422` is fixed and a regression test guards
   against its return.

## Non-goals

- Reimplementing Donto. We pull from upstream `thomasdavis/donto` and
  treat it as a managed dependency.
- A two-way Donto↔Postgres sync. Postgres is the operational store;
  Donto is the audit graph. Writes go to both at upload/simulate time;
  Donto is never written-back to Postgres.

## Background / current state

Implementation note, 2026-06-13:

- `paper_donto_ingest` is now surfaced on paper pages through a Donto
  status pill with state, attempts, statement count, span count, and
  evidence-link count.
- Upload writes compact claim data to Postgres and then attempts rich
  Donto-agent ingest. If compact claim extraction hits rate limits, the
  upload path can still continue into Donto-agent extraction and later
  materialize graph-derived claims.
- `POST /api/papers/{id}/donto/reingest` exists for retrying a paper's
  Donto ingest. It now mirrors the upload fallback: compact claim
  extraction failure no longer prevents forced rich Donto-agent reingest.
- Rich Donto-agent extraction writes per-paper JSONL and summary files
  under `$DONTO_AGENT_LOG_DIR/<paper_id>/`, so sparse or failed
  extraction is inspectable chunk-by-chunk instead of hidden in service
  logs.
- `GET /api/papers/{id}/donto/extraction-log` exposes the per-paper
  Donto-agent summary and JSONL events to the web UI. The paper detail
  page polls this endpoint during queued/running ingest so operators can
  see chunk starts, chunk successes, fact counts, anchoring counts,
  provider/model, elapsed time, and captured stdout/stderr tails.
- Rich extraction now also persists exact chunk input files under
  `$DONTO_AGENT_LOG_DIR/<paper_id>/chunks/`, and `chunkPath` is recorded
  in events and summaries. This makes sparse extraction and table/figure
  misses auditable against the exact text window passed to the agent.
- Rich extraction now quality-gates chunk output. A successful
  `donto-agent` exit can still be treated as repairable if stderr shows
  provider stream drops/partial output, no facts were ingested, fact
  density is too low, or anchor coverage is implausibly weak. The JSONL
  log records `chunk_quality_retry`, `chunk_degraded`, and
  `chunk_degraded_after_retry_error` events; the UI displays repair and
  degraded counts.
- `DONTO_INGEST_LAUNCHER=queue` plus
  `toiletpaper-donto-ingest-worker.service` moves long GLM/donto-agent
  extraction into a separate systemd service. Uploads and reingests can
  enqueue `paper_donto_ingest` rows, so web deploys do not kill active
  extraction work.
- The simulation path now reads the paper's Donto context directly
  from `DONTO_DSN` and compiles current statements into replication
  units, so graph health is visible in both Donto counts and graph-fed
  simulation rows.

Validation snapshot, 2026-06-13:

- Forced rich reingest for paper
  `c75b96b4-5c8e-4a8f-bf4c-2af6ba7423d9` succeeded after 9
  GLM/donto-agent chunks.
- `paper_donto_ingest` recorded `statement_count=1503`,
  `span_count=821`, and `evidence_link_count=2315`.
- The live Donto context held 2,354 statements after reingest,
  including compact claims plus rich Donto-agent statements.
- The extraction summary recorded 1,339 rich facts, 816 anchored facts,
  0 skipped facts, 8 max passes, 12,000 max output tokens, 3,500-char
  chunks, and 700-char overlap.
- Non-fatal GLM stream-drop warnings were captured in JSONL chunk
  events and accepted as partial-provider output; no chunk failed.

Validation snapshot, 2026-06-18:

- The 2026-06-13 behavior above is no longer accepted as ordinary
  success for future ingests. The donto-agent wrapper now retries
  partial/sparse/low-anchor chunks and records per-chunk
  `qualityWarnings` plus `qualityRetryCount`.
- Focused extractor tests cover dense acceptable output, partial GLM
  stream output with weak anchoring, and zero-statement sparse output.

Validation snapshot, 2026-06-17:

- Future ingests now assert paper metadata triples individually and link
  document type, title, description, and author statements to the
  completed extraction run before linking claim/rich-agent statements.
- `scripts/backfill-donto-metadata-provenance.ts` repaired existing
  paper metadata provenance additively, adding 34 missing `produced_by`
  links across five paper contexts without rewriting statements.
- Codex full-paper ingestion now asserts Donto simulation verdict/reason
  statements and links them to a Donto production run keyed by the Codex
  job id, with evidence metadata for simulation row id, replication unit
  id, source statement ids, artifacts, workdir, and result status.
- Codex full-paper job staging now includes `donto-statements.json`, the
  full current Donto paper context, alongside `replication-units.json`.
  The worker expects one result entry per replication unit and records
  partial jobs with missing-unit counts when `results.json` is
  incomplete, so whole-paper replication gaps remain visible.
- Codex full-paper rows now preserve unit context in both `result` and
  `metadata`: claim IRI, source statement IDs/count, domain, unit type,
  workdir, job id, and replication unit id. Recovery ingestion writes the
  same metadata so recovered jobs remain auditable.
- `scripts/backfill-codex-unit-metadata.ts` repairs historical Codex
  rows from persisted `replication_units`. The production instance was
  backfilled on 2026-06-18: 1,181 historical rows were updated and a
  follow-up dry run reported zero rows missing `metadata.unit_type` or
  `result.unitType`.
- Paper APIs now expose `wholePaperCoverage` and stricter
  `replicationReadiness`. Readiness treats `inconclusive` rows with
  `insufficient` evidence as blocked, so reports do not understate the
  missing artifacts required for faithful replication.
- Paper APIs now also expose a Missing Artifact Manifest. The dedicated
  route is `/api/papers/{id}/artifact-manifest`, and the all-in-one route
  embeds it as `artifactManifest`. It derives artifact requests from
  current simulation reasons, limitations, Donto-backed replication-unit
  blockers, and required artifacts while filtering generic boilerplate
  limitations.
- Paper APIs now expose supplemental artifact bundles as the operational
  answer to those requests. `/api/papers/{id}/artifact-bundles` stores
  immutable uploaded or URL-imported files with notes, source
  provenance, final fetched URLs/status, and SHA-256 hashes. Individual
  manifest entries are downloadable through
  `/api/papers/{id}/artifact-bundles/{bundleId}/files/{fileId}` with
  manifest IDs, source kind, content type, content length, and SHA-256
  headers for audit trails.
  `/api/papers/{id}/full` embeds the bundle manifest as
  `artifactBundles`, and the missing artifact manifest endpoint includes
  the same bundle state alongside unresolved requests. Codex full-paper
  jobs stage every uploaded/imported bundle into `supplemental-artifacts/`
  and record `supplemental-artifacts.json` so simulation provenance can
  identify which source datasets, scripts, measurements, images,
  trajectories, input decks, and configs were available for a run.
- Paper APIs now also expose `artifactGapCoverage`, a candidate map from
  stored artifacts to unresolved Missing Artifact Manifest request
  kinds. It is intentionally a triage signal, not a proof signal: a
  blocker remains until a subsequent run uses the candidate artifact and
  records a concrete result.
- Paper APIs now expose the latest Codex full-paper job dossier at
  `/api/papers/{id}/replication-dossier`. The dossier verifies required
  workdir files, parses `results.json`, checks
  `experiments/full_paper_replication/coverage_report.json`, summarizes
  verdict/evidence distributions, counts missing result units, and marks
  whether the run is auditable, running, incomplete, or missing its
  workdir. `/api/papers/{id}/full` embeds the same object as
  `replicationDossier`. Existing files listed by the latest dossier are
  downloadable through
  `/api/papers/{id}/replication-dossier/files/{relativePath}`, including
  generated `src/` code and `experiments/` outputs. The dossier records
  SHA-256 hashes for files up to the configured hash-size cap, and file
  downloads return the hash when it was computed. New Codex jobs also
  write `replication-dossier-snapshot.json` at job finish; future
  `auditable` status requires that frozen snapshot as an output.
- The 2026-06-18 graphene/aluminum smoke job
  `ca7d8dd6-22e7-4174-8a6a-88b7494a76e7` completed 286/286 Codex
  unit results with zero failed units and wrote 572 Donto
  simulation-provenance statements plus 386 evidence links.
- `scripts/backfill-donto-simulation-provenance.ts` processed 401 latest
  Codex result rows and linked 16 legacy orphaned simulation
  verdict/reason statements to a legacy simulation-ingest production run.
- The Perch 2.0 whale paper now reports 2,637/2,637 active statements
  linked to extraction or simulation production runs. The sperm-whale
  paper reports 1,345/1,345.

`upload/route.ts` calls `ingestPaperIntoDonto(...)` inside a
try/catch. The catch logs the message and falls back to a "shape" of
the result that has `claimIris: []`, `documentId: ""`, etc. The
caller (`db.insert(claims).values(...)`) then writes
`donto_subject_iri: null` for every claim.

The Donto health endpoint is `dontosrv /healthz`; the homepage already
calls it. The result is rendered as a single Online/Offline pill.
There's no per-paper Donto status, no recent-error count, no
ingest-success-rate gauge.

## Proposed design

### Persistent ingest state per paper

```sql
CREATE TABLE paper_donto_ingest (
  paper_id uuid PRIMARY KEY REFERENCES papers(id) ON DELETE CASCADE,
  state text NOT NULL,          -- queued | running | succeeded | failed
  attempts integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  last_error_code text,         -- e.g. "agents-bind-422"
  last_error_message text,
  document_id text,             -- tp:document:<id>
  revision_id text,
  agent_id text,
  run_id text,
  statement_count integer NOT NULL DEFAULT 0,
  span_count integer NOT NULL DEFAULT 0,
  evidence_link_count integer NOT NULL DEFAULT 0,
  argument_count integer NOT NULL DEFAULT 0,
  certified_count integer NOT NULL DEFAULT 0,
  shape_check_count integer NOT NULL DEFAULT 0,
  obligation_ids text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

Every upload writes a `queued` row before the ingest call. The ingest
function transitions `queued → running → succeeded|failed` and stores
the `documentId/revisionId/agentId/runId/statementCount/...` (the
existing return shape — we just persist it).

This single table replaces the silent log line and the empty-shape
fallback.

### Ingest contract

```ts
export async function ingestPaperIntoDonto(
  paperId: string,
  text: string,
  ...,
): Promise<IngestResult>;
```

The function is replaced with one that:

1. Marks the paper `running`.
2. Performs the ingest steps wrapped in `Promise.allSettled` so a
   partial failure (e.g. /spans/batch fails after /assert succeeds)
   leaves us in a recoverable state, not a half-written one.
3. On any settled rejection, marks the paper `failed` with the first
   structured error (`{code, message, step}`) and **rethrows**.
   Callers may swallow it (the upload route does) but the row state
   reflects truth.
4. On full success, marks the paper `succeeded` and updates counts.

### `agents/bind 422` root-cause fix

The 422 from `dontosrv /agents/bind` is "unknown" — meaning the
request body shape doesn't match `BindAgentReq`. The donto repo has
just shipped a predicate-alignment refactor (commit a3b93cc) so the
request schema may have changed.

P0 work:

1. Pin `dontosrv` deploy to a known-good commit during the
   stabilization window.
2. Capture the failing request body (`/agents/bind`) in toiletpaper's
   logs at level=error with structured fields, not a raw curl-style
   error message.
3. Land a unit test in `@toiletpaper/donto-client` that round-trips
   `BindAgentReq` JSON ↔ the dontosrv server's parser using a docker
   stub of dontosrv at the pinned commit.
4. Audit every donto-client call site for similar schema-fragility:
   `/contexts/ensure`, `/assert/batch`, `/arguments/assert`,
   `/obligations/emit`, `/spans/batch`, `/evidence/links/batch`.

### UI: per-paper Donto badge

`/papers/[id]` gains a small badge (using the existing `<Pill>` with
icon):

| State | Pill |
|---|---|
| succeeded | `green` "Donto · 7 quads/claim · synced" |
| failed | `red` "Donto · ingest failed" + retry button |
| queued/running | `amber` "Donto · ingesting…" |
| not_attempted | `muted` "Donto · skipped" |

Clicking the failed pill opens a panel with `last_error_code`,
`last_error_message`, and "Retry ingest" — calls
`POST /api/papers/<id>/donto/reingest`.

### Retry endpoint

```http
POST /api/papers/{id}/donto/reingest
```

Idempotent. Reads the paper from GCS, runs the same ingest, updates
`paper_donto_ingest`. If the ingest already succeeded and the
caller doesn't pass `?force=true`, it 204s without doing work.

### Nightly auto-retry

A scheduled Cloud Run Job (every 6 hours) selects up to 50 papers
with `state='failed'` AND `last_attempt_at < now() - interval '2
hours'`, retries them, and emails a summary to the maintainer if any
succeeded or any are still failing after 5 attempts.

### Health surface

`GET /api/donto/health` returns:

```json
{
  "healthy": true,
  "version": "donto a3b93cc",
  "ingest_failures_last_24h": 0,
  "last_failure": null,
  "context_count": 14,
  "statement_count": 2840
}
```

The homepage and the per-paper detail page both consume this. A
24-hour failure rate >5% drops a banner on the homepage:
"Some papers may not have full graph data. We're investigating."

## Acceptance criteria

- Re-uploading the Tuṣāra paper produces a row in
  `paper_donto_ingest` with `state='succeeded'` (after the bind 422
  is fixed) or `state='failed'` with a non-empty
  `last_error_code/message` if it fails.
- The /papers/[id] page renders a Donto status pill that reflects
  this row.
- The retry endpoint, called against a `failed` paper, transitions it
  to `succeeded` after 1 successful attempt.
- The donto-client integration tests catch the next schema drift in
  `BindAgentReq` before it hits production.

## Phasing

| P | Scope |
|---|---|
| P0 | Diagnose & fix `/agents/bind 422`; pin dontosrv |
| P0 | `paper_donto_ingest` table + state transitions in upload |
| P1 | Per-paper Donto badge UI; retry endpoint |
| P1 | Health surface; homepage banner on >5% failure rate |
| P2 | Nightly auto-retry Cloud Run Job |
| P2 | Donto-client integration test suite |

## Telemetry

- `donto.ingest.attempts_total` counter, labeled `result`
- `donto.ingest.duration_seconds` histogram
- `donto.client.error_total` counter, labeled `endpoint, code`
- A daily Slack/email digest:
  *"Yesterday: 12 papers ingested, 0 failures, p95 ingest 4.2s. 1 paper
  remains in `failed` state for >24h: <id>."*

## Open questions

- Should the upload route block on Donto ingest succeeding before
  marking the paper `extracted`? Currently it doesn't; the verdict
  pipeline can proceed with Postgres-only. Default: keep async, but
  surface state.
- Should we maintain a Donto write-ahead log on disk so we can replay
  ingests after Donto outages even if the GCS PDF is removed? P3.
