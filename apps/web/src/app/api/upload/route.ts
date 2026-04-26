import { NextResponse } from "next/server";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { papers, claims } from "@toiletpaper/db";
import { eq } from "drizzle-orm";

const UPLOADS_DIR = join(process.cwd(), "uploads");

const ACCEPTED_TYPES = new Set([
  "application/pdf",
  "text/markdown",
  "text/plain",
  "text/x-markdown",
  "application/octet-stream",
]);

function inferType(name: string, mime: string): "pdf" | "markdown" | null {
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (
    name.endsWith(".md") ||
    name.endsWith(".markdown") ||
    mime.includes("markdown")
  )
    return "markdown";
  if (mime === "text/plain") return "markdown";
  return null;
}

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const fileType = inferType(file.name, file.type);
  if (!fileType) {
    return NextResponse.json(
      { error: "Only PDF and Markdown files are accepted" },
      { status: 400 },
    );
  }

  const fileId = randomUUID();
  const ext = fileType === "pdf" ? "pdf" : "md";
  const filename = `${fileId}.${ext}`;

  await mkdir(UPLOADS_DIR, { recursive: true });
  const filepath = join(UPLOADS_DIR, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filepath, buffer);

  const title = file.name.replace(/\.(pdf|md|markdown)$/i, "");

  const [paper] = await db
    .insert(papers)
    .values({
      title,
      authors: [],
      pdfUrl: `/uploads/${filename}`,
      status: "extracting",
    })
    .returning();

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    await db
      .update(papers)
      .set({ status: "uploaded", updatedAt: new Date() })
      .where(eq(papers.id, paper.id));
    return NextResponse.json({ id: paper.id }, { status: 201 });
  }

  try {
    let textForExtraction: string;

    if (fileType === "markdown") {
      textForExtraction = buffer.toString("utf-8");
    } else {
      const { extractTextFromPdf } = await import("@toiletpaper/extractor");
      const pdf = await extractTextFromPdf(buffer);
      textForExtraction = pdf.text;
    }

    const { extractClaimsFromText } = await import(
      "@toiletpaper/extractor"
    );
    const extraction = await extractClaimsFromText(textForExtraction, apiKey);

    const { ingestPaperIntoDonto } = await import("@toiletpaper/extractor");
    const dontoResult = await ingestPaperIntoDonto(
      paper.id,
      textForExtraction,
      "",
      extraction,
      fileType === "markdown" ? "text/markdown" : "application/pdf",
    );

    await db
      .update(papers)
      .set({
        title: extraction.title || title,
        authors:
          extraction.authors.length > 0 ? extraction.authors : [],
        abstract: extraction.abstract || null,
        updatedAt: new Date(),
      })
      .where(eq(papers.id, paper.id));

    const claimValues = extraction.claims.map((claim, i) => ({
      paperId: paper.id,
      text: claim.text,
      dontoSubjectIri: dontoResult.claimIris[i] ?? null,
      status: "asserted" as const,
      confidence: claim.confidence,
    }));

    if (claimValues.length > 0) {
      await db.insert(claims).values(claimValues);
    }

    await db
      .update(papers)
      .set({ status: "extracted", updatedAt: new Date() })
      .where(eq(papers.id, paper.id));

    return NextResponse.json(
      {
        id: paper.id,
        claims: claimValues.length,
        donto: {
          documentId: dontoResult.documentId,
          statementCount: dontoResult.statementCount,
        },
      },
      { status: 201 },
    );
  } catch (e) {
    console.error("Extraction failed:", e);
    await db
      .update(papers)
      .set({ status: "error", updatedAt: new Date() })
      .where(eq(papers.id, paper.id));

    return NextResponse.json(
      {
        id: paper.id,
        error: e instanceof Error ? e.message : "Extraction failed",
      },
      { status: 201 },
    );
  }
}
