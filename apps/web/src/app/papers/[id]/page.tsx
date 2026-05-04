export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import { db } from "@/lib/db";
import { papers, claims, simulations } from "@toiletpaper/db";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PaperStatusBadge } from "@/components/paper-status-badge";
import { DontoStatusPill } from "@/components/donto-status-pill";
import { DontoContextInfo } from "@/components/donto-context-info";
import { DontoDetails } from "@/components/donto-details";
import { VerdictSummary } from "@/components/verdict-summary";
import { getHistory, getContexts } from "@/lib/donto";
import {
  Heading,
  Text,
  Stack,
  StatCard,
} from "@toiletpaper/ui";
import { DebugPanel } from "@/components/debug-panel";
import { SimulationStream } from "@/components/simulation-stream";
import { CollapsibleDetails } from "@/components/collapsible-details";
import { PaperWorkspace } from "@/components/paper-workspace";
import type { SerializedClaim, SerializedSimulation } from "@/components/claim-drawer";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const [paper] = await db.select().from(papers).where(eq(papers.id, id));
  if (!paper) return { title: "Paper not found" };
  const description = paper.abstract?.slice(0, 200) ?? `Reproducibility analysis of "${paper.title}"`;
  return {
    title: paper.title,
    description,
    alternates: { canonical: `/papers/${id}` },
    openGraph: { title: paper.title, description, url: `/papers/${id}`, type: "article" },
  };
}

function getClaimVerdict(sims: { verdict: string | null }[]): string {
  if (sims.length === 0) return "untested";
  if (sims.some((s) => s.verdict === "confirmed" || s.verdict === "reproduced")) return "reproduced";
  if (sims.some((s) => s.verdict === "refuted" || s.verdict === "contradicted")) return "contradicted";
  if (sims.some((s) => s.verdict === "fragile")) return "fragile";
  return "inconclusive";
}

function serializeSim(sim: typeof simulations.$inferSelect): SerializedSimulation {
  return {
    id: sim.id, claimId: sim.claimId, method: sim.method, simulatorId: sim.simulatorId,
    runId: sim.runId, replacesId: sim.replacesId, result: sim.result, verdict: sim.verdict,
    metadata: sim.metadata, createdAt: sim.createdAt.toISOString(),
  };
}

function serializeClaim(
  claim: typeof claims.$inferSelect,
  claimSims: (typeof simulations.$inferSelect)[],
): SerializedClaim {
  return {
    id: claim.id, paperId: claim.paperId, text: claim.text, canonicalText: claim.canonicalText,
    status: claim.status, confidence: claim.confidence, category: claim.category,
    predicate: claim.predicate, value: claim.value, unit: claim.unit, evidence: claim.evidence,
    testability: claim.testability, testabilityReason: claim.testabilityReason, page: claim.page,
    dontoSubjectIri: claim.dontoSubjectIri, createdAt: claim.createdAt.toISOString(),
    simulations: claimSims.map(serializeSim),
  };
}

