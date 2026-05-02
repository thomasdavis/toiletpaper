# PRD-006 · Async Simulation Pipeline with Re-run Support

| | |
|---|---|
| Status | Draft |
| Created | 2026-05-02 |
| Owner | toiletpaper engine |
| Related | PRD-001, PRD-002, PRD-003, PRD-008 |

## Problem

`POST /api/simulate` is a synchronous handler that blocks for the
entire duration of a paper's simulation pipeline. On a 90-claim
paper that's 10–20 minutes. Multiple things break:

1. **Cloudflare** drops the connection at 100 s. We work around by
   hitting the Cloud Run URL directly, which is unprintable to users.
2. **Cloud Run** kills the request at the configured `timeoutSeconds`
   (currently 1800). When that fires mid-pipeline:
   - `papers.status` stays `simulating` forever.
   - Already-written `simulations` rows survive, but the rest are lost.
   - There is no resume; re-running creates duplicate rows.
3. **No progress.** A user staring at the paper page sees nothing
   change for 15 minutes. There is no "claim 23/90" indicator.
4. **No retry.** A transient OpenAI 503 inside the pipeline corrupts
   the run; no granular retry exists.
5. **No re-run.** Once a paper is `done`, you cannot re-evaluate it
   against a new simulator without dropping rows manually in psql.

Direct evidence from the Tuṣāra paper run today: the curl client
disconnected after 371s, the route kept running for a while, then the
Cloud Run instance was reaped, leaving the paper stuck at status
`simulating` with 8 sims out of 90 written.

## Goals

1. The user-facing `POST /api/simulate` returns within seconds with a
   `job_id`. Work continues in a background worker.
2. The user can poll or stream live progress (claims completed, in
   flight, queued) and the UI shows a per-claim progress bar.
3. A worker crash never loses progress: completed simulations are
   already in the DB, and the job can resume from the next pending
   claim.
4. Each (paper, simulator, claim) tuple is idempotent. Re-runs do not
   duplicate rows.
5. There is a one-click re-run flow for: (a) a single claim against
   a single simulator, (b) all claims against a newly-added simulator,
   (c) a full re-evaluation after extractor v2 (PRD-004).

## Non-goals

- Streaming partial verdicts via WebSockets. Polling + SSE is enough.
- Multi-tenant isolation. We have one tenant.
- Distributed workers across regions. One worker pool per region.

## Background / current state

`simulate/route.ts` runs everything in-process. Postgres `simulations`
rows are written serially. `papers.status` is a single-string column
toggled `extracting → extracted → simulating → done|error`.

There is no job table, no idempotency key, and no per-claim progress
flag.

## Proposed design

### Tables

```sql
CREATE TABLE simulation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id uuid NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  /** "full" | "single_claim" | "single_simulator" | "missing_only" */
  scope text NOT NULL,
  /** scope_args is { claim_id?, simulator_id? } */
  scope_args jsonb NOT NULL DEFAULT '{}',
  state text NOT NULL,           -- queued | running | succeeded | failed | cancelled
  total_units integer NOT NULL DEFAULT 0,
  completed_units integer NOT NULL DEFAULT 0,
  failed_units integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  finished_at timestamptz,
  triggered_by text,             -- user email or "system:auto-retry"
  error_summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX simulation_jobs_paper_idx ON simulation_jobs (paper_id, created_at DESC);
CREATE INDEX simulation_jobs_state_idx ON simulation_jobs (state) WHERE state IN ('queued','running');
```

### Idempotency on `simulations`

```sql
ALTER TABLE simulations
  ADD COLUMN simulator_id text NOT NULL,
  ADD COLUMN run_id uuid REFERENCES simulation_jobs(id),
  ADD COLUMN replaces_id uuid REFERENCES simulations(id);

CREATE UNIQUE INDEX simulations_unique_per_run
  ON simulations (claim_id, simulator_id, run_id);
```

A simulation for a (claim, simulator, run) is unique. Re-runs create
a new `run_id` so old rows are preserved (history!), and the
`replaces_id` link points back to the previous row. The "current"
verdict for a (claim, simulator) is the latest by `created_at` within
non-cancelled runs.

### Job-runner architecture

```
client → POST /api/simulate { paper_id, scope }
  → enqueue job in `simulation_jobs` (state=queued)
  → publish task to Cloud Tasks queue `tp-sim-jobs`
  → return { job_id, status_url } 202 Accepted

Cloud Tasks → POST /api/internal/sim/run { job_id }   (worker URL)
  → Cloud Run worker service (separate from web)
    → claim job (CAS state queued→running)
    → enumerate units (claim × simulator) according to scope
    → for each unit, in parallel up to N=4:
        - run simulator with budgets (PRD-003)
        - upsert simulations row keyed (claim_id, simulator_id, run_id)
        - increment job.completed_units atomically
    → mark job succeeded | failed
```

