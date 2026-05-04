# Toiletpaper Improvement Plan

Distilled from external review. Ordered by impact.

---

## 1. Cloud Run GPU for ML Claims

The "not simulable" rate is 35-65% and it's almost entirely because ML papers need GPU training. Cloud Run Jobs now supports L4 GPUs (24GB VRAM). This is the single highest-impact change.

**Implementation:**
- Split simulation into two paths in `simulate-paper.ts`:
  - CPU path: algebraic checks, statistical tests, parameter sweeps (<2min)
  - GPU path: ML training, deep learning experiments (up to 30min on L4)
- The replication blueprint (see #3) determines which path each claim group needs
- CPU claims run immediately on Cloud Run; GPU claims dispatch to Cloud Run Jobs
- Results merge back into the same results.json + ingest pipeline

**Expected impact:** Cut "not simulable" from ~45% to ~15% (the remainder being truly theoretical/proof claims).

---

## 2. Stable Claim IDs (Kill Levenshtein Matching)

The fuzzy text matching between Claude Code's results and the DB is lossy (20-40% miss rate). The fix: every claim gets a stable ID at extraction time, and the spec.md passes those IDs to the agent.

**Implementation:**
- In `simulate-paper.ts`, the spec.md already lists claims. Add explicit IDs:
  ```
  ### Claim 1 [claim_id: 7a3f2b01-...]
  ```
- Update the spec instructions to require results.json to reference `claim_id`, not `claim_index`
- Update `ingest-results.ts` to match on `claim_id` first, fall back to Levenshtein only for legacy results
- The ID chain becomes: `paper_id → claim.id (uuid) → simulation.claim_id (FK)`

**Expected impact:** Ingest match rate goes from ~65% to ~98%.

---

## 3. Replication Blueprint Layer

Don't let the coding agent jump from paper to code. Add an intermediate planning artifact that can be reviewed, cached, and improved independently.

**Implementation:**
- Add a new step in `simulate-paper.ts` between spec writing and Claude Code invocation
- Use Grok 4.1-fast to generate a `replication_plan.json`:
  ```json
  {
    "claim_clusters": [
      {
        "claims": ["claim_001", "claim_002", "claim_005"],
        "test_strategy": "independent_implementation",
        "required_data": "Split-MNIST via torchvision",
        "compute_tier": "gpu",
        "expected_outputs": ["accuracy", "backward_transfer", "seed_sensitivity"],
        "invalid_shortcuts": ["do not use fewer than 3 seeds", "must compare to EWC baseline"],
        "minimum_valid_test": "Train 5-task split on ≥1000 samples per task"
      }
    ]
  }
  ```
- Store the blueprint in the DB (new `replication_plans` table or as JSONB on `simulation_jobs`)
- Pass the blueprint to Claude Code alongside the spec — the agent follows the plan rather than inventing its own
- The blueprint is viewable in the UI as a new "Plan" tab

**Expected impact:** More consistent simulations across runs. Cacheable plans. Human-reviewable before execution.

---

## 4. Evidence Grading on Verdicts

A single verdict label ("reproduced") is misleading when the evidence is a 2-epoch proxy simulation on synthetic data. Add an evidence grade alongside the verdict.

**Implementation:**
- Add two fields to the `simulations` table:
  - `evidence_mode`: "exact_artifact" | "independent_implementation" | "proxy_simulation" | "static_check" | "formal_proof" | "insufficient"
  - `limitations`: text[] (e.g., ["synthetic data", "reduced epochs", "cpu-scale only"])
- Update the spec.md instructions to require Claude Code to classify its own evidence mode
- Update the results.json schema:
  ```json
  {
    "claim_id": "...",
    "verdict": "fragile",
    "evidence_mode": "proxy_simulation",
    "limitations": ["synthetic data", "3 epochs instead of 100", "single seed"],
    "confidence": 0.58
  }
  ```
- Display in the UI: verdict badge + evidence grade pill + limitations tooltip
- The Findings panel groups by evidence strength, not just verdict

**Expected impact:** Honest communication of uncertainty. Prevents overclaiming. A "reproduced via proxy simulation" is clearly weaker than "reproduced via independent implementation."

---

## 5. Split "Not Simulable" into Categories

"Not simulable" is a catch-all that hides useful information. Break it into specific reasons.

**Implementation:**
- Replace `not_simulable` with specific categories in the verdict enum or as a `not_evaluated_reason` field:
  - `no_data` — required dataset unavailable
  - `no_code` — method description insufficient to implement
  - `compute_unavailable` — needs GPU/TPU/cluster not available
  - `theoretical_claim` — requires formal proof, not simulation
  - `observational_claim` — requires real-world data collection
  - `insufficient_detail` — paper doesn't specify enough to test
  - `out_of_scope` — modality not supported (e.g., wet lab, clinical trial)
- Update Claude Code's spec instructions to classify why a claim can't be tested
- Display in the UI with specific icons and explanations per category
- Track distribution over time: "62% of untested claims are compute-limited" → justifies GPU investment

**Expected impact:** Actionable data on what to build next. Users understand WHY a claim wasn't tested.

---

## 6. Adversarial Code Review Agent

After Claude Code writes simulations, a second agent reviews the code before verdicts are trusted.

**Implementation:**
- After `results.json` is written but before ingest, invoke a review agent:
  ```bash
  claude -p "Review the simulation code in this directory. For each script, check:
    1. Does the code test the actual claim (not a strawman)?
    2. Is the metric correct?
    3. Is the baseline fair?
    4. Is there data leakage?
    5. Is the reduced compute so aggressive that the result is meaningless?
    6. Did it convert a theoretical claim into an invalid simulation?
    Write review.json with per-claim assessments and confidence adjustments."
  ```
- The reviewer can downgrade verdict confidence or flag issues
- Store `review.json` alongside `results.json`
- Display reviewer notes in the claim drawer
- Add a "Reviewed" badge to claims that passed adversarial review

**Expected impact:** Catch false contradictions before they're published. The most important safety net.

---

## 7. Shared Library Governance

The organic library growth is powerful but risky — a buggy helper silently biases future verdicts.

**Implementation:**
- Add a `lib/MANIFEST.json` tracking each module:
  ```json
  {
    "kuramoto.py": {
      "state": "tested",
      "added_by_paper": "ba1101be-...",
      "has_tests": true,
      "last_reviewed": null,
      "functions": ["order_parameter", "kuramoto_step", "sweep_coupling"]
    }
  }
  ```
- States: `generated` → `tested` → `reviewed` → `blessed`
- Claude Code spec instructions: "Only import `blessed` modules by default. `generated` modules require explicit justification."
- Add a `scripts/test-lib.ts` that runs pytest on all library modules
- Track which library functions influenced which verdicts (store in simulation metadata)

**Expected impact:** Prevents error propagation across papers. Enables trust auditing.

---

## 8. Store All Generated Artifacts in DB/GCS

Simulation scripts only exist on the local machine. They need to be in GCS so the Code tab works on Cloud Run and verdicts are auditable.

**Implementation:**
- After Claude Code finishes, in `simulate-paper.ts`:
  ```typescript
  // Upload all simulation artifacts to GCS
  const artifacts = readdirSync(workDir).filter(f => f.endsWith('.py') || f.endsWith('.json'));
  for (const f of artifacts) {
    await putObject(UPLOADS_BUCKET, `simulations/${paperId}/${f}`, readFileSync(join(workDir, f)), 'text/plain');
  }
  ```
- Store artifact manifest in `simulation_jobs.metadata`
- Update the Code tab's source endpoint to read from GCS instead of local filesystem
- Include: spec.md, paper.md, replication_plan.json, all .py scripts, results.json, review.json, session JSONL

**Expected impact:** Code tab works in production. Full audit trail. Reproducible verdicts.

---

## 9. Hybrid Templates + Agents for Common Claim Types

Use pre-built templates for common claim patterns; agents for novel ones.

**Implementation:**
- Identify the most common claim types from existing runs:
  - Metric recomputation ("achieves X% accuracy")
  - Baseline comparison ("outperforms Y by Z%")
  - Scaling law ("scales as O(n^k)")
  - Ablation study ("removing component X reduces performance by Y%")
  - Statistical significance ("p < 0.05, effect size d = 0.8")
  - Dimensional analysis ("units are consistent")
  - Seed sensitivity ("results hold across N seeds")
- For each, create a Python template in `lib/templates/`:
  ```python
  # templates/metric_recomputation.py
  def test_metric_claim(
      model_fn, dataset_fn, metric_fn,
      claimed_value, tolerance=0.05, n_seeds=3
  ):
      results = [run_with_seed(model_fn, dataset_fn, metric_fn, seed=s) for s in range(n_seeds)]
      mean = np.mean(results)
      return {
          "verdict": "reproduced" if abs(mean - claimed_value) / claimed_value < tolerance else "contradicted",
          "measured": mean, "expected": claimed_value,
          "seed_std": np.std(results)
      }
  ```
- The replication blueprint (step #3) maps claims to templates where possible
- Claude Code fills in the template parameters rather than writing from scratch
- Novel claim types still get full agentic codegen

**Expected impact:** Faster, cheaper, more consistent verdicts for common claims. Agents focus on hard cases.

---

## 10. Calibration Suite

Build a gold-standard test set to measure and improve verdict accuracy.

**Implementation:**
- Create `test/calibration/` with four tracks:
  1. **Known-good papers** — papers with verified, correct results. System should reproduce.
  2. **Seeded-bug papers** — correct papers with one deliberately wrong claim each. System should catch.
  3. **Synthetic papers** — generated from known ground-truth simulations (like the crocodile paper). Full control.
  4. **Community benchmarks** — run on CORE-Bench or PaperBench tasks for external comparison.
- Track metrics:
  - Extraction precision/recall
  - Verdict accuracy (reproduced when should be, contradicted when should be)
  - **False contradiction rate** (most important — wrong "contradicted" damages trust)
  - False reproduction rate
  - Cost per valid verdict
  - Time per valid verdict
- Run calibration suite on every major code change
- Publish calibration results alongside production verdicts

**Expected impact:** Measurable quality. Can quote: "Our false contradiction rate is X%." Enables systematic improvement.

---

## Summary: Implementation Order

| # | Change | Effort | Impact |
|---|--------|--------|--------|
| 2 | Stable claim IDs | Small | High — fixes 35% ingest failures |
| 5 | Split "not simulable" categories | Small | Medium — actionable diagnostics |
| 4 | Evidence grading on verdicts | Small | High — honest uncertainty |
| 8 | Store artifacts in GCS | Medium | High — auditable, Code tab works |
| 1 | Cloud Run GPU | Medium | Very High — cuts not-simulable by 2/3 |
| 3 | Replication blueprint | Medium | High — consistency, reviewability |
| 6 | Adversarial review agent | Medium | Very High — safety net |
| 7 | Library governance | Small | Medium — prevents error propagation |
| 9 | Hybrid templates | Large | High — speed + consistency |
| 10 | Calibration suite | Large | Very High — measurable quality |

Do #2, #5, #4 first (small, high impact). Then #8, #1 (medium, unblocks production use). Then #3, #6 (the quality leap). Then #7, #9, #10 (the maturity leap).
