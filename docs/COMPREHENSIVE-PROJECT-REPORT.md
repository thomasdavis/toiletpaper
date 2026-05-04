# Toiletpaper: Comprehensive Project Report

**Date:** May 2026
**Purpose:** External review — seeking criticism, ideas, and comparable projects

---

## 1. What Toiletpaper Is

Toiletpaper is an automated scientific paper reproducibility engine. You upload a research paper (PDF or Markdown), and the system:

1. **Extracts** every testable claim using GPT-5.5
2. **Ingests** structured assertions into a bitemporal knowledge graph (Donto)
3. **Simulates** each claim by having Claude Code agentically write and run verification code from scratch
4. **Judges** results and assigns verdicts: reproduced, contradicted, fragile, undetermined, or not simulable
5. **Reports** findings via a web UI and Discord

The core insight is that an AI coding agent — given a paper's claims, evidence, and the full source text — can build independent computational experiments to check whether the claims hold up. It doesn't trust the paper's own analysis; it reconstructs the experiment from scratch.

### Production Stats (as of May 2026)

| Metric | Value |
|--------|-------|
| Papers processed | 7 |
| Total claims extracted | 580+ |
| Claims with verdicts | 400+ |
| Reproduced | ~160 (40%) |
| Contradicted | ~23 (6%) |
| Fragile | ~43 (11%) |
| Not simulable | ~174 (43%) |
| Simulation scripts generated | ~60 Python files |
| Shared library modules | 10 reusable Python packages |
| Lines of generated simulation code | ~15,000+ |
| Donto knowledge graph statements | ~3,000+ |

### The Stack

```
┌─────────────────────────────────────────────────────┐
│                   Web UI (Next.js 15)                │
│  React 19 · Tailwind v4 · App Router · SSE streams  │
├─────────────────────────────────────────────────────┤
│                    API Layer                          │
│  15 REST endpoints · Cloud Run · GCS uploads         │
├──────────────┬──────────────┬───────────────────────┤
│  Extraction  │  Simulation  │    Knowledge Graph     │
│  GPT-5.5 via │  Claude Code │    Donto (Rust)        │
│  OpenRouter  │  CLI agent   │    808+ stmts/paper    │
├──────────────┴──────────────┴───────────────────────┤
│               Postgres (Drizzle ORM)                 │
│  8 tables · 6 enums · bitemporal in Donto            │
├─────────────────────────────────────────────────────┤
│           Infrastructure (GCP / Apex)                │
│  Cloud Run · Cloud SQL · GCS · Secret Manager        │
│  Cloud Build · apex.toml stack manifest              │
└─────────────────────────────────────────────────────┘
```

---

## 2. Architecture Deep Dive

### 2.1 Data Model

**Primary Postgres** (8 tables):
- `papers` — metadata, domain classification, extraction provenance
- `claims` — extracted claims with structured fields (predicate, value, unit, evidence, testability)
- `simulations` — verdict results linked to claims
- `router_decisions` — audit log of which simulators were considered
- `paper_donto_ingest` — per-paper Donto ingest state tracking
- `simulation_jobs` — async work queue (PRD-006)
- `replication_units` — PRD-009 Donto-native replication plans
- `simulation_logs` — real-time Claude Code session events for live streaming

**Donto Knowledge Graph** (separate Postgres, accessed via Rust HTTP sidecar):
- Bitemporal quad store (subject, predicate, object, context + valid_time + transaction_time)
- ~808 statements per paper (7 quads/claim average)
- Evidence chains, arguments, proof obligations, certificates
- Shape validation and lifecycle state machine

### 2.2 The Pipeline (End to End)

