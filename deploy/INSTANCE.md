# toiletpaper.dev on the donto instance

This deployment runs `toiletpaper` on the same host and shared donto
substrate as the other repositories on this instance.

## Runtime shape

| piece | value |
|---|---|
| Web service | `toiletpaper-web.service` |
| Donto ingest worker | `toiletpaper-donto-ingest-worker.service` |
| Codex replication worker | `toiletpaper-codex-worker.service` |
| Local port | `3110` |
| Public domain | `toiletpaper.dev`, `www.toiletpaper.dev` |
| App database | `postgres://toiletpaper:...@127.0.0.1:5432/toiletpaper` |
| Donto HTTP sidecar | `http://127.0.0.1:7879` |
| Donto Postgres | the shared `donto` database on the local `donto-pg` container |
| LLM provider | z.ai GLM coding subscription via OpenAI-compatible API |
| Upload storage | `/mnt/donto-data/toiletpaper/uploads` |
| Simulation workdir | `/mnt/donto-data/toiletpaper/simulations` |
| Supplemental artifact bundles | `/mnt/donto-data/toiletpaper/simulations/paper-artifacts` |
| Rich extraction logs | `/mnt/donto-data/toiletpaper/extractions/<paper_id>/` |

## Important deployment decision

Do **not** start the repo's old `toiletpaper-donto-pg` compose service
for this instance. That service was for an isolated development Donto
database on port `55433`. Production here reuses the existing donto
instance:

- `DONTOSRV_URL=http://127.0.0.1:7879`
- `DONTO_DSN=<shared donto DSN for 127.0.0.1:5432/donto>`
- `LLM_BASE_URL=https://api.z.ai/api/coding/paas/v4`
- `LLM_MODEL=glm-4.7`
- `LLM_MAX_TOKENS=4096`
- `LLM_API_KEY_FILE=/etc/donto/glm.key`

The same OpenAI-compatible provider settings are used for claim
extraction, domain classification, simulation planning/codegen, and
LLM result judging. If simulation needs a different lane later, set
`SIMULATOR_LLM_BASE_URL`, `SIMULATOR_LLM_MODEL`, and either
`SIMULATOR_LLM_API_KEY` or `SIMULATOR_LLM_API_KEY_FILE`.

Rich graph extraction runs through `donto-agent` with the local GLM key.
The wrapper treats partial provider output, zero facts, sparse fact
density, and very low anchor coverage as repairable quality failures.
Those chunks are retried, logged as `chunk_quality_retry`, and surfaced
in the UI as repaired/degraded rather than accepted as ordinary
successes. The relevant env knobs are:

- `DONTO_AGENT_RETRY_ATTEMPTS`
- `DONTO_AGENT_MIN_ANCHORED_RATIO`
- `DONTO_AGENT_MIN_FACTS_PER_1K_CHARS`
- `DONTO_AGENT_MIN_STATEMENTS_FOR_ANCHOR_CHECK`

The app still has its own `toiletpaper` Postgres database for papers,
claims, simulations, job state, and UI metadata.

If that read-model database must be rebuilt, inventory and restore it from the
durable Donto revisions plus the simulation workdir:

```bash
set -a; . /etc/toiletpaper-web.env; set +a
pnpm provision:local-db        # idempotently create/repair the local role + DB
pnpm --filter @toiletpaper/db db:push
pnpm recover:local-db          # read-only inventory
pnpm recover:local-db --apply  # idempotent restore; never mutates Donto
```

The recovery preserves every provable paper, compact claim, replication unit,
Codex result, legacy result, and job event. When an original uploaded binary is
not present, it exposes Donto's exact parsed revision as a clearly named
`recovered-<paper-id>.md` source instead of fabricating a PDF.

Full-paper replication is Codex-backed and runs outside the web request
path. `POST /api/simulate` compiles Donto graph statements into
replication units, materializes deterministic placeholder rows, and
queues a `simulation_jobs` row when `CODEX_SIMULATION_ENABLED=1` and
`CODEX_JOB_LAUNCHER=queue`. The `toiletpaper-codex-worker.service`
leases those rows and runs `scripts/run-codex-replication-job.ts`.

Each Codex workdir under
`$SIMULATOR_WORKDIR/codex-full-paper/<paper_id>/<job_id>/` contains
the staged source, `paper-text.txt`, `donto-statements.json`,
`replication-units.json`, deterministic executions,
`supplemental-artifacts.json`, `artifact-gap-manifest.json`,
`artifact-gap-coverage.json`, immutable supplemental artifact copies,
Codex event logs, `progress.json`, and `results.json`. The runner now treats
`donto-statements.json` as the whole-paper substrate and expects one
result per replication unit. If `results.json` omits units, the job is
recorded as partial with missing-unit counts instead of silently
becoming complete.

The paper overview/report pages expose Whole Paper Coverage from the
current read model: persisted `replication_units` joined to current
simulation rows by `replication_unit_id`. `/api/papers/<id>/full` returns
the same data as `wholePaperCoverage`. Replication Readiness counts
`inconclusive` rows with `insufficient` evidence as blocked so missing
raw artifacts remain visible after a successful Codex job.

The same pages expose a Missing Artifact Manifest, also available at
`/api/papers/<id>/artifact-manifest` and as `artifactManifest` on
`/api/papers/<id>/full`. It groups blocked current results into concrete
artifact requests and filters generic boilerplate limitations before
counting request kinds. On the graphene/aluminum smoke paper, the live
manifest reports 85 blocked units and 16 request groups, led by
trajectories, MD input decks, potential files, atomistic structures,
microscopy data, fitting artifacts, source code/scripts, artifact URLs,
datasets, clean source, and Monte Carlo implementation.

