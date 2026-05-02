# PRD-008 · UI Honesty Pass — Verdict Display, Donto Status, PDF Source

| | |
|---|---|
| Status | Draft |
| Created | 2026-05-02 |
| Owner | toiletpaper frontend |
| Related | PRD-002, PRD-005, PRD-006 |

## Problem

The current UI overstates the rigour of the analysis it presents.
Concrete examples from the live Tuṣāra paper detail page
(`/papers/a8569d0a-409a-4aee-849b-31dd3616004f`):

- The summary bar reads
  *"Reproduced 59 / Refuted 8 / Inconclusive 23"*. Of those:
  - **44 of 59 "reproduced"** are vacuous dimensional checks on text
    with no numbers.
  - **23 of 23 "inconclusive"** are simulator crashes (EACCES).
  - **8 of 8 "refuted"** are MHD physics simulations on non-physics
    claims due to the keyword-matching bug.
  - That is, **~96% of the verdicts shown are noise**, but the green
    "59 reproduced" pill is dominant.
- There is no link to the source PDF anywhere, even though it sits
  in GCS and we have an authenticated read path.
- There is no Donto status — the homepage advertises Donto features,
  but a paper with zero Donto coverage looks identical to a paper
  with full coverage.
- The detail page SSR HTML is **1.6 MB** — every claim and every
  simulation result is inlined, including 7-row rawData arrays for
  each MHD sim. A 90-claim paper produces a 1.6 MB document.
- `/styleguide` is in the public navbar yet `noindex`. The status
  page for our internal design tokens shouldn't be a top-level user
  link.

## Goals

1. Aggregate verdict displays separate *signal* from *meta* (vacuous,
   not-applicable, system errors, untested) so users can see at a
   glance how much of the analysis is meaningful.
2. Per-claim views explain *why* there's no useful verdict, not just
   that there isn't one.
3. The Donto integration state is visible per paper.
4. The source PDF is reachable in one click from any paper page.
5. Page weight is bounded — list pages don't inline detail data, and
   the detail page lazy-loads simulation result blobs.

## Non-goals

- A new design system. We extend `components/brand/`.
- Internationalization or theming.
- Reactive real-time updates beyond the polling/SSE introduced in
  PRD-006.

## Background / current state

`/papers/[id]/report` uses a single `DistributionBar` over
`reproduced/contradicted/inconclusive/untested`. `/papers/[id]/`
inlines all claims with their full simulation rows. The annotated
view loads everything client-side. Donto details are loaded
asynchronously by `<DontoDetails paperId={id} />` but the failure
mode (no donto rows) renders nothing — no message, no CTA.

## Proposed design

### New verdict legend

The `<VerdictTag>` and `<DistributionBar>` components are extended
to carry the eight-state vocabulary (PRD-002):

| Verdict | Bucket | Color | Pill icon |
|---|---|---|---|
| reproduced | signal | `#2D6A4F` | check |
| contradicted | signal | `#9B2226` | x |
| fragile | signal | `#B07D2B` | wave |
| inconclusive | signal | `#B07D2B` | minus |
| not_applicable | meta | `#9B9B9B` | dash-circle |
| vacuous | meta | `#9B9B9B` | empty-set |
| system_error | meta | `#6A2B2B` | wrench |
| untested | meta | `#C8C3B8` | (none) |

### Two-row distribution bar

Replace the single bar with two:

```
Tested:        ████████░░░░░░  17 of 90 (19%)
   reproduced 12 · contradicted 5 · inconclusive 0 · fragile 0
Filtered out: ░░██████████████  73 of 90 (81%)
   not_applicable 50 · vacuous 15 · system_error 8 · untested 0
```

The exact pixel widths derive from the numbers, not from a hard-coded
proportion. The summary line at the top of the detail page reads:

> *"17 of this paper's 90 claims could be tested. Of those, 12 reproduce
> the paper, 5 contradict it. The other 73 weren't testable by any of
> our current simulators."*

The number `17 of 90` is the **headline** number; `12 / 5 / 0 / 0` is
the qualitative breakdown.

### Per-claim "why no verdict?"

Every claim row in the report tab gains a tiny annotation when its
best verdict is in the *meta* bucket:

- `not_applicable` → small chip `"no simulator applies"` with a
  popover listing the candidate simulators and why each declined
  (read from `router_decisions`, PRD-001).
- `vacuous` → chip `"vacuous test"` with the reason: e.g.
  *"dimensional analysis on text with no numeric content"*.
- `system_error` → chip `"simulator error"` with the abbreviated
  error code (e.g. `wall-time exceeded`); full trace behind a
  "Show details" disclosure for admins.
- `untested` → chip `"untestable claim"` with the testability reason
  from PRD-004.

### Donto status pill

Per-paper card (top of detail page) shows a single pill from PRD-005:

```
Donto · synced · 7 quads/claim ✓
Donto · ingest failed · retry  ⚠
Donto · ingesting…              ⏳
Donto · skipped                 ··
```

The `failed` pill includes a retry button that calls
`POST /api/papers/<id>/donto/reingest` (PRD-005).