```
User uploads PDF/MD
       │
       ▼
┌─────────────────┐     ┌──────────────────┐
│  pdf-parse       │────▶│  GPT-5.5 via      │
│  (text extract)  │     │  OpenRouter        │
└─────────────────┘     │                    │
                        │  Extracts:         │
                        │  - title, authors  │
                        │  - 50-120 claims   │
                        │  - relations       │
                        │  - predicates      │
                        │  - values + units  │
                        └────────┬───────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  Donto Ingest (16 steps) │
                    │                          │
                    │  register doc → assert   │
                    │  quads → spans → args →  │
                    │  obligations → certify   │
                    │  (~600 statements)        │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  Domain Classification   │
                    │  Grok 4.1-fast           │
                    │  (16 domains)            │
                    └────────────┬─────────────┘
                                 │
              ┌──────────────────┴──────────────────┐
              │                                     │
        Physics domain                      Any domain
              │                                     │
    ┌─────────▼─────────┐            ┌──────────────▼──────────────┐
    │  MHD Simulations   │            │  Claude Code Agent          │
    │  (deterministic)   │            │  (agentic code generation)  │
    │                    │            │                              │
    │  Harris sheet      │            │  Reads spec.md + paper.md   │
    │  MRI shearing box  │            │  + Donto statements         │
    │  Dynamo onset      │            │  + shared library           │
    └─────────┬──────────┘            │                              │
              │                       │  Writes Python from scratch  │
              │                       │  Runs experiments            │
              │                       │  Judges results              │
              │                       │  Extracts reusable code      │
              │                       │  Sends Discord report        │
              │                       └──────────────┬───────────────┘
              │                                      │
              └──────────────┬───────────────────────┘
                             │
                    ┌────────▼────────┐
                    │  Result Ingest   │
                    │                  │
                    │  Fuzzy matching  │
                    │  (Levenshtein)   │
                    │  → simulations   │
                    │  → Donto verdicts│
                    │  → arguments     │
                    │  → certificates  │
                    └────────┬─────────┘
                             │
                    ┌────────▼────────┐
                    │  Web UI          │
                    │                  │
                    │  Sidebar layout  │
                    │  Findings panel  │
                    │  Claims table    │
                    │  Code viewer     │
                    │  Session log     │
                    │  Evidence graph  │
                    └─────────────────┘
```

### 2.3 LLM Model Routing

| Task | Model | Provider | Cost |
|------|-------|----------|------|
| Claim extraction | GPT-5.5 | OpenRouter | ~$0.35/paper |
| Domain classification | Grok 4.1-fast | OpenRouter | ~$0.02/call |
| Claim triage | Grok 4.1-fast | OpenRouter | ~$0.02/batch |
| Simulation codegen | Claude Code CLI | Anthropic (OAuth) | ~$2-5/paper |
| MHD analysis | Grok 4.1-fast | OpenRouter | ~$0.02/call |
| Result judging | Grok 4.1-fast | OpenRouter | ~$0.02/call |

**Total cost per paper: ~$3-6** (dominated by Claude Code session)

---

## 3. The Code Generation System (Deep Dive)

This is the heart of toiletpaper and the most architecturally interesting part. The system doesn't use a single LLM API call to generate simulation code — it invokes Claude Code as a fully autonomous coding agent that reads the paper, reasons about what to test, writes code from scratch, runs it, debugs errors, and iterates until it has results.

### 3.1 Current Architecture

The code generation pipeline lives in `scripts/simulate-paper.ts` and works in phases:

**Phase 1: Context Assembly**
```
For each paper, the system assembles maximum context:
├── spec.md (the simulation specification)
│   ├── Paper metadata (title, authors, abstract)
│   ├── Full paper source text (paper.md)
│   ├── Donto knowledge graph statements (up to 200 triples)
│   ├── All extracted claims with:
│   │   ├── Claim text
│   │   ├── Category (quantitative/comparative/causal/etc.)
│   │   ├── Confidence score
│   │   ├── Predicate (e.g., "achieves_accuracy", "outperforms")
│   │   ├── Value + unit (e.g., "92.2%", "18.6 km")
│   │   ├── Evidence quote from the paper
│   │   └── Donto IRI (link to knowledge graph)
│   ├── Shared simulation library inventory
│   │   └── List of all .py modules with descriptions
│   ├── Simulation instructions
│   │   ├── Testability categories
│   │   ├── Code requirements (baseline + proposed models)
│   │   ├── Convergence testing requirements
│   │   ├── Result schema (results.json format)
│   │   └── Library extraction instructions
│   └── Discord reporting instructions
└── paper.md (full original paper text)
```