Supplemental artifact bundles close that loop. Paper overview/report
pages call `GET /api/papers/<id>/artifact-bundles` to list uploaded
source files and `POST /api/papers/<id>/artifact-bundles` to attach
datasets, scripts, input decks, raw measurements, trajectories, images,
configuration files, and public HTTP(S) artifact URLs. URL imports reject
credentials, non-HTTP schemes, and localhost/private-network addresses.
Bundles are immutable directories with a `manifest.json` recording
original names, sanitized stored names, byte lengths, content types,
notes, source provenance, final fetched URLs/status, and SHA-256 hashes.
Individual files are downloaded through the manifest-backed route
`GET /api/papers/<id>/artifact-bundles/<bundle_id>/files/<file_id>`,
which streams only files listed in the manifest and emits checksum,
source-kind, bundle/file ID, content type, and content length headers.
By default they live under
`$SIMULATOR_WORKDIR/paper-artifacts/<paper_id>/`; set
`PAPER_ARTIFACTS_DIR` to move them. `PAPER_ARTIFACT_MAX_BYTES` controls
the per-request upload/import cap. Each new Codex full-paper job stages
all available bundles under `supplemental-artifacts/` and must inspect
them before declaring a unit blocked for missing artifacts.

`/api/papers/<id>/artifact-manifest` and `/api/papers/<id>/full` also
return `artifactGapCoverage`. This is a heuristic candidate map from
stored artifact files back to Missing Artifact Manifest request kinds,
using filenames, content types, bundle notes, URL provenance, and common
scientific file extensions. It is an operator/Codex triage aid only:
candidate coverage does not clear a blocker until a later replication
run uses the file and records a real result.

The latest Codex job also has a workdir dossier at
`GET /api/papers/<id>/replication-dossier`, mirrored on the paper
overview/report pages. It checks required Codex input manifests,
runtime trace files, `results.json`, and
`experiments/full_paper_replication/coverage_report.json`; summarizes
verdict/evidence distributions; counts missing result units; and marks
the job `auditable`, `running`, `incomplete`, or `missing_workdir`.
Files listed by the latest dossier are downloadable at
`/api/papers/<id>/replication-dossier/files/<relative_path>`; the route
only serves existing paths already present in the dossier, including
generated `src/` code and `experiments/` outputs. The dossier records
SHA-256 hashes for files up to `CODEX_DOSSIER_HASH_MAX_BYTES` (64 MiB by
default), and file downloads return `x-dossier-sha256` when a hash was
computed. New Codex jobs write `replication-dossier-snapshot.json` at job
finish; future `auditable` status requires that frozen snapshot as an
output. Use this before treating a full-paper job as operationally
complete.

If older Codex rows are missing persisted unit metadata, run:

```bash
DATABASE_URL=<toiletpaper-postgres-url> pnpm exec tsx scripts/backfill-codex-unit-metadata.ts --dry-run
DATABASE_URL=<toiletpaper-postgres-url> pnpm exec tsx scripts/backfill-codex-unit-metadata.ts
```

The production instance was backfilled on 2026-06-18: 1,181 historical
Codex full-paper rows were updated, and a follow-up dry run reported
zero rows missing unit metadata.

Relevant Codex env knobs:

- `CODEX_SIMULATION_ENABLED=1`
- `CODEX_JOB_LAUNCHER=queue`
- `CODEX_FULL_PAPER_TIMEOUT_MS=7200000`
- `CODEX_DONTO_STATEMENT_LIMIT=50000`
- `CODEX_SIMULATION_SANDBOX=danger-full-access`
- `CODEX_BIN=/usr/bin/codex`
- `CODEX_HOME=/home/ajax/.codex`

## Provisioning checklist

```sh
# 1. Create or update /etc/toiletpaper-web.env.
# It must include DATABASE_URL, DONTOSRV_URL, DONTO_DSN,
# extractor provider settings, UPLOADS_DIR, SIMULATOR_WORKDIR, and
# optional PAPER_ARTIFACTS_DIR/PAPER_ARTIFACT_MAX_BYTES.

# 2. Push the Drizzle schema to the app database.
DATABASE_URL="$(grep '^DATABASE_URL=' /etc/toiletpaper-web.env | cut -d= -f2-)" \
  pnpm --filter @toiletpaper/db db:push

# 3. Build the app.
set -a
. /etc/toiletpaper-web.env
set +a
pnpm --filter @toiletpaper/web build
rm -rf apps/web/.next/standalone/apps/web/.next/static
cp -R apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static

# 4. Install and start the service.
sudo install -m 0644 deploy/toiletpaper-web.service /etc/systemd/system/toiletpaper-web.service
sudo systemctl daemon-reload
sudo systemctl enable --now toiletpaper-web.service

# 5. Add deploy/caddy.toiletpaper.dev to /etc/caddy/Caddyfile and reload Caddy.
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

After DNS points `toiletpaper.dev` and `www.toiletpaper.dev` at this
host, Caddy will obtain public certificates automatically.

## Shared Donto compatibility note

This instance had a historical `donto_agent` table without the unique
constraints assumed by `donto_ensure_agent()` and
`donto_bind_agent_context()`. The live functions were repaired to use
advisory locks plus explicit select/update logic instead of relying on
`ON CONFLICT`. If Donto agent registration returns
`{"error":"postgres error: db error"}`, check those functions before
debugging toiletpaper.
