import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { papers } from "@toiletpaper/db";
import { eq } from "drizzle-orm";
import { parseGs, getObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * GET /api/papers/{id}/source
 *
 * Streams the source PDF/markdown back to the caller.
 *
 * For GCS-backed paper rows we authenticate via the metadata server
 * (server-side, no public bucket needed). For legacy local-disk URLs
 * we 404, since those files were on a previous Cloud Run revision and
 * are no longer available.
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

  const gs = parseGs(paper.pdfUrl);
  if (!gs) {
    return NextResponse.json(
      { error: "source no longer available (legacy ephemeral path)" },
      { status: 410 },
    );
  }

  let buf: Buffer;
  try {
    buf = await getObject(gs.bucket, gs.object);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "fetch failed" },
      { status: 502 },
    );
  }

  const ext = (gs.object.split(".").pop() ?? "pdf").toLowerCase();
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
