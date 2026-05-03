import OpenAI from "openai";
import type { TestableClaim, SimulationResult, ClaimVerdict, Verdict } from "./schema";

const JUDGE_PROMPT = `You are a scientific judge evaluating whether a physics claim has been reproduced by simulation.

Given:
1. The original claim
2. Dimensional analysis results
3. Simulation results (baseline vs proposed)
4. Convergence test results
5. Conservation check results
6. Fitted exponent vs expected exponent (for scaling laws)

Assign a verdict:
- "reproduced": simulation confirms the claim quantitatively (exponents match within 5%, predictions match within error bars)
- "contradicted": simulation produces results inconsistent with the claim
- "numerically_fragile": result depends on resolution, initial conditions, or has poor convergence
- "underdetermined": insufficient information or too many free parameters to decide
- "not_simulable": the claim cannot be tested with the available simulation tier
- "requires_unavailable_data": claim needs observational data not available

Also assess:
- confidence (0-1): how confident are you in this verdict?
- baselineReproduced: does the baseline (standard model) work as expected?
- proposedMatchesClaim: does the proposed model match what the paper claims?

Return JSON: { "verdict": "...", "reason": "...", "confidence": 0.9, "baselineReproduced": true, "proposedMatchesClaim": true }`;

export async function judgeResult(
  claim: TestableClaim,
  result: SimulationResult,
  apiKey: string,
): Promise<ClaimVerdict> {
  const client = new OpenAI({ apiKey, baseURL: "https://openrouter.ai/api/v1" });

  const summary = {
    claim: claim.statement,
    claimType: claim.claimType,
    expectedExponent: claim.exponent,
    baselineModel: claim.baselineModel,
    proposedModel: claim.proposedModel,
    falsificationCriteria: claim.falsificationCriteria,
    dimensionalCheck: result.dimensionalCheck,
    fittedExponent: result.fittedExponent,
    fittedExponentError: result.fittedExponentError,
    convergencePassed: result.convergenceCheck.passed,
    convergenceOrder: result.convergenceCheck.convergenceOrder,
    conservationPassed: result.conservationCheck.passed,
    baselinePoints: result.baselineData.length,
    proposedPoints: result.proposedData.length,
    rawVerdict: result.verdict,
    rawReason: result.verdictReason,
  };

  const response = await client.chat.completions.create({
    model: "x-ai/grok-4.1-mini",
    messages: [
      { role: "system", content: JUDGE_PROMPT },
      { role: "user", content: JSON.stringify(summary, null, 2) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
  });

  const content = response.choices[0]?.message?.content;
  let judged = {
    verdict: result.verdict as Verdict,
    reason: result.verdictReason,
    confidence: 0.5,
    baselineReproduced: true,
    proposedMatchesClaim: result.verdict === "reproduced",
  };

  if (content) {
    try {
      const parsed = JSON.parse(content);
      judged = { ...judged, ...parsed };
    } catch (_e) { /* use defaults */ }
  }

  return {
    claimId: claim.claimId,
    statement: claim.statement,
    claimType: claim.claimType,
    tier: result.tier as 1 | 2 | 3,
    verdict: judged.verdict,
    reason: judged.reason,
    dimensionalPass: result.dimensionalCheck.passed,
    convergencePass: result.convergenceCheck.passed,
    conservationPass: result.conservationCheck.passed,
    baselineReproduced: judged.baselineReproduced,
    proposedMatchesClaim: judged.proposedMatchesClaim,
    fittedExponent: result.fittedExponent,
    expectedExponent: result.expectedExponent,
    confidence: judged.confidence,
    plots: result.plots,
  };
}

export function judgeAlgebraic(claim: TestableClaim, result: SimulationResult): ClaimVerdict {
  return {
    claimId: claim.claimId,
    statement: claim.statement,
    claimType: claim.claimType,
    tier: 1,
    verdict: result.verdict,
    reason: result.verdictReason,
    dimensionalPass: result.dimensionalCheck.passed,
    convergencePass: result.convergenceCheck.passed,
    conservationPass: result.conservationCheck.passed,
    baselineReproduced: true,
    proposedMatchesClaim: result.verdict === "reproduced",
    fittedExponent: result.fittedExponent,
    expectedExponent: result.expectedExponent,
    confidence: result.verdict === "reproduced" ? 0.95 : 0.7,
    plots: result.plots,
  };
}
