# Lifecycle Gap Analysis: Paper I (Astrophysical Bivector Dynamics)

**Date:** 2026-04-25
**Paper:** Bivector Non-Commutativity in Strong-Field Astrophysics
**Context:** `tp:paper:63a74b3c-d57d-44cb-a1fd-6decaca2cd71:claims`
**Statements:** 74 (7 claims × 9 triples + 11 metadata)
**Also checked:** Paper 0 (Algebra of Synchronization Failure) — same pattern

---

## Summary

All 7 claims sit at **maturity level 0** with only **2 of 11 lifecycle stages reached** (observed + obligations_clear). This is **not a paper quality problem** — the papers extract well. It is an **extraction pipeline problem**: toiletpaper's ingestion code doesn't use most of donto's evidence substrate, so the lifecycle tracker correctly reports the missing linkages.

Donto itself is working correctly. The Lean engine is attached, shape validation runs, the lifecycle function accurately diagnoses what's missing, and the auto-validator passes all 14 numeric checks. The problem is upstream: toiletpaper creates the right *data* but doesn't create the right *metadata*.

---

## Lifecycle Coverage

| Stage | Paper I | Paper 0 | Owner | Status |
|-------|---------|---------|-------|--------|
| observed | 100% | 100% | donto | Working — statements exist |
| extracted | 0% | 0% | **toiletpaper** | Not creating `donto_extraction_run` records |
| typed | 47.3% | 38.5% | **toiletpaper** | Partial — `xsd:decimal` used for values but `xsd:string` for text claims |
| anchored | 0% | 0% | **toiletpaper** | Not creating spans or evidence links |
| confidence_rated | 0% | 0% | **toiletpaper** | Storing confidence as quads, not using `donto_stmt_confidence` overlay |
| predicate_registered | 14.9% | 23.1% | **toiletpaper** | `tp:*` predicates not registered in ontology |
| shape_checked | 18.9% | 0% | donto | Auto-validated 14 numeric literals; schema predicates get shape checks |
| source_supported | 0% | 0% | **toiletpaper** | Not linking statements to source document via evidence links |
| obligations_clear | 100% | 100% | donto | No obligations emitted (they silently fail — see below) |
| argued | 0% | 0% | **toiletpaper** | Argument wiring exists in code but didn't fire for these papers |
| certified | 0% | 0% | future | Certificates require Lean proofs — not yet implemented |

---

## Root Causes (all extraction pipeline)

### 1. No extraction run provenance

**What's missing:** toiletpaper doesn't call `donto_start_extraction()` / `donto_complete_extraction()` to create a `donto_extraction_run` record. Without this, the lifecycle can't mark claims as "extracted" — they're just statements that appeared with no record of how.

**Impact:** `extracted` stage = 0% for all claims.

