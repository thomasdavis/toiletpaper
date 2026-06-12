import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { papers } from "@toiletpaper/db";
import { eq } from "drizzle-orm";
import { parseGs, getObject } from "@/lib/storage";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";

export const dynamic = "force-dynamic";

const UPLOADS_DIR = process.env.UPLOADS_DIR || join(process.cwd(), "uploads");

/**
 * GET /api/papers/{id}/source
 *
 * Streams the source PDF/markdown back to the caller.
 *
 * For GCS-backed paper rows we authenticate via the metadata server
 * (server-side, no public bucket needed). For instance-local rows we
 * resolve /uploads/<file> against UPLOADS_DIR, which is persistent on
 * the donto host.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const [paper] = await db.select().from(papers).where(eq(papers.id, id));
  if (!paper) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (!paper.pdfUrl) {
    return NextResponse.json({ error: "no source attached" }, { status: 404 });
  }

  let buf: Buffer;
  let ext: string;
  try {
    if (paper.pdfUrl.startsWith("gs://")) {
      const gs = parseGs(paper.pdfUrl);
      buf = await getObject(gs.bucket, gs.key);
      ext = (gs.key.split(".").pop() ?? "pdf").toLowerCase();
    } else if (paper.pdfUrl.startsWith("/uploads/")) {
      const filename = basename(paper.pdfUrl);
      buf = await readFile(join(UPLOADS_DIR, filename));
      ext = (filename.split(".").pop() ?? "pdf").toLowerCase();
    } else {
      return NextResponse.json(
        { error: "unsupported source location" },
        { status: 410 },
      );
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "fetch failed" },
      { status: 502 },
    );
  }

  const contentType =
    ext === "pdf" ? "application/pdf"
      : ext === "md" || ext === "markdown" ? "text/markdown; charset=utf-8"
        : "application/octet-stream";

  // Sanitize the title for the Content-Disposition filename
  const safeTitle = paper.title
    .replace(/[^\w\s.-]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 80) || `paper_${id}`;
  const filename = `${safeTitle}.${ext}`;

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "content-type": contentType,
      "content-length": String(buf.byteLength),
      "content-disposition": `inline; filename="${filename}"`,
      "cache-control": "private, max-age=300",
    },
  });
}
