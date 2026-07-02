import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { papers, replicationUnits } from "@toiletpaper/db";
import { eq } from "drizzle-orm";
import {
  buildGraphReplicationPlan,
  persistReplicationUnitsForPaper,
} from "@/lib/graph-replication";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const [paper] = await db.select().from(papers).where(eq(papers.id, id));
  if (!paper) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const plan = await buildGraphReplicationPlan(id);
  await persistReplicationUnitsForPaper(plan.units);

  return NextResponse.json({
    paperId: id,
    context: plan.context,
    statementsScanned: plan.statements.length,
    unitsCreated: plan.units.length,
    units: plan.units,
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
