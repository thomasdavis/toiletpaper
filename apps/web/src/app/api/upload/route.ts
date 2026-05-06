import { NextResponse } from "next/server";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { papers, claims, paperDontoIngest } from "@toiletpaper/db";
import { eq } from "drizzle-orm";
import { putObject } from "@/lib/storage";

// Cloud Run filesystem is read-only except for /tmp; allow override via env.
const UPLOADS_DIR = process.env.UPLOADS_DIR || join(process.cwd(), "uploads");
// If set, uploads go to gs://<bucket>/uploads/<id>.<ext> and pdfUrl is the gs:// URL.
const UPLOADS_BUCKET = process.env.UPLOADS_BUCKET || "";

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

  const buffer = Buffer.from(await file.arrayBuffer());
  let pdfUrl: string;
  if (UPLOADS_BUCKET) {
    // Persist to GCS so the file survives Cloud Run revision changes.
    await putObject(
      UPLOADS_BUCKET,
      `uploads/${filename}`,
      buffer,
      fileType === "pdf" ? "application/pdf" : "text/markdown; charset=utf-8",
    );
    pdfUrl = `gs://${UPLOADS_BUCKET}/uploads/${filename}`;
  } else {
    await mkdir(UPLOADS_DIR, { recursive: true });
    const filepath = join(UPLOADS_DIR, filename);
    await writeFile(filepath, buffer);
    pdfUrl = `/uploads/${filename}`;
  }

  const title = file.name.replace(/\.(pdf|md|markdown)$/i, "");

  const [paper] = await db
    .insert(papers)
    .values({
      title,
      authors: [],
      pdfUrl,
      status: "extracting",
    })
    .returning();

  const apiKey = process.env.OPENROUTER_API_KEY;
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

    // Mark the paper as "queued" for Donto ingest before we try.
    // Outcome (succeeded | failed) is recorded after the attempt.
    await db
      .insert(paperDontoIngest)
      .values({
        paperId: paper.id,
        state: "running",
        attempts: 1,
        lastAttemptAt: new Date(),
      })
      .onConflictDoUpdate({
        target: paperDontoIngest.paperId,
        set: {
          state: "running",
          lastAttemptAt: new Date(),
          updatedAt: new Date(),
        },
      });

    const { ingestPaperIntoDonto } = await import("@toiletpaper/extractor");
    let dontoResult;
    try {
      dontoResult = await ingestPaperIntoDonto(
        paper.id,
        textForExtraction,
        "",
        extraction,
        fileType === "markdown" ? "text/markdown" : "application/pdf",
      );
      await db
        .update(paperDontoIngest)
        .set({
          state: "succeeded",
          documentId: dontoResult.documentId || null,
          revisionId: dontoResult.revisionId || null,
          agentId: dontoResult.agentId || null,
          runId: dontoResult.runId || null,
          statementCount: dontoResult.statementCount ?? 0,
          spanCount: dontoResult.spanCount ?? 0,
          evidenceLinkCount: dontoResult.evidenceLinkCount ?? 0,
          argumentCount: dontoResult.argumentCount ?? 0,
          certifiedCount: dontoResult.certifiedCount ?? 0,
          shapeCheckCount: dontoResult.shapeChecks ?? 0,
          obligationIds: dontoResult.obligationIds ?? [],
          lastErrorCode: null,
          lastErrorMessage: null,
          updatedAt: new Date(),
        })
        .where(eq(paperDontoIngest.paperId, paper.id));
    } catch (dontoErr) {
      const msg = dontoErr instanceof Error ? dontoErr.message : String(dontoErr);
      console.error("Donto ingestion failed (continuing without):", msg);
      // Try to extract a useful machine code, e.g. "agents-bind-422".
      const codeMatch = msg.match(/(\/[a-z]+\/[a-z]+):? (\d{3})/i);
      const code = codeMatch
        ? `${codeMatch[1].replace(/^\//, "").replace(/\//g, "-")}-${codeMatch[2]}`
        : "ingest-failed";
      await db
        .update(paperDontoIngest)
        .set({
          state: "failed",
          lastErrorCode: code,
          lastErrorMessage: msg.slice(0, 1000),
          updatedAt: new Date(),
        })
        .where(eq(paperDontoIngest.paperId, paper.id));
      dontoResult = { claimIris: extraction.claims.map(() => null), statementCount: 0, documentId: "", revisionId: "", agentId: "", runId: "", obligationIds: [], spanCount: 0, evidenceLinkCount: 0, argumentCount: 0, certifiedCount: 0, shapeChecks: 0 };
    }

    await db
      .update(papers)
      .set({
        title: extraction.title || title,
        authors: (extraction.authors ?? []).filter(Boolean),
        abstract: extraction.abstract ?? null,
        extractorModel: "openai/gpt-5.5",
        extractorVersion: "2026-05",
        parserVersion: fileType === "markdown" ? "markdown-raw" : "pdf-parse-1.1.1",
        bodyCharCount: textForExtraction.length,
        updatedAt: new Date(),
      })
      .where(eq(papers.id, paper.id));

    const claimValues = extraction.claims.map((claim, i) => ({
      paperId: paper.id,
      text: claim.text ?? "",
      dontoSubjectIri: dontoResult.claimIris[i] ?? null,
      status: "asserted" as const,
      confidence: claim.confidence ?? null,
      category: claim.category ?? "unknown",
      predicate: claim.predicate ?? null,
      value: claim.value ?? null,
      unit: claim.unit ?? null,
      evidence: claim.evidence ?? null,
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
