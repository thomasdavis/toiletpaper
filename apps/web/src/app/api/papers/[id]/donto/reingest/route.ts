import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { papers, paperDontoIngest } from "@toiletpaper/db";
import { eq, sql } from "drizzle-orm";
import { parseGs, getObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * POST /api/papers/{id}/donto/reingest
 *
 * Idempotent retry of the Donto ingest for a paper. Reads the source
 * PDF/markdown from GCS, re-runs the extractor's Donto path, and
 * updates `paper_donto_ingest`. Returns 204 if the paper is already
 * in `succeeded` state and the caller didn't pass `?force=true`.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const force = new URL(req.url).searchParams.get("force") === "true";

  const [paper] = await db.select().from(papers).where(eq(papers.id, id));
  if (!paper) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [existing] = await db
    .select()
    .from(paperDontoIngest)
    .where(eq(paperDontoIngest.paperId, id));

  if (!force && existing?.state === "succeeded") {
    return new NextResponse(null, { status: 204 });
  }

  if (!paper.pdfUrl) {
    return NextResponse.json(
      { error: "paper has no source attached" },
      { status: 400 },
    );
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY not set" },
      { status: 500 },
    );
  }

  // Fetch source PDF from GCS
  const gs = parseGs(paper.pdfUrl);
  if (!gs) {
    return NextResponse.json(
      { error: "source no longer available (legacy ephemeral path)" },
      { status: 410 },
    );
  }

  let buf: Buffer;
  try {
    buf = await getObject(gs.bucket, gs.key);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "fetch failed" },
      { status: 502 },
    );
  }

  const isPdf = gs.object.toLowerCase().endsWith(".pdf");
  let textForExtraction: string;
  if (isPdf) {
    const { extractTextFromPdf } = await import("@toiletpaper/extractor");
    const pdf = await extractTextFromPdf(buf);
    textForExtraction = pdf.text;
  } else {
    textForExtraction = buf.toString("utf-8");
  }

  const { extractClaimsFromText, ingestPaperIntoDonto } = await import(
    "@toiletpaper/extractor"
  );
  const extraction = await extractClaimsFromText(textForExtraction, apiKey);

  // Bump attempts + mark running
  await db
    .insert(paperDontoIngest)
    .values({
      paperId: id,
      state: "running",
      attempts: 1,
      lastAttemptAt: new Date(),
    })
    .onConflictDoUpdate({
      target: paperDontoIngest.paperId,
      set: {
        state: "running",
        attempts: sql`${paperDontoIngest.attempts} + 1`,
        lastAttemptAt: new Date(),
        updatedAt: new Date(),
      },
    });

  try {
    const result = await ingestPaperIntoDonto(
      id,
      textForExtraction,
      "",
      extraction,
      isPdf ? "application/pdf" : "text/markdown",
    );

    await db
      .update(paperDontoIngest)
      .set({
        state: "succeeded",
        documentId: result.documentId || null,
        revisionId: result.revisionId || null,
        agentId: result.agentId || null,
        runId: result.runId || null,
        statementCount: result.statementCount ?? 0,
        spanCount: result.spanCount ?? 0,
        evidenceLinkCount: result.evidenceLinkCount ?? 0,
        argumentCount: result.argumentCount ?? 0,
        certifiedCount: result.certifiedCount ?? 0,
        shapeCheckCount: result.shapeChecks ?? 0,
        obligationIds: result.obligationIds ?? [],
        lastErrorCode: null,
        lastErrorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(paperDontoIngest.paperId, id));

    return NextResponse.json({ state: "succeeded", result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
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
      .where(eq(paperDontoIngest.paperId, id));
    return NextResponse.json(
      { state: "failed", code, message: msg },
      { status: 502 },
    );
  }
}
