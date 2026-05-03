import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { papers, claims, replicationUnits } from "@toiletpaper/db";
import { eq } from "drizzle-orm";
import { getHistory } from "@/lib/donto";
import {
  buildReplicationUnitsFromDonto,
  type DontoStatementInput,
  type DontoReplicationBundleInput,
} from "@toiletpaper/simulator";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const [paper] = await db.select().from(papers).where(eq(papers.id, id));
  if (!paper) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const paperClaims = await db
    .select()
    .from(claims)
    .where(eq(claims.paperId, id));

  const statements: DontoStatementInput[] = [];

  for (const claim of paperClaims) {
    if (!claim.dontoSubjectIri) continue;

    const history = await getHistory(claim.dontoSubjectIri);
    if (!history?.rows) continue;

    for (const row of history.rows) {
      statements.push({
        statementId: row.statement_id,
        subject: row.subject,
        predicate: row.predicate,
        object_iri: row.object_iri,
        object_lit: row.object_lit
          ? { v: row.object_lit.v as string | number | boolean, dt: row.object_lit.dt }
          : null,
        context: row.context,
        confidence: undefined,
      });
    }
  }

  const bundleInput: DontoReplicationBundleInput = {
    paperId: id,
    claimIriPrefix: `tp:claim`,
    statements,
  };

  const units = buildReplicationUnitsFromDonto(bundleInput);

  if (units.length > 0) {
    await db
      .insert(replicationUnits)
      .values(
        units.map((u) => ({
          id: u.id,
          paperId: u.paperId,
          claimIri: u.claimIri,
          sourceStatementIds: u.sourceStatementIds,
          domain: u.domain,
          unitType: u.unitType,
          claimText: u.claimText,
          evidenceQuotes: u.evidenceQuotes,
          hypothesis: u.hypothesis,
          expectedOutcome: u.expectedOutcome,
          falsificationCriteria: u.falsificationCriteria,
          requiredArtifacts: u.requiredArtifacts,
          datasets: u.datasets,
          methods: u.methods,
          metrics: u.metrics,
          baselines: u.baselines,
          parameters: u.parameters,
          computeBudget: u.computeBudget,
          verifierCandidates: u.verifierCandidates,
          planner: u.planner,
          state: u.state,
          blockers: u.blockers,
        })),
      )
      .onConflictDoUpdate({
        target: replicationUnits.id,
        set: {
          state: undefined,
          updatedAt: new Date(),
        },
      });
  }

  return NextResponse.json({
    paperId: id,
    statementsScanned: statements.length,
    unitsCreated: units.length,
    units,
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const units = await db
    .select()
    .from(replicationUnits)
    .where(eq(replicationUnits.paperId, id));

  return NextResponse.json({ paperId: id, units });
}