**Phase 2: Agent Invocation**
```bash
claude --print -p "<prompt>" --dangerously-skip-permissions
```

The agent runs for up to 60 minutes with full filesystem access. It can:
- Read any file in the workspace
- Write Python scripts
- Execute them with `python3`
- Read outputs and iterate
- Import from the shared library
- Self-correct on errors

**Phase 3: Autonomous Simulation Building**

Claude Code typically follows this pattern (observed across 7 paper runs):

1. Reads spec.md and paper.md to understand the paper
2. Categorizes each claim by testability
3. Groups related claims that can share infrastructure
4. Checks the shared library for existing utilities
5. Writes simulation scripts (typically 3-8 per paper):
   - Each script tests 1-5 related claims
   - Always implements both baseline and proposed models
   - Includes convergence checks and sanity tests
6. Runs each script, checks output
7. If a script fails: reads the error, edits the code, re-runs
8. Collects all results into results.json
9. Extracts reusable functions into the shared library
10. Sends a Discord report with analysis

**Phase 4: Result Collection**

If the agent completes normally, `simulate-paper.ts`:
- Reads results.json
- Delegates to `ingest-results.ts` for fuzzy claim matching
- Stores verdicts in Postgres
- Ingests verdict quads into Donto (batch assertions)
- Wires arguments (supports/rebuts) between verdict and claim statements
- Updates confidence scores and attaches certificates
- Emits proof obligations for fragile claims

If the agent times out:
- Attempts to collect partial results from `results_*.json` files
- Runs any `collect_results.py` script the agent may have written
- Sends a fallback Discord notification

### 3.2 The Shared Simulation Library

A key design decision: simulation code is not disposable. Each paper run contributes reusable modules to `.simulations/lib/`, which future runs can import. The library currently contains:

| Module | Lines | Domain | Key Functions |
|--------|-------|--------|---------------|
| `kuramoto.py` | 85 | Physics | `order_parameter()`, `kuramoto_step()`, `sweep_coupling()` |
| `lohe.py` | 165 | ML/Physics | `LoheSync` layer, `ModalityEncoder`, `cross_modal_retrieval()` |
| `riemannian.py` | 141 | Geometry | `exp_map_sphere()`, `RotationalAdamW`, `gegenbauer_coefficients()` |
| `continual_learning.py` | 233 | ML | `SmallMLP`, `train_with_ewc()`, `run_sequential_experiment()` |
| `symbiogenesis.py` | 319 | ML | `FusedMLP`, `sequential_fusion()`, `train_progressive()` |
| `spectral_genomics.py` | ~200 | Biology | `compute_hks()`, `simple_gw_distance()`, `generate_diploid_pair()` |
| `telemetry.py` | 153 | Ecology | `segmented_regression()`, `logistic_disturbance_model()` |
| `sweep.py` | 85 | General | `parameter_sweep()`, `fit_scaling_law()`, `convergence_test()` |
| `stats.py` | 95 | General | `bootstrap_ci()`, `cohens_d()`, `permutation_test()` |
| `output.py` | 40 | General | `make_result()`, `write_results()` |

The spec.md explicitly tells Claude Code to check the library first and import rather than rewrite. Over time, the library becomes increasingly comprehensive — a Kuramoto paper benefits the next synchronization paper; a continual learning paper builds infrastructure for future ML papers.

### 3.3 What Works Well

