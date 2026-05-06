import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  papers,
  claims,
  simulations,
  paperDontoIngest,
  routerDecisions,
  replicationUnits,
  replicationBlueprints,
  simulationLogs,
} from "@toiletpaper/db";
import { eq, desc, asc, sql, count } from "drizzle-orm";
import { getHistory, getContexts } from "@/lib/donto";
import { listObjects } from "@/lib/storage";
import { normalizeVerdict, isSignal } from "@/lib/verdict";

export const dynamic = "force-dynamic";

const UPLOADS_BUCKET = process.env.UPLOADS_BUCKET || "";
const SIMULATOR_WORKDIR =
  process.env.SIMULATOR_WORKDIR ?? "/tmp/tp-simulations";

// ── helpers ──────────────────────────────────────────────────────────────────

async function fetchArtifacts(paperId: string) {
  // Try GCS first
  if (UPLOADS_BUCKET) {
    try {
      const prefix = `simulations/${paperId}/`;
      const files = await listObjects(UPLOADS_BUCKET, prefix);
      return {
        source: `gs://${UPLOADS_BUCKET}/simulations/${paperId}/`,
        files: files.map((f) => ({
          name: f.name,
          key: f.fullKey,
          size: f.size,
        })),
      };
    } catch {
      // fall through to local
    }
  }

  // Fall back to local filesystem
  try {
    const { readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const paperDir = join(SIMULATOR_WORKDIR, paperId);
    const entries = readdirSync(paperDir);
    const files = entries.map((name) => {
      const st = statSync(join(paperDir, name));
      return { name, key: `simulations/${paperId}/${name}`, size: st.size };
    });
    return { source: "local", files };
  } catch {
    return { source: "none", files: [] };
  }
}

async function fetchDontoData(
  paper: { id: string; doi?: string | null; arxivId?: string | null; title: string },
  paperClaims: { dontoSubjectIri: string | null }[],
) {
  const DONTOSRV_URL = process.env.DONTOSRV_URL ?? "http://localhost:7879";

  try {
    const paperIri = `tp:paper:${paper.id}`;
    const claimsCtx = `tp:paper:${paper.id}:claims`;

    const [paperHistory, contexts, obligationSummary, openObligations, argumentsFrontier] = await Promise.all([
      getHistory(paperIri),
      getContexts(),
      fetch(`${DONTOSRV_URL}/obligations/summary`, { headers: { accept: "application/json" } })
        .then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${DONTOSRV_URL}/obligations/open`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ context: claimsCtx, limit: 200 }),
      }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${DONTOSRV_URL}/arguments/frontier`, { headers: { accept: "application/json" } })
        .then(r => r.ok ? r.json() : null).catch(() => null),
    ]);

    const paperContext = contexts?.contexts?.find(
      (c: { context: string }) => c.context === claimsCtx,
    );

    // Fetch per-claim Donto histories (all statements for each claim)
    const claimIris = paperClaims
      .map(c => c.dontoSubjectIri)
      .filter((iri): iri is string => iri != null);

    const claimHistories: Record<string, unknown> = {};
    // Batch in groups of 10 to avoid overwhelming dontosrv
    for (let i = 0; i < claimIris.length; i += 10) {
      const batch = claimIris.slice(i, i + 10);
      const results = await Promise.all(
        batch.map(iri => getHistory(iri).catch(() => null)),
      );
      for (let j = 0; j < batch.length; j++) {
        if (results[j]) claimHistories[batch[j]] = results[j];
      }
    }

    return {
      iri: paperIri,
      context: paperContext ?? null,
      statementCount: paperHistory?.count ?? 0,
      paperTriples: paperHistory?.rows ?? [],
      claimStatements: claimHistories,
      totalClaimStatements: Object.values(claimHistories).reduce(
        (sum, h: any) => sum + (h?.count ?? 0), 0,
      ),
      obligations: {
        summary: obligationSummary?.summary ?? [],
        open: openObligations?.obligations ?? [],
      },
      arguments: {
        frontier: argumentsFrontier?.frontier ?? [],
      },
    };
  } catch {
    return null;
  }
}

// ── main handler ─────────────────────────────────────────────────────────────

