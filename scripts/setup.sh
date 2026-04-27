#!/usr/bin/env bash
set -euo pipefail

echo "==> Starting Docker containers..."
docker compose up -d

echo "==> Waiting for primary Postgres..."
until docker exec toiletpaper-pg pg_isready -U toiletpaper -d toiletpaper >/dev/null 2>&1; do sleep 1; done
echo "    Primary Postgres is ready (port 5434)"

echo "==> Waiting for donto Postgres..."
until docker exec toiletpaper-donto-pg pg_isready -U donto -d donto >/dev/null 2>&1; do sleep 1; done
echo "    Donto Postgres is ready (port 55433)"

echo "==> Installing dependencies..."
pnpm install

echo "==> Pushing database schema..."
pnpm --filter @toiletpaper/db db:push

echo "==> Running donto migrations..."
if command -v cargo &>/dev/null && [ -d "../donto" ]; then
  DONTO_DSN="postgres://donto:donto@127.0.0.1:55433/donto" \
    cargo run --manifest-path ../donto/Cargo.toml -p donto-cli --quiet -- migrate
  echo "    Donto migrations applied"
else
  echo "    Skipped (cargo or ../donto not found)"
  echo "    Run manually: cd ../donto && DONTO_DSN=postgres://donto:donto@127.0.0.1:55433/donto cargo run -p donto-cli -- migrate"
fi

echo ""
echo "==> Ready!"
echo ""
echo "  pnpm dev                   Start the web app on :3001"
echo ""
echo "  Start dontosrv separately:"
echo "  cd ../donto && DONTO_DSN=postgres://donto:donto@127.0.0.1:55433/donto DONTO_BIND=127.0.0.1:7879 cargo run -p dontosrv"
