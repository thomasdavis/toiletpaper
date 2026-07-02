export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { papers, simulations } from "@toiletpaper/db";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Container } from "@toiletpaper/ui";
import { PaperTabs } from "@/components/paper-tabs";
import {
  AnnotatedPaper,
  type AnnotatedClaim,
} from "@/components/annotated-paper";
import { isSignal, normalizeVerdict } from "@/lib/verdict";
import { getCurrentSimulationsForPaper } from "@/lib/current-simulations";
import { loadPaperText } from "@/lib/paper-text";

type Simulation = typeof simulations.$inferSelect;

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

function resultReason(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  return typeof r.reason === "string" ? r.reason : null;
}

function mapVerdict(
  verdict: string | null,
  metadata?: unknown,
  reason?: string | null,
): AnnotatedClaim["verdict"] {
  const normalized = normalizeVerdict(verdict, metadata, reason);
  return isSignal(normalized) ? normalized : "untested";
}

function bestVerdict(sims: Simulation[]): string {
  if (sims.length === 0) return "untested";
  const sorted = [...sims].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  return mapVerdict(sorted[0].verdict, sorted[0].metadata, resultReason(sorted[0].result));
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

export default async function AnnotatedPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [paper] = await db.select().from(papers).where(eq(papers.id, id));
  if (!paper) notFound();

  const { claims: paperClaims, simulations: sims } =
    await getCurrentSimulationsForPaper(id);
  paperClaims.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

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
