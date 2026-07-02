import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  resolvePaperArtifactFile,
  safeArtifactName,
} from "@/lib/paper-artifacts";
import { papers } from "@toiletpaper/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function requirePaper(id: string) {
  const [paper] = await db
    .select({ id: papers.id, title: papers.title })
    .from(papers)
    .where(eq(papers.id, id))
    .limit(1);
  return paper ?? null;
}

function attachmentDisposition(filename: string) {
  const fallback = safeArtifactName(filename).replace(/"/g, "");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function GET(
  _req: Request,
  {
    params,
  }: { params: Promise<{ id: string; bundleId: string; fileId: string }> },
) {
  const { id, bundleId, fileId } = await params;
  const paper = await requirePaper(id);
  if (!paper) return NextResponse.json({ error: "not found" }, { status: 404 });

  let resolved;
  try {
    resolved = await resolvePaperArtifactFile({ paperId: id, bundleId, fileId });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "artifact manifest could not be resolved",
      },
      { status: 500 },
    );
  }

  if (!resolved) {
    return NextResponse.json({ error: "artifact not found" }, { status: 404 });
  }

  let fileStat;
  try {
    fileStat = await stat(resolved.absolutePath);
  } catch {
    return NextResponse.json(
      { error: "artifact file missing on disk" },
      { status: 404 },
    );
  }

  if (!fileStat.isFile()) {
    return NextResponse.json(
      { error: "artifact path is not a file" },
      { status: 404 },
    );
  }

  const stream = Readable.toWeb(createReadStream(resolved.absolutePath));
  return new Response(stream as BodyInit, {
    status: 200,
    headers: {
      "cache-control": "private, no-store",
      "content-disposition": attachmentDisposition(resolved.file.originalName),
      "content-length": String(fileStat.size),
      "content-type": resolved.file.contentType || "application/octet-stream",
      "x-artifact-bundle-id": resolved.bundle.id,
      "x-artifact-file-id": resolved.file.id,
      "x-artifact-manifest-version": resolved.manifest.schemaVersion,
      "x-artifact-sha256": resolved.file.sha256,
      "x-artifact-source-kind": resolved.file.source?.kind ?? "upload",
      "x-content-type-options": "nosniff",
    },
  });
}
