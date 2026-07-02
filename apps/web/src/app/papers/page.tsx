// Force per-request rendering — the DB state changes constantly, never prerender.
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import { db } from "@/lib/db";
import { papers, claims, simulations } from "@toiletpaper/db";
import { desc, eq, count as countFn, inArray } from "drizzle-orm";
import Link from "next/link";
import {
  Container,
  EmptyState,
} from "@toiletpaper/ui";
import { isSignal, normalizeVerdict } from "@/lib/verdict";
import {
  currentSimulations,
  latestSimulationJobForPaper,
} from "@/lib/current-simulations";

export const metadata: Metadata = {
  title: "Papers",
  description:
    "All research papers analyzed by toiletpaper — with claim counts, simulation verdicts, and reproducibility status.",
  alternates: { canonical: "/papers" },
  openGraph: {
    title: "Papers · toiletpaper",
    description:
      "All research papers analyzed by toiletpaper — with claim counts, simulation verdicts, and reproducibility status.",
    url: "/papers",
    type: "website",
  },
};

function statusBadgeClasses(status: string) {
  switch (status) {
    case "done":
      return "bg-[#D4EDE1] text-[#2D6A4F]";
    case "error":
      return "bg-[#F5D5D6] text-[#9B2226]";
    case "extracting":
    case "simulating":
      return "bg-[#E8EEF5] text-[#4A6FA5]";
    case "extracted":
      return "bg-[#F5ECD4] text-[#B07D2B]";
    default:
      return "bg-[#F5F3EF] text-[#6B6B6B]";
  }
}

interface PaperRow {
  id: string;
  title: string;
  authors: string[] | null;
  abstract: string | null;
  status: string;
  createdAt: Date;
  claimCount: number;
  verdicts: { reproduced: number; contradicted: number; inconclusive: number; noSignal: number };
  simCount: number;
}

function resultReason(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  return typeof r.reason === "string" ? r.reason : null;
}

export default async function PapersPage() {
  let rows: PaperRow[] = [];

  try {
    const paperRows = await db
      .select()
      .from(papers)
      .orderBy(desc(papers.createdAt))
      .limit(100);

    const counts = await Promise.all(
      paperRows.map((p) =>
        db
          .select({ value: countFn() })
          .from(claims)
          .where(eq(claims.paperId, p.id)),
      ),
    );

    // Get all claim IDs per paper, then fetch simulations
    const paperClaimIds = await Promise.all(
      paperRows.map((p) =>
        db
          .select({ id: claims.id })
          .from(claims)
          .where(eq(claims.paperId, p.id)),
      ),
    );

    const paperSimulations = await Promise.all(
      paperClaimIds.map(async (claimRows, index) => {
        const ids = claimRows.map((c) => c.id);
        if (ids.length === 0) return [];
        const [allSims, latestJob] = await Promise.all([
          db.select().from(simulations).where(inArray(simulations.claimId, ids)),
          latestSimulationJobForPaper(paperRows[index].id),
        ]);
        return currentSimulations(allSims, latestJob);
      }),
    );

    rows = paperRows.map((p, i) => {
      const sims = paperSimulations[i] ?? [];
      const normalized = sims.map((s) =>
        normalizeVerdict(s.verdict, s.metadata, resultReason(s.result)),
      );
      const verdicts = {
        reproduced: normalized.filter((v) => v === "reproduced").length,
        contradicted: normalized.filter((v) => v === "contradicted").length,
        inconclusive: normalized.filter((v) => v === "inconclusive" || v === "fragile").length,
        noSignal: normalized.filter((v) => !isSignal(v)).length,
      };
      return {
        id: p.id,
        title: p.title,
        authors: p.authors,
        abstract: p.abstract,
        status: p.status,
        createdAt: p.createdAt,
        claimCount: counts[i]?.[0]?.value ?? 0,
        verdicts,
        simCount: sims.length,
      };
    });
  } catch { /* DB not available */ }

  return (
    <Container>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-[36px] font-bold leading-tight tracking-[-0.02em] text-[#1A1A1A]">
            Papers
          </h2>
          <Link href="/upload">
            <button className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#4A6FA5] px-4 text-sm font-medium text-white shadow-sm transition-all hover:bg-[#3A5A87] active:bg-[#2E4A6F]">
              Upload
            </button>
          </Link>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title="No papers yet"
            description="Upload a paper to get started with claim extraction and verification."
            action={
              <Link href="/upload">
                <button className="inline-flex h-11 items-center gap-2 rounded-md bg-[#4A6FA5] px-6 text-sm font-medium text-white shadow-sm transition-all hover:bg-[#3A5A87] active:bg-[#2E4A6F]">
                  Upload one
                </button>
              </Link>
            }
          />
        ) : (
          <div className="space-y-4">
            {rows.map((paper) => (
              <Link key={paper.id} href={`/papers/${paper.id}`}>
                <div className="rounded-xl border border-[#E8E5DE] bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-serif text-[20px] font-bold leading-tight text-[#1A1A1A]">
                        {paper.title}
                      </h3>
                      {paper.authors && paper.authors.length > 0 && (
                        <p className="mt-0.5 text-sm text-[#6B6B6B]">
                          {paper.authors.join(", ")}
                        </p>
                      )}
                      {paper.abstract && (
                        <p className="mt-2 line-clamp-2 text-sm text-[#9B9B9B]">
                          {paper.abstract}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <span className="text-xs text-[#6B6B6B]">
                          {paper.claimCount} claims
                        </span>
                        <span className="text-xs text-[#9B9B9B]">&middot;</span>
                        <span className="text-xs text-[#6B6B6B]">
                          {new Date(paper.createdAt).toLocaleDateString()}
                        </span>
                        {/* Verdict mini-summary */}
                        {paper.simCount > 0 && (
                          <>
                            <span className="text-xs text-[#9B9B9B]">&middot;</span>
                            <span className="inline-flex items-center gap-2 text-xs">
                              <span className="font-semibold text-[#2D6A4F]">{paper.verdicts.reproduced} &#10003;</span>
                              <span className="font-semibold text-[#9B2226]">{paper.verdicts.contradicted} &#10007;</span>
                              <span className="font-semibold text-[#B07D2B]">{paper.verdicts.inconclusive} ~</span>
                              {paper.verdicts.noSignal > 0 && (
                                <span className="font-semibold text-[#8B8589]">{paper.verdicts.noSignal} no signal</span>
                              )}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClasses(paper.status)}`}>
                        {paper.status}
                      </span>
                      {paper.simCount > 0 && (
                        <span className="text-xs font-medium text-[#4A6FA5] hover:underline">
                          View Report &rarr;
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Container>
  );
}