1. **The agent genuinely builds real experiments.** For the continual learning paper, it wrote 643 lines of PyTorch implementing the full Symbiogenesis architecture from scratch — training on Split-MNIST, measuring backward transfer, sweeping EWC hyperparameters across 6 lambda values.

2. **It self-corrects.** When scripts fail (missing imports, wrong tensor shapes, timeout), the agent reads the error, edits the code, and retries. The session logs show 2-5 iterations per script on average.

3. **Domain adaptation without explicit programming.** The same system handled:
   - Kuramoto oscillator dynamics (physics/math)
   - Continual learning with neural architecture search (ML)
   - Cross-modal binding on hyperspheres (neuroscience/ML)
   - Estuarine crocodile telemetry (ecology/statistics)
   - Spectral-geometric genomic relatedness (bioinformatics)
   
   No domain-specific configuration was needed.

4. **The shared library compounds.** Each run adds ~1-2 modules. By the 7th paper, the agent could import from 10 existing modules instead of rebuilding common utilities.

5. **Contradiction detection is valuable.** The crocodile paper (synthetic/fabricated data) got 7 contradictions — the system caught that simulated statistics didn't match claimed values. The continual learning paper's progressive unfreezing speedup claims (30-51%) were contradicted by measured ~0% speedup.

### 3.4 What Doesn't Work Well

1. **CPU-only execution.** ML papers need GPU training but Cloud Run doesn't have GPUs. The agent must reduce epochs/data to fit in 120s per script, weakening the simulation quality. 35-43% of claims end up "not simulable" — largely because proper testing would require GPU compute.

2. **60-minute timeout.** Papers with 100+ claims push against the timeout. The agent prioritizes but can't test everything. Partial result recovery helps but isn't ideal.

3. **Non-deterministic.** The same paper can get different verdicts on re-run because Claude Code makes different design decisions (different model architectures, different parameter ranges, different convergence criteria).

4. **Theoretical claims aren't testable.** Claims like "knowledge distillation conveys log2(K) times more information per example than hard labels" require formal proofs, not simulations. The system correctly classifies these as "not simulable" but can't verify them.

5. **Claim matching is lossy.** Claude Code's results.json uses claim text that may differ from the DB's extraction text. The Levenshtein fuzzy matching catches ~60-80% but misses ~20-40% (especially generic/theoretical claims).

### 3.5 The Ideal Code Generation Architecture (Vision)

To handle arbitrary scientific papers at scale, the code generation system needs to evolve significantly:

**Multi-stage agent pipeline:**
```
Stage 1: Paper Comprehension Agent
  └─ Reads full paper, builds a structured understanding
  └─ Identifies methodology, experimental setup, key results tables
  └─ Maps claims to specific figures/tables in the paper
  └─ Outputs a "replication blueprint" — not code, but a plan

Stage 2: Environment Provisioner
  └─ Reads the blueprint, determines compute requirements
  └─ Spins up appropriate environment (CPU, GPU, TPU)
  └─ Installs domain-specific packages (PyTorch, JAX, R, Julia, MATLAB)
  └─ Downloads required datasets (from HuggingFace, OpenML, UCI, etc.)
  └─ Checks if paper's code/data repos are available

Stage 3: Code Generation Agents (parallel, per-claim-group)
  └─ Each agent handles a cluster of related claims
  └─ Has access to the shared library + paper source + data
  └─ Generates code with explicit test harnesses
  └─ Includes convergence tests and statistical significance checks
  └─ Runs in isolated sandboxed environments

Stage 4: Adversarial Review Agent
  └─ Reviews generated code for correctness
  └─ Checks: right loss function? correct metric? proper train/test split?
  └─ Flags common simulation errors (data leakage, wrong baselines, etc.)
  └─ Can request re-generation with specific corrections

Stage 5: Verdict Synthesis Agent
  └─ Combines results from all claim-group agents
  └─ Weighs evidence: statistical significance, effect sizes, convergence
  └─ Produces a coherent narrative (not just per-claim verdicts)
  └─ Identifies patterns: "all claims about X are fragile because Y"
```

