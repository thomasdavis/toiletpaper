# PRD-003 · Simulator Runtime Hardening

| | |
|---|---|
| Status | Draft |
| Created | 2026-05-02 |
| Owner | toiletpaper engine |
| Related | PRD-002, PRD-006 |

## Problem

The simulator package (`@toiletpaper/simulator`) writes to disk paths
like `'/repo/toiletpaper/apps/web/.simulations'`. Cloud Run's
filesystem is read-only outside `/tmp`, so on the production deploy
every Tier-2 simulation fails with:

```
EACCES: permission denied, mkdir '/repo/toiletpaper/apps/web/.simulations'
```

The `simulate` route catches the throw and writes a row with
`verdict: "inconclusive"` and reason starting with
`"Pipeline error: ..."`. **23/23 Tier-2 simulations on the Tuṣāra paper
were system errors masquerading as inconclusive analyses.**

The simulator also has no resource ceiling. A pathological claim
could spin a simulation for the entire 30-minute Cloud Run timeout,
holding the request thread and starving everything else.

There is no separation between *deterministic numeric simulations*
(MHD, etc.) and *LLM-judge simulations* (Tier-1, Tier-2). Both run in
the same process, share the same OpenAI client, and the same crash in
the LLM client kills the entire batch.

## Goals

1. Every simulator runs inside a sandbox where filesystem writes,
   memory, CPU time, and external network are bounded and configured
   per-simulator.
2. A simulator crash is contained to its own simulation row; it never
   poisons the rest of the batch.
3. The simulator package has no hidden filesystem-side-effects; all
   writes go through a single configurable `WorkDir` abstraction.
4. Simulators declare their resource needs upfront and the orchestrator
   refuses to start one whose budget can't be met.

## Non-goals

- Replacing the simulator algorithms.
- Cross-process sandboxing via VMs / containers — overkill for the
  current scale; revisit when we add untrusted user-submitted
  simulators.
- GPU support.

## Background / current state

The simulator's deterministic tests (`harrisSheet`, `mriShearingBox`,
`dynamoOnset`) run pure-JS and don't touch disk. The Tier-2 LLM
simulator writes intermediate artifacts (LLM transcripts, plot data) to
`apps/web/.simulations/<sim_id>/...` — discovered by the EACCES bug.
Path is hard-coded as `process.cwd() + "/.simulations"`.

OpenAI client is a singleton per process; no retry/backoff config.
There is no per-simulation timeout — only the Cloud Run service-level
timeout (now 1800 s) which, when exceeded, drops the whole request.

## Proposed design

### `WorkDir` abstraction

```ts
export interface WorkDir {
  /** Returns an absolute path inside the workdir, creating dirs as needed */
  path(...parts: string[]): Promise<string>;
  /** Write a file inside the workdir; returns the absolute path */
  writeFile(rel: string, body: Buffer | string): Promise<string>;
  /** Read a file inside the workdir; throws if missing */
  readFile(rel: string): Promise<Buffer>;
  /** Best-effort cleanup; called by orchestrator at end of run */
  dispose(): Promise<void>;
}
```

Two implementations:

- `TmpWorkDir(rootHint)` — backed by `/tmp/<simId>/` (Cloud Run-safe).
- `MemoryWorkDir()` — `Map<string, Buffer>` for tests and
  in-memory-only simulators.

Selection by env var `SIMULATOR_WORKDIR=/tmp/simulations` (production)
or `memory` (test). The simulator package no longer knows about
`process.cwd()`; the orchestrator hands a `WorkDir` to each
`simulator.run()`.

### Resource budgets

Each `SimulatorSpec` (PRD-001) gains a `budget` field:

```ts
budget: {
  /** Max wall time for a single .run() call. Hard kill at 1.5×. */
  wallTimeMs: number;
  /** Max heap allocated by the simulator (best-effort, soft) */
  memoryMb: number;
  /** Max OpenAI tokens per simulation (input + output) */
  llmTokens?: number;
  /** Allowed external hostnames; empty array = no network */
  network: string[];
}
```

The orchestrator wraps `simulator.run()` in:

```ts
async function runWithBudget(spec, input, ctx) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort("budget.wall"),
                           spec.budget.wallTimeMs);
  try {
    return await spec.run(input, { ...ctx, signal: ctrl.signal });
  } catch (err) {
    if (ctrl.signal.aborted)
      return { verdict: "system_error", reason: "wall-time exceeded",
               errorTrace: String(err), confidence: 0 };
    return { verdict: "system_error", reason: String(err),
             errorTrace: err.stack, confidence: 0 };
  } finally { clearTimeout(timer); }
}
```

