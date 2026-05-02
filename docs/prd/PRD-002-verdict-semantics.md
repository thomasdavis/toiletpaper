# PRD-002 · Verdict Semantics — Inapplicability, Vacuous Truth, and System Errors

| | |
|---|---|
| Status | Draft |
| Created | 2026-05-02 |
| Owner | toiletpaper engine |
| Related | PRD-001, PRD-003, PRD-008 |

## Problem

The verdict pipeline conflates three distinct outcomes into the
"confirmed / refuted / inconclusive" buckets:

1. **Vacuous passes.** Tier-1 dimensional analysis on text without
   numbers returns `LHS: [dimensionless], RHS components: [dimensionless]`
   and is mapped to `confirmed`. On the Tuṣāra paper, **44 of 59
   "confirmed" verdicts are vacuous** (the reason text contains
   "vacuous" or "dimensionless" with no actual numeric content).
2. **System errors.** Tier-2 simulations on Cloud Run fail with
   `EACCES: permission denied, mkdir '/repo/toiletpaper/apps/web/.simulations'`.
   The route catches the error and writes `verdict: "inconclusive"` with
   a reason starting `"Pipeline error: ..."`. **23 of 23 tier-2 sims**
   on the Tuṣāra paper are system errors masquerading as analyses.
3. **Inapplicability.** A claim outside any simulator's domain (PRD-001)
   has no verdict at all today. After PRD-001 it will be `not_applicable`
   and must be aggregated separately from genuine
   "we tested but couldn't decide" inconclusive verdicts.

The aggregate UI on the homepage and on `/papers/[id]/report` shows
"Reproduced 59 / Refuted 8 / Inconclusive 23" — a green-heavy summary
that is almost entirely noise. We are misleading users.

## Goals

1. Each simulation row carries a verdict from a *closed*, well-defined
   enum that the UI can rely on without parsing the reason text.
2. The aggregate per-paper stats can be honest about how much of the
   analysis was actually meaningful.
3. The UI separates *signal* (real reproduced/refuted/inconclusive
   verdicts) from *noise* (vacuous, not-applicable, system errors).
4. Adding a new outcome category in the future is a one-line change to
   the enum + a UI legend update; no ad-hoc string parsing.

## Non-goals

- Changing how the simulators reach a verdict. This PRD defines the
  *vocabulary*, not the underlying logic.
- Backwards-compatible verdict labels for clients outside this repo.
  We control all consumers.

## Background / current state

`simulations.verdict` is a `text` column with values
`{confirmed, refuted, inconclusive}` (per the route's
`v.verdict === "reproduced" ? "confirmed" : ...` mapping). The route
collapses all simulator outputs into these three buckets. There is no
distinction between "we ran a real test and got a real refutation" and
"the simulator died with a stack trace".

The map function in the page UI (`mapVerdict`) re-reads `verdict` and
also peeks at `metadata.original_verdict` for `fragile`,
`numerically_fragile`, `not-simulable`. Two facts hang off the same row
in two places.

## Proposed design

### New verdict enum

```ts
export type Verdict =
  | "reproduced"          // simulation came back consistent with the claim
  | "contradicted"        // simulation came back inconsistent with the claim
  | "fragile"             // result swings with parameter perturbation
  | "inconclusive"        // genuine, ran-but-couldn't-decide
  | "not_applicable"      // no simulator's preconditions matched (PRD-001)
  | "vacuous"             // the test passed/failed vacuously (no numbers, …)
  | "system_error"        // simulator crashed; reason carries the trace
  | "untested";           // claim was never offered to any simulator
```

Postgres:

```sql
CREATE TYPE simulation_verdict AS ENUM (
  'reproduced', 'contradicted', 'fragile', 'inconclusive',
  'not_applicable', 'vacuous', 'system_error', 'untested'
);

ALTER TABLE simulations
  ALTER COLUMN verdict TYPE simulation_verdict
  USING (CASE
    WHEN verdict = 'confirmed' THEN 'reproduced'::simulation_verdict
    WHEN verdict = 'refuted'   THEN 'contradicted'::simulation_verdict
    ELSE verdict::simulation_verdict
  END);
```

Existing `confirmed`/`refuted` rows are renamed in place. The
`metadata.original_verdict` shim is **deleted**; the enum is the single
source of truth.

### Simulator contract

`SimulatorVerdict` (PRD-001) is amended:

```ts
export interface SimulatorVerdict {
  verdict: Verdict;
  /** Human-readable single line for the UI legend */
  reason: string;
  /** Confidence in the verdict, 0..1 */
  confidence: number;
  /** Numeric measured/expected if applicable */
  measured?: number;
  expected?: number;
  /** Set when verdict === "system_error" — never logged client-side */
  errorTrace?: string;
  /** Free-form metadata; UI must not rely on it */
  metadata?: Record<string, unknown>;
}
```