**Dataset integration layer:**
- Auto-detect dataset requirements from paper text
- Fetch from HuggingFace Hub, OpenML, UCI, Kaggle
- Handle licensing and access restrictions
- Cache datasets across paper runs
- Generate synthetic data when real data isn't available (with explicit caveats)

**Compute orchestration:**
- Pool of GPU instances for ML papers
- Spot instances for cost optimization
- Per-claim compute budgets (algebraic: 10s, ML training: 30min, full 3D simulation: 2h)
- Progress streaming back to the UI

**Formal verification layer (for mathematical claims):**
- Integration with Lean 4 or Coq for theorem checking
- Symbolic computation via SymPy for algebraic claims
- Dimensional analysis engine for physics claims
- Unit checking across entire computation chains

**Code quality and reproducibility:**
- Pin all random seeds
- Record exact library versions
- Generate Docker containers per simulation
- Store generated code in the DB (not just local filesystem)
- Support "re-run with different seeds" to check robustness

---

## 4. The Knowledge Graph (Donto Integration)

Donto is a separate Rust project that provides a bitemporal quad store. Toiletpaper uses it as an evidence substrate:

### What gets stored per paper:
- **Document registration** — paper metadata as quads
- **Claim assertions** — 7-9 quads per claim (text, category, evidence, predicate, value, unit, confidence)
- **Evidence spans** — character ranges linking claims to source text
- **Agent provenance** — which model extracted what, when
- **Extraction runs** — versioned extraction sessions
- **Arguments** — supports/rebuts relations between verdict statements and claims
- **Confidence overlays** — updated confidence scores after simulation
- **Certificates** — verification certificates for reproduced claims
- **Proof obligations** — work items for fragile/uncertain claims
- **Shape validation** — structural integrity checks

### Current state:
- Donto ingest now works in production (fixed during this session)
- ~3,000+ statements across 7 papers
- Evidence chains, lifecycle, arguments, and obligations queryable
- The web UI shows Donto data in the Evidence Graph tab

### What Donto enables that a flat DB doesn't:
- **Bitemporal queries** — "what did we believe about this claim at time T?"
- **Argument graphs** — formal attack/support relations between evidence
- **Provenance tracking** — which model/version produced each assertion
- **Obligation scheduling** — automated work queues for uncertain claims
- **Shape validation** — structural integrity checks on the knowledge graph

---

## 5. The Web Interface

### Layout
- **Left sidebar** with grouped navigation (Views / Analysis / Data)
- **Paper detail tabs:** Overview, Findings, Claims, Simulations, Code, Evidence, Session Log
- **Claim drawer:** slide-out panel with full claim detail + simulation results
- **Annotated Paper:** source text with inline claim highlights
- **Full Report:** printable verdict report

### Key design decisions:
- **Contradiction-first information hierarchy.** The Findings tab shows contradicted claims first — these are the most valuable signal.
- **Table over cards.** 74+ claims render as a filterable DataTable, not expanded cards. Detail on click via drawer.
- **Session log replay.** Every Claude Code session is stored and viewable as a timeline — you can watch the AI build simulations in detail.
- **Verdict bar.** A stacked horizontal bar gives instant visual read of paper health.

### What's missing:
- No "Simulate" button — must use CLI or API
- No user authentication or multi-tenancy
- No paper comparison view
- Live simulation streaming not fully working (path encoding issues)
- Code tab shows "source not available" on Cloud Run (scripts are local-only)

---

## 6. Infrastructure & Deployment

