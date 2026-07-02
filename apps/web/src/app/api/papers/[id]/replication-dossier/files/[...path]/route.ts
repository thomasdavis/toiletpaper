import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveCodexDossierFile } from "@/lib/codex-replication-dossier";
import { papers } from "@toiletpaper/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function contentTypeFor(path: string) {
  const ext = extname(path).toLowerCase();
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".jsonl") return "application/x-ndjson; charset=utf-8";
  if (ext === ".md") return "text/markdown; charset=utf-8";
  if (ext === ".txt" || ext === ".log") return "text/plain; charset=utf-8";
  if (ext === ".js" || ext === ".mjs" || ext === ".cjs") {
    return "text/javascript; charset=utf-8";
  }
  if (ext === ".ts" || ext === ".tsx") return "text/typescript; charset=utf-8";
  if (ext === ".py" || ext === ".r") return "text/plain; charset=utf-8";
  if (ext === ".pdf") return "application/pdf";
  return "application/octet-stream";
}

function attachmentDisposition(path: string) {
  const fallback = basename(path).replace(/[^a-zA-Z0-9_.-]+/g, "-") || "dossier-file";
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(basename(path))}`;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; path: string[] }> },
) {
  const { id, path } = await params;
  const [paper] = await db
    .select({ id: papers.id })
    .from(papers)
    .where(eq(papers.id, id))
    .limit(1);
  if (!paper) return NextResponse.json({ error: "not found" }, { status: 404 });

  const relativePath = path.join("/");
  const resolved = await resolveCodexDossierFile({ paperId: id, relativePath });
  if (!resolved) {
    return NextResponse.json(
      { error: "dossier file not found" },
      { status: 404 },
    );
  }

  let fileStat;
  try {
    fileStat = await stat(resolved.absolutePath);
  } catch {
    return NextResponse.json(
      { error: "dossier file missing on disk" },
      { status: 404 },
    );
  }
  if (!fileStat.isFile()) {
    return NextResponse.json(
      { error: "dossier path is not a file" },
      { status: 404 },
    );
  }

  const stream = Readable.toWeb(createReadStream(resolved.absolutePath));
  return new Response(stream as BodyInit, {
    status: 200,
    headers: {
      "cache-control": "private, no-store",
      "content-disposition": attachmentDisposition(resolved.file.relativePath),
      "content-length": String(fileStat.size),
      "content-type": contentTypeFor(resolved.file.relativePath),
      "x-codex-job-id": resolved.dossier.job.id,
      "x-dossier-file-path": resolved.file.relativePath,
      "x-dossier-file-phase": resolved.file.phase,
      "x-dossier-hash-status": resolved.file.hashStatus,
      ...(resolved.file.sha256
        ? { "x-dossier-sha256": resolved.file.sha256 }
        : {}),
      "x-dossier-status": resolved.dossier.status,
      "x-content-type-options": "nosniff",
    },
  });
}
