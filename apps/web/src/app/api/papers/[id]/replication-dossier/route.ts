import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { latestCodexReplicationDossier } from "@/lib/codex-replication-dossier";
import { papers } from "@toiletpaper/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const [paper] = await db
    .select({ id: papers.id, title: papers.title })
    .from(papers)
    .where(eq(papers.id, id))
    .limit(1);

  if (!paper) return NextResponse.json({ error: "not found" }, { status: 404 });

  const dossier = await latestCodexReplicationDossier(id);
  return NextResponse.json({ paper, dossier });
}
