# PRD-001 · Domain Classification and Verifier Routing

| | |
|---|---|
| Status | Draft |
| Created | 2026-05-02 |
| Owner | toiletpaper engine |
| Related | PRD-002, PRD-003, PRD-004 |

## Problem

The `simulate` route routes claims to physics simulators using
case-insensitive substring matches on the claim text:

```ts
const reconnClaims = enriched.filter((c) =>
  c.text.toLowerCase().includes("reconnect") && (c.text.includes("0.1") || c.text.includes("v_A")),
);
const mriClaims = enriched.filter((c) =>
  c.text.toLowerCase().includes("viscosity") || c.text.includes("α") || c.text.includes("alpha"),
);
const dynamoClaims = enriched.filter((c) =>
  c.text.toLowerCase().includes("dynamo") || c.text.toLowerCase().includes("rm"),
);
```

The `"rm"` substring fires on `metallurgy`, `preliminary`, `form`,
`barter`, `term`, `farm`, every paper containing the letter pair "rm".
On the Tuṣāra paper (a 90-claim humanities monograph on Vedic-era
trade and Yuezhi migration) eight unrelated claims were routed to
`mhd-dynamo-onset`, returning a verdict-with-rawData of
`{Rm: 10, magE: 7e-08, …}` and a "refuted" label. Users see physics
verdicts on linguistics claims.

There is also no positive signal that a paper is *outside the
applicability* of any simulator. The system never refuses; it always
produces a verdict, even when the verdict is meaningless.

## Goals

1. A claim is only sent to a simulator when the simulator has declared
   its applicability for that claim's domain *and* its preconditions
   hold.
2. A paper that is outside every available simulator's domain is
   surfaced explicitly to the user, not silently passed through.
3. Routing decisions are inspectable per claim — we should be able to
   answer "why did this claim end up in MHD?" from a log line.
4. Adding a new simulator is a registration step, not a hand-edit of
   a routing if-else chain.

## Non-goals

- Re-implementing the simulators. This PRD only governs which
  simulator runs on which claim, not how the simulator works.
- Cross-domain papers (a physics+philosophy paper). Mixed-domain papers
  are an explicit follow-up; for v1, a paper has one primary domain.
- Reproducibility verifiers for non-physics domains (those are scoped
  in PRD-004 §"Domain-appropriate verifiers").

## Background / current state

`simulate/route.ts` is a 392-line single function. Routing is
keyword-substring filters; the simulator package
(`@toiletpaper/simulator`) exposes free functions per test. There is no
notion of a "simulator" as a registered object with metadata.

There is no `domain` field on `papers` or `claims`. The Donto context
is the only place where category-like info is asserted (`tp:category`
predicate, free-text values: `quantitative`, `unknown`, etc.) and the
relational Postgres tables don't carry it.

## Proposed design

### New: simulator registry

Each simulator declares a `SimulatorSpec`:

```ts
export interface SimulatorSpec {
  /** stable identifier; used as `simulations.method` prefix */
  id: string;
  /** human-readable name */
  name: string;
  /** which paper-level domains this can run on */
  paperDomains: ReadonlyArray<PaperDomain>;
  /** which claim categories this can run on */
  claimCategories: ReadonlyArray<ClaimCategory>;
  /**
   * Returns null if the claim is not applicable to this simulator,
   * otherwise a (mutable) preprocessed input bundle.
   *
   * Must be deterministic and side-effect free.
   */
  applies(claim: EnrichedClaim, paper: PaperMetadata): SimulatorInput | null;
  run(input: SimulatorInput, ctx: SimulatorContext): Promise<SimulatorVerdict>;
}
```

Simulators register at module load:

```ts
registry.register(harrisSheetReconnection);
registry.register(mriShearingBoxViscosity);
registry.register(dynamoOnset);
// future: citationCorroboration, archaeologicalDateConsistency, …
```

The registry exposes `pickSimulators(claim, paper)` which iterates
registered simulators in declared priority order, calls `applies`, and
returns the non-null matches.

### New: `papers.domain` column

```sql
ALTER TABLE papers ADD COLUMN domain text NOT NULL DEFAULT 'unknown';
ALTER TABLE papers ADD COLUMN domain_confidence double precision;
ALTER TABLE papers ADD COLUMN domain_classified_at timestamptz;
CREATE INDEX papers_domain_idx ON papers (domain);
```

Allowed values (initial enum, stored as text for forward compat):

```
physics, astronomy, biology, chemistry, materials, mathematics,
computer_science, economics, medicine, social_science, humanities,
linguistics, history, philosophy, mixed, unknown
```

### New: `claims.category` column

Mirror of the Donto `tp:category` predicate so structure survives
Donto outages (see PRD-005, PRD-004):

