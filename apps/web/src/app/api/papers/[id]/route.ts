import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { papers, claims, simulations } from "@toiletpaper/db";
import { eq } from "drizzle-orm";

export async function GET(
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

  return NextResponse.json({ ...paper, claims: paperClaims });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json()) as Partial<{
    title: string;
    authors: string[];
    abstract: string;
    status: string;
  }>;

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.title) updates.title = body.title;
  if (body.authors) updates.authors = body.authors;
  if (body.abstract !== undefined) updates.abstract = body.abstract;
  if (body.status) updates.status = body.status;

  const [updated] = await db
    .update(papers)
    .set(updates)
    .where(eq(papers.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const [deleted] = await db
    .delete(papers)
    .where(eq(papers.id, id))
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
