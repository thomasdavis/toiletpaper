import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { papers } from "@toiletpaper/db";
import { eq } from "drizzle-orm";
import { getCurrentSimulationsForPaper } from "@/lib/current-simulations";
import { summarizeReplicationReadiness } from "@/lib/replication-readiness";
import { normalizeVerdict } from "@/lib/verdict";

const VERDICT_FILTERS = new Set([
  "confirmed",
  "refuted",
  "reproduced",
  "contradicted",
  "fragile",
  "inconclusive",
  "untested",
  "not_applicable",
  "vacuous",
  "system_error",
]);

function resultReason(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const record = result as Record<string, unknown>;
  return typeof record.reason === "string" ? record.reason : null;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const [paper] = await db.select().from(papers).where(eq(papers.id, id));
  if (!paper) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { claims: paperClaims, simulations: currentSims, latestJob } =
    await getCurrentSimulationsForPaper(id);
  let allSims = currentSims;

  // Apply verdict filter if provided
  const url = new URL(req.url);
  const verdictFilter = url.searchParams.get("verdict");
  if (verdictFilter && VERDICT_FILTERS.has(verdictFilter)) {
    allSims = allSims.filter((sim) => {
      const normalized = normalizeVerdict(
        sim.verdict,
        sim.metadata,
        resultReason(sim.result),
      );
      return sim.verdict === verdictFilter || normalized === verdictFilter;
    });
  }

  // Join claim data
  const claimMap = new Map(paperClaims.map((c) => [c.id, c]));
  const simsWithClaims = allSims.map((sim) => ({
    ...sim,
    claim: claimMap.get(sim.claimId) ?? null,
  }));
  const replicationReadiness = summarizeReplicationReadiness(
    allSims.map((sim) => ({
      ...sim,
      claimText: claimMap.get(sim.claimId)?.text ?? null,
      unitType: claimMap.get(sim.claimId)?.predicate ?? null,
    })),
  );

  return NextResponse.json({
    simulations: simsWithClaims,
    simulationJob: latestJob,
    replicationReadiness,
  });
}
