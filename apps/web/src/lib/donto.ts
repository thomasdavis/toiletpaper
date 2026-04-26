import { env } from "./env";

async function get<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`${env.DONTOSRV_URL}${path}`, {
      headers: { accept: "application/json" },
      next: { revalidate: 0 },
    });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch (_e) {
    return null;
  }
}

export async function dontoHealth(): Promise<boolean> {
  try {
    const r = await fetch(`${env.DONTOSRV_URL}/health`);
    return r.ok;
  } catch (_e) {
    return false;
  }
}

export async function getClaimCard(statementId: string) {
  return get<Record<string, unknown>>(`/claim/${encodeURIComponent(statementId)}`);
}

export async function getHistory(subject: string) {
  return get<{
    subject: string;
    count: number;
    rows: Array<{
      statement_id: string;
      subject: string;
      predicate: string;
      object_iri?: string | null;
      object_lit?: { v: unknown; dt: string } | null;
      context: string;
      polarity: string;
      maturity: number;
      valid_lo?: string | null;
      valid_hi?: string | null;
      tx_lo: string;
      tx_hi?: string | null;
      lineage: string[];
    }>;
  }>(`/history/${encodeURIComponent(subject)}`);
}

export async function getContexts() {
  return get<{
    contexts: Array<{ context: string; kind: string; mode: string; count: number }>;
  }>("/contexts");
}

export async function getObligationSummary() {
  return get<{
    summary: Array<{ obligation_type: string; status: string; count: number }>;
  }>("/obligations/summary");
}

export async function getOpenObligations(context?: string) {
  try {
    const r = await fetch(`${env.DONTOSRV_URL}/obligations/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ context, limit: 50 }),
      next: { revalidate: 0 },
    });
    if (!r.ok) return { obligations: [] };
    return (await r.json()) as {
      obligations: Array<{
        obligation_id: string;
        statement_id?: string;
        obligation_type: string;
        priority: number;
        context: string;
      }>;
    };
  } catch (_e) {
    return { obligations: [] };
  }
}

export async function getSubjects() {
  return get<{
    subjects: Array<{ subject: string; count: number }>;
  }>("/subjects");
}

export async function getArgumentsFrontier() {
  return get<{
    frontier: Array<{
      statement_id: string;
      attack_count: number;
      support_count: number;
      net_pressure: number;
    }>;
  }>("/arguments/frontier");
}

export async function getEvidenceFor(statementId: string) {
  return get<{
    evidence: Array<{
      link_id: string;
      link_type: string;
      confidence?: number;
    }>;
  }>(`/evidence/${encodeURIComponent(statementId)}`);
}