/**
 * GET /api/papers/{id}/full?full_logs=true
 *
 * Returns everything we know about a paper in one JSON response.
 * External integrations, reports, debugging, and LLM analysis.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(req.url);
  const fullLogs = url.searchParams.get("full_logs") === "true";

  // ── 1. Fetch paper ──────────────────────────────────────────────────────
  const [paper] = await db.select().from(papers).where(eq(papers.id, id));
  if (!paper) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // ── 2. Parallel queries ─────────────────────────────────────────────────
  const [
    paperClaims,
    allSimulations,
    dontoIngestRow,
    routerDecisionRows,
    replicationUnitRows,
    latestBlueprint,
    logCountResult,
    logPreview,
    artifacts,
    donto,
  ] = await Promise.all([
    // Claims
    db
      .select()
      .from(claims)
      .where(eq(claims.paperId, id))
      .orderBy(asc(claims.createdAt)),

    // All simulations for this paper's claims (join through claims)
    db
      .select({
        simulation: simulations,
        claimId: claims.id,
      })
      .from(simulations)
      .innerJoin(claims, eq(simulations.claimId, claims.id))
      .where(eq(claims.paperId, id))
      .orderBy(asc(simulations.createdAt)),

    // Donto ingest state
    db
      .select()
      .from(paperDontoIngest)
      .where(eq(paperDontoIngest.paperId, id))
      .then((rows) => rows[0] ?? null),

    // Router decisions
    db
      .select()
      .from(routerDecisions)
      .where(eq(routerDecisions.paperId, id))
      .orderBy(desc(routerDecisions.decidedAt)),

    // Replication units
    db
      .select()
      .from(replicationUnits)
      .where(eq(replicationUnits.paperId, id))
      .orderBy(asc(replicationUnits.createdAt)),

    // Latest blueprint
    db
      .select()
      .from(replicationBlueprints)
      .where(eq(replicationBlueprints.paperId, id))
      .orderBy(desc(replicationBlueprints.createdAt))
      .limit(1)
      .then((rows) => rows[0] ?? null),

    // Log count
    db
      .select({ count: count() })
      .from(simulationLogs)
      .where(eq(simulationLogs.paperId, id))
      .then((rows) => rows[0]?.count ?? 0),

    // Log preview (first 50 by seq)
    db
      .select()
      .from(simulationLogs)
      .where(eq(simulationLogs.paperId, id))
      .orderBy(asc(simulationLogs.seq))
      .limit(fullLogs ? 10000 : 50),

    // GCS artifacts (non-blocking)
    fetchArtifacts(id).catch(() => ({ source: "none" as const, files: [] })),

    // Donto placeholder — fetched below after claims resolve
    Promise.resolve(null),
  ]);

  // Fetch full Donto data (needs claim IRIs from above)
  const dontoFull = await fetchDontoData(paper, paperClaims).catch(() => null);

  // ── 3. Group simulations by claim ───────────────────────────────────────
  const simsByClaim = new Map<string, typeof allSimulations>();
  for (const row of allSimulations) {
    const arr = simsByClaim.get(row.claimId) ?? [];
    arr.push(row);
    simsByClaim.set(row.claimId, arr);
  }

  const claimsWithSims = paperClaims.map((claim) => {
    const claimSims = simsByClaim.get(claim.id) ?? [];
    return {
      ...claim,
      simulations: claimSims.map((s) => s.simulation),
    };
  });

  // ── 4. Compute stats ───────────────────────────────────────────────────
  const evidenceModeCounts: Record<string, number> = {};
  const verdictCounts: Record<string, number> = {};
  let tested = 0;
  let reproduced = 0;
  let contradicted = 0;
  let fragile = 0;
  let notEvaluated = 0;

  for (const claim of claimsWithSims) {
    const sims = claim.simulations;

    if (sims.length === 0) {
      notEvaluated++;
      continue;
    }

    // Count evidence modes
    for (const sim of sims) {
      if (sim.evidenceMode) {
        evidenceModeCounts[sim.evidenceMode] =
          (evidenceModeCounts[sim.evidenceMode] ?? 0) + 1;
      }
    }

    // Determine claim-level verdict from best simulation
    let claimHasSignal = false;
    for (const sim of sims) {
      const reason =
        sim.result && typeof sim.result === "object" && sim.result !== null
          ? ((sim.result as Record<string, unknown>).reason as
              | string
              | undefined)
          : undefined;
      const v = normalizeVerdict(sim.verdict, sim.metadata, reason);
      verdictCounts[v] = (verdictCounts[v] ?? 0) + 1;

      if (isSignal(v)) {
        claimHasSignal = true;
        if (v === "reproduced") reproduced++;
        else if (v === "contradicted") contradicted++;
        else if (v === "fragile") fragile++;
      }
    }

    if (claimHasSignal) {
      tested++;
    } else {
      notEvaluated++;
    }
  }

  // Review status from claim status field
  const reviewStatus: Record<string, number> = {};
  for (const claim of paperClaims) {
    const s = claim.status ?? "pending";
    reviewStatus[s] = (reviewStatus[s] ?? 0) + 1;
  }

  const stats = {
    totalClaims: paperClaims.length,
    tested,
    reproduced,
    contradicted,
    fragile,
    notEvaluated,
    evidenceModes: evidenceModeCounts,
    verdictDistribution: verdictCounts,
    reviewStatus,
  };

  // ── 5. Assemble response ────────────────────────────────────────────────
  const logCount = Number(logCountResult);

  return NextResponse.json({
    paper,
    claims: claimsWithSims,
    dontoIngest: dontoIngestRow,
    routerDecisions: routerDecisionRows,
    replicationUnits: replicationUnitRows,
    blueprint: latestBlueprint
      ? {
          id: latestBlueprint.id,
          blueprint: latestBlueprint.blueprint,
          model: latestBlueprint.modelUsed,
          createdAt: latestBlueprint.createdAt,
        }
      : null,
    simulationLogs: {
      count: logCount,
      events: logPreview,
      truncated: !fullLogs && logCount > 50,
    },
    artifacts,
    donto: dontoFull,
    stats,
  });
}
