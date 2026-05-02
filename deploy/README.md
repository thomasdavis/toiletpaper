# deploy/

Source-of-truth declarative configuration for the toiletpaper Cloud Run
deployment (PRD-007). Anything mutable in production should be
representable here, so the running service is reproducible from a
clean clone.

## Files

| File | What it controls |
|---|---|
| `toiletpaper-web.service.yaml` | Cloud Run service spec for the web tier — env vars, secret refs, image, resources, scaling, timeout, service account. |
| `cert-sans.txt` | The list of SANs on the LE certificate served by the global LB. One domain per line; consumed by `xtask renew-cert`. |

## Deploying

Always use `gcloud run services replace` for production updates so the
running spec equals the file. Partial updates (`--update-env-vars`,
`--set-env-vars`, etc.) are forbidden because they cause silent drift
between revisions — see PRD-007 for the incident that motivated this.

```sh
# 1. Build the image (builds and tags us-central1-…/toiletpaper-web:latest)
gcloud builds submit --config cloudbuild.yaml --project=apex-494316

# 2. Apply the service spec
gcloud run services replace deploy/toiletpaper-web.service.yaml \
  --project=apex-494316 --region=us-central1
```

The image tag in `toiletpaper-web.service.yaml` is `:latest`; the
build step is what advances which sha `:latest` points at.

## Renewing the cert

```sh
CLOUDFLARE_DNS_API_TOKEN=$(cat ~/.cf-api-token) \
lego \
  --accept-tos \
  --email thomasalwyndavis@gmail.com \
  --dns cloudflare \
  --dns.resolvers "1.1.1.1:53" --dns.resolvers "8.8.8.8:53" \
  --dns.propagation-wait 60s \
  --path "$HOME/.lego" \
  $(while read d; do echo "--domains $d"; done < deploy/cert-sans.txt) \
  run

gcloud compute ssl-certificates create apex-le-cert-vN \
  --certificate=$HOME/.lego/certificates/apexpots.com.crt \
  --private-key=$HOME/.lego/certificates/apexpots.com.key \
  --project=apex-494316 --global
gcloud compute target-https-proxies update apex-console-https-proxy \
  --ssl-certificates=apex-le-cert-vN \
  --project=apex-494316 --global
```

Bump `vN` each time. Old certs can be garbage-collected after the new
one has propagated for ≥ 24h (the LB caches them on backends).

## What is *not* in this directory

The Apex global load balancer (URL map, backend services, target
proxies, forwarding rules) is owned by the Apex bootstrap and lives in
the `apex` repo. Toiletpaper only owns the host-rule fragment for
`toiletpaper-matcher` inside that URL map; for now we mutate it via
ad-hoc imports, with a follow-up to commit a `url-map-fragment.yaml`
slice once the Apex-side IaC stabilizes.
