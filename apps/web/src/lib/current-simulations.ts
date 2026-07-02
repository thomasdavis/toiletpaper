import { db } from "@/lib/db";
import { claims, simulationJobs, simulations } from "@toiletpaper/db";
import { desc, eq, inArray } from "drizzle-orm";

type Simulation = typeof simulations.$inferSelect;
type SimulationJob = typeof simulationJobs.$inferSelect;

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

export function simulationJobId(sim: Simulation) {
  const metadata = objectRecord(sim.metadata);
  return typeof metadata?.job_id === "string" ? metadata.job_id : null;
}

export function simulationReplicationUnitId(sim: Simulation) {
  const metadata = objectRecord(sim.metadata);
  if (typeof metadata?.replication_unit_id === "string") {
    return metadata.replication_unit_id;
  }
  const result = objectRecord(sim.result);
  return typeof result?.replicationUnitId === "string"
    ? result.replicationUnitId
    : null;
}

function byCreatedAt(a: Simulation, b: Simulation) {
  return a.createdAt.getTime() - b.createdAt.getTime();
}

export function currentSimulations(
  allSimulations: Simulation[],
  latestJob: Pick<SimulationJob, "id" | "state"> | null | undefined,
) {
  if (allSimulations.length === 0) return [];

  const activeJob =
    latestJob?.state === "queued" || latestJob?.state === "running";
  if (latestJob) {
    const jobRows = allSimulations.filter(
      (sim) => simulationJobId(sim) === latestJob.id,
    );
    if (activeJob && jobRows.length === 0) {
      return currentSimulations(
        allSimulations.filter((sim) => !simulationJobId(sim)),
        null,
      );
    }
    if (jobRows.length > 0) {
      const coveredUnits = new Set(
        jobRows.map(simulationReplicationUnitId).filter(Boolean),
      );
      const fillers = activeJob
        ? allSimulations.filter((sim) => {
            if (simulationJobId(sim)) return false;
            const unitId = simulationReplicationUnitId(sim);
            return unitId && !coveredUnits.has(unitId);
          })
        : [];
      return [...fillers, ...jobRows].sort(byCreatedAt);
    }
  }

  const loose: Simulation[] = [];
  const byUnit = new Map<string, Simulation>();
  for (const sim of [...allSimulations].sort(byCreatedAt)) {
    const unitId = simulationReplicationUnitId(sim);
    if (!unitId) {
      loose.push(sim);
      continue;
    }
    byUnit.set(unitId, sim);
  }
  return [...loose, ...byUnit.values()].sort(byCreatedAt);
}

export async function latestSimulationJobForPaper(paperId: string) {
  const [latestJob] = await db
    .select()
    .from(simulationJobs)
    .where(eq(simulationJobs.paperId, paperId))
    .orderBy(desc(simulationJobs.createdAt))
    .limit(1);
  return latestJob ?? null;
}

export async function getCurrentSimulationsForPaper(paperId: string) {
  const [paperClaims, latestJob] = await Promise.all([
    db.select().from(claims).where(eq(claims.paperId, paperId)),
    latestSimulationJobForPaper(paperId),
  ]);
  const claimIds = paperClaims.map((claim) => claim.id);
  const allSimulations =
    claimIds.length === 0
      ? []
      : await db
          .select()
          .from(simulations)
          .where(inArray(simulations.claimId, claimIds));

  return {
    claims: paperClaims,
    latestJob,
    simulations: currentSimulations(allSimulations, latestJob),
    allSimulations,
  };
}
