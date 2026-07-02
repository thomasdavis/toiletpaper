#!/usr/bin/env npx tsx

import postgres from "postgres";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://toiletpaper:toiletpaper@127.0.0.1:5434/toiletpaper";

function hasArg(name: string) {
  return process.argv.includes(name);
}

async function main() {
  const dryRun = hasArg("--dry-run");
  const sql = postgres(DATABASE_URL, { max: 2 });

  try {
    const [before] = await sql<{
      rows: number;
      missing_metadata_unit_type: number;
      missing_result_unit_type: number;
    }[]>`
      SELECT
        count(*)::int AS rows,
        count(*) FILTER (
          WHERE NOT (COALESCE(metadata, '{}'::jsonb) ? 'unit_type')
        )::int AS missing_metadata_unit_type,
        count(*) FILTER (
          WHERE NOT (COALESCE(result, '{}'::jsonb) ? 'unitType')
        )::int AS missing_result_unit_type
      FROM simulations
      WHERE simulator_id = 'codex-full-paper'
    `;

    if (dryRun) {
      console.log(JSON.stringify({ dryRun, before }, null, 2));
      return;
    }

    const [updated] = await sql<{ updated: number }[]>`
      WITH matched AS (
        SELECT
          s.id AS simulation_id,
          ru.claim_iri,
          ru.source_statement_ids,
          ru.domain,
          ru.unit_type,
          COALESCE(array_length(ru.source_statement_ids, 1), 0) AS source_statement_count
        FROM simulations s
        JOIN replication_units ru
          ON ru.id = COALESCE(
            s.metadata ->> 'replication_unit_id',
            s.result ->> 'replicationUnitId'
          )
        WHERE s.simulator_id = 'codex-full-paper'
          AND (
            NOT (COALESCE(s.metadata, '{}'::jsonb) ? 'unit_type')
            OR NOT (COALESCE(s.result, '{}'::jsonb) ? 'unitType')
          )
      ),
      changed AS (
        UPDATE simulations s
        SET
          metadata = COALESCE(s.metadata, '{}'::jsonb) || jsonb_build_object(
            'claim_iri', matched.claim_iri,
            'source_statement_ids', to_jsonb(matched.source_statement_ids),
            'source_statement_count', matched.source_statement_count,
            'domain', matched.domain,
            'unit_type', matched.unit_type
          ),
          result = CASE
            WHEN jsonb_typeof(COALESCE(s.result, '{}'::jsonb)) = 'object' THEN
              COALESCE(s.result, '{}'::jsonb) || jsonb_build_object(
                'claimIri', matched.claim_iri,
                'sourceStatementIds', to_jsonb(matched.source_statement_ids),
                'domain', matched.domain,
                'unitType', matched.unit_type
              )
            ELSE s.result
          END
        FROM matched
        WHERE s.id = matched.simulation_id
        RETURNING 1
      )
      SELECT count(*)::int AS updated FROM changed
    `;

    const [after] = await sql<{
      rows: number;
      missing_metadata_unit_type: number;
      missing_result_unit_type: number;
    }[]>`
      SELECT
        count(*)::int AS rows,
        count(*) FILTER (
          WHERE NOT (COALESCE(metadata, '{}'::jsonb) ? 'unit_type')
        )::int AS missing_metadata_unit_type,
        count(*) FILTER (
          WHERE NOT (COALESCE(result, '{}'::jsonb) ? 'unitType')
        )::int AS missing_result_unit_type
      FROM simulations
      WHERE simulator_id = 'codex-full-paper'
    `;

    console.log(
      JSON.stringify(
        {
          dryRun,
          updated: updated?.updated ?? 0,
          before,
          after,
        },
        null,
        2,
      ),
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
