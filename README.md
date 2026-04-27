# toiletpaper

**Upload papers. Extract claims. Simulate physics. Verify truth.**

toiletpaper is an adversarial scientific paper simulator. It takes a research paper, extracts every testable claim using GPT-5.4, runs independent simulations (including a from-scratch MHD solver for physics papers), and produces a claim-by-claim verdict: reproduced, contradicted, or fragile.

Every claim, simulation result, and argument is stored in [donto](https://github.com/thomasdavis/donto) — a bitemporal paraconsistent knowledge graph that tracks what we know, when we learned it, and how confident we are.

## What it does

```
Paper (PDF/Markdown)
  → GPT-5.4 extracts 50-180 structured claims
  → Each claim ingested into donto with evidence substrate
  → Claims triaged: equation / scaling law / numerical prediction / comparative
  → Tier 1: Algebraic checks (dimensional analysis, exponent verification)
  → Tier 2: Real simulations (MHD solver, or Claude Code builds from scratch)
  → Deterministic judge + LLM analysis on every result
  → Verdict per claim: reproduced / contradicted / fragile / underdetermined
  → Everything stored back in donto (arguments, certificates, obligations)
```

## Results

Four papers have been processed:

| Paper | Claims | Reproduced | Contradicted | Fragile |
|-------|--------|------------|--------------|---------|
| Paper 0 — Algebra of Synchronization Failure | 111 | 45 | 32 | 13 |
| Paper I — Astrophysical Bivector Dynamics | 177 | 74 | 46 | 13 |
| KAN: Kolmogorov-Arnold Networks | 102 | 24 | 3 | 18 |
| MEMORA: Harmonic Memory Representation | 58 | 19 | 0 | 0 |

### Key findings

**KAN paper**: Grid scaling claim G^{-4} measured as G^{-1.5} (right direction, wrong magnitude). 100x accuracy claim contradicted (1.4x measured). Catastrophic forgetting claim reproduced — KAN forgets 3.2x vs MLP 171x. Depth advantage reproduced with proper training (was initially contradicted due to insufficient epochs).

**Physics papers**: Reconnection rate v_rec/v_A flattens to ~0.065 at high Lundquist number, independent of S — confirmed by our MHD solver with machine-precision energy conservation (0.000% drift).

**MEMORA paper**: 0 contradictions. Complexity formulas algebraically verified. RAG and KG proved to be special cases of MEMORA by construction.

## Architecture

```
apps/web/              Next.js 15 · React 19 · Tailwind v4 · App Router
packages/db/           Drizzle ORM — papers, claims, simulations (Postgres)
packages/extractor/    PDF parsing · GPT-5.4 claim extraction · 14-step donto ingestion
packages/simulator/    Claim triage · algebraic checks · MHD solver · scientific judge
packages/donto-client/ Typed wrappers for all 30+ dontosrv endpoints
packages/ui/           33-component design system (CVA + tailwind-merge)
```

### MHD Solver

Built from scratch in TypeScript:

- HLL Riemann solver for 8-wave ideal MHD
- Second-order TVD Runge-Kutta with minmod limiter
- Resistive diffusion source terms
- Coriolis + tidal forces for shearing box MRI
- Mean-field alpha-effect for 2D dynamo
- Validated on Orszag-Tang vortex: convergence order 2.29, energy conservation to machine precision

### Donto Integration

Every step of the pipeline writes to donto's evidence substrate:

- **Extraction**: document registration, text revision, agent binding, extraction run provenance
- **Claims**: typed quads with confidence overlay, span anchoring, shape validation
- **Simulation**: verdict quads, argument wiring (supports/rebuts), certificates, proof obligations
- **Lifecycle**: 11-stage maturity tracking from observation to formal verification

## Pages

| Route | Description |
|-------|-------------|
| `/` | Dashboard — papers, claims, simulations, donto stats |
| `/papers` | Paper list with verdict summaries per paper |
| `/papers/:id` | Paper detail with sub-nav: Overview, Report, Annotated, Simulations |
| `/papers/:id/report` | Tabbed verdict report — contradicted claims shown first |
| `/papers/:id/annotated` | Split-pane view: paper text with highlighted claims + margin verdict cards |
| `/papers/:id/simulations` | Filterable simulation results table |
| `/papers/:id/simulations/:simId` | Individual simulation detail with source code viewer |
| `/upload` | Drag & drop PDF/Markdown upload with auto-extraction |
| `/styleguide` | Component reference with design tokens |

### Debug Mode

Toggle "Debug: ON" in the navbar to show raw JSON dumps of all data on every page — papers, claims, simulations, donto responses. Useful for inspecting the pipeline.

## Quick start

```bash
# Prerequisites: Docker, Node 22+, pnpm, Rust (for donto)
git clone https://github.com/thomasdavis/toiletpaper
cd toiletpaper

# Start databases and install
./scripts/setup.sh

# Start dontosrv (separate terminal, from the donto repo)
cd ../donto
DONTO_DSN=postgres://donto:donto@127.0.0.1:55433/donto \
DONTO_BIND=127.0.0.1:7879 \
cargo run -p dontosrv

# Start the web app
cp .env.example .env  # Add your OPENAI_API_KEY
pnpm dev              # http://localhost:3001
```

### Upload a paper

```bash
# Via the web UI
open http://localhost:3001/upload

# Via curl
curl -X POST http://localhost:3001/api/upload \
  -F "file=@paper.pdf;type=application/pdf"
```

### Run simulations

The upload route auto-extracts claims. To run simulations:

```bash
# Via the API (uses MHD solver + LLM triage)
curl -X POST http://localhost:3001/api/simulate \
  -H 'content-type: application/json' \
  -d '{"paper_id":"<id>"}'

# Via Claude Code (builds simulations from scratch)
npx tsx scripts/prep-simulation.ts <paper_id>
cd .simulations/<paper_id>
claude  # "Read spec.md and simulate every testable claim"
npx tsx scripts/ingest-results.ts <paper_id>
```

## Databases

| Service | Port | Purpose |
|---------|------|---------|
| Postgres | 5434 | Papers, claims, simulation results |
| Donto Postgres | 55433 | Knowledge graph quad store |
| dontosrv | 7879 | Donto HTTP sidecar (Rust + optional Lean 4 engine) |

### Donto lifecycle

Each claim progresses through 11 stages:

```
observed → extracted → typed → anchored → confidence_rated →
predicate_registered → shape_checked → source_supported →
obligations_clear → argued → certified
```

Paper I reaches: 100% observed/extracted/typed/confidence/predicates/shapes, 85% certified, 78% argued, 70% anchored/source-supported.

## Design system

33 components with an academic scientific aesthetic:

- **Typography**: Serif headings (Georgia), monospace data, sans-serif body
- **Colors**: Paper whites (#FAFAF8), charcoal ink (#1A1A1A), slate blues (#4A6FA5), forest greens (#2D6A4F), brick reds (#9B2226), ochre ambers (#B07D2B)
- **Verdict colors**: Green (reproduced), red (contradicted), amber (fragile/inconclusive), gray (untested)
- **Help tooltips**: "?" icons throughout explaining technical concepts

View the styleguide at `/styleguide`.

## Three-reviewer audit

The KAN paper results were audited by three independent agents:

- **Hostile Reviewer** (senior ML professor): Found threshold gerrymandering, wrong test functions, single-seed non-reproducibility
- **Paper Author** (simulated Ziming Liu): Pointed out unfair tests — PDE-specific claims tested on function fitting, missing grid extension with coefficient transfer
- **Systems Auditor**: Found critical claim-index mapping bug (results attributed to wrong claims), verdict information loss ("fragile" collapsed to "inconclusive")

All findings were fixed. The claim mapping now uses text matching, fragile verdicts are preserved, conflicting verdicts show warnings.

## Project stats

| Metric | Value |
|--------|-------|
| TypeScript files | 112 |
| Lines of code | 14,485 |
| UI components | 33 |
| API routes | 13 |
| Pages | 8 |
| MHD solver lines | 1,343 |
| Papers processed | 4 |
| Total claims tested | 448 |
| Integration test lines | 650 |

## Tech stack

Next.js 15 · React 19 · Tailwind CSS v4 · Drizzle ORM · PostgreSQL 16 · OpenAI GPT-5.4 · donto (bitemporal quad store) · Turborepo · pnpm · Vitest · TypeScript 5.7

## License

MIT
