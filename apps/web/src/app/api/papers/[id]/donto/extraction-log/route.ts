import { NextResponse } from "next/server";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const dynamic = "force-dynamic";

function extractionLogRoot() {
  if (process.env.DONTO_AGENT_LOG_DIR) return process.env.DONTO_AGENT_LOG_DIR;
  const simulatorDir = process.env.SIMULATOR_WORKDIR;
  if (simulatorDir) return join(dirname(simulatorDir), "extractions");
  return join("/mnt/donto-data/toiletpaper", "extractions");
}

function intParam(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseJsonLine(line: string) {
  try {
    return JSON.parse(line) as unknown;
  } catch {
    return { event: "parse_error", line };
  }
}

function chunkFilename(index: number) {
  return `chunk-${String(index).padStart(3, "0")}.txt`;
}

function ordinalFromChunkPath(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.match(/chunk-(\d+)\.txt$/);
  if (!match) return null;
  const ordinal = Number.parseInt(match[1], 10);
  return Number.isFinite(ordinal) && ordinal > 0 ? ordinal : null;
}

function normalizeEventPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return payload;
  const event = payload as Record<string, unknown>;
  const ordinal =
    typeof event.ordinal === "number"
      ? event.ordinal
      : typeof event.index === "number"
        ? event.index + 1
        : ordinalFromChunkPath(event.chunkPath);
  if (!ordinal) return payload;
  return { ...event, ordinal };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(req.url);
  const after = intParam(url.searchParams.get("after"), 0);
  const limit = Math.min(intParam(url.searchParams.get("limit"), 100), 500);
  const chunkOrdinal = url.searchParams.get("chunk");

  const dir = join(extractionLogRoot(), id);
  const summaryPath = join(dir, "donto-agent-summary.json");
  const chunksPath = join(dir, "donto-agent-chunks.jsonl");
  const chunksDir = join(dir, "chunks");

  if (chunkOrdinal) {
    const ordinal = intParam(chunkOrdinal, 0);
    if (ordinal <= 0) {
      return NextResponse.json({ error: "invalid chunk" }, { status: 400 });
    }
    const path = join(chunksDir, chunkFilename(ordinal));
    if (!existsSync(path)) {
      return NextResponse.json({ error: "chunk not found" }, { status: 404 });
    }
    const text = await readFile(path, "utf8");
    return NextResponse.json({
      paperId: id,
      ordinal,
      filename: chunkFilename(ordinal),
      text,
      chars: text.length,
    });
  }

  let summary: unknown = null;
  if (existsSync(summaryPath)) {
    summary = parseJsonLine(await readFile(summaryPath, "utf8"));
  }

  let events: Array<{ seq: number; payload: unknown }> = [];
  let lastSeq = 0;
  if (existsSync(chunksPath)) {
    const lines = (await readFile(chunksPath, "utf8"))
      .split("\n")
      .filter((line) => line.trim().length > 0);
    lastSeq = lines.length;
    events = lines
      .map((line, index) => ({
        seq: index + 1,
        payload: normalizeEventPayload(parseJsonLine(line)),
      }))
      .filter((event) => event.seq > after)
      .slice(-limit);
  }

  return NextResponse.json({
    paperId: id,
    logDir: dir,
    summary,
    events,
    lastSeq,
  });
}