### GCP Resources
| Resource | Purpose |
|----------|---------|
| Cloud Run (`toiletpaper-web`) | Next.js web app |
| Cloud Run (`dontosrv`) | Donto HTTP sidecar |
| Cloud SQL (`apex-postgres-staging`) | Both Postgres databases |
| GCS (`apex-494316-source-staging`) | Uploaded paper files |
| Secret Manager | DATABASE_URL, OPENROUTER_API_KEY, DONTO_DSN |
| Cloud Build | Docker image builds |
| Artifact Registry | Container images |

### Deployment flow
1. `git push` to GitHub
2. `gcloud builds submit` with `cloudbuild.yaml`
3. `gcloud run deploy` with secrets + env vars
4. ~4 minute build, ~1 minute deploy

### apex.toml
The project has an `apex.toml` stack manifest compatible with the Apex platform (a from-scratch PaaS built in Rust). This enables declarative deployment with `apex stack deploy`.

---

## 7. Testing

### Integration test suite (`test/integration.test.ts`)
- 60+ test cases across 8 layers
- Covers: PDF parsing, LLM extraction, Donto ingestion, Web API CRUD, full upload flow, evidence substrate, UI pages
- Fixture: graphene-aluminum-composites.pdf

### Manual testing
- 7 papers run through the full pipeline
- Papers span: physics, ML, ecology, genomics, neuroscience
- Results manually verified against paper claims

### What's missing:
- No unit tests for individual components
- No simulation output validation tests
- No regression tests for verdict consistency
- No load testing

---

## 8. Design Documents (PRDs)

9 Product Requirement Documents define the system's architecture:

| PRD | Title | Key Contribution |
|-----|-------|------------------|
| PRD-001 | Domain Classification & Verifier Routing | 16-domain taxonomy, simulator registry, routing audit log |
| PRD-002 | Verdict Semantics | 8-state enum replacing binary confirmed/refuted |
| PRD-003 | Simulator Runtime Hardening | Timeouts, resource limits, sandboxing |
| PRD-004 | Extractor v2 | Structured claim schema with testability scoring |
| PRD-005 | Donto Integration Reliability | Ingest tracking, retry logic, status pill |
| PRD-006 | Async Simulation Pipeline | Job queue, re-runs, partial recovery |
| PRD-007 | Cloud Run Deployment Stability | Declarative config, drift detection |
| PRD-008 | UI Honesty Pass | Verdict display, "why no verdict?" explanations |
| PRD-009 | Donto-Native Replication Planner | ReplicationUnit types, verifier candidates, blocker tracking |

---

## 9. Results: What We Found

### Paper-by-paper summary

| Paper | Domain | Claims | Reproduced | Contradicted | Fragile | Not Simulable |
|-------|--------|--------|-----------|-------------|---------|--------------|
| Kuramoto Synchronization | Physics/ML | 12 | 4 | 0 | 4 | 4 |
| Riemannian Manifold Learning | Math/ML | 10 | 7 | 1 | 1 | 1 |
| Continual Learning (Grok extraction) | ML | 15 | 4 | 4 | 7 | 0 |
| Continual Learning (GPT-5.5) | ML | 61 | 22 | 3 | 9 | 27 |
| Cross-Modal Binding | Neuroscience | 54 | 23 | 5 | 10 | 16 |
| Continual Learning (full, Donto) | ML | 71 | 36 | 0 | 1 | 30 |
| Crocodile Telemetry (synthetic) | Ecology | 74 | 25 | 7 | 5 | 35 |
| Spectral Genomics (PDF) | Bioinformatics | 119 | 32 | 1 | 7 | 79 |

### Key observations:

1. **Extraction model matters enormously.** GPT-5.5 finds 5-6x more claims than Grok 3 mini (54-119 vs 10-15). The deeper extraction also reduces false contradictions.

2. **The "not simulable" rate is the main bottleneck.** 35-65% of claims can't be tested computationally — either they're theoretical (need proofs), require specific hardware (GPU training), or need data that isn't available. This is the biggest area for improvement.

