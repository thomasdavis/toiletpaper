import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { papers, replicationUnits } from "@toiletpaper/db";
import { eq } from "drizzle-orm";
import { getCurrentSimulationsForPaper } from "@/lib/current-simulations";
import { summarizeReplicationGapManifest } from "@/lib/replication-gap-manifest";
import { loadPaperArtifactManifest } from "@/lib/paper-artifacts";
import { summarizeArtifactGapCoverage } from "@/lib/artifact-gap-coverage";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const [paper] = await db.select().from(papers).where(eq(papers.id, id));
  if (!paper) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const [{ claims: paperClaims, simulations: sims, latestJob }, unitRows, artifactBundles] =
    await Promise.all([
      getCurrentSimulationsForPaper(id),
      db.select().from(replicationUnits).where(eq(replicationUnits.paperId, id)),
      loadPaperArtifactManifest(id).catch(() => null),
    ]);
  const claimById = new Map(paperClaims.map((claim) => [claim.id, claim]));

  const manifest = summarizeReplicationGapManifest({
    units: unitRows.map((unit) => ({
      id: unit.id,
      claimText: unit.claimText,
      unitType: unit.unitType,
      domain: unit.domain,
      sourceStatementIds: unit.sourceStatementIds,
      requiredArtifacts: unit.requiredArtifacts,
      blockers: unit.blockers,
    })),
    simulations: sims.map((sim) => ({
      ...sim,
      claimText: claimById.get(sim.claimId)?.text ?? null,
    })),
  });
  const artifactGapCoverage = summarizeArtifactGapCoverage({
    gapManifest: manifest,
    artifactManifest: artifactBundles,
  });

  return NextResponse.json({
    paper: {
      id: paper.id,
      title: paper.title,
      status: paper.status,
    },
    latestSimulationJob: latestJob,
    generatedAt: new Date().toISOString(),
    manifest,
    artifactBundles,
    artifactGapCoverage,
  });
}