LLM token budgets are enforced via the OpenAI client wrapper:
`new TokenBoundedClient(parent, budget.llmTokens)` rejects with
`BudgetExceeded` once the running sum hits the cap.

### Per-simulation isolation

Every simulator gets a freshly-instantiated `WorkDir`, a fresh OpenAI
client (so retry state can't leak), and a fresh `AbortController`.

The orchestrator runs simulations with `Promise.allSettled` (not
`Promise.all`) so one rejection doesn't take the rest down. Settled
rejections are converted to `system_error` rows by the wrapper above
and never propagate.

### Network egress allowlist

The simulator runtime sets `https.globalAgent` to a custom agent that
checks the destination hostname against the simulator's
`budget.network` allowlist. A simulator that didn't declare
`api.openai.com` in its allowlist cannot call the OpenAI API. This
catches accidental dependencies and forces simulators to be honest
about their integration surface.

### LLM client hardening

Replace direct `openai.chat.completions.create(...)` calls with a
shared wrapper:

```ts
class LlmClient {
  async judge(prompt: string, schema: ZodSchema, opts: {
    model: string; budget: number; signal?: AbortSignal;
    seed?: number; maxRetries?: number;
  }): Promise<JudgeResult>;
}
```

Features:
- Automatic retry on 429 / 5xx with exponential backoff and jitter
- Token accounting via `usage` field, charged against `budget`
- `seed` always set so re-runs are reproducible
- All requests/responses logged to the simulation's WorkDir
  (`workdir/llm/<sequence>.json`) for post-hoc inspection

### Failure-mode contract

| Failure | Verdict written | UI display |
|---|---|---|
| Wall-time exceeded | `system_error`, reason `"wall-time exceeded"` | "🛠 simulator timed out" |
| Memory exceeded | `system_error`, reason `"memory exceeded"` | "🛠 simulator OOM" |
| OpenAI 429 after retries | `system_error`, reason `"llm budget exceeded"` | "🛠 LLM unavailable" |
| Network egress blocked | `system_error`, reason `"network egress denied: <host>"` | "🛠 simulator misconfigured (network)" |
| Uncaught throw | `system_error`, reason `<message>`, `errorTrace` populated | "🛠 simulator error" |
| `applies()` returned null | no row; `not_applicable` decision logged | (PRD-001) |

## Acceptance criteria

- Grep over `packages/simulator/` finds **no** uses of `process.cwd()`,
  `__dirname`, hard-coded `/repo`, or `path.join(...".simulations")`.
- Running `pnpm test --filter=@toiletpaper/simulator` with
  `SIMULATOR_WORKDIR=memory` produces zero filesystem writes.
- Re-running the Tuṣāra paper simulation pipeline produces zero
  `system_error` rows.
- Killing a simulator process mid-run (`SIGTERM` after 1s) yields a
  single `system_error` row, not a stuck `simulating` paper status.
- Setting `budget.network: []` and running a Tier-2 simulator that
  attempts an OpenAI call results in an `system_error` with reason
  `"network egress denied: api.openai.com"` — proves the allowlist is
  enforced.

## Phasing

| P | Scope |
|---|---|
| P0 | `WorkDir` abstraction + replace all hard-coded paths in `@toiletpaper/simulator` |
| P0 | `runWithBudget` wrapper in orchestrator; wall-time enforcement |
| P1 | LLM client wrapper with retries, budget accounting, transcript persistence |
| P1 | Network egress allowlist |
| P2 | Memory accounting via `process.memoryUsage()` polling |
| P2 | Per-simulator metric exports (Prom-style /metrics endpoint) |

## Telemetry

- `simulator.duration_seconds` histogram, labeled `simulator_id`
- `simulator.budget_exceeded_total` counter, labeled
  `simulator_id, kind=wall|memory|tokens|network`
- `simulator.llm_tokens_total` counter, labeled `simulator_id, model`
- WorkDir contents persisted to GCS (`gs://apex-494316-source-staging/sims/<paperId>/<simId>/`)
  for any simulation that ends in `system_error` — for after-the-fact
  debugging without needing a re-run.

## Open questions

- Should we run the simulator in a separate Node worker thread for
  hard memory isolation? P2; defer until the LLM-judge runs are
  consistently exhausting one process's heap.
- Should `WorkDir` be Pulumi/IaC for the GCS path? Defer to PRD-007.