3. **Contradictions are rare but valuable.** Only ~6% of claims are contradicted, but these are the most important findings. The crocodile paper (synthetic data) had the highest contradiction rate (9.5%), which makes sense — it was designed as a test with fabricated results.

4. **"Fragile" is the interesting middle ground.** ~11% of claims are directionally correct but sensitive to parameters, seeds, or methodology. These are the claims that need the most careful review.

5. **The system improves over time.** The shared library means each paper run makes future runs faster and more capable. By the 7th paper, the agent could import from 10 existing modules.

---

## 10. Cost Analysis

### Per-paper costs
| Component | Cost | Notes |
|-----------|------|-------|
| GPT-5.5 extraction | ~$0.35 | 30-50K input tokens, 5K output |
| Grok 4.1-fast (classification + triage) | ~$0.10 | 3-5 API calls |
| Claude Code session | ~$2-5 | 60 min session, depends on complexity |
| Cloud Run compute | ~$0.02 | Cold start + request time |
| Cloud SQL | ~$0.01 | Shared instance |
| **Total per paper** | **~$3-6** | |

### At scale
| Volume | Monthly Cost | Notes |
|--------|-------------|-------|
| 10 papers/day | ~$1,200-1,800 | Current architecture |
| 100 papers/day | ~$12,000-18,000 | Would need GPU pool |
| 1000 papers/day | ~$120,000-180,000 | Would need major architectural changes |

The cost is dominated by Claude Code sessions. Moving to a more structured codegen approach (pre-built simulation templates + targeted LLM calls) could reduce costs 5-10x at the expense of flexibility.

---

## 11. Known Limitations & Open Problems

### Critical limitations
1. **No GPU compute** — ML claims can't be properly tested. 35-65% "not simulable" rate.
2. **Non-deterministic verdicts** — Same paper can get different results on re-run.
3. **No formal verification** — Mathematical proofs and theorems can't be checked.
4. **Single-threaded agent** — 119 claims tested sequentially. Parallelism would help.
5. **Local-only simulation scripts** — Generated code exists on the CLI machine, not in the cloud. Can't view code from the web UI on Cloud Run.

### Open research questions
1. **How do you verify a verification?** If Claude Code writes a simulation that says "reproduced," how do we know the simulation itself is correct?
2. **What counts as "reproduced"?** A 5% tolerance works for physics scaling laws but not for ML accuracy claims where 0.1% matters.
3. **How should theoretical claims be handled?** Formal proof assistants (Lean, Coq) could verify mathematical claims, but integration is complex.
4. **Can you detect p-hacking and data fabrication?** Some contradictions might indicate fraud rather than error. Statistical forensics could be added.
5. **Should the system have domain experts in the loop?** Pure automation misses nuance that a domain expert would catch.

---

## 12. Improvement Roadmap

### P0 — Critical
- [ ] GPU-enabled simulation environment (Cloud Run Jobs with T4/A100)
- [ ] Store generated simulation code in DB/GCS (viewable from web)
- [ ] Adversarial code review agent (check simulation correctness)
- [ ] Parallel claim simulation (multiple Claude Code sessions)

### P1 — Important
- [ ] "Simulate" button in web UI
- [ ] Formal verification for mathematical claims (Lean 4 integration)
- [ ] Dataset auto-detection and fetching (HuggingFace, OpenML)
- [ ] Deterministic simulation mode (pinned seeds, version locking)
- [ ] Paper comparison view ("Paper A says X, Paper B says Y, simulation shows Z")

### P2 — Nice to have
- [ ] arXiv auto-ingestion (watch categories, auto-process new papers)
- [ ] Cost tracking per paper (show in UI)
- [ ] Community verdicts (user voting on whether they agree)
- [ ] Confidence calibration (track accuracy of verdicts over time)
- [ ] Multi-language simulation support (R, Julia, MATLAB)