The web service no longer runs simulator code. The worker is a
separate Cloud Run service (`toiletpaper-worker`) with its own
Dockerfile, scaled to `min=0, max=4`, request timeout 3600s. Cloud
Tasks delivers one task per job.

Re-runs simply enqueue a new job; the worker is idempotent.

### Progress endpoint

```
GET /api/jobs/{id}                    → JSON status
GET /api/jobs/{id}/stream             → SSE event stream
```

The SSE stream emits one event per claim transition:

```
event: progress
data: { job_id, claim_id, simulator_id, verdict, completed, total }
```

The paper-detail page subscribes to the stream while the job is
`running`; otherwise it polls every 5s.

### Resumption / crash recovery

- On worker startup, scan for jobs with `state='running'` and
  `started_at < now() - interval '2 minutes'` with no recent progress;
  mark them `failed` with `error_summary='worker died'`. A retry job
  can be triggered automatically (configurable, default off).
- Within a job, the worker recomputes pending units by diffing
  intended units against `simulations` already inserted with this
  `run_id`. So a worker that comes back up mid-job picks up where the
  previous instance died.

### Cancellation

`POST /api/jobs/{id}/cancel` flips the job to `cancelled`. The worker
checks the state every claim and bails out cleanly. In-flight LLM
calls are aborted via the `AbortController` from PRD-003.

### Re-run scopes

Scope is one of:

- `full`              — every claim × every simulator that applies
- `missing_only`      — every (claim, simulator) pair that has no
                        non-cancelled run yet
- `single_claim`      — claim_id × every applicable simulator
- `single_simulator`  — every claim × simulator_id

The UI exposes:
- "Re-evaluate paper" → `full`
- "Run new simulators" → `missing_only`
- "Re-test this claim" (per claim) → `single_claim`
- "Apply this simulator" (admin only) → `single_simulator`

### Status state machine of `papers`

The single `status` column is replaced by `extraction_state` and a
derived `simulation_state` view computed from `simulation_jobs`:

```
extraction_state: pending | running | done | failed
simulation_state: never_run | running | done | failed | partial
```

Writes are idempotent — the upload route owns extraction_state, the
worker owns the job table.

## Migration

1. Land tables, types, and the `simulator_id` column with a backfill
   that maps existing `method` strings to canonical simulator ids.
2. Build the worker service; deploy alongside web. Web continues to
   run inline simulate behind a flag `INLINE_SIMULATE=true`.
3. Switch the UI's "Run simulations" button to enqueue a job. Old
   inline endpoint stays for one release.
4. Delete the inline path; remove `INLINE_SIMULATE` flag.

## Acceptance criteria

- `POST /api/simulate` returns 202 with a `job_id` within 1 s
  (verified by unit test + production trace).
- A 90-claim paper completes simulation within ~15 min on the worker;
  the user sees per-claim progress without refreshing.
- Killing the worker mid-run (`gcloud run services revisions delete`
  during a job) results in the next worker boot resuming from the next
  pending unit; no duplicate rows.
- Re-uploading and clicking "Re-evaluate" creates a new
  `simulation_jobs` row and new `simulations` rows linked by `run_id`;
  the previous run's rows are still in the DB but not the "current"
  verdict.
- A claim with two simulators applicable produces two simulation rows
  per run; the unique index prevents three.

## Phasing

| P | Scope |
|---|---|
| P0 | Schema; worker service skeleton; Cloud Tasks queue |
| P0 | Inline-fallback flag; idempotent upserts |
| P1 | SSE progress endpoint; per-claim progress UI |
| P1 | Re-run scopes (single_claim, missing_only) |
| P2 | Cancellation; auto-retry for failed jobs |
| P2 | Drop inline path |

## Telemetry

- `sim_job.duration_seconds` histogram, labeled `scope`
- `sim_job.units_total` and `sim_job.units_failed_total` counters
- `sim_job.queue_lag_seconds` (queued → started)
- A live dashboard panel: "Active jobs: N · Median ETA: N min".
- Pager rule: any job in `running` state for >2× its expected
  wall-time (estimated from history) pages on-call.

## Open questions

- Cloud Tasks vs. Pub/Sub. Tasks gives us per-task retry policy and
  is simpler for "exactly one worker invocation per task". Default:
  Tasks.
- Worker autoscaling. With OpenAI as the bottleneck we want
  concurrency-1 per worker, max-4 workers. That's fine on Cloud Run.
- Should we expose the SSE stream through Cloudflare? Their proxy
  buffers — likely yes but verify.
