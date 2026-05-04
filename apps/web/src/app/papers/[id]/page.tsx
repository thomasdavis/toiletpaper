export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import { db } from "@/lib/db";
import { papers, claims, simulations, replicationBlueprints, paperDontoIngest, routerDecisions } from "@toiletpaper/db";
import { desc } from "drizzle-orm";
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
import { SessionLogPanel } from "@/components/session-log-panel";
import type { SerializedClaim, SerializedSimulation } from "@/components/claim-drawer";
import { BlueprintPanel } from "@/components/blueprint-panel";

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
    evidenceMode: sim.evidenceMode, limitations: sim.limitations,
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
    sectionPath: claim.sectionPath, charStart: claim.charStart, charEnd: claim.charEnd,
    extractorModel: claim.extractorModel, extractorVersion: claim.extractorVersion,
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

  // Fetch latest blueprint for this paper (only if on blueprint tab to avoid extra query)
  let blueprintData: unknown = null;
  let blueprintModel: string | null = null;
  let blueprintCreatedAt: string | null = null;
  if (activeTab === "blueprint") {
    const [bp] = await db
      .select()
      .from(replicationBlueprints)
      .where(eq(replicationBlueprints.paperId, id))
      .orderBy(desc(replicationBlueprints.createdAt))
      .limit(1);
    if (bp) {
      blueprintData = bp.blueprint;
      blueprintModel = bp.modelUsed;
      blueprintCreatedAt = bp.createdAt.toISOString();
    }
  }

  // Fetch Donto ingest row
  let ingestRow: (typeof paperDontoIngest.$inferSelect) | undefined;
  try {
    const [row] = await db.select().from(paperDontoIngest).where(eq(paperDontoIngest.paperId, id));
    ingestRow = row;
  } catch {
    ingestRow = undefined;
  }

  // Fetch router decisions for this paper
  const routerRows = await db.select().from(routerDecisions).where(eq(routerDecisions.paperId, id));

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


      {(paper.status === "simulating" || paper.status === "extracted") && (
        <div className="mb-6"><SimulationStream paperId={id} /></div>
      )}

      {activeTab === "overview" && (
        <Stack gap={6}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard label="Total Claims" value={paperClaims.length} />
            <StatCard label="Tested" value={tested} unit={`of ${paperClaims.length}`} />
            <StatCard label="Reproduced" value={reproduced} className="border-l-2 border-l-[#2D6A4F]" />
            <StatCard label="Contradicted" value={contradicted} className="border-l-2 border-l-[#9B2226] ring-1 ring-[#9B2226]/20" />
            <StatCard label="Fragile" value={fragile} className="border-l-2 border-l-[#B07D2B]" />
          </div>

          {/* Paper Metadata */}
          <div className="rounded-lg border border-[#E8E5DE] bg-white p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#9B9B9B] mb-3">Paper Metadata</h4>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
              {paper.year && <div><span className="text-[#9B9B9B]">Year:</span> {paper.year}</div>}
              {paper.venue && <div><span className="text-[#9B9B9B]">Venue:</span> {paper.venue}</div>}
              {paper.doi && (
                <div>
                  <span className="text-[#9B9B9B]">DOI:</span>{" "}
                  <a href={`https://doi.org/${paper.doi}`} target="_blank" rel="noreferrer" className="text-[#2563EB] hover:underline font-mono text-xs">{paper.doi}</a>
                </div>
              )}
              {paper.arxivId && (
                <div>
                  <span className="text-[#9B9B9B]">arXiv:</span>{" "}
                  <a href={`https://arxiv.org/abs/${paper.arxivId}`} target="_blank" rel="noreferrer" className="text-[#2563EB] hover:underline font-mono text-xs">{paper.arxivId}</a>
                </div>
              )}
              {paper.domain && paper.domain !== "unknown" && (
                <div>
                  <span className="text-[#9B9B9B]">Domain:</span> {paper.domain}
                  {paper.domainConfidence != null && (
                    <span className="ml-1 text-xs text-[#9B9B9B]">({(paper.domainConfidence * 100).toFixed(0)}% confidence)</span>
                  )}
                </div>
              )}
              {paper.pageCount != null && (
                <div><span className="text-[#9B9B9B]">Pages:</span> {paper.pageCount}</div>
              )}
              {paper.bodyCharCount != null && (
                <div><span className="text-[#9B9B9B]">Body Characters:</span> {paper.bodyCharCount.toLocaleString()}</div>
              )}
              {paper.extractorModel && (
                <div><span className="text-[#9B9B9B]">Extractor Model:</span> <span className="font-mono text-xs">{paper.extractorModel}</span></div>
              )}
              {paper.extractorVersion && (
                <div><span className="text-[#9B9B9B]">Extractor Version:</span> <span className="font-mono text-xs">{paper.extractorVersion}</span></div>
              )}
              {paper.parserVersion && (
                <div><span className="text-[#9B9B9B]">Parser Version:</span> <span className="font-mono text-xs">{paper.parserVersion}</span></div>
              )}
              <div><span className="text-[#9B9B9B]">Created:</span> {paper.createdAt.toLocaleDateString()}</div>
              <div><span className="text-[#9B9B9B]">Updated:</span> {paper.updatedAt.toLocaleDateString()}</div>
            </div>
          </div>

          {/* Donto Ingest Details */}
          {ingestRow && (
            <div className="rounded-lg border border-[#E8E5DE] bg-white p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#9B9B9B] mb-3">Donto Ingest</h4>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <div>
                  <span className="text-[#9B9B9B]">State:</span>{" "}
                  <span className={
                    ingestRow.state === "succeeded" ? "text-[#2D6A4F] font-medium"
                    : ingestRow.state === "failed" ? "text-[#9B2226] font-medium"
                    : "text-[#B07D2B] font-medium"
                  }>
                    {ingestRow.state}
                  </span>
                </div>
                <div><span className="text-[#9B9B9B]">Attempts:</span> {ingestRow.attempts}</div>
                {ingestRow.statementCount > 0 && <div><span className="text-[#9B9B9B]">Statements:</span> {ingestRow.statementCount}</div>}
                {ingestRow.spanCount > 0 && <div><span className="text-[#9B9B9B]">Spans:</span> {ingestRow.spanCount}</div>}
                {ingestRow.evidenceLinkCount > 0 && <div><span className="text-[#9B9B9B]">Evidence Links:</span> {ingestRow.evidenceLinkCount}</div>}
                {ingestRow.argumentCount > 0 && <div><span className="text-[#9B9B9B]">Arguments:</span> {ingestRow.argumentCount}</div>}
                {ingestRow.certifiedCount > 0 && <div><span className="text-[#9B9B9B]">Certified:</span> {ingestRow.certifiedCount}</div>}
                {ingestRow.shapeCheckCount > 0 && <div><span className="text-[#9B9B9B]">Shape Checks:</span> {ingestRow.shapeCheckCount}</div>}
              </div>
              {ingestRow.state === "failed" && (ingestRow.lastErrorCode || ingestRow.lastErrorMessage) && (
                <div className="mt-3 rounded border border-[#9B2226]/20 bg-[#9B2226]/5 p-2 text-xs">
                  {ingestRow.lastErrorCode && <div><span className="text-[#9B9B9B]">Error Code:</span> <span className="font-mono text-[#9B2226]">{ingestRow.lastErrorCode}</span></div>}
                  {ingestRow.lastErrorMessage && <div className="mt-1"><span className="text-[#9B9B9B]">Error:</span> <span className="text-[#9B2226]">{ingestRow.lastErrorMessage}</span></div>}
                </div>
              )}
              {(ingestRow.documentId || ingestRow.revisionId || ingestRow.agentId || ingestRow.runId) && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-medium text-[#9B9B9B] hover:text-[#6B6B6B]">Ingest IDs</summary>
                  <div className="mt-1 grid grid-cols-2 gap-x-6 gap-y-1 text-xs font-mono">
                    {ingestRow.documentId && <div><span className="text-[#9B9B9B]">Document:</span> {ingestRow.documentId}</div>}
                    {ingestRow.revisionId && <div><span className="text-[#9B9B9B]">Revision:</span> {ingestRow.revisionId}</div>}
                    {ingestRow.agentId && <div><span className="text-[#9B9B9B]">Agent:</span> {ingestRow.agentId}</div>}
                    {ingestRow.runId && <div><span className="text-[#9B9B9B]">Run:</span> {ingestRow.runId}</div>}
                  </div>
                </details>
              )}
              {ingestRow.obligationIds && ingestRow.obligationIds.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-medium text-[#9B9B9B] hover:text-[#6B6B6B]">Obligation IDs ({ingestRow.obligationIds.length})</summary>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {ingestRow.obligationIds.map((oid) => (
                      <span key={oid} className="rounded bg-[#F5F3EF] px-1.5 py-0.5 text-[10px] font-mono text-[#6B6B6B]">{oid}</span>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          {/* Router Decisions */}
          {routerRows.length > 0 && (
            <div className="rounded-lg border border-[#E8E5DE] bg-white p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#9B9B9B] mb-3">Router Decisions ({routerRows.length})</h4>
              <details>
                <summary className="cursor-pointer text-xs font-medium text-[#9B9B9B] hover:text-[#6B6B6B]">Show routing decisions</summary>
                <div className="mt-2 space-y-2">
                  {routerRows.map((rd) => (
                    <div key={rd.id} className="rounded border border-[#E8E5DE] bg-[#FAFAF8] p-2 text-xs">
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {rd.paperDomain && <div><span className="text-[#9B9B9B]">Domain:</span> {rd.paperDomain}</div>}
                        {rd.claimCategory && <div><span className="text-[#9B9B9B]">Category:</span> {rd.claimCategory}</div>}
                        <div><span className="text-[#9B9B9B]">Selected:</span> <span className="font-mono">{rd.selected.join(", ")}</span></div>
                        <div><span className="text-[#9B9B9B]">Candidates:</span> <span className="font-mono">{rd.candidates.join(", ")}</span></div>
                      </div>
                      {rd.reason && <div className="mt-1 text-[#6B6B6B]">{rd.reason}</div>}
                      <div className="mt-1 text-[10px] text-[#9B9B9B]">{new Date(rd.decidedAt).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}

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

      {activeTab === "blueprint" && blueprintData != null && (
        <BlueprintPanel
          blueprint={blueprintData}
          modelUsed={blueprintModel}
          createdAt={blueprintCreatedAt}
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

      {activeTab === "session" && (
        <SessionLogPanel paperId={id} isLive={paper.status === "simulating"} />
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
