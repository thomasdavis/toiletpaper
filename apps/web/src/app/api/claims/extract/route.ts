import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { db } from "@/lib/db";
import { papers, claims } from "@toiletpaper/db";
import { eq } from "drizzle-orm";
import { parseGs, getObject } from "@/lib/storage";

const UPLOADS_DIR = process.env.UPLOADS_DIR || join(process.cwd(), "uploads");

function hasExtractorProvider() {
  if (process.env.LLM_API_KEY || process.env.OPENROUTER_API_KEY) return true;
  const keyFile = process.env.LLM_API_KEY_FILE;
  return Boolean(keyFile && existsSync(keyFile));
}

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
    if (!hasExtractorProvider()) throw new Error("extractor provider not configured");
    const apiKey = process.env.LLM_API_KEY ?? process.env.OPENROUTER_API_KEY ?? "";

    let sourceBuffer: Buffer | null = null;
    let sourceName = "";
    if (paper.pdfUrl) {
      try {
        if (paper.pdfUrl.startsWith("gs://")) {
          const gs = parseGs(paper.pdfUrl);
          sourceBuffer = await getObject(gs.bucket, gs.key);
          sourceName = gs.key;
        } else if (paper.pdfUrl.startsWith("/uploads/")) {
          sourceName = basename(paper.pdfUrl);
          sourceBuffer = await readFile(join(UPLOADS_DIR, sourceName));
        } else {
          sourceName = paper.pdfUrl.replace(/^\//, "");
          sourceBuffer = await readFile(join(process.cwd(), sourceName));
        }
      } catch {
        // source might no longer exist; fall through to metadata-only extraction.
      }
    }

    if (!sourceBuffer) {
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

    const isPdf = sourceName.toLowerCase().endsWith(".pdf");
    const {
      extractPaper,
      extractClaimsFromText,
      ingestPaperIntoDonto,
      extractorModel,
      extractorVersion,
    } = await import("@toiletpaper/extractor");
    let result: Awaited<ReturnType<typeof extractPaper>>;
    if (isPdf) {
      result = await extractPaper(sourceBuffer, paper.id, apiKey);
    } else {
      const text = sourceBuffer.toString("utf-8");
      const extraction = await extractClaimsFromText(text, apiKey);
      const donto = await ingestPaperIntoDonto(
        paper.id,
        text,
        "",
        extraction,
        "text/markdown",
      );
      result = {
        pdf: { text, contentHash: "", pages: 0 },
        extraction,
        donto,
      };
    }

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
        extractorModel: extractorModel(),
        extractorVersion: extractorVersion(),
        parserVersion: isPdf ? "pdf-parse-1.1.1" : "markdown-raw",
        bodyCharCount: result.pdf.text.length,
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
      category: claim.category ?? "unknown",
      predicate: claim.predicate ?? null,
      value: claim.value ?? null,
      unit: claim.unit ?? null,
      evidence: claim.evidence ?? null,
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