**Fix:** Create an extraction run with model_id `gpt-4o`, link it to the document revision, and complete it with the statement count. The dontosrv endpoints are `POST /documents/register` and `POST /documents/revision` — these are already called. The missing piece is the extraction run itself, which has no HTTP endpoint yet (it's a SQL function `donto_start_extraction`).

### 2. No span anchoring

**What's missing:** toiletpaper doesn't create `donto_span` records to anchor claims to specific character ranges in the source text. Without spans, the lifecycle can't mark claims as "anchored" and evidence links have nothing to point at.

**Impact:** `anchored` = 0%, `source_supported` = 0%.

**Fix:** After extraction, use GPT-4o (or string matching) to find the character offset of each claim's source sentence in the document revision text. Create spans via `donto_create_char_span()`, then link them to statements via `donto_link_evidence_span()`. The HTTP endpoint exists: `POST /evidence/link/span`.

### 3. No evidence links

**What's missing:** `donto_evidence_link` table has **0 rows**. toiletpaper registers documents and creates revisions but never links statements back to them. The evidence chain (statement → span → revision → document) is broken at the first hop.

**Impact:** `source_supported` = 0%.

**Fix:** After creating spans, link each claim statement to its span via `POST /evidence/link/span` with `link_type: "extracted_from"`. Also link to the extraction run via `POST /evidence/link/span` with a run target (this endpoint may need a `target_run_id` variant).

### 4. Confidence stored wrong

**What's missing:** toiletpaper stores confidence as a `tp:confidence` quad on the claim subject. Donto has a dedicated `donto_stmt_confidence` overlay table with richer semantics (confidence_source, extraction run linkage, low-confidence queries). The lifecycle checks the overlay, not the quad.

**Impact:** `confidence_rated` = 0% despite all 7 claims having confidence values in their quads.

**Fix:** After asserting claims, call `donto_set_confidence(stmt_id, confidence, 'extraction', run_id)` for each claim. This requires the statement UUID (not the claim IRI), which means switching from `assertBatch` (returns only a count) to individual `assert` calls (returns the statement_id).

### 5. `tp:*` predicates not registered

**What's missing:** donto's ontology (migration 0044) registers 101 predicates across 6 domains, but none of the `tp:*` predicates used by toiletpaper (tp:claimText, tp:category, tp:value, tp:unit, tp:confidence, tp:predicate, tp:evidence, tp:extractedFrom). The context is `permissive` so assertions succeed, but the lifecycle marks these as "predicate not registered".

**Impact:** `predicate_registered` = 14.9% (only `rdf:type` and `schema:*` predicates are registered). This also blocks maturity level 0→1 for every claim.

**Fix:** Register all `tp:*` predicates via `donto_register_predicate()` with proper labels, datatypes, and cardinality. This is a one-time migration. Could also be done via a `POST /predicates/register` endpoint if one existed (it doesn't — this is a donto gap).

### 6. Obligations silently fail

**What's missing:** The extractor tries to emit proof obligations via `POST /obligations/emit` but passes claim IRIs as `statement_id`. The obligations endpoint expects a UUID (the `statement_id` from `donto_statement`), not a string IRI. The try/catch swallows the error.

**Impact:** `obligations_clear` = 100% (vacuously — no obligations were created). This is misleadingly green.

**Fix:** Use the statement UUID from the assert response instead of the claim IRI. Same root cause as #4: `assertBatch` doesn't return individual statement IDs.

### 7. Documents mistyped

**Minor:** Both papers are markdown files but registered as `application/pdf` with parser_version `pdf-parse-1.1.1`. The document is correctly stored (53k and 106k chars of text), but the metadata is wrong.

**Fix:** Pass the actual media type (`text/markdown`) and parser version (`markdown-raw`) through the extraction pipeline.

---

## What's NOT a problem

### The papers extract well

GPT-4o correctly identifies the key testable claims from both papers:
- Paper I: 7 claims covering coronal heating, reconnection, magnetar cutoffs, nucleosynthesis, jet power, disk viscosity, and dynamo onset — all with appropriate confidence levels (80-90%) and correct categorization (6 quantitative, 1 comparative, 1 theoretical)
- Paper 0: 3 theoretical claims about the bivector commutator, Lohe equation identification, and KT energy gap — all at 90% confidence

The extraction quality is good. The problem is that the metadata around the extraction is incomplete.

### Donto is working correctly

- Lean engine is attached and responding
- Shape validation runs (14 pass annotations on Paper I's numeric literals)
- Lifecycle function accurately diagnoses every gap
- `donto_why_not_higher()` correctly identifies all 5 blockers per claim
- `donto_auto_validate()` passes all numeric checks
- Bitemporal storage is correct (all statements have open tx_time)
- Context hierarchy is correct (candidate contexts with tp:papers parent)

### The blocker list is accurate

Every blocker reported by `donto_why_not_higher()` is a genuine gap in the evidence chain, not a false positive. The lifecycle is doing its job — it's the extraction pipeline that needs to catch up.

---

## Priority fixes

| Priority | Fix | Impact | Effort |
|----------|-----|--------|--------|
| **P0** | Register `tp:*` predicates | Unblocks maturity 0→1 for all claims | One-time SQL migration |
| **P0** | Switch from `assertBatch` to individual `assert` | Enables all downstream fixes (need statement UUIDs) | Medium — API change |
| **P1** | Create extraction runs | `extracted` stage reaches 100% | Add SQL call to pipeline |
| **P1** | Set confidence via overlay | `confidence_rated` reaches 100% | Use `donto_set_confidence()` |
| **P1** | Link evidence to documents | `source_supported` reaches 100% | Add evidence link calls |
| **P2** | Create spans for text anchoring | `anchored` reaches ~100% | Need sentence boundary detection |
| **P2** | Fix obligation emission | Real obligations appear, `obligations_clear` becomes meaningful | Fix UUID vs IRI mismatch |
| **P3** | Wire arguments between claims | `argued` stage starts filling | Need cross-claim reference detection |
| **P3** | Fix media type for markdown | Correct metadata | Trivial |
