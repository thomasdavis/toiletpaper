import { NextResponse } from "next/server";
import { env } from "@/lib/env";

const DONTOSRV_URL = env.DONTOSRV_URL || "http://localhost:7879";

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

/**
 * GET /api/papers/[id]/donto?section=evidence|arguments|obligations
 *
 * Lazy-loaded donto data for the paper detail page.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(req.url);
  const section = url.searchParams.get("section");
  const paperIri = `tp:paper:${id}`;
  const claimsCtx = `tp:paper:${id}:claims`;

  if (section === "evidence") {
    const history = await fetchJson<{
      subject: string;
      count: number;
      rows: Array<{
        statement_id: string;
        predicate: string;
        object_iri?: string | null;
        object_lit?: { v: unknown; dt: string } | null;
        context: string;
      }>;
    }>(`${DONTOSRV_URL}/history/${encodeURIComponent(paperIri)}`);

    if (!history) {
      return NextResponse.json({ evidence: null });
    }

    // Extract extraction run metadata from history triples
    const triples = history.rows ?? [];
    const extractionModel = triples.find((r) => r.predicate === "tp:extractionModel")?.object_lit?.v;
    const extractionVersion = triples.find((r) => r.predicate === "tp:extractionVersion")?.object_lit?.v;
    const parserVersion = triples.find((r) => r.predicate === "tp:parserVersion")?.object_lit?.v;
    const bodyCharCount = triples.find((r) => r.predicate === "tp:bodyCharCount")?.object_lit?.v;
    const agent = triples.find((r) => r.predicate === "tp:agent")?.object_lit?.v
      ?? triples.find((r) => r.predicate === "dc:creator")?.object_lit?.v;
    const title = triples.find((r) => r.predicate === "dc:title")?.object_lit?.v;
    const docType = triples.find((r) => r.predicate === "rdf:type")?.object_iri;

    return NextResponse.json({
      evidence: {
        tripleCount: history.count,
        extractionModel: extractionModel ?? null,
        extractionVersion: extractionVersion ?? null,
        parserVersion: parserVersion ?? null,
        bodyCharCount: bodyCharCount ?? null,
        agent: agent ?? null,
        title: title ?? null,
        docType: docType ?? null,
        predicates: [...new Set(triples.map((r) => r.predicate))],
      },
    });
  }

  if (section === "arguments") {
    const frontier = await fetchJson<{
      frontier: Array<{
        statement_id: string;
        attack_count: number;
        support_count: number;
        net_pressure: number;
      }>;
    }>(`${DONTOSRV_URL}/arguments/frontier`);

    return NextResponse.json({
      arguments: (frontier?.frontier ?? []).map((f) => ({
        statementId: f.statement_id,
        attackCount: f.attack_count,
        supportCount: f.support_count,
        netPressure: f.net_pressure,
      })),
    });
  }

  if (section === "obligations") {
    const obligations = await fetchJson<{
      obligations: Array<{
        obligation_id: string;
        statement_id?: string;
        obligation_type: string;
        priority: number;
        context: string;
      }>;
    }>(`${DONTOSRV_URL}/obligations/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ context: claimsCtx, limit: 100 }),
    });

    return NextResponse.json({
      obligations: (obligations?.obligations ?? []).map((o) => ({
        id: o.obligation_id,
        statementId: o.statement_id,
        type: o.obligation_type,
        priority: o.priority,
        context: o.context,
      })),
    });
  }

  return NextResponse.json({ error: "section param required (evidence|arguments|obligations)" }, { status: 400 });
}
