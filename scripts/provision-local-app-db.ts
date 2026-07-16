#!/usr/bin/env npx tsx
/** Provision the local Toiletpaper role/database without exposing credentials. */

import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
const DONTO_DSN = process.env.DONTO_DSN;

async function formattedCommand(
  sql: ReturnType<typeof postgres>,
  template: string,
  values: string[],
) {
  const [row] = await sql<{ command: string }[]>`
    SELECT format(
      ${template}::text,
      ${values[0]}::text,
      ${values[1]}::text
    ) AS command
  `;
  if (!row?.command) throw new Error("Postgres did not format the provisioning command");
  return row.command;
}

async function main() {
  if (!DATABASE_URL) throw new Error("DATABASE_URL is required");
  if (!DONTO_DSN) throw new Error("DONTO_DSN is required");

  const target = new URL(DATABASE_URL);
  if (!new Set(["127.0.0.1", "localhost"]).has(target.hostname)) {
    throw new Error(`refusing to provision a non-local database host: ${target.hostname}`);
  }
  if (target.port && target.port !== "5432") {
    throw new Error(`refusing to provision unexpected database port: ${target.port}`);
  }

  const role = decodeURIComponent(target.username);
  const password = decodeURIComponent(target.password);
  const database = decodeURIComponent(target.pathname.replace(/^\//, ""));
  if (!role || !password || !database) {
    throw new Error("DATABASE_URL must include role, password, and database");
  }

  const admin = postgres(DONTO_DSN, { max: 1 });
  try {
    const [existingRole] = await admin<{ exists: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${role}) AS exists
    `;
    if (!existingRole?.exists) {
      const command = await formattedCommand(
        admin,
        "CREATE ROLE %I LOGIN PASSWORD %L",
        [role, password],
      );
      await admin.unsafe(command);
    } else {
      const command = await formattedCommand(
        admin,
        "ALTER ROLE %I LOGIN PASSWORD %L",
        [role, password],
      );
      await admin.unsafe(command);
    }

    const [existingDatabase] = await admin<{ exists: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = ${database}) AS exists
    `;
    if (!existingDatabase?.exists) {
      const command = await formattedCommand(
        admin,
        "CREATE DATABASE %I OWNER %I",
        [database, role],
      );
      await admin.unsafe(command);
    }

    console.log(JSON.stringify({ role, database, ready: true }));
  } finally {
    await admin.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
