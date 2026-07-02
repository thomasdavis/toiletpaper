#!/usr/bin/env npx tsx
/**
 * Recreate persisted Donto-agent chunk input files for extraction logs that
 * were produced before `chunkPath`/`chunksDir` were recorded.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import postgres from "postgres";
import {
  extractTextFromPdf,
  splitDontoAgentText,
} from "@toiletpaper/extractor";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://toiletpaper:toiletpaper@127.0.0.1:5434/toiletpaper";
const UPLOADS_DIR =
  process.env.UPLOADS_DIR ?? join(process.cwd(), "uploads");

interface PaperRow {
  id: string;
  pdf_url: string | null;
}

function arg(name: string) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

function extractionLogRoot() {
  if (process.env.DONTO_AGENT_LOG_DIR) return process.env.DONTO_AGENT_LOG_DIR;
  const simulatorDir = process.env.SIMULATOR_WORKDIR;
  if (simulatorDir) return join(dirname(simulatorDir), "extractions");
  return join("/mnt/donto-data/toiletpaper", "extractions");
}

async function sourceTextForPaper(paper: PaperRow) {
  if (!paper.pdf_url) throw new Error("paper has no source attached");
  if (!paper.pdf_url.startsWith("/uploads/")) {
    throw new Error(`unsupported source location: ${paper.pdf_url}`);
  }
  const sourceName = basename(paper.pdf_url);
  const buffer = await readFile(join(UPLOADS_DIR, sourceName));
  return sourceName.toLowerCase().endsWith(".pdf")
    ? (await extractTextFromPdf(buffer)).text
    : buffer.toString("utf8");
}

function parseJson(value: string, path: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch (e) {
    throw new Error(
      `failed to parse ${path}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

async function main() {
  const paperId = arg("--paper-id") ?? process.argv[2];
  if (!paperId) {
    console.error("Usage: backfill-donto-agent-chunks.ts --paper-id <id>");
    process.exit(1);
  }

  const logDir = join(extractionLogRoot(), paperId);
  const summaryPath = join(logDir, "donto-agent-summary.json");
  const eventsPath = join(logDir, "donto-agent-chunks.jsonl");
  if (!existsSync(summaryPath)) {
    throw new Error(`summary not found: ${summaryPath}`);
  }

  const sql = postgres(DATABASE_URL, { max: 1 });
  try {
    const [paper] = await sql<PaperRow[]>`
      SELECT id, pdf_url
      FROM papers
      WHERE id = ${paperId}
    `;
    if (!paper) throw new Error(`paper ${paperId} not found`);

    const summary = parseJson(await readFile(summaryPath, "utf8"), summaryPath);
    const maxChars =
      typeof summary.maxChars === "number" ? summary.maxChars : 3_500;
    const overlapChars =
      typeof summary.overlapChars === "number" ? summary.overlapChars : 700;
    const text = await sourceTextForPaper(paper);
    const chunks = splitDontoAgentText(text, maxChars, overlapChars);
    const chunksDir = join(logDir, "chunks");
    await mkdir(chunksDir, { recursive: true });

    const chunkPaths = new Map<number, string>();
    for (const [index, chunk] of chunks.entries()) {
      const path = join(
        chunksDir,
        `chunk-${String(index + 1).padStart(3, "0")}.txt`,
      );
      await writeFile(path, chunk, "utf8");
      chunkPaths.set(index, path);
    }

    summary.chunksDir = chunksDir;
    summary.chunkCount = chunks.length;
    if (Array.isArray(summary.chunks)) {
      summary.chunks = summary.chunks.map((chunk) => {
        if (!chunk || typeof chunk !== "object") return chunk;
        const item = chunk as Record<string, unknown>;
        const index = typeof item.index === "number" ? item.index : null;
        return index == null
          ? item
          : { ...item, chunkPath: chunkPaths.get(index) ?? null };
      });
    }
    await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

    let eventCount = 0;
    if (existsSync(eventsPath)) {
      const lines = (await readFile(eventsPath, "utf8"))
        .split("\n")
        .filter((line) => line.trim().length > 0);
      const patched = lines.map((line) => {
        const event = parseJson(line, eventsPath);
        const index = typeof event.index === "number" ? event.index : null;
        if (index != null && chunkPaths.has(index)) {
          event.chunkPath = chunkPaths.get(index) ?? null;
          event.ordinal = index + 1;
        }
        eventCount += 1;
        return JSON.stringify(event);
      });
      await writeFile(eventsPath, `${patched.join("\n")}\n`, "utf8");
    }

    console.log(
      JSON.stringify({
        paperId,
        chunks: chunks.length,
        chunksDir,
        events: eventCount,
      }),
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
