import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { papers } from "@toiletpaper/db";
import { eq } from "drizzle-orm";
import { loadPaperText } from "@/lib/paper-text";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const [paper] = await db.select().from(papers).where(eq(papers.id, id));
  if (!paper) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (!paper.pdfUrl) {
    return NextResponse.json(
      { error: "no file associated with this paper" },
      { status: 404 },
    );
  }

  const paperText = await loadPaperText(paper);
  if (!paperText) {
    return NextResponse.json(
      { error: "file not found on disk" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    text: paperText.text,
    format: paperText.format,
    source: paperText.source,
  });
}
