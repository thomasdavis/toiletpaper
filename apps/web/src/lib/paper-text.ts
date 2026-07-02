import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { getObject, parseGs } from "@/lib/storage";

const UPLOADS_DIR = process.env.UPLOADS_DIR || join(process.cwd(), "uploads");

export interface PaperTextSource {
  text: string;
  format: "markdown" | "plaintext";
  source:
    | "donto-agent-chunks"
    | "gcs-source"
    | "local-source"
    | "fixture-source";
}

function extractionLogRoot() {
  if (process.env.DONTO_AGENT_LOG_DIR) return process.env.DONTO_AGENT_LOG_DIR;
  const simulatorDir = process.env.SIMULATOR_WORKDIR;
  if (simulatorDir) return join(dirname(simulatorDir), "extractions");
  return join("/mnt/donto-data/toiletpaper", "extractions");
}

function chunkOrdinal(filename: string) {
  const match = filename.match(/^chunk-(\d+)\.txt$/);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function overlapLength(left: string, right: string) {
  const max = Math.min(left.length, right.length, 2_000);
  for (let size = max; size >= 40; size -= 1) {
    if (left.endsWith(right.slice(0, size))) return size;
  }
  return 0;
}

function stitchOverlappingChunks(chunks: string[]) {
  let text = chunks[0] ?? "";
  for (const chunk of chunks.slice(1)) {
    const overlap = overlapLength(text, chunk);
    text += overlap > 0 ? chunk.slice(overlap) : `\n\n${chunk}`;
  }
  return text;
}

async function loadDontoChunkText(paperId: string): Promise<PaperTextSource | null> {
  const chunksDir = join(extractionLogRoot(), paperId, "chunks");
  if (!existsSync(chunksDir)) return null;

  const filenames = (await readdir(chunksDir))
    .map((filename) => ({ filename, ordinal: chunkOrdinal(filename) }))
    .filter((item): item is { filename: string; ordinal: number } => item.ordinal != null)
    .sort((a, b) => a.ordinal - b.ordinal);

  if (filenames.length === 0) return null;

  const chunks = await Promise.all(
    filenames.map((item) => readFile(join(chunksDir, item.filename), "utf8")),
  );

  return {
    text: stitchOverlappingChunks(chunks),
    format: "plaintext",
    source: "donto-agent-chunks",
  };
}

async function decodeContent(
  content: Buffer,
  ext: string,
  source: Exclude<PaperTextSource["source"], "donto-agent-chunks">,
): Promise<PaperTextSource | null> {
  if (ext === "md" || ext === "markdown") {
    return { text: content.toString("utf-8"), format: "markdown", source };
  }
  if (ext === "pdf") {
    try {
      const { extractTextFromPdf } = await import("@toiletpaper/extractor");
      const pdf = await extractTextFromPdf(content);
      return { text: pdf.text, format: "plaintext", source };
    } catch {
      return null;
    }
  }
  return { text: content.toString("utf-8"), format: "plaintext", source };
}

export async function loadPaperText(
  paper: { id: string; pdfUrl: string | null; title: string },
): Promise<PaperTextSource | null> {
  const chunkText = await loadDontoChunkText(paper.id);
  if (chunkText) return chunkText;

  if (!paper.pdfUrl) return null;

  if (paper.pdfUrl.startsWith("gs://")) {
    try {
      const gs = parseGs(paper.pdfUrl);
      const buf = await getObject(gs.bucket, gs.key);
      const ext = gs.key.split(".").pop()?.toLowerCase() ?? "";
      return await decodeContent(buf, ext, "gcs-source");
    } catch {
      return null;
    }
  }

  const filename = basename(paper.pdfUrl);
  const candidatePaths = [
    {
      path: paper.pdfUrl.startsWith("/uploads/") ? join(UPLOADS_DIR, filename) : "",
      source: "local-source" as const,
    },
    {
      path: join(process.cwd(), paper.pdfUrl.replace(/^\//, "")),
      source: "local-source" as const,
    },
    {
      path: join(process.cwd(), "test", "fixtures", filename),
      source: "fixture-source" as const,
    },
    {
      path: join(process.cwd(), "test", "fixtures", `${paper.title}.md`),
      source: "fixture-source" as const,
    },
    {
      path: join(process.cwd(), "test", "fixtures", `${paper.title}.pdf`),
      source: "fixture-source" as const,
    },
  ].filter((item) => item.path.length > 0);

  for (const candidate of candidatePaths) {
    try {
      const content = await readFile(candidate.path);
      const ext = candidate.path.split(".").pop()?.toLowerCase() ?? "";
      const decoded = await decodeContent(content, ext, candidate.source);
      if (decoded) return decoded;
    } catch {
      continue;
    }
  }

  return null;
}
