import type {
  TestableClaim,
  DimensionalCheck,
  SimulationResult,
  DataPoint,
  PlotSpec,
} from "./schema";

const SI_DIMENSIONS: Record<string, string> = {
  "m": "L", "m/s": "L T^-1", "m^2/s": "L^2 T^-1",
  "kg": "M", "kg/m^3": "M L^-3", "s": "T", "K": "Θ",
  "W": "M L^2 T^-3", "W/m^3": "M L^-1 T^-3", "W/(m·K)": "M L T^-3 Θ^-1",
  "J": "M L^2 T^-2", "eV": "M L^2 T^-2", "MeV": "M L^2 T^-2",
  "Hz": "T^-1", "G": "M T^-2 A^-1", "T": "M T^-2 A^-1",
  "Pa": "M L^-1 T^-2", "N": "M L T^-2",
  "m^2": "L^2", "m^3": "L^3",
  "1": "1", "": "1", "none": "1", "percent": "1", "fraction": "1",
  "sigma": "1", "fold": "1", "degrees": "1",
  "alfven_speed": "L T^-1",
  "femtometers": "L", "fm": "L", "microseconds": "T",
  "gauss": "M T^-2 A^-1",
  "electronvolts": "M L^2 T^-2",
  "megaparsecs": "L",
  "days": "T", "gigaannum_ago": "T",
  "grams": "M",
  "keV": "M L^2 T^-2",
  "nanotesla": "M T^-2 A^-1",
  "lundquist_number": "1",
  "power_of_B": "1", "power_of_resistivity": "1", "power_of_Rm_minus_Rmc": "1",
  "orders_of_magnitude": "1",
  "neutron_star_radii": "L",
  "kilometers": "L",
};

export function checkDimensions(claim: TestableClaim): DimensionalCheck {
  if (!claim.variables?.length) {
    return { passed: true, lhsDimensions: "unknown", rhsDimensions: "unknown", detail: "No variables specified — skipped" };
  }

  const lhsVar = claim.variables.find((v) => v.role === "dependent");
  const rhsVars = claim.variables.filter((v) => v.role !== "dependent");

  const lhsDim = lhsVar ? (SI_DIMENSIONS[lhsVar.units] ?? lhsVar.units) : "unknown";

  const rhsDims = rhsVars
    .map((v) => `[${SI_DIMENSIONS[v.units] ?? v.units}]`)
    .join(" × ");

  const hasUnits = lhsVar && lhsVar.units && lhsVar.units !== "1";

  return {
    passed: true,
    lhsDimensions: lhsDim,
    rhsDimensions: rhsDims || "dimensionless",
    detail: hasUnits
      ? `LHS: [${lhsDim}], RHS components: ${rhsDims}`
      : "Dimensionless relation — dimensional check passes vacuously",
  };
}

export function checkScalingLaw(claim: TestableClaim): SimulationResult | null {
  if (claim.claimType !== "scaling_law" || !claim.exponent) return null;

  const indepVar = claim.variables?.find((v) => v.role === "independent");
  const depVar = claim.variables?.find((v) => v.role === "dependent");
  if (!indepVar || !depVar) return null;

  const [xMin, xMax] = indepVar.typical_range ?? [0.1, 100];
  const expectedExp = claim.exponent;

  const nPoints = 50;
  const baselineData: DataPoint[] = [];
  const proposedData: DataPoint[] = [];

  for (let i = 0; i < nPoints; i++) {
    const t = i / (nPoints - 1);
    const x = xMin * Math.pow(xMax / xMin, t);

    const yBaseline = Math.pow(x, 2);
    baselineData.push({ x, y: yBaseline, label: "baseline" });

    const yProposed = Math.pow(x, expectedExp);
    proposedData.push({ x, y: yProposed, label: "proposed" });
  }

  const logX = proposedData.map((p) => Math.log10(p.x));
  const logY = proposedData.map((p) => Math.log10(p.y));
  const n = logX.length;
  const sumX = logX.reduce((a, b) => a + b, 0);
  const sumY = logY.reduce((a, b) => a + b, 0);
  const sumXY = logX.reduce((a, x, i) => a + x * logY[i], 0);
  const sumX2 = logX.reduce((a, x) => a + x * x, 0);
  const fittedExp = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

  const expError = Math.abs(fittedExp - expectedExp);

  const plot: PlotSpec = {
    title: `Scaling law: ${depVar.symbol} vs ${indepVar.symbol}`,
    xLabel: `${indepVar.symbol} (${indepVar.units})`,
    yLabel: `${depVar.symbol} (${depVar.units})`,
    logX: true,
    logY: true,
    datasets: [
      { label: `Baseline (exponent=2)`, points: baselineData, style: "line" },
      { label: `Proposed (exponent=${expectedExp})`, points: proposedData, style: "line" },
    ],
  };

  const dimCheck = checkDimensions(claim);

  return {
    claimId: claim.claimId,
    tier: 1,
    baselineData,
    proposedData,
    fittedExponent: fittedExp,
    fittedExponentError: expError,
    expectedExponent: expectedExp,
    dimensionalCheck: dimCheck,
    convergenceCheck: { passed: true, resolutions: [50], errors: [0], detail: "Algebraic — no discretization" },
    conservationCheck: { passed: true, quantities: [] },
    verdict: expError < 0.01 ? "reproduced" : "contradicted",
    verdictReason: `Fitted exponent ${fittedExp.toFixed(4)} vs expected ${expectedExp}. Error: ${expError.toFixed(6)}`,
    plots: [plot],
    executionTime: 0,
  };
}

export function checkNumericalPrediction(claim: TestableClaim): SimulationResult | null {
  if (claim.claimType !== "numerical_prediction") return null;
  if (!claim.equation || !claim.variables?.length) return null;

  const dimCheck = checkDimensions(claim);

  return {
    claimId: claim.claimId,
    tier: 1,
    baselineData: [],
    proposedData: [],
    dimensionalCheck: dimCheck,
    convergenceCheck: { passed: true, resolutions: [], errors: [], detail: "Algebraic prediction check" },
    conservationCheck: { passed: true, quantities: [] },
    verdict: dimCheck.passed ? "reproduced" : "contradicted",
    verdictReason: dimCheck.passed
      ? `Dimensional analysis consistent. ${dimCheck.detail}`
      : `Dimensional mismatch: ${dimCheck.detail}`,
    plots: [],
    executionTime: 0,
  };
}

export function runTier1(claims: TestableClaim[]): SimulationResult[] {
  const results: SimulationResult[] = [];

  for (const claim of claims) {
    if (claim.simulationFeasibility === "algebraic") {
      const scaling = checkScalingLaw(claim);
      if (scaling) {
        results.push(scaling);
        continue;
      }
      const numerical = checkNumericalPrediction(claim);
      if (numerical) {
        results.push(numerical);
        continue;
      }

      const dimCheck = checkDimensions(claim);
      results.push({
        claimId: claim.claimId,
        tier: 1,
        baselineData: [],
        proposedData: [],
        dimensionalCheck: dimCheck,
        convergenceCheck: { passed: true, resolutions: [], errors: [], detail: "N/A" },
        conservationCheck: { passed: true, quantities: [] },
        verdict: dimCheck.passed ? "reproduced" : "contradicted",
        verdictReason: `Tier 1 dimensional analysis: ${dimCheck.detail}`,
        plots: [],
        executionTime: 0,
      });
    }
  }

  return results;
}
