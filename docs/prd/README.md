# PRDs

Design documents for the toiletpaper engine. Each PRD is independently
implementable but they have explicit `Related:` cross-references when a
design depends on another's primitives.

The current set was written 2026-05-02 in response to a critical
review of the Tuṣāra paper run, which exposed end-to-end issues with
extraction quality, simulator routing, verdict semantics, Donto
ingest, and operator workflows.

## Suggested implementation order

The dependency graph is roughly linear:

```
PRD-002 (verdict semantics) ────┐
PRD-003 (simulator runtime) ────┼─→ PRD-001 (router)
PRD-004 (extractor v2)  ────────┤
                                ↓
                       PRD-006 (async sim pipeline)
                                ↓
                       PRD-008 (UI honesty pass)

PRD-005 (donto reliability)  ── parallel; required for PRD-008's
                                  Donto status pill
PRD-007 (deploy stability)   ── parallel; unblocks confident shipping

PRD-009 (local replication)  ── follows PRD-004/005/006; generalizes
                                  the engine from physics simulations
                                  to Donto-native replication units
```

Recommended start: **PRD-002 first** (it's a vocabulary fix that lets
the rest of the work be honest about state) and **PRD-007 in
parallel** (so subsequent deploys don't drift). PRD-001 lands once
PRD-002, PRD-003, and PRD-004 are at P0.

## Index

| # | Title | One-line summary |
|---|---|---|
| [PRD-001](PRD-001-domain-classification-and-verifier-routing.md) | Domain classification & verifier routing | Stop substring-matching `"rm"` to MHD. Simulators register with applicability rules; router refuses out-of-domain claims. |
| [PRD-002](PRD-002-verdict-semantics.md) | Verdict semantics | An eight-state enum that distinguishes signal verdicts from vacuous-passes, system errors, and inapplicability. |
| [PRD-003](PRD-003-simulator-runtime-hardening.md) | Simulator runtime hardening | `WorkDir` abstraction, per-simulator budgets (wall-time, memory, LLM tokens), network egress allowlist, isolated retries. |
| [PRD-004](PRD-004-extractor-v2.md) | Extractor v2 | Header parser + body extractor + testability classifier; structured fields mirrored to Postgres. Annotated view becomes deterministic. |
| [PRD-005](PRD-005-donto-integration-reliability.md) | Donto integration reliability | `paper_donto_ingest` table; per-paper status pill; retry endpoint; root-cause fix for `agents/bind 422`. |
| [PRD-006](PRD-006-async-simulation-pipeline.md) | Async simulation pipeline | Cloud Tasks-backed worker; resume after crash; SSE progress; idempotent re-runs. |
| [PRD-007](PRD-007-cloud-run-deployment-stability.md) | Cloud Run deployment stability | Declarative `services replace` from a checked-in YAML; drift detector; cert-renewal from a SAN file. |
| [PRD-008](PRD-008-ui-honesty.md) | UI honesty pass | Two-row distribution bar, per-claim "why no verdict?", Donto pill, source-PDF link, lazy-loaded detail page. |
| [PRD-009](PRD-009-donto-local-replication-planner.md) | Donto-native local replication planner | Compile Donto/Qwen claim bundles into replication units; route to local/deterministic verifiers; store plans, blockers, runs, and verdicts back in Donto. |

## What this set deliberately does *not* cover

These are P3+ and intentionally out of scope for the current set:

- Multi-tenant authentication / billing.
- Replacement of pdf-parse with a custom PDF parser.
- Multi-region deploy.
- Cross-paper analysis (e.g. "which papers contradict each other on
  the value of X"). The data model post-PRD-004 supports it; the UI
  doesn't.
- Untrusted user-submitted simulators.
