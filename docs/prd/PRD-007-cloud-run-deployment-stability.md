# PRD-007 · Cloud Run Deployment Stability and Drift Elimination

| | |
|---|---|
| Status | Draft |
| Created | 2026-05-02 |
| Owner | toiletpaper platform |
| Related | PRD-005, PRD-006 |

## Problem

`gcloud run services update --image=...` does not preserve previously-set
env vars in our deployments — at least not reliably. Today we
discovered that `UPLOADS_BUCKET=apex-494316-source-staging` had been
silently dropped between revisions, causing every upload to fall back
to the read-only Cloud Run filesystem and fail with `EACCES`.

Other symptoms of the same drift class:

- Cloud Run timeout was bumped from 300s → 1800s by hand once.
  Nothing in the repo records that.
- `OPENAI_API_KEY` and `DATABASE_URL` are bound via secret references
  whose source-of-truth is `gcloud` invocations from chat history, not
  a checked-in spec.
- LB host rules and SAN list on the LE cert are mutated by ad-hoc
  shell commands (this is OK during bring-up; it's not OK as the
  steady state).
- The `cloudbuild.yaml` that we deploy from doesn't trigger from
  GitHub — every deploy is a manual `gcloud builds submit`. That's
  fine for a single operator but sketchy as the project grows.

The result is that the production deploy *cannot be reproduced from
the repo* without operator memory.

## Goals

1. The full Cloud Run service spec (env vars, secret refs, image,
   timeout, concurrency, scaling, IAM bindings) lives in a checked-in
   YAML file that is the source of truth.
2. Deploys are `gcloud run services replace <yaml>`; partial updates
   are forbidden in CI.
3. Drift between the running spec and the committed spec is detected
   and alerted within an hour.
4. The same model applies to LB URL maps, SSL certificate SANs, and
   any other GCP resource toiletpaper depends on. (Apex repo CLAUDE.md
   forbids Terraform, but toiletpaper is not Apex; we use Terraform's
   cousin — `gcloud … replace`-style declarative YAML — checked in.)
5. A new contributor can run `xtask deploy --env=prod` and reach
   parity with prod from a clean clone, no shell history needed.

## Non-goals

- Migrating off Cloud Run.
- Setting up GitHub-triggered Cloud Build (P2 follow-up).
- Multi-region. We're us-central1 only for now.

## Background / current state

Our deploy workflow today:

```
gcloud builds submit --config cloudbuild.yaml --project=apex-494316
gcloud run services update toiletpaper-web --image=...:latest --region=us-central1
```

`cloudbuild.yaml` only knows how to *build* the image. `services
update` mutates one or two flags at a time. Env vars set today via
`--update-env-vars` are clobbered tomorrow if a different operator
runs `--set-env-vars` for a single field.

The LB URL map (`apex-console-urlmap`) is owned by the Apex repo's
bootstrap; we mutate its `toiletpaper-matcher` host rule by exporting,
editing the YAML in `/tmp/`, and re-importing. There is no commit
trail.

## Proposed design

### `deploy/` directory in the repo

```
deploy/
  toiletpaper-web.service.yaml     # Cloud Run service spec
  toiletpaper-worker.service.yaml  # PRD-006 worker spec
  cloud-tasks-queue.yaml           # the sim-jobs queue
  url-map-fragment.yaml            # only the toiletpaper-matcher block
  cert-sans.txt                    # one SAN per line
  README.md                        # what each file is, how to deploy
```

Service yaml is full — all env, all secrets-as-secretRef, timeout,
concurrency, scaling — generated once via
`gcloud run services describe toiletpaper-web --format=export` and
then committed.

### Deploy command — single source of truth

`xtask deploy --env=prod --service=web|worker|all` runs (per service):

```
gcloud builds submit --config cloudbuild.yaml --substitutions=_IMAGE_TAG=$GIT_SHA
gcloud run services replace deploy/toiletpaper-${SVC}.service.yaml \
  --project=apex-494316 --region=us-central1
```

`services replace` is fully declarative — the spec wins; missing
fields are removed; the service ends up exactly as the file describes.

The image tag in the YAML is templated with `${IMAGE_TAG}` and
substituted at deploy time so we don't churn the file on every commit.

### Drift detector

A scheduled Cloud Run Job, `tp-drift-check`, runs hourly:

