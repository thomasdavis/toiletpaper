# PRD-005 · Donto Integration Reliability and Postgres Mirror

| | |
|---|---|
| Status | Draft |
| Created | 2026-05-02 |
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
