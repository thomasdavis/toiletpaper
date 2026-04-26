import { NextResponse } from "next/server";
import { env } from "@/lib/env";

const DONTOSRV_URL = env.DONTOSRV_URL || "http://localhost:7879";

/**
 * GET /api/donto/history?iri=<subject_iri>
 *
 * Proxy to dontosrv /history/<iri> so client components can fetch donto data
 * without needing direct access to the sidecar.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const iri = url.searchParams.get("iri");

  if (!iri) {
    return NextResponse.json({ error: "iri param required" }, { status: 400 });
  }

  try {
    const r = await fetch(
      `${DONTOSRV_URL}/history/${encodeURIComponent(iri)}`,
      { headers: { accept: "application/json" } },
    );
    if (!r.ok) {
      return NextResponse.json({ rows: [] });
    }
    const data = await r.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ rows: [] });
  }
}
