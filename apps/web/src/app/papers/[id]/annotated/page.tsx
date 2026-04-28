export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import { db } from "@/lib/db";
import { papers, claims, simulations } from "@toiletpaper/db";
import { eq, asc } from "drizzle-orm";
import { notFound } from "next/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const [paper] = await db.select().from(papers).where(eq(papers.id, id));
  if (!paper) return { title: "Annotated paper not found" };
  const description = `Read "${paper.title}" with extracted claims highlighted inline and color-coded by simulation verdict.`;
  return {
    title: `Annotated · ${paper.title}`,
    description,
    alternates: { canonical: `/papers/${id}/annotated` },
    openGraph: {
      title: `Annotated · ${paper.title}`,
      description,
      url: `/papers/${id}/annotated`,
      type: "article",
    },
  };
}
import Link from "next/link";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Container } from "@toiletpaper/ui";
import { parseGs, getObject } from "@/lib/storage";
import { PaperTabs } from "@/components/paper-tabs";
import {
  AnnotatedPaper,
  type AnnotatedClaim,
} from "@/components/annotated-paper";

type Simulation = typeof simulations.$inferSelect;

function mapVerdict(verdict: string | null, metadata?: unknown) {
  if (metadata && typeof metadata === "object") {
    const m = metadata as Record<string, unknown>;
    if (typeof m.original_verdict === "string") {
      const ov = m.original_verdict;
      if (ov === "reproduced") return "reproduced" as const;
      if (ov === "contradicted") return "contradicted" as const;
      if (ov === "fragile") return "fragile" as const;
    }
  }
  if (verdict === "confirmed") return "reproduced" as const;
  if (verdict === "refuted") return "contradicted" as const;
  return "inconclusive" as const;
}

function bestVerdict(sims: Simulation[]): string {
  if (sims.length === 0) return "untested";
  const sorted = [...sims].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  return mapVerdict(sorted[0].verdict, sorted[0].metadata);
}

function extractResult(result: unknown) {
  if (!result || typeof result !== "object") return {};
  const r = result as Record<string, unknown>;
  const fmt = (v: unknown) =>
    v == null
      ? undefined
      : typeof v === "object"
        ? JSON.stringify(v)
        : String(v);
  return {
    reason: typeof r.reason === "string" ? r.reason : undefined,
    measured: fmt(r.measured),
    expected: fmt(r.expected),
    confidence: typeof r.confidence === "number" ? r.confidence : undefined,
  };
}

async function decodeContent(
  content: Buffer,
  ext: string,
): Promise<{ text: string; format: "markdown" | "plaintext" } | null> {
  if (ext === "md" || ext === "markdown") {
    return { text: content.toString("utf-8"), format: "markdown" };
  }
  if (ext === "pdf") {
    try {
      const { extractTextFromPdf } = await import("@toiletpaper/extractor");
      const pdf = await extractTextFromPdf(content);
      return { text: pdf.text, format: "plaintext" };
    } catch {
      return null;
    }
  }
  return { text: content.toString("utf-8"), format: "plaintext" };
}