1. `gcloud run services describe toiletpaper-web --format=export` →
   normalized YAML.
2. Read the committed `deploy/toiletpaper-web.service.yaml` (from a
   GCS-mirrored copy of `main`).
3. Diff (yq, key-by-key). Ignore generated fields:
   `metadata.resourceVersion`, `metadata.creationTimestamp`,
   `spec.template.spec.containers[].image` (allowed to drift forward).
4. If the diff is non-empty, post to a webhook (Slack/email) with the
   diff body and the offending field path.

The same job runs for the worker service, the cloud-tasks queue, and
(read-only diff) the URL map host rule.

### URL map host rule fragment

We don't own the whole `apex-console-urlmap`, but we own the
`toiletpaper-matcher` host rule. The deploy step:

1. Exports the URL map.
2. Splices our committed `url-map-fragment.yaml` over the
   `toiletpaper-matcher` and the `toiletpaper.dev` host entries.
3. Runs `gcloud compute url-maps import`.

If the fragment was committed, the operation is reproducible.

### Cert SAN list

`deploy/cert-sans.txt`:

```
apexpots.com
api.apexpots.com
console.apexpots.com
hello.apexpots.com
toiletpaper.apexpots.com
toiletpaper.dev
www.apexpots.com
www.toiletpaper.dev
tpmjs.apexpots.com
```

`xtask renew-cert` reads the file and shells out to `lego` with the
listed `--domains` flags, then uploads as a fresh SSL cert and swaps
it onto the HTTPS proxy. Cron weekly so we have a 60-day buffer
before the 90-day LE cert expires.

### Secret bindings

Secrets are referenced symbolically (`secretKeyRef`) in the service
YAML. Their values live in Secret Manager and are *not* in the repo.
The YAML lists which secrets are required:

```yaml
- name: DATABASE_URL
  valueFrom:
    secretKeyRef: { name: tp-database-url, key: latest }
```

Pre-deploy hook checks every referenced secret exists and has at
least one enabled version; refuses to deploy otherwise. (This catches
the "I forgot to create the secret in the new project" failure mode.)

### `xtask preflight`

A standalone command that runs before any deploy:

- Confirms the active gcloud project is `apex-494316`.
- Confirms the active gcloud account is the maintainer email.
- Lints the service YAML for required fields.
- Checks all referenced secrets exist.
- Diffs running prod against the YAML and prints the pending changes.
- Asks for confirmation if the diff is non-trivial.

## Acceptance criteria

- `gcloud run services describe toiletpaper-web --format=export` minus
  generated fields equals
  `deploy/toiletpaper-web.service.yaml` after a deploy.
- Setting `UPLOADS_BUCKET` requires editing the YAML and committing;
  ad-hoc `--update-env-vars` is documented as forbidden in
  `deploy/README.md`.
- A simulated drift (manual `gcloud run services update --remove-env-vars
  UPLOADS_BUCKET`) is detected by the drift-check job within an hour
  and alerts the maintainer.
- `xtask deploy --env=prod --service=web` from a clean clone produces
  the running prod service exactly.
- The LE cert SAN list is auditable from `deploy/cert-sans.txt`; cert
  renewal uses only that file as input.

## Phasing

| P | Scope |
|---|---|
| P0 | Export current service spec, commit `deploy/toiletpaper-web.service.yaml` |
| P0 | `xtask deploy --service=web` using `services replace` |
| P0 | Document the prohibition on partial updates |
| P1 | Drift-detector Cloud Run Job + webhook |
| P1 | `cert-sans.txt` + `xtask renew-cert` |
| P1 | URL-map fragment splice |
| P2 | GitHub-triggered Cloud Build on push to `main` |
| P2 | `xtask preflight` |

## Telemetry

- `deploy.applied_total` counter, labeled `service, result`
- `deploy.duration_seconds` histogram
- `drift.detected_total` counter, labeled `resource, field_path`
- One alert: any drift, any time → page maintainer.

## Open questions

- Multi-environment (staging vs prod)? We don't have one today, but
  `--env=prod|staging` parameterization is cheap; defer the actual
  staging env to PRD-008 or later.
- Secret Manager rotation policy. Currently keys are rotated by hand;
  a P3 PRD will automate the OpenAI / Cloudflare token rotation.
