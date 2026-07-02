import { normalizeVerdict } from "@/lib/verdict";

interface UnitInput {
  id: string;
  unitType?: string | null;
  sourceStatementIds?: string[] | null;
  state?: string | null;
}

interface SimulationInput {
  id: string;
  verdict?: string | null;
  evidenceMode?: string | null;
  result?: unknown;
  metadata?: unknown;
}

interface JobInput {
  id: string;
  state: string;
  totalUnits: number;
  completedUnits: number;
  failedUnits: number;
}

export interface WholePaperCoverageSummary {
  dontoStatementCount: number;
  sourceStatementCount: number;
  replicationUnitCount: number;
  currentResultCount: number;
  coveredUnitCount: number;
  missingResultCount: number;
  blockedOrInsufficientCount: number;
  failedUnitCount: number;
  coveragePercent: number;
  unitTypeCounts: Record<string, number>;
  coveredUnitTypeCounts: Record<string, number>;
  verdictCounts: Record<string, number>;
  evidenceModeCounts: Record<string, number>;
  latestJob: JobInput | null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function increment(target: Record<string, number>, key: string | null | undefined) {
  const normalized = (key ?? "unknown").trim() || "unknown";
  target[normalized] = (target[normalized] ?? 0) + 1;
}

function sortCounts(counts: Record<string, number>) {
  return Object.fromEntries(
    Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  );
}

function resultReason(result: unknown) {
  const resultRecord = record(result);
  return typeof resultRecord?.reason === "string" ? resultRecord.reason : null;
}

function replicationUnitId(sim: SimulationInput) {
  const metadata = record(sim.metadata);
  if (typeof metadata?.replication_unit_id === "string") {
    return metadata.replication_unit_id;
  }
  const result = record(sim.result);
  if (typeof result?.replicationUnitId === "string") {
    return result.replicationUnitId;
  }
  return null;
}

export function summarizeWholePaperCoverage(input: {
  dontoStatementCount?: number | null;
  units: UnitInput[];
  simulations: SimulationInput[];
  latestJob?: JobInput | null;
}): WholePaperCoverageSummary {
  const unitTypeCounts: Record<string, number> = {};
  const coveredUnitTypeCounts: Record<string, number> = {};
  const verdictCounts: Record<string, number> = {};
  const evidenceModeCounts: Record<string, number> = {};
  const sourceStatementIds = new Set<string>();
  const unitTypeById = new Map<string, string>();

  for (const unit of input.units) {
    const unitType = unit.unitType ?? "unknown";
    unitTypeById.set(unit.id, unitType);
    increment(unitTypeCounts, unitType);
    for (const statementId of unit.sourceStatementIds ?? []) {
      sourceStatementIds.add(statementId);
    }
  }

  const coveredUnitIds = new Set<string>();
  let currentResultCount = 0;
  let blockedOrInsufficientCount = 0;
  let failedUnitCount = 0;

  for (const sim of input.simulations) {
    const unitId = replicationUnitId(sim);
    if (!unitId) continue;

    currentResultCount += 1;
    if (!coveredUnitIds.has(unitId)) {
      coveredUnitIds.add(unitId);
      increment(coveredUnitTypeCounts, unitTypeById.get(unitId));
    }

    const reason = resultReason(sim.result);
    const verdict = normalizeVerdict(sim.verdict, sim.metadata, reason);
    increment(verdictCounts, verdict);
    increment(evidenceModeCounts, sim.evidenceMode);

    if (
      verdict === "inconclusive" ||
      verdict === "untested" ||
      verdict === "not_applicable" ||
      sim.evidenceMode === "insufficient"
    ) {
      blockedOrInsufficientCount += 1;
    }
    if (verdict === "system_error") {
      failedUnitCount += 1;
    }
  }

  const replicationUnitCount = input.units.length;
  const coveredUnitCount = coveredUnitIds.size;
  const missingResultCount = Math.max(0, replicationUnitCount - coveredUnitCount);
  const coveragePercent =
    replicationUnitCount === 0
      ? 0
      : Math.round((coveredUnitCount / replicationUnitCount) * 100);

  return {
    dontoStatementCount: input.dontoStatementCount ?? 0,
    sourceStatementCount: sourceStatementIds.size,
    replicationUnitCount,
    currentResultCount,
    coveredUnitCount,
    missingResultCount,
    blockedOrInsufficientCount,
    failedUnitCount,
    coveragePercent,
    unitTypeCounts: sortCounts(unitTypeCounts),
    coveredUnitTypeCounts: sortCounts(coveredUnitTypeCounts),
    verdictCounts: sortCounts(verdictCounts),
    evidenceModeCounts: sortCounts(evidenceModeCounts),
    latestJob: input.latestJob ?? null,
  };
}
