export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import { db } from "@/lib/db";
import { papers, claims, simulations } from "@toiletpaper/db";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PaperStatusBadge } from "@/components/paper-status-badge";
import { DontoStatusPill } from "@/components/donto-status-pill";
import { ClaimCard } from "@/components/claim-card";
import { DontoContextInfo } from "@/components/donto-context-info";
import { DontoDetails } from "@/components/donto-details";
import { VerdictSummary } from "@/components/verdict-summary";
import { getHistory, getContexts } from "@/lib/donto";
import {
  Container,
  Heading,
  Text,
  Stack,
  EmptyState,
} from "@toiletpaper/ui";
import { DebugPanel } from "@/components/debug-panel";
import { PaperTabs } from "@/components/paper-tabs";
import { SimulationStream } from "@/components/simulation-stream";
import { CollapsibleDetails } from "@/components/collapsible-details";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const [paper] = await db.select().from(papers).where(eq(papers.id, id));
  if (!paper) {
    return { title: "Paper not found" };
  }
  const authors =
    paper.authors && paper.authors.length > 0
      ? ` by ${paper.authors.slice(0, 3).join(", ")}${paper.authors.length > 3 ? " et al." : ""}`
      : "";
  const description =
    paper.abstract?.slice(0, 200) ??
    `Reproducibility analysis of "${paper.title}"${authors} on toiletpaper.`;
  return {
    title: paper.title,
    description,
    alternates: { canonical: `/papers/${id}` },
    openGraph: {
      title: paper.title,
      description,
      url: `/papers/${id}`,
      type: "article",
      authors: paper.authors ?? undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: paper.title,
      description,
    },
  };
}

