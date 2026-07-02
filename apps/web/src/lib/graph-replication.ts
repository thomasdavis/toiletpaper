import { and, eq, inArray, like } from "drizzle-orm";
import { db } from "@/lib/db";
import { claims, replicationUnits, simulations } from "@toiletpaper/db";
import {
  buildReplicationUnitsFromDonto,
  executeReplicationUnit,
  type DontoStatementInput,
  type ReplicationAgentResult,
  type ReplicationExecutionVerdict,
  type ReplicationUnit,
} from "@toiletpaper/simulator";
import { getDontoStatementsForPaper, paperClaimsContext } from "@/lib/donto-statements";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface GraphReplicationPlan {
  context: string;
  statements: DontoStatementInput[];
  units: ReplicationUnit[];
}

export async function buildGraphReplicationPlan(
  paperId: string,
): Promise<GraphReplicationPlan> {
  const statements = await getDontoStatementsForPaper(paperId);
  const units = buildReplicationUnitsFromDonto({
    paperId,
    claimIriPrefix: "tp:graph-claim",
    statements,
    planner: {
      plannerId: "donto-graph-replication-v1",
      version: "1.0.0",
      source: "deterministic",
    },
  });

  return {
    context: paperClaimsContext(paperId),
    statements,
    units,
  };
}

export async function persistReplicationUnitsForPaper(units: ReplicationUnit[]) {
  for (const unit of units) {
    await db
      .insert(replicationUnits)
      .values({
        id: unit.id,
        paperId: unit.paperId,
        claimIri: unit.claimIri,
        sourceStatementIds: unit.sourceStatementIds,
        domain: unit.domain,
        unitType: unit.unitType,
        claimText: unit.claimText,
        evidenceQuotes: unit.evidenceQuotes,
        hypothesis: unit.hypothesis,
        expectedOutcome: unit.expectedOutcome,
        falsificationCriteria: unit.falsificationCriteria,
        requiredArtifacts: unit.requiredArtifacts,
        datasets: unit.datasets,
        methods: unit.methods,
        metrics: unit.metrics,
        baselines: unit.baselines,
        parameters: unit.parameters,
        computeBudget: unit.computeBudget,
        verifierCandidates: unit.verifierCandidates,
        planner: unit.planner,
        state: unit.state,
        blockers: unit.blockers,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: replicationUnits.id,
        set: {
          claimIri: unit.claimIri,
          sourceStatementIds: unit.sourceStatementIds,
          domain: unit.domain,
          unitType: unit.unitType,
          claimText: unit.claimText,
          evidenceQuotes: unit.evidenceQuotes,
          hypothesis: unit.hypothesis,
          expectedOutcome: unit.expectedOutcome,
          falsificationCriteria: unit.falsificationCriteria,
          requiredArtifacts: unit.requiredArtifacts,
          datasets: unit.datasets,
          methods: unit.methods,
          metrics: unit.metrics,
          baselines: unit.baselines,
          parameters: unit.parameters,
          computeBudget: unit.computeBudget,
          verifierCandidates: unit.verifierCandidates,
          planner: unit.planner,
          state: unit.state,
          blockers: unit.blockers,
          updatedAt: new Date(),
        },
      });
  }
}

export function claimIdForReplicationUnit(unit: ReplicationUnit): string | null {
  const id = unit.sourceStatementIds[0];
  return id && UUID_RE.test(id) ? id : null;
}

export interface GraphSimulationExecution {
  unit: ReplicationUnit;
  execution: ReplicationAgentResult;
}

export interface GraphSimulationMaterialization {
  rowsCreated: number;
  executions: GraphSimulationExecution[];
}

function categoryForUnit(unit: ReplicationUnit) {
  if (unit.unitType === "baseline_contrast") return "comparative";
  if (unit.unitType === "metric_recompute" || unit.unitType === "equation_check") {
    return "quantitative";
  }
  if (unit.unitType === "artifact_availability" || unit.unitType === "dataset_integrity") {
    return "methodological";
  }
  return "theoretical";
}