```sql
ALTER TABLE claims ADD COLUMN category text NOT NULL DEFAULT 'unknown';
CREATE INDEX claims_category_idx ON claims (category);
```

Categories (initial set):

```
quantitative_prediction   — "X = 4.2 ± 0.3 σ"
scaling_law               — "y ~ x^k"
equation                  — closed-form expression
baseline_contrast         — "method A outperforms method B"
qualitative_assertion     — testable but non-numeric ("X causes Y")
narrative                 — non-falsifiable
historical_assertion      — "X happened in year Y"
linguistic_assertion      — "word A derives from word B"
unknown
```

### New: domain classification step

A new step is added to the upload pipeline, between extraction and
ingest, called `classifyDomain(paper, claims)`. It must:

1. Use a single LLM call (`gpt-4o-mini`, structured output via JSON
   schema) over the paper title + abstract + a sampled set of 8 claims.
2. Return `{ domain: PaperDomain, confidence: number,
   per_claim_categories: Array<{claim_id, category}> }`.
3. Be cheap (<5k input tokens / paper), deterministic with `seed: 42`.
4. Never block the upload — failure falls back to `domain="unknown"`,
   `category="unknown"` and the paper is flagged `requires_review`.

### Routing

`simulate/route.ts` is replaced by `simulate/orchestrator.ts`:

```ts
const sims = registry.all();
for (const claim of paperClaims) {
  const matches = sims
    .map((s) => ({ sim: s, input: s.applies(claim, paper) }))
    .filter((m) => m.input !== null);

  if (matches.length === 0) {
    await recordVerdict(claim, {
      verdict: "not_applicable",
      reason: "no registered simulator applies to this claim's category and the paper's domain",
      method: "router",
    });
    continue;
  }
  …
}
```

The substring filter chain is deleted. `dynamo` and `rm` substring
matches are no longer used to route claims; instead the dynamo
simulator's `applies(claim, paper)` requires `paper.domain === "physics"`
*and* `claim.category === "scaling_law"` *and* (a strict regex on the
text). Inapplicable claims hit the `not_applicable` path, which is
visible in the UI as "no simulator was applicable" — not a verdict.

### Telemetry

Per claim:

```
{
  event: "router.decision",
  paper_id, claim_id,
  paper_domain, claim_category,
  candidate_simulators: ["mhd-dynamo-onset"],
  selected_simulators: [],
  reason: "claim.category=historical_assertion not in dynamo.claimCategories"
}
```

Stored in a new `router_decisions` table (append-only, partitioned by
month) so we can later answer "what % of claims got no simulator?" and
"which simulator decided the most claims were inapplicable?".

## Migration

1. Ship `papers.domain` + `claims.category` columns with backfill
   defaults of `unknown`.
2. Backfill existing papers via the new classifier (a one-shot job
   `xtask reclassify-papers` that walks the table; idempotent).
3. Land the simulator registry behind a feature flag
   `ROUTER_V2=disabled|shadow|enabled`.
   - `shadow` runs both the old keyword router and the new
     registry-based router and logs the diff. No verdicts written
     from the new path.
   - `enabled` switches over.
4. After 7 days of `enabled` with no regression, delete the old
   substring code and the flag.

## Acceptance criteria

- A claim text containing the bare substring `"rm"` (e.g. "metallurgy")
  is **not** routed to `mhd-dynamo-onset` unless the paper domain is
  `physics` and the claim category is `scaling_law` *and* the
  simulator's stricter regex matches.
- Uploading a humanities-domain paper produces zero
  `mhd-*` simulation rows and produces a paper-level
  `domain="humanities"` row.
- Each `simulations` row carries the registry id of the simulator that
  produced it; `not_applicable` claims do not generate `simulations`
  rows but do generate `router_decisions` rows.
- The Tuṣāra paper, re-run after this lands, shows zero MHD verdicts
  and surfaces a banner: *"This paper is humanities/linguistics. No
  physics simulators are applicable. 0 of 90 claims tested."*

## Phasing

| P | Scope |
|---|---|
| P0 | DB migrations (`papers.domain`, `claims.category`, `router_decisions`); registry skeleton; classifier LLM call |
| P0 | Move existing 3 physics simulators behind `applies()` with strict guards |
| P1 | `not_applicable` verdict surface in UI; banner on detail page |
| P1 | Shadow mode rollout, diff dashboard |
| P2 | Delete old substring router; turn off the flag |

## Open questions

- Should `applies()` be async? Most simulators don't need IO, but a
  citation-corroboration verifier in PRD-004 will. Default sync;
  registry can wrap async in a `try` later.
- Should we let users override the domain in the UI? Probably yes for
  edge cases, deferred to PRD-008.
