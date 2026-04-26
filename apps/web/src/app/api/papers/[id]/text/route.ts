import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "@/lib/db";
import { papers } from "@toiletpaper/db";
import { eq } from "drizzle-orm";

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

  // Resolve the file path. pdfUrl is stored as "/uploads/xxx.ext"
  // Try the uploads directory first, then test/fixtures
  const filename = paper.pdfUrl.split("/").pop() ?? "";
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";

  const candidatePaths = [
    join(process.cwd(), paper.pdfUrl.replace(/^\//, "")),
    join(process.cwd(), "test", "fixtures", filename),
    // Also try matching by paper title in test/fixtures
    ...(paper.title
      ? [
          join(process.cwd(), "test", "fixtures", `${paper.title}.md`),
          join(process.cwd(), "test", "fixtures", `${paper.title}.pdf`),
        ]
      : []),
  ];

  let content: Buffer | null = null;
  let resolvedPath = "";
  for (const p of candidatePaths) {
    try {
      content = await readFile(p);
      resolvedPath = p;
      break;
    } catch {
      // try next
    }
  }

  if (!content) {
    return NextResponse.json(
      { error: "file not found on disk" },
      { status: 404 },
    );
  }

  const resolvedExt = resolvedPath.split(".").pop()?.toLowerCase() ?? ext;

  if (resolvedExt === "md" || resolvedExt === "markdown") {
    return NextResponse.json({
      text: content.toString("utf-8"),
      format: "markdown",
    });
  }

  // For PDFs, try to extract text
  if (resolvedExt === "pdf") {
    try {
      const { extractTextFromPdf } = await import("@toiletpaper/extractor");
      const pdf = await extractTextFromPdf(content);
      return NextResponse.json({ text: pdf.text, format: "plaintext" });
    } catch {
      return NextResponse.json(
        { error: "failed to extract text from PDF" },
        { status: 500 },
      );
    }
  }

  // Fallback: treat as plaintext
  return NextResponse.json({
    text: content.toString("utf-8"),
    format: "plaintext",
  });
}
