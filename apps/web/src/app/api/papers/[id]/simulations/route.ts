import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { papers, claims, simulations } from "@toiletpaper/db";
import { eq } from "drizzle-orm";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const [paper] = await db.select().from(papers).where(eq(papers.id, id));
  if (!paper) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const paperClaims = await db
    .select()
    .from(claims)
    .where(eq(claims.paperId, id));

  const claimIds = paperClaims.map((c) => c.id);
  let allSims: (typeof simulations.$inferSelect)[] = [];
  if (claimIds.length > 0) {
    const results = await Promise.all(
      claimIds.map((cid) =>
        db.select().from(simulations).where(eq(simulations.claimId, cid)),
      ),
    );
    allSims = results.flat();
  }

  // Apply verdict filter if provided
  const url = new URL(req.url);
  const verdictFilter = url.searchParams.get("verdict");
  if (verdictFilter && ["confirmed", "refuted", "inconclusive"].includes(verdictFilter)) {
    allSims = allSims.filter((s) => s.verdict === verdictFilter);
  }

  // Join claim data
  const claimMap = new Map(paperClaims.map((c) => [c.id, c]));
  const simsWithClaims = allSims.map((sim) => ({
    ...sim,
    claim: claimMap.get(sim.claimId) ?? null,
  }));

  return NextResponse.json({ simulations: simsWithClaims });
}
