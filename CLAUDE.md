# toiletpaper

Upload papers, extract claims, simulate physics, verify truth.

## Layout

- `apps/web` — Next.js 15 web app (React 19, Tailwind v4, App Router)
- `packages/db` — Drizzle ORM + Postgres (papers, claims, simulations)
- `packages/donto-client` — Wrapper around @donto/client with toiletpaper helpers
- `packages/extractor` — PDF parsing + OpenAI claim extraction + donto evidence substrate ingestion
- `packages/ui` — Shared React components (shadcn-style, CVA + tailwind-merge)
- `packages/typescript-config` — Shared tsconfig bases
- `packages/eslint-config` — Shared ESLint 9 flat config

## How to run

```bash
./scripts/setup.sh       # Docker, install, migrate
pnpm dev                  # starts web on :3001
```

dontosrv (the donto HTTP sidecar) runs separately:

```bash
cd ../donto && DONTO_DSN=postgres://donto:donto@127.0.0.1:55433/donto DONTO_BIND=127.0.0.1:7879 cargo run -p dontosrv
```

## Databases

- Primary Postgres on port 5432 — toiletpaper's relational data (papers, claims, simulations)
- Donto Postgres on port 55433 — knowledge graph quad store (separate from donto's dev instance on 55432)
- dontosrv on port 7879 (to avoid collision with donto's dev instance on 7878)

## Conventions

- Source-only internal packages (no build step). Next.js transpiles them via `transpilePackages`.
- pnpm workspaces + Turborepo for task orchestration.
- `@donto/client` is referenced via `file:` from the sibling `~/repos/donto` repo.
- Drizzle ORM for the relational database. `drizzle-kit push` for schema sync.
- API routes in `apps/web/src/app/api/` handle all server mutations.
- Server Components by default; `"use client"` only for interactive UI.
- Tailwind v4: no `tailwind.config.ts`. Theme lives in `globals.css` `@theme` block.

## Don't

- Don't add a build step to source-only packages.
- Don't use Tailwind v3 config files — this project uses v4 (CSS-first).
- Don't run dontosrv from this repo — it lives in `../donto`.
- Don't put `postgres` (the driver) in the Next.js client bundle — it's in `serverExternalPackages`.