export default async function PaperDetailPage({
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
    .where(eq(claims.paperId, id));

  const claimIds = paperClaims.map((c) => c.id);
  let sims: (typeof simulations.$inferSelect)[] = [];
  if (claimIds.length > 0) {
    const allSims = await Promise.all(
      claimIds.map((cid) =>
        db.select().from(simulations).where(eq(simulations.claimId, cid)),
      ),
    );
    sims = allSims.flat();
  }

  const paperIri = `tp:paper:${id}`;
  const claimsCtxIri = `tp:paper:${id}:claims`;

  const [dontoHistory, ctxData] = await Promise.all([
    getHistory(paperIri),
    getContexts(),
  ]);

  const paperCtx = ctxData?.contexts?.find(
    (c) => c.context === claimsCtxIri,
  );

  const claimsWithSims = paperClaims.map((claim) => ({
    ...claim,
    simulations: sims.filter((s) => s.claimId === claim.id),
  }));

  const reproduced = claimsWithSims.filter(c => c.simulations.some(s => s.verdict === "confirmed")).length;
  const contradicted = claimsWithSims.filter(c => c.simulations.some(s => s.verdict === "refuted")).length;
  const inconclusive = claimsWithSims.filter(c => c.simulations.length > 0 && !c.simulations.some(s => s.verdict === "confirmed" || s.verdict === "refuted")).length;
  const untested = claimsWithSims.filter(c => c.simulations.length === 0).length;

  return (
    <Container>
      <Stack gap={6}>
        {/* ── Header: title + metadata row ── */}
        <div>
          <Stack direction="horizontal" align="start" gap={3}>
            <Heading level={2}>{paper.title}</Heading>
            <PaperStatusBadge status={paper.status} />
          </Stack>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-[#6B6B6B]">
            {paper.authors && paper.authors.length > 0 && (
              <span>{paper.authors.join(", ")}</span>
            )}
            {paper.domain && paper.domain !== "unknown" && (
              <span className="rounded-full border border-[#E8E5DE] bg-[#FAFAF8] px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.18em]">
                {paper.domain}
              </span>
            )}
            {paper.pdfUrl && (
              <a
                href={`/api/papers/${id}/source`}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-[#D4D0C8] bg-white px-2.5 py-1 font-medium text-[#3D3D3D] shadow-sm hover:bg-[#F5F3EF]"
              >
                Source
              </a>
            )}
            <DontoStatusPill paperId={id} />
          </div>
        </div>

        {/* ── At-a-glance: verdict bar + stats + Donto ── */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {sims.length > 0 ? (
              <VerdictSummary simulations={sims} totalClaims={paperClaims.length} />
            ) : (
              <div className="flex h-full items-center justify-center rounded-lg border border-[#E8E5DE] bg-[#FAFAF8] p-6 text-center text-sm text-[#6B6B6B]">
                No simulations yet
              </div>
            )}
          </div>
          <div className="space-y-3">
            {paperCtx && (
              <DontoContextInfo
                contextIri={claimsCtxIri}
                kind={paperCtx.kind}
                statementCount={paperCtx.count}
                dontoHistory={dontoHistory}
              />
            )}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-[#E8E5DE] bg-white p-3 text-center">
                <div className="text-2xl font-bold text-[#1A1A1A]">{paperClaims.length}</div>
                <div className="text-[11px] uppercase tracking-wider text-[#6B6B6B]">Claims</div>
              </div>
              <div className="rounded-lg border border-[#E8E5DE] bg-white p-3 text-center">
                <div className="text-2xl font-bold text-[#1A1A1A]">{sims.length}</div>
                <div className="text-[11px] uppercase tracking-wider text-[#6B6B6B]">Simulations</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Abstract (collapsed) ── */}
        {paper.abstract && (
          <CollapsibleDetails summary={`Abstract (${paper.abstract.length} chars)`}>
            <Text size="sm" color="light" leading="relaxed">
              {paper.abstract}
            </Text>
          </CollapsibleDetails>
        )}

        {/* ── Tabs ── */}
        <PaperTabs
          paperId={id}
          active="overview"
          hasPdf={Boolean(paper.pdfUrl)}
          hasSims={sims.length > 0}
          counts={{ claims: paperClaims.length, simulations: sims.length }}
        />

        {/* ── Live simulation stream ── */}
        {(paper.status === "simulating" || paper.status === "extracted") && (
          <SimulationStream paperId={id} />
        )}

        {/* ── Claims grouped by verdict ── */}
        {claimsWithSims.length === 0 ? (
          <EmptyState
            title="No claims extracted yet"
            description="Claims will appear here once extraction completes."
          />
        ) : (
          <Stack gap={6}>
            {/* Contradicted first — most important */}
            {contradicted > 0 && (
              <div>
                <Heading level={5} className="mb-3">
                  <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-[#9B2226]" />
                  Contradicted ({contradicted})
                </Heading>
                <Stack gap={3}>
                  {claimsWithSims
                    .filter(c => c.simulations.some(s => s.verdict === "refuted"))
                    .map(claim => <ClaimCard key={claim.id} claim={claim} />)}
                </Stack>
              </div>
            )}

            {/* Reproduced */}
            {reproduced > 0 && (
              <div>
                <Heading level={5} className="mb-3">
                  <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-[#2D6A4F]" />
                  Reproduced ({reproduced})
                </Heading>
                <Stack gap={3}>
                  {claimsWithSims
                    .filter(c => c.simulations.some(s => s.verdict === "confirmed"))
                    .map(claim => <ClaimCard key={claim.id} claim={claim} />)}
                </Stack>
              </div>
            )}

            {/* Inconclusive */}
            {inconclusive > 0 && (
              <CollapsibleDetails summary={`Inconclusive (${inconclusive})`}>
                <Stack gap={3}>
                  {claimsWithSims
                    .filter(c => c.simulations.length > 0 && !c.simulations.some(s => s.verdict === "confirmed" || s.verdict === "refuted"))
                    .map(claim => <ClaimCard key={claim.id} claim={claim} />)}
                </Stack>
              </CollapsibleDetails>
            )}

            {/* Untested */}
            {untested > 0 && (
              <CollapsibleDetails summary={`Untested (${untested})`}>
                <Stack gap={3}>
                  {claimsWithSims
                    .filter(c => c.simulations.length === 0)
                    .map(claim => <ClaimCard key={claim.id} claim={claim} />)}
                </Stack>
              </CollapsibleDetails>
            )}
          </Stack>
        )}

        {/* ── Donto evidence substrate (collapsed) ── */}
        <CollapsibleDetails summary="Donto Evidence Substrate">
          <DontoDetails paperId={id} />
        </CollapsibleDetails>

        {/* ── Debug panels (collapsed) ── */}
        <CollapsibleDetails summary="Debug Data">
          <Stack gap={2}>
            <DebugPanel label="Paper" data={paper} />
            <DebugPanel label="Claims" data={paperClaims} />
            <DebugPanel label="Donto History" data={dontoHistory} />
          </Stack>
        </CollapsibleDetails>
      </Stack>
    </Container>
  );
}
