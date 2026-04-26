import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { papers } from "@toiletpaper/db";
import { desc } from "drizzle-orm";

export async function GET() {
  const rows = await db
    .select()
    .from(papers)
    .orderBy(desc(papers.createdAt))
    .limit(100);
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    title: string;
    authors?: string[];
    abstract?: string;
    pdf_url?: string;
  };

  if (!body.title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const [paper] = await db
    .insert(papers)
    .values({
      title: body.title,
      authors: body.authors ?? [],
      abstract: body.abstract ?? null,
      pdfUrl: body.pdf_url ?? null,
    })
    .returning();

  return NextResponse.json(paper, { status: 201 });
}
