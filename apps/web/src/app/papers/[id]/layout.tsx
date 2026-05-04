import { db } from "@/lib/db";
import { papers, claims, simulations } from "@toiletpaper/db";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PaperSidebar } from "@/components/paper-sidebar";

function getClaimVerdict(sims: { verdict: string | null }[]): string {
  if (sims.length === 0) return "untested";
  if (sims.some((s) => s.verdict === "confirmed" || s.verdict === "reproduced")) return "reproduced";
  if (sims.some((s) => s.verdict === "refuted" || s.verdict === "contradicted")) return "contradicted";
  if (sims.some((s) => s.verdict === "fragile")) return "fragile";
  return "inconclusive";
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

  const paperClaims = await db.select().from(claims).where(eq(claims.paperId, id));
  const claimIds = paperClaims.map((c) => c.id);
  let sims: (typeof simulations.$inferSelect)[] = [];
  if (claimIds.length > 0) {
    const allSims = await Promise.all(
      claimIds.map((cid) => db.select().from(simulations).where(eq(simulations.claimId, cid))),
    );
    sims = allSims.flat();
  }

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

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      <PaperSidebar
        paperId={id}
        hasPdf={Boolean(paper.pdfUrl)}
        hasSims={sims.length > 0}
        counts={counts}
      />
      <main className="flex-1 min-w-0 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
