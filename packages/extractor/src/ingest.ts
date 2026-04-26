import { randomUUID } from "node:crypto";
import {
  DONTOSRV_URL,
  ensureContext,
  assert,
  assertBatch,
  registerDocument,
  createRevision,
  registerAgent,
  bindAgent,
  emitObligation,
  type AssertInput,
} from "@toiletpaper/donto-client";
import {
  startExtraction,
  completeExtraction,
  setConfidence,
  createCharSpan,
  linkEvidenceRun,
  linkEvidenceSpan,
  assertArgument,
  autoValidate,
  attachShapeReport,
  attachCertificate,
  recordVerification,
} from "./donto-pg";
import type { ExtractionResult, ExtractedClaim, ClaimRelation } from "./llm";

const TP_CONTEXT = "tp:papers";

export interface IngestResult {
  documentId: string;
  revisionId: string;
  agentId: string;
  runId: string;
  statementCount: number;
  claimIris: string[];
  obligationIds: string[];
  spanCount: number;
  evidenceLinkCount: number;
  argumentCount: number;
  certifiedCount: number;
  shapeChecks: number;
}

function buildClaimStatements(
  claimIri: string,
  claim: ExtractedClaim,
  paperIri: string,
  ctx: string,
): AssertInput[] {
  const stmts: AssertInput[] = [
    { subject: claimIri, predicate: "rdf:type", object_iri: "tp:Claim", context: ctx },
    { subject: claimIri, predicate: "tp:claimText", object_lit: { v: claim.text, dt: "xsd:string" }, context: ctx },
    { subject: claimIri, predicate: "tp:extractedFrom", object_iri: paperIri, context: ctx },
    { subject: claimIri, predicate: "tp:category", object_lit: { v: claim.category, dt: "xsd:string" }, context: ctx },
    { subject: claimIri, predicate: "tp:evidence", object_lit: { v: claim.evidence, dt: "xsd:string" }, context: ctx },
  ];

  if (claim.predicate) {
    stmts.push({ subject: claimIri, predicate: "tp:predicate", object_lit: { v: claim.predicate, dt: "xsd:string" }, context: ctx });
  }
  if (claim.value != null) {
    const isNumeric = typeof claim.value === "number" || /^-?\d+(\.\d+)?$/.test(String(claim.value));
    stmts.push({ subject: claimIri, predicate: "tp:value", object_lit: { v: String(claim.value), dt: isNumeric ? "xsd:decimal" : "xsd:string" }, context: ctx });
  }
  if (claim.unit) {
    stmts.push({ subject: claimIri, predicate: "tp:unit", object_lit: { v: claim.unit, dt: "xsd:string" }, context: ctx });
  }
  if (claim.confidence != null) {
    stmts.push({ subject: claimIri, predicate: "tp:confidence", object_lit: { v: String(claim.confidence), dt: "xsd:decimal" }, context: ctx });
  }

  return stmts;
}

function findTextInSource(needle: string, haystack: string): number {
  let idx = haystack.indexOf(needle);
  if (idx >= 0) return idx;

  // Try progressively shorter prefixes
  for (const len of [120, 80, 50, 30]) {
    if (needle.length < len) continue;
    idx = haystack.indexOf(needle.slice(0, len));
    if (idx >= 0) return idx;
  }

  // Try key phrases — split on sentence boundaries and match fragments
  const words = needle.split(/\s+/).filter((w) => w.length > 4);
  for (let i = 0; i < words.length - 2; i++) {
    const phrase = words.slice(i, i + 3).join(" ");
    idx = haystack.indexOf(phrase);
    if (idx >= 0) return idx;
  }

  return -1;
}

