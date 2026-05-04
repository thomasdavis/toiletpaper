#!/usr/bin/env npx tsx
/**
 * backfill-session-logs.ts — Read Claude Code JSONL session files from
 * ~/.claude/projects/ and backfill the simulation_logs table for papers
 * that have already been simulated.
 *
 * Usage:
 *   npx tsx scripts/backfill-session-logs.ts [paper_id]
 *
 * If paper_id is omitted, backfills all papers that have JSONL but no logs.
 */

import postgres from "postgres";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://toiletpaper:toiletpaper@127.0.0.1:5434/toiletpaper";

const sql = postgres(DATABASE_URL);

// Claude encodes CWD paths as: /foo/bar → -foo-bar
const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");

// Pattern: -home-<user>-repos-donto-toiletpaper--simulations-<paper_id>
// OR:      -home-<user>-repos-toiletpaper--simulations-<paper_id>
const SIM_DIR_RE =
  /-home-[^-]+-repos-(?:donto-)?toiletpaper--simulations-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

/**
 * Classify a JSONL line into an event type.
 */
function classifyEvent(obj: Record<string, unknown>): {
  eventType: string;
  payload: unknown;
} {
  const type = obj.type as string;

  if (type === "assistant") {
    const msg = obj.message as Record<string, unknown> | undefined;
    const content = msg?.content;
    if (Array.isArray(content)) {
      // An assistant message can contain multiple blocks — we classify
      // based on the first significant block
      for (const block of content) {
        if (block.type === "thinking") {
          return { eventType: "thinking", payload: obj };
        }
        if (block.type === "tool_use") {
          const name = block.name ?? "unknown";
          return { eventType: `tool_use:${name}`, payload: obj };
        }
        if (block.type === "text") {
          return { eventType: "assistant_text", payload: obj };
        }
      }
    }
    return { eventType: "assistant_text", payload: obj };
  }

  if (type === "user") {
    const msg = obj.message as Record<string, unknown> | undefined;
    const content = msg?.content;
    if (Array.isArray(content)) {
      // User messages with list content are typically tool_result responses
      for (const block of content) {
        if (block.type === "tool_result") {
          return { eventType: "tool_result", payload: obj };
        }
      }
    }
    return { eventType: "user", payload: obj };
  }

  // Skip non-conversational events (queue-operation, attachment, last-prompt, etc.)
  return { eventType: type, payload: obj };
}

/**
 * Find all JSONL session directories matching simulation paper IDs.
 */
function findSimulationDirs(): Map<string, string> {
  const map = new Map<string, string>(); // paperId -> project dir path
  if (!existsSync(CLAUDE_PROJECTS_DIR)) return map;

  for (const dir of readdirSync(CLAUDE_PROJECTS_DIR)) {
    const match = dir.match(SIM_DIR_RE);
    if (match) {
      const paperId = match[1];
      map.set(paperId, join(CLAUDE_PROJECTS_DIR, dir));
    }
  }
  return map;
}

/**
 * Parse a JSONL file and return classified events.
 */
async function parseJsonlFile(
  filePath: string,
): Promise<
  Array<{ eventType: string; payload: unknown; timestamp: string | null }>
> {
  const events: Array<{
    eventType: string;
    payload: unknown;
    timestamp: string | null;
  }> = [];

  const stream = createReadStream(filePath, { encoding: "utf-8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      const { eventType, payload } = classifyEvent(obj);

      // Skip internal/meta events that aren't part of the conversation
      if (
        eventType === "queue-operation" ||
        eventType === "attachment" ||
        eventType === "last-prompt"
      ) {
        continue;
      }

      events.push({
        eventType,
        payload,
        timestamp: obj.timestamp ?? null,
      });
    } catch {
      // Skip malformed lines
    }
  }

  return events;
}

async function backfillPaper(paperId: string, projectDir: string) {
  // Check if paper already has logs
  const existing =
    await sql`SELECT COUNT(*)::int AS count FROM simulation_logs WHERE paper_id = ${paperId}`;
  if (existing[0].count > 0) {
    console.log(
      `  Skipping ${paperId} — already has ${existing[0].count} log events`,
    );
    return;
  }

  // Find JSONL files
  const jsonlFiles = readdirSync(projectDir)
    .filter((f) => f.endsWith(".jsonl"))
    .sort(); // Sort to process in order

  if (jsonlFiles.length === 0) {
    console.log(`  No JSONL files found for ${paperId}`);
    return;
  }

  // Parse all JSONL files and combine events
  let allEvents: Array<{
    eventType: string;
    payload: unknown;
    timestamp: string | null;
  }> = [];
  for (const file of jsonlFiles) {
    const events = await parseJsonlFile(join(projectDir, file));
    allEvents = allEvents.concat(events);
  }

  if (allEvents.length === 0) {
    console.log(`  No conversation events found for ${paperId}`);
    return;
  }

  console.log(
    `  Inserting ${allEvents.length} events for ${paperId} from ${jsonlFiles.length} session(s)...`,
  );

  // Insert in batches of 100
  const BATCH_SIZE = 100;
  for (let i = 0; i < allEvents.length; i += BATCH_SIZE) {
    const batch = allEvents.slice(i, i + BATCH_SIZE);
    for (const e of batch) {
      const seqNum = allEvents.indexOf(e) + 1;
      const ts = e.timestamp ? new Date(e.timestamp) : new Date();
      await sql`
        INSERT INTO simulation_logs (paper_id, seq, event_type, payload, created_at)
        VALUES (${paperId}, ${seqNum}, ${e.eventType}, ${JSON.stringify(e.payload)}::jsonb, ${ts})
      `;
    }
  }

  // Summary
  const typeCounts: Record<string, number> = {};
  for (const e of allEvents) {
    typeCounts[e.eventType] = (typeCounts[e.eventType] ?? 0) + 1;
  }
  console.log(
    `  Done. Event breakdown:`,
    Object.entries(typeCounts)
      .map(([k, v]) => `${k}=${v}`)
      .join(", "),
  );
}

async function main() {
  const targetPaperId = process.argv[2];
  const simDirs = findSimulationDirs();

  console.log(`Found ${simDirs.size} simulation session directories`);

  if (targetPaperId) {
    // Backfill single paper
    const dir = simDirs.get(targetPaperId);
    if (!dir) {
      console.error(
        `No JSONL session directory found for paper ${targetPaperId}`,
      );
      process.exit(1);
    }
    // Verify paper exists in DB
    const [paper] =
      await sql`SELECT id, title FROM papers WHERE id = ${targetPaperId}`;
    if (!paper) {
      console.error(`Paper ${targetPaperId} not found in database`);
      process.exit(1);
    }
    console.log(`Backfilling: ${paper.title}`);
    await backfillPaper(targetPaperId, dir);
  } else {
    // Backfill all papers
    const paperIds = Array.from(simDirs.keys());
    // Verify which papers exist in DB
    const dbPapers =
      await sql`SELECT id, title FROM papers WHERE id = ANY(${paperIds})`;
    const dbPaperMap = new Map(dbPapers.map((p) => [p.id, p.title]));

    console.log(
      `${dbPaperMap.size} of ${paperIds.length} papers found in database`,
    );

    for (const [paperId, dir] of simDirs) {
      const title = dbPaperMap.get(paperId);
      if (!title) {
        console.log(`  Skipping ${paperId} — not in database`);
        continue;
      }
      console.log(`\nBackfilling: ${title}`);
      await backfillPaper(paperId, dir);
    }
  }

  await sql.end();
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