export async function materializeClaimsForReplicationUnits(units: ReplicationUnit[]) {
  const claimIds: string[] = [];

  for (const unit of units) {
    const claimId = claimIdForReplicationUnit(unit);
    if (!claimId) continue;
    claimIds.push(claimId);

    await db
      .insert(claims)
      .values({
        id: claimId,
        paperId: unit.paperId,
        text: unit.claimText,
        dontoSubjectIri: unit.claimIri,
        status: "asserted",
        confidence: null,
        category: categoryForUnit(unit),
        predicate: unit.unitType,
        value: unit.metrics[0]?.expected ?? unit.parameters[0]?.value ?? null,
        unit: null,
        evidence: unit.evidenceQuotes[0] ?? unit.expectedOutcome,
        extractorModel: "donto-graph",
        extractorVersion: "replication-v1",
      })
      .onConflictDoUpdate({
        target: claims.id,
        set: {
          text: unit.claimText,
          dontoSubjectIri: unit.claimIri,
          status: "asserted",
          confidence: null,
          category: categoryForUnit(unit),
          predicate: unit.unitType,
          value: unit.metrics[0]?.expected ?? unit.parameters[0]?.value ?? null,
          evidence: unit.evidenceQuotes[0] ?? unit.expectedOutcome,
          extractorModel: "donto-graph",
          extractorVersion: "replication-v1",
        },
      });
  }

  return claimIds;
}

function executionVerdictForDb(
  verdict: ReplicationExecutionVerdict,
): typeof simulations.$inferInsert.verdict {
  return verdict;
}

function executionStateForReplicationUnit(execution: ReplicationAgentResult) {
  if (execution.state === "blocked") return "blocked";
  if (execution.state === "running") return "running";
  if (execution.state === "failed") return "failed";
  if (execution.state === "succeeded") return "succeeded";
  return "planned";
}

export async function replaceGraphSimulationRows(
  units: ReplicationUnit[],
): Promise<GraphSimulationMaterialization> {
  const executions = units.map((unit) => ({
    unit,
    execution: executeReplicationUnit(unit),
  }));

  const claimIds = units
    .map((unit) => claimIdForReplicationUnit(unit))
    .filter((id): id is string => Boolean(id));

  if (claimIds.length === 0) {
    return { rowsCreated: 0, executions };
  }

  await db
    .delete(simulations)
    .where(and(
      inArray(simulations.claimId, claimIds),
      like(simulations.method, "donto-replication-%"),
    ));

  const now = new Date();
  for (const { unit, execution } of executions) {
    await db
      .update(replicationUnits)
      .set({
        state: executionStateForReplicationUnit(execution),
        blockers: execution.blockers,
        updatedAt: now,
      })
      .where(eq(replicationUnits.id, unit.id));
  }

  const rows = executions
    .map(({ unit, execution }) => {
      const claimId = claimIdForReplicationUnit(unit);
      if (!claimId) return null;
      const verdict = executionVerdictForDb(execution.verdict);
      return {
        claimId,
        method: `donto-replication-${unit.unitType}`,
        simulatorId: `donto-agent-${execution.agentId}`,
        result: {
          reason: execution.reason,
          replicationUnitId: unit.id,
          agentId: execution.agentId,
          agentName: execution.agentName,
          executorVersion: execution.executorVersion,
          state: execution.state,
          confidence: execution.confidence,
          observations: execution.observations,
          measurements: execution.measurements,
          artifacts: execution.artifacts,
          hypothesis: unit.hypothesis,
          expectedOutcome: unit.expectedOutcome,
          requiredArtifacts: unit.requiredArtifacts,
          blockers: execution.blockers,
          limitations: execution.limitations,
          verifierCandidates: unit.verifierCandidates,
          digitalPhysics: execution.digitalPhysics,
        },
        verdict,
        evidenceMode: execution.evidenceMode,
        limitations: execution.limitations,
        metadata: {
          graph_fed: true,
          replication_unit_id: unit.id,
          agent_id: execution.agentId,
          agent_name: execution.agentName,
          executor_version: execution.executorVersion,
          digital_physics_engine: execution.digitalPhysics.engine,
          donto_context: paperClaimsContext(unit.paperId),
          source_statement_ids: unit.sourceStatementIds,
          domain: unit.domain,
          unit_type: unit.unitType,
          original_verdict: execution.verdict,
        },
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (rows.length > 0) {
    await db.insert(simulations).values(rows);
  }

  return { rowsCreated: rows.length, executions };
}
