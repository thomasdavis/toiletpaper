import { NextResponse } from "next/server";
import { env } from "@/lib/env";

const DONTOSRV_URL = env.DONTOSRV_URL || "http://localhost:7879";

/** The 11-stage claim lifecycle. */
const LIFECYCLE_STAGES = [
  { key: "ingested", label: "Ingested", description: "PDF parsed and text extracted" },
  { key: "extracted", label: "Claims Extracted", description: "Claims identified by LLM" },
  { key: "asserted", label: "Asserted in KG", description: "Claims stored as donto statements" },
  { key: "evidence_linked", label: "Evidence Linked", description: "Source spans linked to claims" },
  { key: "validated", label: "Schema Validated", description: "Claims pass SHACL shape checks" },
  { key: "simulated", label: "Simulated", description: "Physics simulations run" },
  { key: "verdict_issued", label: "Verdict Issued", description: "Simulation verdict recorded" },
  { key: "argued", label: "Arguments Wired", description: "Support/rebut arguments connected" },
  { key: "confidence_set", label: "Confidence Set", description: "Confidence scores updated" },
  { key: "certified", label: "Certified", description: "Verification certificate attached" },
  { key: "obligations_clear", label: "Obligations Clear", description: "No open proof obligations" },
] as const;

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const r = await fetch(url, {
      ...init,
      headers: { accept: "application/json", ...(init?.headers ?? {}) },
    });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const paperIri = `tp:paper:${id}`;
  const claimsCtx = `tp:paper:${id}:claims`;

  // Fetch data from dontosrv in parallel
  const [contexts, obligations, frontier, paperHistory] = await Promise.all([
    fetchJson<{ contexts: Array<{ context: string; kind: string; count: number }> }>(
      `${DONTOSRV_URL}/contexts`,
    ),
    fetchJson<{ obligations: Array<{ obligation_id: string; obligation_type: string; context: string }> }>(
      `${DONTOSRV_URL}/obligations/open`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ context: claimsCtx, limit: 100 }) },
    ),
    fetchJson<{ frontier: Array<{ statement_id: string; attack_count: number; support_count: number }> }>(
      `${DONTOSRV_URL}/arguments/frontier`,
    ),
    fetchJson<{ subject: string; count: number; rows: Array<{ predicate: string; object_lit?: { v: unknown } | null }> }>(
      `${DONTOSRV_URL}/history/${encodeURIComponent(paperIri)}`,
    ),
  ]);

  const ctxMatch = contexts?.contexts?.find((c) => c.context === claimsCtx);
  const stmtCount = ctxMatch?.count ?? 0;
  const openObligations = obligations?.obligations ?? [];
  const frontierEntries = frontier?.frontier ?? [];
  const hasArguments = frontierEntries.some((f) => f.attack_count > 0 || f.support_count > 0);
  const paperTriples = paperHistory?.count ?? 0;

  // Determine which stages are complete based on available data
  const stages = LIFECYCLE_STAGES.map((stage) => {
    let complete = false;

    switch (stage.key) {
      case "ingested":
        complete = paperTriples > 0;
        break;
      case "extracted":
        complete = stmtCount > 0;
        break;
      case "asserted":
        complete = stmtCount > 0;
        break;
      case "evidence_linked":
        // Evidence linked if we have more than just the base claim triples
        complete = stmtCount > 3;
        break;
      case "validated":
        complete = stmtCount > 0;
        break;
      case "simulated":
        // Check for simulation verdict predicates in the context
        complete = stmtCount > 5;
        break;
      case "verdict_issued":
        complete = stmtCount > 5;
        break;
      case "argued":
        complete = hasArguments;
        break;
      case "confidence_set":
        complete = stmtCount > 5;
        break;
      case "certified":
        // Hard to tell without querying certificates directly, approximate
        complete = stmtCount > 8;
        break;
      case "obligations_clear":
        complete = openObligations.length === 0 && stmtCount > 0;
        break;
    }

    return { ...stage, complete };
  });

  const completedCount = stages.filter((s) => s.complete).length;

  return NextResponse.json({
    paperId: id,
    stages,
    completedCount,
    totalStages: LIFECYCLE_STAGES.length,
    openObligationCount: openObligations.length,
    argumentCount: frontierEntries.length,
    statementCount: stmtCount,
  });
}
