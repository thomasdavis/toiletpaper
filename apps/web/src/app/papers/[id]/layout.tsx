import { db } from "@/lib/db";
import { papers, claims, simulations, simulationLogs, replicationBlueprints } from "@toiletpaper/db";
import { eq, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PaperSidebar } from "@/components/paper-sidebar";
import { isSignal, normalizeVerdict } from "@/lib/verdict";
import { getCurrentSimulationsForPaper } from "@/lib/current-simulations";

function resultReason(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  return typeof r.reason === "string" ? r.reason : null;
}

function getClaimVerdict(sims: (typeof simulations.$inferSelect)[]): string {
  if (sims.length === 0) return "untested";
  const verdicts = sims.map((s) => normalizeVerdict(s.verdict, s.metadata, resultReason(s.result)));
  if (verdicts.some((v) => v === "reproduced")) return "reproduced";
  if (verdicts.some((v) => v === "contradicted")) return "contradicted";
  if (verdicts.some((v) => v === "fragile")) return "fragile";
  if (verdicts.some((v) => isSignal(v))) return "inconclusive";
  return "untested";
}

export default async function PaperLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;
  const [paper] = await db.select().from(papers).where(eq(papers.id, id));
  if (!paper) notFound();

  const { claims: paperClaims, simulations: sims } =
    await getCurrentSimulationsForPaper(id);

  const claimsWithSims = paperClaims.map((c) => ({
    sims: sims.filter((s) => s.claimId === c.id),
  }));

  const counts = {
    claims: paperClaims.length,
    simulations: sims.length,
    reproduced: claimsWithSims.filter((c) => getClaimVerdict(c.sims) === "reproduced").length,
    contradicted: claimsWithSims.filter((c) => getClaimVerdict(c.sims) === "contradicted").length,
    fragile: claimsWithSims.filter((c) => getClaimVerdict(c.sims) === "fragile").length,
  };

  // Check if simulation session logs exist for this paper
  const [logCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(simulationLogs)
    .where(eq(simulationLogs.paperId, id));
  const hasSessionLogs = (logCount?.count ?? 0) > 0;

  // Check if a replication blueprint exists for this paper
  const [bpCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(replicationBlueprints)
    .where(eq(replicationBlueprints.paperId, id));
  const hasBlueprint = (bpCount?.count ?? 0) > 0;

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      <PaperSidebar
        paperId={id}
        hasPdf={Boolean(paper.pdfUrl)}
        hasSims={sims.length > 0}
        hasSessionLogs={hasSessionLogs}
        hasBlueprint={hasBlueprint}
        counts={counts}
      />
      <main className="flex-1 min-w-0">
        {children}
      </main>
    </div>
  );
}