### P3 — Vision
- [ ] Real-time paper analysis during peer review
- [ ] Integration with journal submission systems
- [ ] Cross-paper analysis ("which papers contradict each other?")
- [ ] Living evidence graphs that update as new papers are published
- [ ] Statistical forensics for fraud detection

---

## 13. Questions for External Review

### Architecture
1. Is the Claude Code agentic approach the right one, or should we use more structured code templates?
2. How should we handle the trade-off between automation and accuracy?
3. Is the shared simulation library approach scalable, or will it become a maintenance burden?

### Product
4. Who is the target user? Researchers? Reviewers? Journals? Funding agencies?
5. Should the system provide confidence intervals on its verdicts?
6. How should we communicate uncertainty? "Not simulable" is honest but unhelpful.

### Competition
7. What existing projects attempt automated paper verification?
8. How does this compare to ReproducibilityChallenge, PapersWithCode, or similar efforts?
9. Are there formal verification approaches (Lean, Coq, Isabelle) being applied to scientific claims?

### Ethics
10. Could this system be used to unfairly reject papers?
11. How do we handle papers where the simulation is wrong but the paper is right?
12. Should authors be notified when their paper is analyzed?

---

## Appendix A: File Inventory

- **252 source files** (excluding node_modules, .next, .git)
- **27 React components**
- **15 API endpoints**
- **9 page routes**
- **8 database tables**
- **10 shared Python modules** (~1,500 lines)
- **~60 generated simulation scripts** (~15,000 lines)
- **9 PRD documents**
- **3 documentation reports**

## Appendix B: Technology Choices

| Choice | Why |
|--------|-----|
| Next.js 15 + React 19 | Server components for data-heavy pages, App Router for clean API routes |
| Tailwind v4 (CSS-first) | No config file, theme in CSS, fast iteration |
| Drizzle ORM | Type-safe schema, push-based migrations, lightweight |
| pnpm workspaces + Turborepo | Monorepo with source-only packages (no build step) |
| Donto (custom Rust) | Bitemporal knowledge graph — nothing off-the-shelf does this |
| Claude Code CLI | Only coding agent that can autonomously build, run, and debug code end-to-end |
| GPT-5.5 via OpenRouter | Best extraction quality at reasonable cost |
| Grok 4.1-fast via OpenRouter | Fast + cheap for classification/triage/judging |
| Cloud Run + Cloud SQL | Simple serverless deploy, managed Postgres |
| GCS | Paper file storage |

## Appendix C: Session Log Sample

A typical Claude Code session for the crocodile paper (67 events):

```
[0s]    user: "Read the simulation spec at spec.md..."
[2s]    thinking: Analyzing 74 claims about crocodile movement ecology...
[5s]    tool_use:Read spec.md
[8s]    tool_use:Read paper.md
[12s]   assistant: "I'll organize the 74 claims into testable groups..."
[15s]   tool_use:Write sim_001_consistency.py (266 lines)
[18s]   tool_use:Bash python3 sim_001_consistency.py
[45s]   tool_result: JSON output with 15 claim verdicts
[48s]   tool_use:Write sim_002_movement.py (542 lines)
[52s]   tool_use:Bash python3 sim_002_movement.py
[120s]  tool_result: JSON output with 32 claim verdicts
[125s]  tool_use:Write sim_003_basking.py (280 lines)
[128s]  tool_use:Bash python3 sim_003_basking.py
[160s]  tool_result: JSON output with 12 claim verdicts
[165s]  tool_use:Write sim_004_aggregate.py (123 lines)
[168s]  tool_use:Bash python3 sim_004_aggregate.py
[175s]  tool_result: Merged 74 results into results.json
[180s]  tool_use:Write lib/telemetry.py (153 lines)
[185s]  tool_use:Bash curl Discord webhook (5 messages)
[195s]  assistant: "All done. 25 reproduced, 7 contradicted, 5 fragile..."
```

Total session: ~3.5 minutes, 67 events, 4 simulation scripts, 1 library module, 1,211 lines of Python.