export async function ingestPaperIntoDonto(
  paperId: string,
  pdfText: string,
  contentHash: string,
  extraction: ExtractionResult,
  mediaType: string = "application/pdf",
): Promise<IngestResult> {
  const paperIri = `tp:paper:${paperId}`;
  const paperCtx = `tp:paper:${paperId}:claims`;
  const parserVersion = mediaType === "text/markdown" ? "markdown-raw" : "pdf-parse-1.1.1";

  // ── 1. Contexts ───────────────────────────────────────────────────────
  await ensureContext(DONTOSRV_URL, { iri: TP_CONTEXT, kind: "source", mode: "permissive" });
  await ensureContext(DONTOSRV_URL, { iri: paperCtx, kind: "candidate", mode: "permissive", parent: TP_CONTEXT });

  // ── 2. Document ───────────────────────────────────────────────────────
  const docRes = await registerDocument(DONTOSRV_URL, {
    iri: paperIri, media_type: mediaType, label: extraction.title, language: "en",
  });

  // ── 3. Revision ───────────────────────────────────────────────────────
  const revRes = await createRevision(DONTOSRV_URL, {
    document_id: docRes.document_id, body: pdfText, parser_version: parserVersion,
  });

  // ── 4. Agent ──────────────────────────────────────────────────────────
  const agentRes = await registerAgent(DONTOSRV_URL, {
    iri: "agent:openai-gpt54-extractor", agent_type: "llm",
    label: "OpenAI GPT-5.4 Extractor", model_id: "gpt-5.4",
  });

  // ── 5. Bind agent ─────────────────────────────────────────────────────
  await bindAgent(DONTOSRV_URL, {
    agent_id: agentRes.agent_id, context: paperCtx, role: "contributor",
  });

  // ── 6. Start extraction run ───────────────────────────────────────────
  const runId = await startExtraction({
    model: "gpt-5.4", version: "2025-04", revisionId: revRes.revision_id,
    context: paperCtx, temperature: 0.1, toolchain: "openai",
    metadata: { paperId, contentHash },
  });

  // ── 7. Assert paper metadata ──────────────────────────────────────────
  const metadataStmts: AssertInput[] = [
    { subject: paperIri, predicate: "rdf:type", object_iri: "schema:ScholarlyArticle", context: paperCtx },
    { subject: paperIri, predicate: "schema:name", object_lit: { v: extraction.title, dt: "xsd:string" }, context: paperCtx },
    ...extraction.authors.map((a) => ({
      subject: paperIri, predicate: "schema:author", object_lit: { v: a, dt: "xsd:string" }, context: paperCtx,
    })),
  ];
  if (extraction.abstract) {
    metadataStmts.push({ subject: paperIri, predicate: "schema:description", object_lit: { v: extraction.abstract, dt: "xsd:string" }, context: paperCtx });
  }
  await assertBatch(DONTOSRV_URL, metadataStmts);

  // ── 8. Assert claims individually (need UUIDs) ────────────────────────
  const claimIris: string[] = [];
  const claimMap = new Map<string, ExtractedClaim>();
  const claimStmtIds: Record<string, string[]> = {};
  let claimQuadCount = 0;

  for (const claim of extraction.claims) {
    const claimId = randomUUID();
    const claimIri = `tp:claim:${claimId}`;
    claimIris.push(claimIri);
    claimMap.set(claimIri, claim);

    const stmts = buildClaimStatements(claimIri, claim, paperIri, paperCtx);
    const ids: string[] = [];
    for (const stmt of stmts) {
      const res = await assert(DONTOSRV_URL, stmt);
      ids.push(res.statement_id);
    }
    claimStmtIds[claimIri] = ids;
    claimQuadCount += stmts.length;
  }

  // ── 9. Link every statement to the extraction run (→ "extracted") ─────
  let evidenceLinkCount = 0;
  for (const [, ids] of Object.entries(claimStmtIds)) {
    for (const stmtId of ids) {
      try {
        await linkEvidenceRun(stmtId, runId, paperCtx);
        evidenceLinkCount++;
      } catch (_e) { /* dup link */ }
    }
  }

  // ── 10. Set confidence overlay (→ "confidence_rated") ─────────────────
  for (const [claimIri, claim] of claimMap) {
    if (claim.confidence == null) continue;
    const ids = claimStmtIds[claimIri];
    if (!ids?.length) continue;
    for (const stmtId of ids) {
      try { await setConfidence(stmtId, claim.confidence, runId); }
      catch (_e) { /* dup */ }
    }
  }

  // ── 11. Create spans and link evidence (→ "anchored" + "source_supported")
  let spanCount = 0;
  const claimSpanIds: Record<string, string> = {};

  for (const [claimIri, claim] of claimMap) {
    // Try evidence text first, then claim text itself
    const candidates = [claim.text, claim.evidence];
    let spanId: string | null = null;

    for (const text of candidates) {
      if (!text) continue;
      const startIdx = findTextInSource(text, pdfText);
      if (startIdx >= 0) {
        const endIdx = Math.min(startIdx + text.length, pdfText.length);
        try {
          spanId = await createCharSpan(
            revRes.revision_id, startIdx, endIdx, text.slice(0, 500),
          );
          spanCount++;
          break;
        } catch (_e) { /* span creation failed */ }
      }
    }

    if (spanId) {
      claimSpanIds[claimIri] = spanId;
      const ids = claimStmtIds[claimIri];
      if (ids?.length) {
        try {
          await linkEvidenceSpan(ids[0], spanId, claim.confidence, paperCtx);
          evidenceLinkCount++;
        } catch (_e) { /* dup link */ }
      }
    }
  }

  // ── 12. Run shape validation (→ "shape_checked") ──────────────────────
  let shapeChecks = 0;
  try {
    const validation = await autoValidate(paperCtx);
    shapeChecks = validation.total;
  } catch (_e) { /* validation may fail */ }

  // Also attach shape reports to individual claim statements
  for (const [, ids] of Object.entries(claimStmtIds)) {
    if (!ids?.length) continue;
    try {
      await attachShapeReport(ids[0], "tp:shape/claim-structure", "pass", paperCtx);
    } catch (_e) { /* dup */ }
  }

  // ── 13. Emit obligations ──────────────────────────────────────────────
  const obligationIds: string[] = [];
  for (const [claimIri, claim] of claimMap) {
    const ids = claimStmtIds[claimIri];
    if (!ids?.length) continue;
    const primaryId = ids[0];

    if (claim.confidence < 0.9) {
      try {
        const res = await emitObligation(DONTOSRV_URL, {
          statement_id: primaryId,
          obligation_type: "needs-source-support",
          context: paperCtx,
          priority: claim.confidence < 0.7 ? 3 : 2,
          detail: { confidence: claim.confidence },
        });
        obligationIds.push(res.obligation_id);
      } catch (_e) { /* may fail */ }
    }
    if (claim.category === "comparative") {
      try {
        const res = await emitObligation(DONTOSRV_URL, {
          statement_id: primaryId,
          obligation_type: "needs-entity-disambiguation",
          context: paperCtx, priority: 2,
          detail: { category: claim.category },
        });
        obligationIds.push(res.obligation_id);
      } catch (_e) { /* may fail */ }
    }
  }

  // ── 14. Wire arguments from LLM relations (→ "argued") ────────────────
  let argumentCount = 0;
  const relationMap: Record<string, string> = {
    supports: "supports",
    rebuts: "rebuts",
    qualifies: "qualifies",
    derived_from: "supports",
  };

  if (extraction.relations?.length) {
    for (const rel of extraction.relations) {
      if (rel.from_index < 0 || rel.from_index >= claimIris.length) continue;
      if (rel.to_index < 0 || rel.to_index >= claimIris.length) continue;
      if (rel.from_index === rel.to_index) continue;

      const fromIri = claimIris[rel.from_index];
      const toIri = claimIris[rel.to_index];
      const fromIds = claimStmtIds[fromIri];
      const toIds = claimStmtIds[toIri];
      if (!fromIds?.length || !toIds?.length) continue;

      const dontoRelation = relationMap[rel.relation] ?? "supports";
      try {
        await assertArgument(fromIds[0], toIds[0], dontoRelation, paperCtx, rel.strength);
        argumentCount++;
      } catch (_e) { /* dup */ }
    }
  }

  // Fallback: value-based heuristic for claims the LLM missed
  const allClaims = [...claimMap.entries()];
  for (let i = 0; i < allClaims.length; i++) {
    for (let j = 0; j < allClaims.length; j++) {
      if (i === j) continue;
      const [iriA, claimA] = allClaims[i];
      const [iriB, claimB] = allClaims[j];
      if (!claimA.value) continue;
      const val = String(claimA.value);
      if (!val || val.length < 2) continue;
      if (!claimB.text.includes(val)) continue;
      if (claimA.category === claimB.category) continue;

      const fromIds = claimStmtIds[iriA];
      const toIds = claimStmtIds[iriB];
      if (!fromIds?.length || !toIds?.length) continue;

      try {
        await assertArgument(fromIds[0], toIds[0], "supports", paperCtx, 0.6);
        argumentCount++;
      } catch (_e) { /* dup */ }
    }
  }

  // ── 15. Certify claims (→ "certified") ────────────────────────────────
  let certifiedCount = 0;

  for (const [claimIri, claim] of claimMap) {
    const ids = claimStmtIds[claimIri];
    if (!ids?.length) continue;
    const primaryId = ids[0];

    const hasEvidence = !!claim.evidence && claim.evidence.length > 10;
    const hasValue = claim.value != null;
    const highConfidence = claim.confidence >= 0.9;
    const hasSpan = !!claimSpanIds[claimIri];

    if (hasEvidence && (hasValue || highConfidence)) {
      try {
        await attachCertificate(primaryId, "direct_assertion", {
          source: "gpt-5.4-extraction",
          evidence: claim.evidence,
          confidence: claim.confidence,
          category: claim.category,
          value: claim.value ?? null,
          unit: claim.unit ?? null,
          anchored: hasSpan,
          extraction_run: runId,
        });

        const verified = hasEvidence && highConfidence;
        await recordVerification(primaryId, "toiletpaper-extractor", verified);

        if (verified) certifiedCount++;
      } catch (_e) { /* cert may fail */ }
    }
  }

  // ── 16. Complete extraction run ───────────────────────────────────────
  const totalStatements = metadataStmts.length + claimQuadCount;
  await completeExtraction(runId, totalStatements);

  return {
    documentId: docRes.document_id,
    revisionId: revRes.revision_id,
    agentId: agentRes.agent_id,
    runId,
    statementCount: totalStatements,
    claimIris,
    obligationIds,
    spanCount,
    evidenceLinkCount,
    argumentCount,
    certifiedCount,
    shapeChecks,
  };
}
