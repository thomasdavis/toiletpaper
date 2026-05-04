export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import { db } from "@/lib/db";
import { papers, claims, simulations } from "@toiletpaper/db";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PaperStatusBadge } from "@/components/paper-status-badge";
import { DontoStatusPill } from "@/components/donto-status-pill";
import { getHistory, getContexts } from "@/lib/donto";
import {
  Container,
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

// ── Metadata ───────────────────────────────────────────────────────

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

// ── Helpers ─────────────────────────────────────────────────────────

function getClaimVerdict(sims: { verdict: string | null }[]): string {
  if (sims.length === 0) return "untested";
  if (sims.some((s) => s.verdict === "confirmed" || s.verdict === "reproduced")) return "reproduced";
  if (sims.some((s) => s.verdict === "refuted" || s.verdict === "contradicted")) return "contradicted";
  if (sims.some((s) => s.verdict === "fragile")) return "fragile";
  if (sims.some((s) => s.verdict === "inconclusive")) return "inconclusive";
  return "undetermined";
}

function firstSentence(text: string, maxLen: number): string {
  const endIdx = text.search(/[.!?]\s/);
  const sentence = endIdx > 0 ? text.slice(0, endIdx + 1) : text;
  if (sentence.length <= maxLen) return sentence;
  return sentence.slice(0, maxLen).trimEnd() + "...";
}

// Serialize Date fields to ISO strings for client boundary
function serializeSim(sim: typeof simulations.$inferSelect): SerializedSimulation {
  return {
    id: sim.id,
    claimId: sim.claimId,
    method: sim.method,
    simulatorId: sim.simulatorId,
    runId: sim.runId,
    replacesId: sim.replacesId,
    result: sim.result,
    verdict: sim.verdict,
    metadata: sim.metadata,
    createdAt: sim.createdAt.toISOString(),
  };
}

function serializeClaim(
  claim: typeof claims.$inferSelect,
  claimSims: (typeof simulations.$inferSelect)[],
): SerializedClaim {
  return {
    id: claim.id,
    paperId: claim.paperId,
    text: claim.text,
    canonicalText: claim.canonicalText,
    status: claim.status,
    confidence: claim.confidence,
    category: claim.category,
    predicate: claim.predicate,
    value: claim.value,
    unit: claim.unit,
    evidence: claim.evidence,
    testability: claim.testability,
    testabilityReason: claim.testabilityReason,
    page: claim.page,
    dontoSubjectIri: claim.dontoSubjectIri,
    createdAt: claim.createdAt.toISOString(),
    simulations: claimSims.map(serializeSim),
  };
}

// ── Page ────────────────────────────────────────────────────────────

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

  // ── Compute scoreboard stats ──
  const claimsWithSims = paperClaims.map((claim) => ({
    claim,
    sims: sims.filter((s) => s.claimId === claim.id),
  }));

  const tested = claimsWithSims.filter((c) => c.sims.length > 0).length;
  const reproduced = claimsWithSims.filter(
    (c) => getClaimVerdict(c.sims) === "reproduced",
  ).length;
  const contradicted = claimsWithSims.filter(
    (c) => getClaimVerdict(c.sims) === "contradicted",
  ).length;
  const fragile = claimsWithSims.filter(
    (c) => getClaimVerdict(c.sims) === "fragile",
  ).length;

  // ── Verdict bar percentages ──
  const total = reproduced + contradicted + fragile;
  const repPct = total > 0 ? (reproduced / total) * 100 : 0;
  const conPct = total > 0 ? (contradicted / total) * 100 : 0;
  const fragPct = total > 0 ? (fragile / total) * 100 : 0;

  // ── Serialize for client boundary ──
  const serializedClaims: SerializedClaim[] = claimsWithSims.map((c) =>
    serializeClaim(c.claim, c.sims),
  );
  const serializedSims: SerializedSimulation[] = sims.map(serializeSim);

  const dontoContext = paperCtx
    ? {
        contextIri: claimsCtxIri,
        kind: paperCtx.kind,
        statementCount: paperCtx.count,
        dontoHistory,
      }
    : null;

  return (
    <Container>
      <Stack gap={6}>
        {/* ════════════════════════════════════════════════════════
            ZONE 1: Header — compact, not sticky
            ════════════════════════════════════════════════════════ */}
        <header>
          <Stack direction="horizontal" align="start" gap={3}>
            <Heading level={3} className="flex-1 min-w-0">
              {paper.title}
            </Heading>
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

          {/* One-line abstract */}
          {paper.abstract && (
            <Text size="sm" color="light" className="mt-2">
              {firstSentence(paper.abstract, 180)}
            </Text>
          )}
        </header>

        {/* ════════════════════════════════════════════════════════
            ZONE 2: Scoreboard — stat tiles + verdict bar
            ════════════════════════════════════════════════════════ */}
        <section>
          {/* Stat tiles grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard
              label="Total Claims"
              value={paperClaims.length}
            />
            <StatCard
              label="Tested"
              value={tested}
              unit={`of ${paperClaims.length}`}
            />
            <StatCard
              label="Reproduced"
              value={reproduced}
              className="border-l-2 border-l-[#2D6A4F]"
            />
            <StatCard
              label="Contradicted"
              value={contradicted}
              className="border-l-2 border-l-[#9B2226] ring-1 ring-[#9B2226]/10"
            />
            <StatCard
              label="Fragile"
              value={fragile}
              className="border-l-2 border-l-[#B07D2B]"
            />
          </div>

          {/* Full-width verdict bar */}
          {total > 0 && (
            <div className="mt-4">
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-[#E8E5DE]">
                {repPct > 0 && (
                  <div
                    className="bg-[#2D6A4F] transition-all"
                    style={{ width: `${repPct}%` }}
                    title={`Reproduced: ${reproduced}`}
                  />
                )}
                {conPct > 0 && (
                  <div
                    className="bg-[#9B2226] transition-all"
                    style={{ width: `${conPct}%` }}
                    title={`Contradicted: ${contradicted}`}
                  />
                )}
                {fragPct > 0 && (
                  <div
                    className="bg-[#B07D2B] transition-all"
                    style={{ width: `${fragPct}%` }}
                    title={`Fragile: ${fragile}`}
                  />
                )}
              </div>
              <div className="mt-2 flex items-center gap-4">
                <div className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#2D6A4F]" />
                  <span className="text-xs text-[#6B6B6B]">Reproduced ({reproduced})</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#9B2226]" />
                  <span className="text-xs text-[#6B6B6B]">Contradicted ({contradicted})</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#B07D2B]" />
                  <span className="text-xs text-[#6B6B6B]">Fragile ({fragile})</span>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ── Live simulation stream (shown during active runs) ── */}
        {(paper.status === "simulating" || paper.status === "extracted") && (
          <SimulationStream paperId={id} />
        )}

        {/* ════════════════════════════════════════════════════════
            ZONE 3: Tabbed workspace (client component)
            ════════════════════════════════════════════════════════ */}
        <PaperWorkspace
          paperId={id}
          claims={serializedClaims}
          simulations={serializedSims}
          dontoContext={dontoContext}
        />

        {/* ── Debug panels (collapsed at bottom) ── */}
        <CollapsibleDetails summary="Debug Data">
          <Stack gap={2}>
            <DebugPanel label="Paper" data={paper} />
            <DebugPanel label="Claims" data={paperClaims} />
            <DebugPanel label="Simulations" data={sims} />
            <DebugPanel label="Donto History" data={dontoHistory} />
          </Stack>
        </CollapsibleDetails>
      </Stack>
    </Container>
  );
}