async function loadPaperText(
  paper: { pdfUrl: string | null; title: string },
): Promise<{ text: string; format: "markdown" | "plaintext" } | null> {
  if (!paper.pdfUrl) return null;

  // GCS-backed uploads — fetch via the metadata-server-authed helper.
  const gs = parseGs(paper.pdfUrl);
  if (gs) {
    try {
      const buf = await getObject(gs.bucket, gs.object);
      const ext = gs.object.split(".").pop()?.toLowerCase() ?? "";
      return await decodeContent(buf, ext);
    } catch {
      return null;
    }
  }

  const filename = paper.pdfUrl.split("/").pop() ?? "";
  const candidatePaths = [
    join(process.cwd(), paper.pdfUrl.replace(/^\//, "")),
    join(process.cwd(), "test", "fixtures", filename),
    join(process.cwd(), "test", "fixtures", `${paper.title}.md`),
    join(process.cwd(), "test", "fixtures", `${paper.title}.pdf`),
  ];

  for (const p of candidatePaths) {
    try {
      const content = await readFile(p);
      const ext = p.split(".").pop()?.toLowerCase() ?? "";
      const decoded = await decodeContent(content, ext);
      if (decoded) return decoded;
    } catch {
      continue;
    }
  }
  return null;
}

export default async function AnnotatedPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [paper] = await db.select().from(papers).where(eq(papers.id, id));
  if (!paper) notFound();

  const paperClaims = await db
    .select()
    .from(claims)
    .where(eq(claims.paperId, id))
    .orderBy(asc(claims.createdAt));

  const claimIds = paperClaims.map((c) => c.id);
  let sims: Simulation[] = [];
  if (claimIds.length > 0) {
    const allSims = await Promise.all(
      claimIds.map((cid) =>
        db.select().from(simulations).where(eq(simulations.claimId, cid)),
      ),
    );
    sims = allSims.flat();
  }

  // Load paper text
  const paperText = await loadPaperText(paper);

  if (!paperText) {
    return (
      <Container>
        <div className="space-y-6 py-4">
          <div>
            <h1 className="font-serif text-3xl font-bold tracking-tight text-[#1A1A1A]">
              {paper.title}
            </h1>
            <p className="mt-2 text-sm text-[#6B6B6B]">Annotated view</p>
          </div>

          <PaperTabs
            paperId={id}
            active="annotated"
            hasPdf={Boolean(paper.pdfUrl)}
            hasSims={sims.length > 0}
            counts={{ claims: paperClaims.length, simulations: sims.length }}
          />

          <div className="rounded-lg border border-[#E8E5DE] bg-white p-12 text-center">
            <p className="text-[#9B9B9B]">
              Paper text is not available. Upload a markdown or PDF file to view
              the annotated version.
            </p>
            <Link
              href={`/papers/${id}`}
              className="mt-4 inline-block text-sm text-[#4A6FA5] hover:underline"
            >
              Back to paper details
            </Link>
          </div>
        </div>
      </Container>
    );
  }

  // Build annotated claims
  const annotatedClaims: AnnotatedClaim[] = paperClaims.map((claim) => {
    const claimSims = sims.filter((s) => s.claimId === claim.id);
    const verdict = bestVerdict(claimSims);
    // Get the best simulation result for display
    const bestSim = claimSims.length > 0
      ? claimSims.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )[0]
      : null;
    const result = bestSim ? extractResult(bestSim.result) : {};

    return {
      id: claim.id,
      text: claim.text,
      verdict: verdict as AnnotatedClaim["verdict"],
      reason: result.reason,
      measured: result.measured,
      expected: result.expected,
      confidence: result.confidence,
      spanStart: null, // Will be computed by fuzzy matching in the client
      spanEnd: null,
    };
  });

  // Count verdicts for the summary bar
  const counts = {
    reproduced: annotatedClaims.filter((c) => c.verdict === "reproduced").length,
    contradicted: annotatedClaims.filter((c) => c.verdict === "contradicted").length,
    fragile: annotatedClaims.filter((c) => c.verdict === "fragile").length,
    inconclusive: annotatedClaims.filter((c) => c.verdict === "inconclusive").length,
    untested: annotatedClaims.filter((c) => c.verdict === "untested").length,
  };

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-[1400px] px-4 pt-4">
        {/* Header */}
        <div className="mb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="font-serif text-2xl font-bold text-[#1A1A1A]">
                {paper.title}
              </h1>
              {paper.authors && paper.authors.length > 0 && (
                <p className="mt-1 text-sm text-[#6B6B6B]">
                  {paper.authors.join(", ")}
                </p>
              )}
            </div>
          </div>
        </div>

        <PaperTabs
          paperId={id}
          active="annotated"
          hasPdf={Boolean(paper.pdfUrl)}
          hasSims={sims.length > 0}
          counts={{ claims: paperClaims.length, simulations: sims.length }}
        />

        <div className="mb-4">
          {/* Mini verdict summary bar */}
          <div className="flex flex-wrap items-center gap-4 text-xs">
            {counts.reproduced > 0 && (
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: "#2D6A4F" }}
                />
                <span style={{ color: "#2D6A4F", fontWeight: 600 }}>
                  {counts.reproduced} reproduced
                </span>
              </span>
            )}
            {counts.contradicted > 0 && (
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: "#9B2226" }}
                />
                <span style={{ color: "#9B2226", fontWeight: 600 }}>
                  {counts.contradicted} contradicted
                </span>
              </span>
            )}
            {counts.fragile > 0 && (
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: "#B07D2B" }}
                />
                <span style={{ color: "#B07D2B", fontWeight: 600 }}>
                  {counts.fragile} fragile
                </span>
              </span>
            )}
            {counts.inconclusive > 0 && (
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: "#B07D2B" }}
                />
                <span style={{ color: "#B07D2B", fontWeight: 600 }}>
                  {counts.inconclusive} inconclusive
                </span>
              </span>
            )}
            {counts.untested > 0 && (
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: "#9B9B9B" }}
                />
                <span style={{ color: "#9B9B9B", fontWeight: 600 }}>
                  {counts.untested} untested
                </span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Annotated paper viewer */}
      <div className="mx-auto max-w-[1400px] px-4 pb-16">
        <AnnotatedPaper
          paperText={paperText.text}
          format={paperText.format}
          claims={annotatedClaims}
        />
      </div>
    </div>
  );
}