### Source PDF link

A button on every paper sub-page (overview / report / annotated /
simulations):

```
[ Source PDF ↓ ]   [ /papers/<id>/sources.pdf ]
```

Implementation: a thin handler at `/papers/<id>/source` that
authenticates and 302-redirects to a *signed* GCS URL valid for 5
minutes. We do not expose the bucket name or path; the URL is opaque.

### Page weight

The detail page (`/papers/[id]`) becomes a server component that
fetches:

- the paper row,
- claim *count* and verdict tally (via aggregation view),
- the first 25 claims (with their summary verdict only — not the
  full simulation rows).

The remaining claims are lazy-loaded via `/api/papers/[id]/claims?cursor=...`.
Each claim's full simulation result is fetched on demand when the user
expands the claim card.

The annotated view continues to load the full text (it must), but no
longer inlines the JSON of every claim's simulations — it only loads
`(id, text, verdict, span)` for claims and fetches sim details as
needed.

### Fast headline numbers — materialized aggregate

```sql
CREATE MATERIALIZED VIEW v_paper_signal AS
  SELECT
    p.id AS paper_id,
    count(DISTINCT c.id) AS claim_count,
    count(DISTINCT c.id) FILTER (WHERE c.testability >= 0.4) AS testable_count,
    count(*) FILTER (WHERE s.verdict IN
      ('reproduced','contradicted','fragile','inconclusive')) AS signal_sims,
    count(*) FILTER (WHERE s.verdict = 'reproduced') AS reproduced,
    count(*) FILTER (WHERE s.verdict = 'contradicted') AS contradicted,
    count(*) FILTER (WHERE s.verdict = 'fragile') AS fragile,
    count(*) FILTER (WHERE s.verdict = 'inconclusive') AS inconclusive,
    count(*) FILTER (WHERE s.verdict = 'not_applicable') AS not_applicable,
    count(*) FILTER (WHERE s.verdict = 'vacuous') AS vacuous,
    count(*) FILTER (WHERE s.verdict = 'system_error') AS system_error,
    count(*) FILTER (WHERE s.verdict = 'untested') AS untested
  FROM papers p
  LEFT JOIN claims c ON c.paper_id = p.id
  LEFT JOIN simulations s ON s.claim_id = c.id
  GROUP BY p.id;
CREATE UNIQUE INDEX v_paper_signal_pk ON v_paper_signal (paper_id);
```

Refreshed concurrently by a trigger on `simulations` insert/update
(or, if perf demands, by the worker on job completion).

### Navbar / Styleguide

`/styleguide` is moved out of the public navbar and placed under
`/internal/styleguide`. Clean nav: `Papers · Upload · Source · Donto`
(the latter two as external github links).

### Honest homepage stats

The homepage's "Live counters" section is updated to show:

- `Papers analyzed: 5`
- `Claims extracted: 357`
- `Claims tested: 41 (11%)`
- `Reproduced: 22 · Contradicted: 13 · Other: 6`

The "Simulations" tile drops the raw count; users care about *tested
claims* not *attempted simulations*.

## Acceptance criteria

- The Tuṣāra paper detail page, post-PRD-002 + post-PRD-008, shows:
  - Headline: *"X of 90 claims could be tested"* (where X is the count
    of claims with a signal verdict, not the count of simulation rows).
  - Two-row distribution bar with the meta bucket explicitly labeled.
  - A "Donto · ingest failed · retry" pill (until PRD-005 fixes the
    422).
  - A "Source PDF ↓" button.
- Detail page SSR HTML for a 90-claim paper is < 250 KB
  (regression-tested in CI by uploading a fixture and asserting page
  size).
- Each meta-verdict claim shows a chip explaining *why* it has no
  testable result.
- `/styleguide` 404s; `/internal/styleguide` works only when an
  admin cookie is present.
- `<VerdictTag kind="vacuous">` renders the empty-set glyph; the same
  pill is used everywhere a vacuous verdict is shown.

## Phasing

| P | Scope |
|---|---|
| P0 | Verdict-vocabulary update across `<VerdictTag>` and `<DistributionBar>` |
| P0 | Two-row distribution bar; honest summary line |
| P0 | Source-PDF link via signed URL |
| P1 | Per-claim "why no verdict?" chips |
| P1 | Donto status pill on the detail page |
| P1 | Materialized view + lazy-load page rewrite |
| P2 | Styleguide migration to `/internal` |
| P2 | Homepage stat refresh |

## Telemetry

- Page load weight: report `Server-Timing: html;dur=<bytes>` on every
  paper page; alert at p95 > 500 KB.
- Per-pill click-through (does anyone click the "system_error"
  details?). If nobody does, the chip is decorative and we should
  reconsider.
- Source-PDF download counts.

## Open questions

- Should the homepage hide papers whose verdict mix is mostly
  meta-bucket from the "browse" list? Probably yes for non-admins;
  always visible to admins. Default: visible to all, with a small
  warning chip.
- Naming: "filtered out" vs "untested" vs "out of scope". User
  testing on copy after the structural change lands.
