import OpenAI from "openai";

export interface ExtractedClaim {
  text: string;
  category: string;
  confidence: number;
  evidence: string;
  predicate?: string;
  value?: string;
  unit?: string;
}

export interface ClaimRelation {
  from_index: number;
  to_index: number;
  relation: "supports" | "rebuts" | "qualifies" | "derived_from";
  strength: number;
  reason: string;
}

export interface ExtractionResult {
  title: string;
  authors: string[];
  abstract: string;
  claims: ExtractedClaim[];
  relations: ClaimRelation[];
}

const EXTRACTION_PROMPT = `You are a scientific paper claim extractor. Given the text of a scientific paper, extract:

1. Paper metadata: title, authors, abstract
2. All testable/verifiable claims made in the paper
3. Logical relationships between claims

For each claim, provide:
- text: the exact claim as stated
- category: one of "quantitative", "comparative", "causal", "methodological", "theoretical"
- confidence: your confidence that this is a genuine testable claim (0-1)
- evidence: the evidence or data cited to support the claim
- predicate: a short predicate name (e.g., "achieves_accuracy", "outperforms", "causes")
- value: the numeric value if quantitative (e.g., "95.2")
- unit: the unit if applicable (e.g., "percent", "seconds", "meters")

For relations between claims, provide an array of objects:
- from_index: index of the source claim in the claims array (0-based)
- to_index: index of the target claim in the claims array (0-based)
- relation: one of "supports" (evidence backs the claim), "rebuts" (contradicts), "qualifies" (adds nuance/scope), "derived_from" (logically follows from)
- strength: confidence in the relationship (0-1)
- reason: one sentence explaining why this relationship holds

Be thorough with relations. Look for:
- Quantitative measurements that support comparative claims
- Theoretical predictions confirmed by observations
- Calculations derived from equations stated elsewhere
- Claims that scope or qualify other claims
- Evidence chains where one result leads to another

Return valid JSON with this structure:
{
  "title": "...",
  "authors": ["..."],
  "abstract": "...",
  "claims": [ { "text": "...", "category": "...", "confidence": 0.9, "evidence": "...", "predicate": "...", "value": "...", "unit": "..." } ],
  "relations": [ { "from_index": 0, "to_index": 1, "relation": "supports", "strength": 0.9, "reason": "..." } ]
}

Focus on claims that are empirically testable or falsifiable. Extract ALL logical relationships between claims — a paper's argumentative structure is as important as its individual claims.`;

export async function extractClaimsFromText(
  text: string,
  apiKey: string,
): Promise<ExtractionResult> {
  const client = new OpenAI({ apiKey, baseURL: "https://openrouter.ai/api/v1" });

  const truncated = text.length > 100_000 ? text.slice(0, 100_000) : text;

  const response = await client.chat.completions.create({
    model: "x-ai/grok-3-mini",
    messages: [
      { role: "system", content: EXTRACTION_PROMPT },
      {
        role: "user",
        content: `Extract all testable claims and their logical relationships from this paper:\n\n${truncated}`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from model");

  const parsed = JSON.parse(content) as ExtractionResult;
  if (!parsed.relations) parsed.relations = [];
  if (!parsed.claims) parsed.claims = [];
  if (!parsed.authors) parsed.authors = [];
  if (!parsed.title) parsed.title = "";
  if (!parsed.abstract) parsed.abstract = "";
  parsed.claims = parsed.claims.map((c) => ({
    ...c,
    text: c.text ?? "",
    category: c.category ?? "unknown",
    confidence: c.confidence ?? 0.5,
    evidence: c.evidence ?? "",
  }));
  return parsed;
}
