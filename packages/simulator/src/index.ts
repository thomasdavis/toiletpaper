export type {
  TestableClaim,
  SimulationPlan,
  SimulationResult,
  ClaimVerdict,
  Verdict,
  Variable,
  ClaimType,
  SimFeasibility,
  PlotSpec,
  DataPoint,
} from "./schema";

export { triageClaims } from "./triage";
export { runTier1, checkDimensions, checkScalingLaw } from "./algebraic";
export { generateSimulationCode, buildSimulationPlan } from "./codegen";
export { runSimulation } from "./runner";
export { judgeResult, judgeAlgebraic } from "./judge";
export {
  buildReplicationUnitsFromDonto,
  type BaselineRequirement,
  type ComputeBudget,
  type ComputeTier,
  type DatasetRequirement,
  type DontoReplicationBundleInput,
  type DontoStatementInput,
  type MethodRequirement,
  type MetricRequirement,
  type ParameterRequirement,
  type PlannerProvenance,
  type ReplicationArtifactRequirement,
  type ReplicationBlocker,
  type ReplicationDomain,
  type ReplicationState,
  type ReplicationUnit,
  type ReplicationUnitType,
} from "./replication";

import type { TestableClaim, ClaimVerdict } from "./schema";
import { triageClaims } from "./triage";
import { runTier1 } from "./algebraic";
import { generateSimulationCode } from "./codegen";
import { runSimulation } from "./runner";
import { judgeResult, judgeAlgebraic } from "./judge";

export interface PipelineInput {
  claims: {
    text: string;
    category: string;
    confidence: number;
    evidence: string;
    predicate?: string;
    value?: string;
    unit?: string;
  }[];
  paperAbstract: string;
  apiKey: string;
}

export interface PipelineResult {
  triaged: TestableClaim[];
  verdicts: ClaimVerdict[];
  summary: {
    total: number;
    reproduced: number;
    contradicted: number;
    fragile: number;
    underdetermined: number;
    notSimulable: number;
  };
}

export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
  const triaged = await triageClaims(
    input.claims,
    input.paperAbstract,
    input.apiKey,
  );

  const verdicts: ClaimVerdict[] = [];

  const algebraic = triaged.filter((c) => c.simulationFeasibility === "algebraic");
  const tier1Results = runTier1(algebraic);
  for (const result of tier1Results) {
    const claim = algebraic.find((c) => c.claimId === result.claimId);
    if (claim) {
      verdicts.push(judgeAlgebraic(claim, result));
    }
  }

  const simClaims = triaged.filter(
    (c) => c.simulationFeasibility === "toy" || c.simulationFeasibility === "reduced",
  );

  for (const claim of simClaims) {
    try {
      const { combinedCode } = await generateSimulationCode(claim, input.apiKey);
      const result = await runSimulation(combinedCode, claim);
      const verdict = await judgeResult(claim, result, input.apiKey);
      verdicts.push(verdict);
    } catch (e) {
      verdicts.push({
        claimId: claim.claimId,
        statement: claim.statement,
        claimType: claim.claimType,
        tier: 2,
        verdict: "not_simulable",
        reason: `Pipeline error: ${e instanceof Error ? e.message : String(e)}`,
        dimensionalPass: false,
        convergencePass: false,
        conservationPass: false,
        baselineReproduced: false,
        proposedMatchesClaim: false,
        confidence: 0,
        plots: [],
      });
    }
  }

  const fullClaims = triaged.filter((c) => c.simulationFeasibility === "full");
  for (const claim of fullClaims) {
    verdicts.push({
      claimId: claim.claimId,
      statement: claim.statement,
      claimType: claim.claimType,
      tier: 3,
      verdict: "not_simulable",
      reason: "Requires full 3D MHD/GRMHD solver — not yet implemented",
      dimensionalPass: true,
      convergencePass: false,
      conservationPass: false,
      baselineReproduced: false,
      proposedMatchesClaim: false,
      confidence: 0,
      plots: [],
    });
  }

  return {
    triaged,
    verdicts,
    summary: {
      total: verdicts.length,
      reproduced: verdicts.filter((v) => v.verdict === "reproduced").length,
      contradicted: verdicts.filter((v) => v.verdict === "contradicted").length,
      fragile: verdicts.filter((v) => v.verdict === "numerically_fragile").length,
      underdetermined: verdicts.filter((v) => v.verdict === "underdetermined").length,
      notSimulable: verdicts.filter((v) => v.verdict === "not_simulable").length,
    },
  };
}
