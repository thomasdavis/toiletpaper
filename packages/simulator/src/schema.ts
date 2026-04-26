export type ClaimType =
  | "equation"
  | "scaling_law"
  | "numerical_prediction"
  | "mechanism"
  | "observational_evidence"
  | "baseline_contrast"
  | "non_testable";

export type SimFeasibility = "algebraic" | "toy" | "reduced" | "full" | "not_enough_info";

export type Verdict =
  | "reproduced"
  | "contradicted"
  | "numerically_fragile"
  | "underdetermined"
  | "not_simulable"
  | "requires_unavailable_data"
  | "pending";

export interface Variable {
  symbol: string;
  name: string;
  units: string;
  typical_range?: [number, number];
  role: "independent" | "dependent" | "parameter" | "constant";
}

export interface TestableClaim {
  claimId: string;
  statement: string;
  claimType: ClaimType;
  variables: Variable[];
  equation?: string;
  lhs?: string;
  rhs?: string;
  exponent?: number;
  requiredInitialConditions: string[];
  requiredBoundaryConditions: string[];
  requiredPhysicalRegime: string[];
  observable: string;
  baselineModel: string;
  proposedModel: string;
  falsificationCriteria: string[];
  simulationFeasibility: SimFeasibility;
  dimensionalFormula?: string;
}

export interface SimulationPlan {
  claimId: string;
  tier: 1 | 2 | 3;
  method: string;
  parameterSweep: ParameterSweep[];
  baselineCode: string;
  proposedCode: string;
  convergenceTest: string;
  conservationChecks: string[];
  expectedOutcome: string;
}

export interface ParameterSweep {
  variable: string;
  min: number;
  max: number;
  points: number;
  scale: "linear" | "log";
}

export interface SimulationResult {
  claimId: string;
  tier: 1 | 2 | 3;
  baselineData: DataPoint[];
  proposedData: DataPoint[];
  fittedExponent?: number;
  fittedExponentError?: number;
  expectedExponent?: number;
  dimensionalCheck: DimensionalCheck;
  convergenceCheck: ConvergenceCheck;
  conservationCheck: ConservationCheck;
  verdict: Verdict;
  verdictReason: string;
  plots: PlotSpec[];
  executionTime: number;
}

export interface DataPoint {
  x: number;
  y: number;
  label?: string;
}

export interface DimensionalCheck {
  passed: boolean;
  lhsDimensions: string;
  rhsDimensions: string;
  detail: string;
}

export interface ConvergenceCheck {
  passed: boolean;
  resolutions: number[];
  errors: number[];
  convergenceOrder?: number;
  detail: string;
}

export interface ConservationCheck {
  passed: boolean;
  quantities: { name: string; maxDrift: number; passed: boolean }[];
}

export interface PlotSpec {
  title: string;
  xLabel: string;
  yLabel: string;
  datasets: { label: string; points: DataPoint[]; style: "line" | "scatter" }[];
  logX?: boolean;
  logY?: boolean;
}

export interface ClaimVerdict {
  claimId: string;
  statement: string;
  claimType: ClaimType;
  tier: 1 | 2 | 3;
  verdict: Verdict;
  reason: string;
  dimensionalPass: boolean;
  convergencePass: boolean;
  conservationPass: boolean;
  baselineReproduced: boolean;
  proposedMatchesClaim: boolean;
  fittedExponent?: number;
  expectedExponent?: number;
  confidence: number;
  plots: PlotSpec[];
}
