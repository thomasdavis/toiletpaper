/**
 * PRD-001 — paper-level domain classification.
 *
 * One LLM call per paper. We cache the result on `papers.domain` so
 * repeat calls (re-simulate, re-extract) don't re-bill the model.
 */

import OpenAI from "openai";
import { db } from "@/lib/db";
import { papers } from "@toiletpaper/db";
import { eq } from "drizzle-orm";

export const PAPER_DOMAINS = [
  "physics",
  "astronomy",
  "biology",
  "chemistry",
  "materials",
  "mathematics",
  "computer_science",
  "economics",
  "medicine",
  "social_science",
  "humanities",
  "linguistics",
  "history",
  "philosophy",
  "mixed",
  "unknown",
] as const;

export type PaperDomain = (typeof PAPER_DOMAINS)[number];

/** Domains for which our deterministic physics simulators are applicable. */
export const PHYSICS_DOMAINS: ReadonlyArray<PaperDomain> = [
  "physics",
  "astronomy",
  "materials",
];

export interface ClassifyInput {
  title: string;
  abstract?: string | null;
  /** A handful of representative claim texts (8-12 is plenty). */
  sampleClaims: string[];
}

export interface ClassifyResult {
  domain: PaperDomain;
  confidence: number;
  reason: string;
}

const SYSTEM_PROMPT = `You classify research papers into a small set of academic domains.
Given the title, abstract, and a few sample claims, return the single
best-fit domain and a confidence score.

Allowed domains:
  ${PAPER_DOMAINS.join(", ")}

Use "mixed" only when the paper sits genuinely on the boundary between
two top-level domains (e.g. mathematical physics, computational
biology). Use "unknown" only when the paper is too short or
non-academic to classify.

Return strict JSON: { "domain": <domain>, "confidence": 0..1, "reason": "<one sentence>" }.`;

export async function classifyPaperDomain(
  input: ClassifyInput,
  apiKey: string,
): Promise<ClassifyResult> {
  const client = new OpenAI({ apiKey, baseURL: "https://openrouter.ai/api/v1" });
  const sample = input.sampleClaims.slice(0, 12).map((s, i) => `  [${i + 1}] ${s}`).join("\n");
  const user = [
    `TITLE: ${input.title}`,
    input.abstract ? `\nABSTRACT: ${input.abstract.slice(0, 1500)}` : "",
    `\nSAMPLE CLAIMS:\n${sample}`,
  ].filter(Boolean).join("");

  const completion = await client.chat.completions.create({
    model: "x-ai/grok-3-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: user },
    ],
    temperature: 0,
    response_format: { type: "json_object" },
    max_tokens: 200,
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: { domain?: string; confidence?: number; reason?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }

  const domain = (PAPER_DOMAINS as readonly string[]).includes(parsed.domain ?? "")
    ? (parsed.domain as PaperDomain)
    : "unknown";
  const confidence =
    typeof parsed.confidence === "number" && parsed.confidence >= 0 && parsed.confidence <= 1
      ? parsed.confidence
      : 0;
  const reason =
    typeof parsed.reason === "string" ? parsed.reason.slice(0, 280) : "";

  return { domain, confidence, reason };
}

/**
 * Classify the paper if it hasn't been already, persist on the row,
 * and return the result. Idempotent: a paper that already has a
 * non-`unknown` domain is returned as-is unless `force` is true.
 */
export async function ensurePaperDomain(
  paperId: string,
  title: string,
  abstract: string | null,
  sampleClaims: string[],
  apiKey: string,
  opts: { force?: boolean } = {},
): Promise<ClassifyResult> {
  if (!opts.force) {
    const [p] = await db
      .select({ domain: papers.domain, conf: papers.domainConfidence })
      .from(papers)
      .where(eq(papers.id, paperId));
    if (p && p.domain && p.domain !== "unknown") {
      return {
        domain: p.domain as PaperDomain,
        confidence: p.conf ?? 0,
        reason: "cached",
      };
    }
  }

  const result = await classifyPaperDomain(
    { title, abstract, sampleClaims },
    apiKey,
  );

  await db
    .update(papers)
    .set({
      domain: result.domain,
      domainConfidence: result.confidence,
      domainClassifiedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(papers.id, paperId));

  return result;
}

export function isPhysicsDomain(d: string): boolean {
  return (PHYSICS_DOMAINS as readonly string[]).includes(d);
}
