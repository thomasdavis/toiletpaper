import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "@/lib/db";
import { papers, claims } from "@toiletpaper/db";
import { eq } from "drizzle-orm";

export async function POST(req: Request) {
  const body = (await req.json()) as { paper_id: string };

  if (!body.paper_id) {
    return NextResponse.json(
      { error: "paper_id is required" },
      { status: 400 },
    );
  }

  const [paper] = await db
    .select()
    .from(papers)
    .where(eq(papers.id, body.paper_id));

  if (!paper) {
    return NextResponse.json({ error: "paper not found" }, { status: 404 });
  }

  await db
    .update(papers)
    .set({ status: "extracting", updatedAt: new Date() })
    .where(eq(papers.id, paper.id));

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY not set");

    let pdfBuffer: Buffer | null = null;
    if (paper.pdfUrl) {
      const localPath = join(process.cwd(), paper.pdfUrl.replace(/^\//, ""));
      try {
        pdfBuffer = await readFile(localPath);
      } catch {
        // file might not exist locally
      }
    }

    if (!pdfBuffer) {
      // No PDF available — fall back to metadata-only extraction
      const { ensurePaperContext, assertPaperMetadata } = await import(
        "@toiletpaper/donto-client/papers"
      );

      await ensurePaperContext();
      await assertPaperMetadata(
        `tp:paper:${paper.id}`,
        paper.title,
        paper.authors ?? [],
        paper.abstract,
      );

      const inserted = await db
        .insert(claims)
        .values([
          {
            paperId: paper.id,
            text: `No PDF available for "${paper.title}" — claims must be extracted manually`,
            status: "pending" as const,
          },
        ])
        .returning();

      await db
        .update(papers)
        .set({ status: "extracted", updatedAt: new Date() })
        .where(eq(papers.id, paper.id));

      return NextResponse.json({ claims: inserted });
    }

    const { extractPaper } = await import("@toiletpaper/extractor");
    const result = await extractPaper(pdfBuffer, paper.id, apiKey);

    // Update paper metadata from extraction
    await db
      .update(papers)
      .set({
        title: result.extraction.title || paper.title,
        authors:
          result.extraction.authors.length > 0
            ? result.extraction.authors
            : paper.authors,
        abstract: result.extraction.abstract || paper.abstract,
        updatedAt: new Date(),
      })
      .where(eq(papers.id, paper.id));

    // Insert extracted claims into primary DB
    const claimValues = result.extraction.claims.map((claim, i) => ({
      paperId: paper.id,
      text: claim.text,
      dontoSubjectIri: result.donto.claimIris[i] ?? null,
      status: "asserted" as const,
      confidence: claim.confidence,
    }));

    let inserted: (typeof claims.$inferSelect)[] = [];
    if (claimValues.length > 0) {
      inserted = await db.insert(claims).values(claimValues).returning();
    }

    await db
      .update(papers)
      .set({ status: "extracted", updatedAt: new Date() })
      .where(eq(papers.id, paper.id));

    return NextResponse.json({
      claims: inserted,
      donto: {
        documentId: result.donto.documentId,
        statementCount: result.donto.statementCount,
        claimCount: result.donto.claimIris.length,
      },
    });
  } catch (e) {
    console.error("Extraction failed:", e);
    await db
      .update(papers)
      .set({ status: "error", updatedAt: new Date() })
      .where(eq(papers.id, paper.id));

    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Extraction failed",
      },
      { status: 500 },
    );
  }
}
