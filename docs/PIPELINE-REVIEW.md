# Toiletpaper Pipeline Review — May 2026

## Executive Summary

We ran 4 papers through the full toiletpaper pipeline over the last 24 hours. The system extracted 137 claims total, built ~35 simulation scripts from scratch, and produced verdicts for all claims. The pipeline works end-to-end but has clear areas for improvement.

**Results across 4 papers:**

| Paper | Claims | Reproduced | Contradicted | Fragile | Undetermined | Extraction Model |
|-------|--------|-----------|-------------|---------|--------------|-----------------|
| Kuramoto Synchronization | 12 | 4 | 0 | 4 | 4 | Grok 3 mini |
| Riemannian Manifold Learning | 10 | 7 | 1 | 1 | 1 | Grok 3 mini |
| Continual Learning (v2) | 61 | 22 | 3 | 9 | 27 | GPT-5.5 |
| Cross-Modal Binding | 54 | 23 | 5 | 10 | 16 | GPT-5.5 |
| **Totals** | **137** | **56 (41%)** | **9 (7%)** | **24 (18%)** | **48 (35%)** | |

**Key finding:** GPT-5.5 extraction pulls 5-6x more claims than Grok 3 mini (54-61 vs 10-12), which gives much better paper coverage. The "not_simulable/undetermined" rate is still high (~35%) — these are claims Claude Code couldn't test computationally.

---

## Pipeline Flow Assessment

### 1. Upload & Extraction

**What works:**
- File upload to GCS ✓
- PDF and Markdown parsing ✓
- GPT-5.5 via OpenRouter extracts rich claims with predicates, values, units, evidence, and inter-claim relations
- 54-61 claims per paper gives excellent coverage

**Problems:**
- Grok 3 mini extraction was weak (10-12 claims, all `category: "unknown"`) — now fixed by switching to GPT-5.5
- Claims sometimes lack structured fields (predicate, value, unit) which makes triage harder
- No deduplication: uploading the same paper twice creates duplicate entries
- Donto ingest fails silently every time (agent registration postgres error)

**Cost:** ~$0.35/paper with GPT-5.5

### 2. Domain Classification

**What works:**
- Grok 4.1-fast classifies papers correctly (computer_science for ML papers)
- Classification is cached on the paper row — no re-billing on re-simulate

**Problems:**
- Three of four papers show `domain: "unknown"` in the DB — classification only runs during simulation, not during upload
- The domain gate blocked all non-physics papers from simulation entirely (now fixed — general pipeline runs for all domains)

### 3. Simulation via Claude Code

**What works:**
- Claude Code agentically builds complete simulation scripts from scratch
- It reads the spec, assesses testability, writes Python with numpy/scipy/pytorch, runs it, judges results
- Shared library grows across runs (kuramoto.py, lohe.py, riemannian.py, stats.py, sweep.py, continual_learning.py, output.py)
- Discord webhook reporting works
- Results stored in DB and visible on paper pages

**Problems:**
- **Permission deadlocks**: Claude Code frequently gets stuck waiting for permission to run `python3`. Requires `--dangerously-skip-permissions` which is not ideal for production.
- **Timeout issues**: ML training scripts timeout on CPU (300s). Claude Code had to rewrite scripts to reduce epochs/data, which weakens the simulation quality.
- **No GPU access**: All claims requiring significant ML training (the "not_simulable" 35%) can't be tested because there's no GPU. A reduced-scale proxy is used but confidence drops.
- **Session crashes**: Switching Claude accounts kills running sessions. OAuth tokens expire.
- **Not reproducible**: Claude Code's agentic decisions vary between runs. Same paper can get different verdicts.
- **Claim index mismatch**: The ingest script sometimes can't match results back to claims (4 skipped in manifold paper) because Claude Code's claim indexing doesn't always align with the DB order.
- **Single-threaded**: 54 claims take 20+ minutes because they're tested sequentially.

### 4. Donto Integration

**Status: Completely broken in production.**

- `dontosrv` is up and healthy
- Context creation works
- Agent registration fails with `postgres error: db error`
- All papers show `statementCount: 0`
- The "Evidence Chain", "Lifecycle Progress", "Arguments", and "Proof Obligations" sections on paper pages never load