export default async function PaperDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const activeTab = tab ?? "overview";

  const [paper] = await db.select().from(papers).where(eq(papers.id, id));
  if (!paper) notFound();

  const paperClaims = await db.select().from(claims).where(eq(claims.paperId, id));
  const claimIds = paperClaims.map((c) => c.id);
  let sims: (typeof simulations.$inferSelect)[] = [];
  if (claimIds.length > 0) {
    const allSims = await Promise.all(
      claimIds.map((cid) => db.select().from(simulations).where(eq(simulations.claimId, cid))),
    );
    sims = allSims.flat();
  }

  const paperIri = `tp:paper:${id}`;
  const claimsCtxIri = `tp:paper:${id}:claims`;
  const [dontoHistory, ctxData] = await Promise.all([getHistory(paperIri), getContexts()]);
  const paperCtx = ctxData?.contexts?.find((c) => c.context === claimsCtxIri);

  const claimsWithSims = paperClaims.map((claim) => ({
    claim,
    sims: sims.filter((s) => s.claimId === claim.id),
  }));

  const tested = claimsWithSims.filter((c) => c.sims.length > 0).length;
  const reproduced = claimsWithSims.filter((c) => getClaimVerdict(c.sims) === "reproduced").length;
  const contradicted = claimsWithSims.filter((c) => getClaimVerdict(c.sims) === "contradicted").length;
  const fragile = claimsWithSims.filter((c) => getClaimVerdict(c.sims) === "fragile").length;

  const serializedClaims: SerializedClaim[] = claimsWithSims.map((c) => serializeClaim(c.claim, c.sims));
  const serializedSims: SerializedSimulation[] = sims.map(serializeSim);

  return (
    <div className="p-6 max-w-5xl">
      {/* Header */}
      <header className="mb-6">
        <div className="flex items-start gap-3">
          <Heading level={3} className="flex-1 min-w-0">{paper.title}</Heading>
          <PaperStatusBadge status={paper.status} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-[#6B6B6B]">
          {paper.authors && paper.authors.length > 0 && <span>{paper.authors.join(", ")}</span>}
          {paper.domain && paper.domain !== "unknown" && (
            <span className="rounded-full border border-[#E8E5DE] bg-[#FAFAF8] px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.18em]">{paper.domain}</span>
          )}
          {paper.pdfUrl && (
            <a href={`/api/papers/${id}/source`} target="_blank" rel="noreferrer"
              className="rounded-md border border-[#D4D0C8] bg-white px-2.5 py-1 font-medium text-[#3D3D3D] shadow-sm hover:bg-[#F5F3EF] cursor-pointer">Source</a>
          )}
          <DontoStatusPill paperId={id} />
        </div>
        {paper.abstract && (
          <Text size="sm" color="light" className="mt-2 line-clamp-2">{paper.abstract}</Text>
        )}
      </header>

      {/* Live simulation stream */}
      {(paper.status === "simulating" || paper.status === "extracted") && (
        <div className="mb-6"><SimulationStream paperId={id} /></div>
      )}

      {/* Tab content */}
      {activeTab === "overview" && (
        <Stack gap={6}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard label="Total Claims" value={paperClaims.length} />
            <StatCard label="Tested" value={tested} unit={`of ${paperClaims.length}`} />
            <StatCard label="Reproduced" value={reproduced} className="border-l-2 border-l-[#2D6A4F]" />
            <StatCard label="Contradicted" value={contradicted} className="border-l-2 border-l-[#9B2226] ring-1 ring-[#9B2226]/20" />
            <StatCard label="Fragile" value={fragile} className="border-l-2 border-l-[#B07D2B]" />
          </div>
          {sims.length > 0 && <VerdictSummary simulations={sims} totalClaims={paperClaims.length} />}
          {paper.abstract && (
            <CollapsibleDetails summary="Full Abstract">
              <Text size="sm" color="light" leading="relaxed">{paper.abstract}</Text>
            </CollapsibleDetails>
          )}
          {paperCtx && (
            <DontoContextInfo contextIri={claimsCtxIri} kind={paperCtx.kind}
              statementCount={paperCtx.count} dontoHistory={dontoHistory} />
          )}
        </Stack>
      )}

      {(activeTab === "findings" || activeTab === "claims" || activeTab === "simulations" || activeTab === "code") && (
        <PaperWorkspace
          activeTab={activeTab}
          claims={serializedClaims}
          simulations={serializedSims}
          paperId={id}
          dontoContext={paperCtx ? { contextIri: claimsCtxIri, kind: paperCtx.kind, statementCount: paperCtx.count, dontoHistory } : null}
        />
      )}

      {activeTab === "evidence" && (
        <Stack gap={4}>
          {paperCtx && (
            <DontoContextInfo contextIri={claimsCtxIri} kind={paperCtx.kind}
              statementCount={paperCtx.count} dontoHistory={dontoHistory} />
          )}
          <DontoDetails paperId={id} />
        </Stack>
      )}

      <div className="mt-8">
        <CollapsibleDetails summary="Debug Data">
          <Stack gap={2}>
            <DebugPanel label="Paper" data={paper} />
            <DebugPanel label="Claims" data={paperClaims} />
            <DebugPanel label="Donto" data={dontoHistory} />
          </Stack>
        </CollapsibleDetails>
      </div>
    </div>
  );
}
