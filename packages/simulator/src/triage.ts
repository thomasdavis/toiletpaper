import OpenAI from "openai";
import type { TestableClaim } from "./schema";

const TRIAGE_PROMPT = `You are a physics claim triage agent. Convert scientific claims into testable specifications.

For each claim, return a JSON object with:
- claimId: "c" + the index number
- statement: the original claim text
- claimType: "equation" | "scaling_law" | "numerical_prediction" | "baseline_contrast"
- simulationFeasibility: "algebraic" | "toy" | "reduced" | "full"
- variables: array of {symbol, name, units, role: "independent"|"dependent"|"parameter"|"constant", typical_range?: [min, max]}
- equation: the mathematical relationship (plain text)
- lhs: left-hand side variable
- rhs: right-hand side expression
- exponent: key exponent being claimed (number or null)
- observable: what to measure
- baselineModel: standard model being compared against
- proposedModel: paper's proposed model
- falsificationCriteria: specific ways to falsify
- requiredInitialConditions: []
- requiredBoundaryConditions: []
- requiredPhysicalRegime: []
- dimensionalFormula: dimensional analysis string

Prefer "algebraic" or "toy" feasibility. Only use "full" if genuinely needs 3D MHD.
Return: {"claims": [...]}`;

interface RawClaim {
  text: string;
  category: string;
  confidence: number;
  evidence: string;
  predicate?: string;
  value?: string;
  unit?: string;
}

export async function triageClaims(
  claims: RawClaim[],
  paperAbstract: string,
  apiKey: string,
): Promise<TestableClaim[]> {
  const client = new OpenAI({ apiKey, baseURL: "https://openrouter.ai/api/v1" });

  const testable = claims.filter(
    (c) => c.category !== "methodological" && c.confidence >= 0.3,
  );
  if (testable.length === 0) return [];

  const results: TestableClaim[] = [];

  const batchSize = 20;
  for (let i = 0; i < testable.length; i += batchSize) {
    const batch = testable.slice(i, i + batchSize);
    const claimsText = batch
      .map((c, j) => `[${i + j}] ${c.text} (value=${c.value ?? "?"}, unit=${c.unit ?? "?"})`)
      .join("\n");

    try {
      const response = await client.chat.completions.create({
        model: "x-ai/grok-3-mini",
        messages: [
          { role: "system", content: TRIAGE_PROMPT },
          { role: "user", content: `Paper: ${paperAbstract.slice(0, 500)}\n\nClaims:\n${claimsText}` },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) continue;

      const parsed = JSON.parse(content) as { claims: TestableClaim[] };
      if (parsed.claims) {
        results.push(...parsed.claims);
      }
    } catch (e) {
      console.error(`Triage batch ${i} failed:`, e instanceof Error ? e.message : e);
    }
  }

  return results;
}