**Root cause:** The dontosrv Postgres database (separate from toiletpaper's) likely doesn't have the `agents` table or has a schema version mismatch.

### 5. Web UI

**What works:**
- Paper list and detail pages render
- Claim cards with verdicts display correctly
- Domain badge shows
- Paper status lifecycle works

**Problems:**
- Donto sections always show "Loading..." (ingest broken)
- Live simulation streaming deployed but untested (DB table created, needs next image build)
- No way to trigger simulation from the UI (must use CLI or API)
- Duplicate papers clutter the list

---

## Shared Simulation Library

The library at `.simulations/lib/` now contains:

| Module | Description | Added by |
|--------|-------------|----------|
| `kuramoto.py` | Kuramoto/Lohe oscillator solvers, order parameter, coupling sweeps | Kuramoto paper |
| `lohe.py` | Lohe model on S^{d-1}, tangent-space projection | Crossmodal paper |
| `riemannian.py` | Riemannian exp/log maps, geodesic distance, parallel transport | Manifold paper |
| `continual_learning.py` | Split-MNIST/Fashion-MNIST data loaders, EWC implementation | Continual learning paper |
| `sweep.py` | Parameter sweeps, scaling law fitting, convergence tests | Seeded manually |
| `stats.py` | Bootstrap CI, Cohen's d, seed averaging, permutation tests | Seeded manually |
| `output.py` | Standardized result formatting for results.json | Seeded manually |

Each new paper run checks this library first and reuses existing code. The library grows organically.

---

## Improvement Recommendations

### P0 — Critical (blocks quality)

1. **Fix Donto ingest**
   - Root cause the `agents/register` postgres error on production dontosrv
   - Likely needs a schema migration on the donto postgres instance (port 55433)
   - Without this, the evidence substrate, arguments, and proof obligations are all dead

2. **GPU-enabled simulation environment**
   - Current: CPU-only, 120s timeout, reduced data → weak ML verdicts
   - Target: GPU instance (T4 or A100) with 10-minute budget per claim
   - Would convert most "not_simulable" verdicts into real results
   - Could use Cloud Run Jobs with GPU or a dedicated GCE instance

3. **Fix claim index alignment in ingest-results.ts**
   - Claude Code sometimes groups claims (e.g. "Claim 1,7" in one script)
   - The ingest script does simple index matching which fails
   - Fix: match by claim text similarity instead of index

### P1 — Important (improves reliability)

4. **Run classification at upload time, not simulation time**
   - Users see `domain: "unknown"` until they simulate
   - Cheap to classify during upload (one Grok call)

5. **Deduplication on upload**
   - Hash the file content (SHA-256)
   - Reject or link to existing paper if hash matches

6. **Parallel claim simulation**
   - Current: sequential (20+ min for 54 claims)
   - Target: batch claims into groups, run multiple Claude Code sessions or generate all scripts first then run in parallel
   - Alternative: use the PRD-006 async job pipeline

7. **Reproducibility via seed pinning**
   - Add seed requirements to the spec
   - Store seeds in results.json
   - Re-run with same seeds for consistency checking

8. **Better timeout handling**
   - Detect when a script is timing out and have Claude Code retry with reduced parameters automatically
   - Store partial results rather than losing them entirely

### P2 — Nice to have (improves experience)

9. **Simulate button in UI**
   - Currently must use CLI or curl
   - Add a button on the paper page that triggers `/api/simulate`
   - Show live progress via the simulation stream component

10. **Re-run specific claims**
    - If a verdict is "underdetermined", let the user re-trigger just that claim with more compute budget

11. **Cost tracking per paper**
    - Log OpenRouter API spend (extraction, triage, classification)
    - Log Claude Code token usage
    - Show on paper page: "This analysis cost $X.XX"

12. **Confidence calibration**
    - Track whether "reproduced" verdicts are actually correct over time
    - Build a calibration curve: does "confidence: 0.9" mean 90% accuracy?

13. **Comparative paper analysis**
    - Two papers making contradicting claims about the same phenomenon
    - Show a diff: "Paper A says X, Paper B says Y, our simulation shows Z"

### P3 — Future vision

14. **Automated paper ingestion from arXiv**
    - Watch specific arXiv categories
    - Auto-upload, extract, simulate, report
    - Daily/weekly digest of findings

15. **Simulation code review**
    - After Claude Code writes a simulation, have a second agent review it for correctness
    - Flag obvious errors (wrong loss function, incorrect metric, off-by-one in indexing)

16. **Community verdicts**
    - Let users vote on whether they agree with a verdict
    - Flag questionable simulations for manual review

---

## Architecture Notes

### Current LLM routing:
- **Extraction:** GPT-5.5 via OpenRouter (~$0.35/paper)
- **Classification + Triage + Judging:** Grok 4.1-fast via OpenRouter (~$0.02/call)
- **Simulation codegen:** Claude Code CLI (`claude --print --dangerously-skip-permissions`)

### Data stores:
- **Toiletpaper Postgres** (Cloud SQL): papers, claims, simulations, replication_units, simulation_logs, router_decisions
- **Donto Postgres** (Cloud SQL): bitemporal quad store (BROKEN — ingest fails)
- **GCS**: uploaded paper files
- **`.simulations/` directory**: simulation scripts, results.json, shared library (local only — not persisted to cloud)

### Deploy:
- Cloud Run (us-central1)
- Cloud Build for images
- GCP Secret Manager for keys
- `apex.toml` stack manifest (not yet wired to `apex stack deploy`)

---

## What Went Well

1. **GPT-5.5 extraction is excellent** — 5-6x more claims with better structure
2. **Claude Code agentic simulation actually works** — it builds real, runnable code from scratch
3. **The shared library pattern is powerful** — each paper enriches the toolkit for future papers
4. **Discord reporting gives instant visibility** into what the system found
5. **The verdicts are scientifically meaningful** — contradictions found real issues (e.g. EWC claims, speedup claims)

## What Didn't Work

1. **Donto is completely broken in production** — zero evidence substrate
2. **CPU-only simulation is too weak** for ML papers — 35% of claims can't be tested
3. **Permission/auth issues wasted hours** — Claude OAuth expired, permission deadlocks, torch version mismatches
4. **The "old code on deployed image" problem** — every code change requires a full rebuild/deploy cycle
5. **No automated pipeline** — everything was manual (upload via curl, simulate via CLI, deploy via gcloud)