Rules:

- A `confidence` value must be supplied even for `system_error`
  (always `0`) and `not_applicable` (always `0`). This eliminates the
  conditional NULL handling in aggregations.
- A simulator that detects "I ran but the test was vacuously true"
  must emit `verdict: "vacuous"`, not `"reproduced"`. The Tier-1
  dimensional analyzer's "passes vacuously" branch is the canonical
  example and is migrated as part of this PRD.
- A simulator that crashes must be wrapped by the orchestrator (PRD-001)
  in a try/catch that emits `verdict: "system_error"` with the stack
  in `errorTrace`. Simulators must not handle their own crashes by
  emitting `inconclusive`.

### Aggregate logic

A new helper, `summarizeVerdicts(rows)`, returns:

```ts
{
  total: number,
  signal: { reproduced, contradicted, fragile, inconclusive },
  meta:   { vacuous, not_applicable, system_error, untested },
  ratio:  number   // sum(signal) / total
}
```

Where it is used:

- Paper detail page: shows two distribution bars side by side,
  "Tested" (signal) and "Not tested or untestable" (meta).
- Homepage live stats: only the *signal* counts roll up to
  "Simulations". Meta counts are surfaced under a separate
  "filtered out" line (see PRD-008).
- Aggregations in SQL must use the helper view:

```sql
CREATE VIEW v_paper_signal AS
  SELECT paper_id,
    count(*) FILTER (WHERE verdict IN
      ('reproduced','contradicted','fragile','inconclusive')) AS signal,
    count(*) FILTER (WHERE verdict IN
      ('vacuous','not_applicable','system_error','untested')) AS meta,
    count(*) AS total
  FROM simulations s JOIN claims c ON c.id = s.claim_id
  GROUP BY paper_id;
```

### "Vacuous" detector — explicit, not pattern-matched

The Tier-1 dimensional analyzer is rewritten so that the moment it
detects an input with no quantitative content, it short-circuits and
returns `{ verdict: "vacuous", reason: "no numeric content in claim",
confidence: 0 }`. The current code path that returns
`Dimensional analysis: dimensionless × dimensionless` and labels it
`reproduced` is deleted; the `"reason"` text was load-bearing for the
UI and never should have been.

### Migration of the Tuṣāra paper (or any pre-existing data)

Run `xtask reclassify-verdicts` once at deploy time. It walks
`simulations` rows and applies these reclassifications:

| If old verdict was | And reason matches | New verdict |
|---|---|---|
| `confirmed` | `~ vacuous \| dimensionless × dimensionless \| Dimensional analysis: LHS: \[N/A\]` | `vacuous` |
| `inconclusive` | `^Pipeline error:` | `system_error` |
| `inconclusive` | `^Simulation failed:` | `system_error` |
| `confirmed` | otherwise | `reproduced` |
| `refuted` | otherwise | `contradicted` |

After backfill the Tuṣāra paper should report:
`reproduced ~15 / contradicted 0 / inconclusive 0 / vacuous 44 /
not_applicable 0 / system_error 23 / untested 8` (8 dynamo
false-positives become `not_applicable` once PRD-001 lands; until then
they stay `contradicted`).

## Acceptance criteria

- `simulations.verdict` is a Postgres enum with the eight values above.
- No simulator can produce a row with `confirmed`/`refuted` (CI guard:
  a `pg_typeof` check in tests).
- Re-running the dimensional-analysis simulator on a claim of
  *"The woollen sieve may be a reference to such a golden fleece"*
  produces `verdict: "vacuous"` not `"reproduced"`.
- A simulator throwing in its `run()` produces a row with
  `verdict: "system_error"` and `errorTrace` populated; the orchestrator
  does not let the throw escape.
- The paper detail page's distribution bar splits visibly into
  *Tested* and *Filtered out* groups; the legend pill colors are
  defined in `<VerdictTag>`.

## Phasing

| P | Scope |
|---|---|
| P0 | Postgres enum + migration of existing rows (`confirmed→reproduced`, `refuted→contradicted`) |
| P0 | Simulator contract amendment + orchestrator try/catch wrapper |
| P0 | Vacuous detector rewrite |
| P1 | `summarizeVerdicts` helper + view; UI swap |
| P1 | Backfill job for existing Tuṣāra-era rows |
| P2 | Delete `metadata.original_verdict` parsing on the page |

## Telemetry

`simulator.verdict_emitted{verdict=…, simulator_id=…, paper_domain=…}`
counter, scraped on the dashboard. A paper whose verdict mix is
>50% `system_error` triggers an alert; >80% `vacuous` is a quality
flag for the simulator, not a paper-level issue.
