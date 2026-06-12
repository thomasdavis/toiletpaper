# toiletpaper.dev on the donto instance

This deployment runs `toiletpaper` on the same host and shared donto
substrate as the other repositories on this instance.

## Runtime shape

| piece | value |
|---|---|
| Web service | `toiletpaper-web.service` |
| Local port | `3110` |
| Public domain | `toiletpaper.dev`, `www.toiletpaper.dev` |
| App database | `postgres://toiletpaper:...@127.0.0.1:5432/toiletpaper` |
| Donto HTTP sidecar | `http://127.0.0.1:7879` |
| Donto Postgres | the shared `donto` database on the local `donto-pg` container |
| LLM provider | z.ai GLM coding subscription via OpenAI-compatible API |
| Upload storage | `/mnt/donto-data/toiletpaper/uploads` |
| Simulation workdir | `/mnt/donto-data/toiletpaper/simulations` |

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

The app still has its own `toiletpaper` Postgres database for papers,
claims, simulations, job state, and UI metadata.

## Provisioning checklist

```sh
# 1. Create or update /etc/toiletpaper-web.env.
# It must include DATABASE_URL, DONTOSRV_URL, DONTO_DSN,
# extractor provider settings, UPLOADS_DIR, and SIMULATOR_WORKDIR.

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
