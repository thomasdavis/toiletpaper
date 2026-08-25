# PRD-010 — Correspondence gates and the per-paper replication bundle

Status: implemented on branch `sim-replication-rework` (2026-08-25)
Related: PRD-002 (verdict semantics), PRD-008 (UI honesty), PRD-009 (Donto-native
replication planner). Design constraints from the Rosetta pipeline advisory
(HAM #187/#188), Thomas's paper→Alpha vision (HAM #186), and the 4-axis
F-artifact partition (HAM #179).

## Problem

Agent-generated replication code can run cleanly yet silently simulate a
DIFFERENT system than the paper describes — altered operator ordering,
initial/boundary conditions, discretization, units, random process, stopping
rule, tolerance, or an undeclared proxy relation. Once that happens, the
qualifier cannot recover truth from complete-looking receipts: the wrong
proposition was instantiated, and every downstream artifact inherits the
mismatch. Before this PRD:

- verdicts were written to `simulations` with **no gates**: a codex result
  claiming `reproduced` was persisted as `reproduced` regardless of whether
  the unit was even bindable to a claim, blocked on missing artifacts, or
  backed by any run evidence;
- a **missing `evidence_mode` defaulted to `proxy_simulation`** (a silent
  promotion into an evidence-producing method) and an **unknown verdict
  defaulted to `inconclusive`** (a signal verdict the result had not earned);
- nothing recorded **what system was actually simulated**, so
  claim↔simulation correspondence was unauditable after the fact;
- per-run outputs were atomic result rows plus a file-inventory dossier;
  there was no single content-addressed artifact a reviewer could consume.

## Design

### 1. Correspondence receipts (`apps/web/src/lib/replication-correspondence.ts`)

A `CorrespondenceReceipt` is the machine-checkable declaration, per
replication unit, of the system that was ACTUALLY simulated:

- `binds`: claim IRI + **source Donto statement ids** (must be a subset of
  the unit's ids — executors cannot invent bindings) + evidence spans;
- `system`: description, equations, operator ordering, ICs/BCs,
  discretization, units system, **random process** (`none | seeded (+seeds)
  | unseeded`), stopping rule, tolerances, parameters;
- `proxy`: explicit `is_proxy` + the **relation the proxy bears to the
  original system** + declared gap (mandatory for `proxy_simulation`);
- `falsifier`: the smallest witness distinguishing intended from implemented
  semantics (obstruction-inventory day-one practice; warn-only in v1);
- `code`: workdir-relative paths + sha256 (machine-filled at ingest when the
  agent omits digests);
- `resolved_blockers`: which planner blockers the executor claims to have
  resolved, and how (consumed by the compilation gate).

Validation is deliberately **structural** (presence, referential integrity,
mode-consistency). Semantic adequacy — "is this discretization faithful?" —
is the qualifier's job and is NOT approximated with string heuristics
(no-brittle-logic rule).

Deterministic in-process executors get **machine-derived receipts**
(`deriveDeterministicReceipt`): they know exactly what they checked (their
constraint set), so their receipts are generated, not declared.

**Claim ceilings** (per HAM #179): `none < static_text_consistency <
proxy_dynamics < independent_reimplementation <
original_artifact_reexecution` (+ `formal_statement_proof`). An executable
evidence mode **without a valid receipt caps at `static_text_consistency`**:
we can see code ran, but not that it simulated the claimed system.
`insufficient` never raises a ceiling.

### 2. Gate order (`apps/web/src/lib/replication-gates.ts`)

```
1. extraction      unit bound to real Donto statements (UUID-bindable);
                   evidence-quote coverage recorded (warning when absent)
2. compilation     unresolved blocking blockers surfaced; a blocker counts
                   as resolved only when the receipt declares how
3. correspondence  receipt present + structurally valid for the evidence mode
4. execution       run evidence exists: executor-reported measurements or
                   unit-specific artifacts (checked BEFORE common-file merge)
5. verdict         admitted only when 1–4 passed
```

Signal verdicts (`reproduced/contradicted/fragile/inconclusive`) failing any
gate are **demoted to `untested`**, with:

- `metadata.ungated_verdict` = the executor's raw verdict (preserved, never
  lost — deliberately NOT `original_verdict`, which `normalizeVerdict()`
  re-promotes at read time);
- `metadata.gate_failures` + full per-gate records in `result.gates`;
- a `verdict_demoted` event in `simulation_logs`.

Meta verdicts pass through unchanged (they are already honest bounded
negative receipts). Honest canonicalization is now shared by both ingest
paths: unknown verdict → `untested` (was `inconclusive`); missing
evidence mode → `insufficient` (was `proxy_simulation`). A signal verdict
carrying `insufficient` evidence is always demoted.

### 3. Per-paper replication bundle (`apps/web/src/lib/replication-bundle.ts`)

One content-addressed aggregation artifact per (paper, job):
`replication-bundle.json` in the job workdir + a `replication_bundles` row.

- `artifactId` = `tp.replication.<paperId>.<jobId>` (`.graph` for
  deterministic-only bundles); `sha256` over **canonical JSON** (sorted keys
  at every level) — mirrors the rosetta proof-obligation bundle shape;
- per-unit entries: source statement ids, gates, receipt, gated verdict +
  claim ceiling + `ungatedVerdict`, simulation row id, artifact digests;
- **ceilings are never merged** — the coverage section only histograms them;
- coverage with denominator accounting: units with no result appear as
  explicit `untested` entries (`missingResultUnitIds`), demoted signals are
  counted separately (`demotedSignalCount`), and the headline
  `reproducedRate` divides gated reproductions by **all units**, so coverage
  gaps can never read as reproduced;
- the bundle indexes the dossier's file digests; the frozen dossier snapshot
  (written after the bundle) hashes the bundle file, closing the loop.

### 4. Wiring

- `scripts/run-codex-replication-job.ts`: the codex prompt now carries the
  **CORRESPONDENCE CONTRACT** — the agent must write
  `correspondence-manifest.json` (`{schema_version, receipts:[...]}`), one
  receipt per executed unit; "a unit result without a valid receipt will
  have its verdict demoted to untested — writing an honest receipt is how
  your work gets counted." Ingest routes every unit through
  `gateUnitVerdict`; the bundle is written before the dossier snapshot.
- `scripts/ingest-codex-results.ts` (recovery): same gates + bundle —
  recovery is not a way around the gates. Shares unit hydration
  (`scripts/lib/replication-unit-row.ts`) and bundle IO
  (`scripts/lib/replication-bundle-io.ts`) with the live path.
- `apps/web/src/lib/graph-replication.ts`: deterministic executions get
  derived receipts and the same gate order before rows are written.
- `apps/web/src/lib/codex-replication-dossier.ts`: lists
  `correspondence-manifest.json` + `replication-bundle.json` (optional in
  the lib so historical dossiers don't retroactively flip to incomplete;
  required in the script's frozen snapshot for new jobs).
- DB insert of the bundle row is **best-effort**: a missing table (before
  `drizzle-kit push` runs) logs `dbInsert: "failed"` without failing the
  job; the bundle FILE is the artifact of record.

## Schema change (additive only)

New table `replication_bundles` (see `packages/db/src/schema.ts`): id,
paper_id (FK), job_id, artifact_id, schema_version, sha256, manifest jsonb,
workdir_path, total/gated-signal/demoted-signal/meta/missing-result/
valid-receipt unit counts, created_at; unique on (artifact_id, sha256).
No existing table or column is modified.

## Not in scope / follow-ups

- The web UI does not yet render bundles, gate records, or demotion badges
  (PRD-008 follow-up: a bundle viewer + per-unit gate trail).
- `apps/web/src/app/api/simulate/route.ts` still writes legacy enum values
  on one path (`confirmed`/`refuted`) — pre-existing, untouched.
- Backfill: historical simulation rows are ungated (`metadata.gated` absent)
  and stay as-is (I3: no destructive rewrites); the bundle/coverage layer
  treats absence of `gated: true` as "pre-PRD-010".
- The qualifier agent (vision stage 4) consumes bundles; its LLM-side
  semantic audit of receipt-vs-paper correspondence is future work.

## Deployment runbook (deliberately NOT executed from the worktree)

1. Merge `sim-replication-rework` into `main`
   (`git -C /mnt/donto-data/workspace/toiletpaper merge sim-replication-rework`).
2. `pnpm install` in the main checkout (lockfile unchanged, but worktree
   installs don't propagate).
3. `pnpm db:push` (drizzle-kit push) against the live DB to create
   `replication_bundles`. Until then, bundle rows log `dbInsert: "failed"`
   and only the file artifact is produced — jobs are unaffected.
4. Restart the source-run workers so they pick up the new scripts:
   `sudo systemctl restart toiletpaper-codex-worker.service`
   (`toiletpaper-donto-ingest-worker.service` is untouched by this PRD but
   restarts harmlessly).
5. Rebuild + restart the web standalone bundle (also picks up the pending
   dontosrv bearer-auth baseline): `pnpm --filter web build` then
   `sudo systemctl restart toiletpaper-web.service`.
6. Verify on the next replication job: `simulation_logs` shows
   `correspondence_manifest_loaded`, `verdict_demoted` (when applicable),
   `replication_bundle_written` with `dbInsert: "inserted"`; the workdir
   contains `correspondence-manifest.json`, `replication-bundle.json`,
   `replication-bundle.sha256`.
