#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3110}"
PDF_URL="${PDF_URL:-https://arxiv.org/pdf/2512.03219}"
PDF_PATH="${PDF_PATH:-/tmp/perch-2-transfers-whale-to-underwater-tasks.pdf}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-3600}"
POLL_SECONDS="${POLL_SECONDS:-10}"
MIN_CLAIMS="${MIN_CLAIMS:-0}"
MIN_STATEMENTS="${MIN_STATEMENTS:-100}"
EXPECT_SIMULATION_PAUSED="${EXPECT_SIMULATION_PAUSED:-0}"
RUN_SIMULATION="${RUN_SIMULATION:-0}"
MIN_SIMULATIONS="${MIN_SIMULATIONS:-1}"

read_env_value() {
  local name="$1"
  local file="${TOILETPAPER_ENV_FILE:-/etc/toiletpaper-web.env}"

  if [ -n "${!name:-}" ]; then
    printf "%s" "${!name}"
    return 0
  fi

  if [ -r "$file" ]; then
    awk -F= -v key="$name" '$1 == key { print substr($0, index($0, "=") + 1); exit }' "$file"
    return 0
  fi

  if command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then
    sudo -n awk -F= -v key="$name" '$1 == key { print substr($0, index($0, "=") + 1); exit }' "$file"
    return 0
  fi

  return 1
}

json_field() {
  local json="$1"
  local field="$2"
  JSON_PAYLOAD="$json" FIELD="$field" node -e '
    const body = JSON.parse(process.env.JSON_PAYLOAD);
    const value = body[process.env.FIELD];
    if (value == null) process.exit(1);
    process.stdout.write(String(value));
  '
}

if [ -n "${PAPER_ID:-}" ]; then
  paper_id="$PAPER_ID"
  paper_url="/papers/$paper_id"
  echo "==> Verifying existing paper"
else
  echo "==> Downloading paper"
  echo "    $PDF_URL"
  curl -fsSL "$PDF_URL" -o "$PDF_PATH"
  file "$PDF_PATH"

  echo "==> Uploading to $BASE_URL/api/upload"
  upload_json="$(
    curl -fsS -X POST \
      -F "file=@${PDF_PATH};type=application/pdf" \
      "$BASE_URL/api/upload"
  )"

  paper_id="$(json_field "$upload_json" id)"
  paper_url="$(json_field "$upload_json" url)"
fi
echo "    paper_id=$paper_id"
echo "    url=$BASE_URL$paper_url"

database_url="$(read_env_value DATABASE_URL || true)"
if [ -z "$database_url" ]; then
  echo "ERROR: DATABASE_URL is required for Donto ingest polling." >&2
  echo "Set DATABASE_URL or TOILETPAPER_ENV_FILE before running this script." >&2
  exit 1
fi

if [ "$EXPECT_SIMULATION_PAUSED" = "1" ]; then
  echo "==> Verifying simulation generation is paused"
  sim_code="$(
    curl -sS -o /tmp/toiletpaper-smoke-simulate.json -w "%{http_code}" \
      -H "content-type: application/json" \
      -d "{\"paper_id\":\"$paper_id\"}" \
      "$BASE_URL/api/simulate"
  )"
  if [ "$sim_code" != "503" ]; then
    echo "ERROR: expected /api/simulate to return 503, got $sim_code" >&2
    cat /tmp/toiletpaper-smoke-simulate.json >&2
    exit 1
  fi
fi

deadline=$((SECONDS + TIMEOUT_SECONDS))
last_status=""

echo "==> Polling extraction and Donto ingest"
while [ "$SECONDS" -lt "$deadline" ]; do
  row="$(
    psql "$database_url" -At -F $'\t' -v ON_ERROR_STOP=1 -c "
      select
        p.status,
        count(distinct c.id),
        coalesce(max(pdi.state::text), 'none'),
        coalesce(max(pdi.statement_count), 0),
        coalesce(max(pdi.span_count), 0),
        coalesce(max(pdi.evidence_link_count), 0),
        count(distinct s.id)
      from papers p
      left join claims c on c.paper_id = p.id
      left join simulations s on s.claim_id = c.id
      left join paper_donto_ingest pdi on pdi.paper_id = p.id
      where p.id = '$paper_id'
      group by p.id, p.status;
    "
  )"

  IFS=$'\t' read -r paper_status claim_count ingest_state statement_count span_count evidence_link_count simulation_count <<< "$row"
  status_line="paper=$paper_status claims=$claim_count donto=$ingest_state statements=$statement_count spans=$span_count evidence_links=$evidence_link_count simulations=$simulation_count"

  if [ "$status_line" != "$last_status" ]; then
    echo "    $status_line"
    last_status="$status_line"
  fi

  if [ "$paper_status" = "error" ] || [ "$ingest_state" = "failed" ]; then
    echo "ERROR: smoke upload failed: $status_line" >&2
    exit 1
  fi

  if [ "$ingest_state" = "succeeded" ] \
    && [ "$claim_count" -ge "$MIN_CLAIMS" ] \
    && [ "$statement_count" -ge "$MIN_STATEMENTS" ]; then
    if [ "$EXPECT_SIMULATION_PAUSED" = "1" ] && [ "$simulation_count" -ne 0 ]; then
      echo "ERROR: expected zero simulations while generation is paused, got $simulation_count" >&2
      exit 1
    fi

    echo "==> Smoke upload passed"
    echo "    $BASE_URL$paper_url"
    echo "    $status_line"
    break
  fi

  sleep "$POLL_SECONDS"
done

if [ "$SECONDS" -ge "$deadline" ]; then
  echo "ERROR: timed out after ${TIMEOUT_SECONDS}s waiting for extraction/Donto ingest" >&2
  echo "Last status: $last_status" >&2
  exit 1
fi

if [ "$RUN_SIMULATION" = "1" ]; then
  echo "==> Running graph-fed simulation"
  simulate_json="$(
    curl -fsS -X POST \
      -H "content-type: application/json" \
      -d "{\"paper_id\":\"$paper_id\"}" \
      "$BASE_URL/api/simulate"
  )"
  simulations_created="$(
    JSON_PAYLOAD="$simulate_json" node -e '
      const body = JSON.parse(process.env.JSON_PAYLOAD);
      process.stdout.write(String(body.simulationsCreated ?? 0));
    '
  )"
  if [ "$simulations_created" -lt "$MIN_SIMULATIONS" ]; then
    echo "ERROR: expected at least $MIN_SIMULATIONS simulation rows, got $simulations_created" >&2
    echo "$simulate_json" >&2
    exit 1
  fi
  echo "    simulationsCreated=$simulations_created"
fi

exit 0
