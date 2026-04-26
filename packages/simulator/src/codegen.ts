import OpenAI from "openai";
import type { TestableClaim, SimulationPlan, ParameterSweep } from "./schema";

const CODEGEN_PROMPT = `You are a computational physics agent. Given a testable scientific claim, generate Python simulation code to test it.

RULES:
1. Generate TWO simulations: baseline model and proposed model
2. Always include a parameter sweep over the key independent variable
3. Use numpy and scipy only (no external physics libraries)
4. Include convergence test: run at 2+ resolutions and check error decreases
5. Include conservation checks where applicable (energy, mass, momentum)
6. Output results as JSON to stdout
7. The code must be self-contained and runnable with: python3 script.py
8. Use finite differences for PDEs, scipy.integrate for ODEs
9. Include error handling and timeouts

OUTPUT FORMAT: The Python script must print a single JSON object to stdout:
{
  "baseline": {"x": [...], "y": [...]},
  "proposed": {"x": [...], "y": [...]},
  "fitted_exponent": number or null,
  "fitted_exponent_error": number or null,
  "convergence": {"resolutions": [...], "errors": [...]},
  "conservation": {"quantities": [{"name": "...", "max_drift": number}]},
  "execution_time": number
}

SPECIFIC SIMULATION TYPES:

For scaling_law claims (e.g., Q ∝ v_A^3/L):
- Sweep the independent variable over 2+ decades
- Fit log-log slope
- Compare fitted exponent to claimed exponent
- Baseline: use the standard model's scaling (e.g., Sweet-Parker Q ∝ η^{1/2})

For numerical_prediction claims (e.g., v_rec ≈ 0.1 v_A):
- Solve the relevant PDE/ODE system
- Extract the observable
- Compare to predicted value
- Baseline: solve without the proposed term

For equation claims (e.g., α_SS = 2/(πβ)):
- Sweep the parameter (β)
- Evaluate both sides
- Check agreement across parameter space

For baseline_contrast claims (e.g., P ∝ B^{3/2} vs P ∝ B^2):
- Run both models over same parameter range
- Fit exponents for both
- Show where they diverge`;

export async function generateSimulationCode(
  claim: TestableClaim,
  apiKey: string,
): Promise<{ baselineCode: string; proposedCode: string; combinedCode: string }> {
  const openai = new OpenAI({ apiKey });

  const claimSpec = JSON.stringify(claim, null, 2);

  const response = await openai.chat.completions.create({
    model: "gpt-5.4",
    messages: [
      { role: "system", content: CODEGEN_PROMPT },
      {
        role: "user",
        content: `Generate a self-contained Python simulation script to test this claim:

${claimSpec}

The script should:
1. Implement both the baseline model (${claim.baselineModel}) and the proposed model (${claim.proposedModel})
2. Sweep ${claim.variables?.find((v) => v.role === "independent")?.symbol ?? "the key parameter"} over its range
3. Fit the scaling exponent if applicable (expected: ${claim.exponent ?? "N/A"})
4. Check convergence at 2 resolutions
5. Print results as a single JSON object to stdout

Return ONLY the Python code, no markdown fences.`,
      },
    ],
    temperature: 0.1,
  });

  const code = response.choices[0]?.message?.content ?? "";

  const cleaned = code
    .replace(/^```python\n?/m, "")
    .replace(/^```\n?/m, "")
    .replace(/```$/m, "")
    .trim();

  return {
    baselineCode: cleaned,
    proposedCode: cleaned,
    combinedCode: cleaned,
  };
}

export function buildSimulationPlan(claim: TestableClaim): SimulationPlan {
  const indepVar = claim.variables?.find((v) => v.role === "independent");
  const sweep: ParameterSweep = indepVar
    ? {
        variable: indepVar.symbol,
        min: indepVar.typical_range?.[0] ?? 0.1,
        max: indepVar.typical_range?.[1] ?? 100,
        points: 50,
        scale: "log",
      }
    : { variable: "x", min: 0.1, max: 100, points: 50, scale: "log" };

  return {
    claimId: claim.claimId,
    tier: claim.simulationFeasibility === "toy" ? 2 : claim.simulationFeasibility === "reduced" ? 2 : 1,
    method: claim.claimType === "scaling_law"
      ? "parameter_sweep_loglog_regression"
      : claim.claimType === "equation"
        ? "direct_evaluation"
        : "numerical_integration",
    parameterSweep: [sweep],
    baselineCode: "",
    proposedCode: "",
    convergenceTest: "run at N and 2N resolution, check L2 error decreases",
    conservationChecks: ["energy"],
    expectedOutcome: claim.exponent
      ? `fitted exponent = ${claim.exponent} ± 0.1`
      : `observable matches prediction`,
  };
}
