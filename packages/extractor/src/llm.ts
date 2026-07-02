import OpenAI from "openai";
import { readFileSync } from "node:fs";

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

export function extractorModel() {
  return process.env.LLM_MODEL ?? "openai/gpt-5.5";
}

export function extractorVersion() {
  return process.env.LLM_MODEL_VERSION ?? "2026-06";
}

function extractorBaseUrl() {
  return process.env.LLM_BASE_URL ?? "https://openrouter.ai/api/v1";
}

function extractorMaxTokens() {
  return Number.parseInt(process.env.LLM_MAX_TOKENS ?? "4096", 10);
}

function extractorRetryAttempts() {
  return Number.parseInt(process.env.LLM_RETRY_ATTEMPTS ?? "3", 10);
}

function extractorRetryBaseMs() {
  return Number.parseInt(process.env.LLM_RETRY_BASE_MS ?? "15000", 10);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function headerValue(headers: unknown, name: string): string | null {
  if (!headers) return null;
  if (typeof (headers as { get?: unknown }).get === "function") {
    return String((headers as { get(name: string): unknown }).get(name) ?? "") || null;
  }
  const value = (headers as Record<string, unknown>)[name] ??
    (headers as Record<string, unknown>)[name.toLowerCase()];
  return value == null ? null : String(value);
}

function retryDelayMs(error: unknown, attempt: number): number {
  const retryAfter = headerValue((error as { headers?: unknown })?.headers, "retry-after");
  if (retryAfter) {
    const seconds = Number.parseFloat(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.ceil(seconds * 1000);
    }
  }
  return extractorRetryBaseMs() * Math.max(1, attempt);
}

function isRetryableExtractorError(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  const code = (error as { code?: string | number })?.code;
  const message = error instanceof Error ? error.message : String(error);
  return (
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    code === "429" ||
    /rate limit|temporarily unavailable|timeout/i.test(message)
  );
}

function resolveApiKey(apiKey?: string) {
  if (process.env.LLM_API_KEY?.trim()) return process.env.LLM_API_KEY.trim();
  if (process.env.LLM_API_KEY_FILE?.trim()) {
    return readFileSync(process.env.LLM_API_KEY_FILE, "utf8").trim();
  }
  if (apiKey?.trim()) return apiKey.trim();
  if (process.env.OPENROUTER_API_KEY?.trim()) {
    return process.env.OPENROUTER_API_KEY.trim();
  }
  return "";
}

function parseJsonObject(content: string): unknown {
  let text = content.trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) text = fenced[1].trim();

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    text = text.slice(start, end + 1);
  }

  try {
    return JSON.parse(text);
  } catch (_e) {
    const repaired = text
      .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')
      .replace(/,\s*([}\]])/g, "$1");
    return JSON.parse(repaired);
  }
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

Focus on claims that are empirically testable or falsifiable. Extract ALL logical relationships between claims — a paper's argumentative structure is as important as its individual claims.

Return ONLY the JSON object. Do not include prose, markdown fences, commentary, or an explanation before or after the JSON.`;

export async function extractClaimsFromText(
  text: string,
  apiKey: string,
): Promise<ExtractionResult> {
  const resolvedApiKey = resolveApiKey(apiKey);
  if (!resolvedApiKey) throw new Error("No extractor API key configured");

  const client = new OpenAI({
    apiKey: resolvedApiKey,
    baseURL: extractorBaseUrl(),
    defaultHeaders: {
      "User-Agent": "toiletpaper/instance-deploy",
    },
  });

  const truncated = text.length > 100_000 ? text.slice(0, 100_000) : text;

  let response;
  const attempts = Math.max(1, extractorRetryAttempts());
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      response = await client.chat.completions.create({
        model: extractorModel(),
        messages: [
          { role: "system", content: `${EXTRACTION_PROMPT}\n\nYou must output strict JSON only.` },
          {
            role: "user",
            content: `Extract all testable claims and their logical relationships from this paper. Return only strict JSON matching the requested schema:\n\n${truncated}`,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: extractorMaxTokens(),
      });
      break;
    } catch (error) {
      if (attempt >= attempts || !isRetryableExtractorError(error)) throw error;
      const delay = retryDelayMs(error, attempt);
      console.warn(
        `Claim extractor request failed; retrying in ${Math.round(delay / 1000)}s (${attempt}/${attempts})`,
        error instanceof Error ? error.message : String(error),
      );
      await sleep(delay);
    }
  }

  const content = response?.choices[0]?.message?.content;
  if (!content) throw new Error("No response from model");

  const parsed = parseJsonObject(content) as ExtractionResult;
  if (!Array.isArray(parsed.relations)) parsed.relations = [];
  if (!Array.isArray(parsed.claims)) parsed.claims = [];
  if (!Array.isArray(parsed.authors)) parsed.authors = [];
  if (!parsed.title) parsed.title = "";
  if (!parsed.abstract) parsed.abstract = "";
  parsed.claims = parsed.claims.map((c) => ({
    ...c,
    text: c.text ?? "",
    category: c.category ?? "unknown",
    confidence: c.confidence ?? 0.5,
    evidence: c.evidence ?? "",
  }));
  parsed.relations = parsed.relations.filter((r) =>
    Number.isInteger(r.from_index) &&
    Number.isInteger(r.to_index) &&
    ["supports", "rebuts", "qualifies", "derived_from"].includes(r.relation),
  );
  return parsed;
}
