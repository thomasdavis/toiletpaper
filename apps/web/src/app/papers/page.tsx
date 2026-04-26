import { db } from "@/lib/db";
import { papers, claims } from "@toiletpaper/db";
import { desc, eq, count as countFn } from "drizzle-orm";
import Link from "next/link";
import { PaperStatusBadge } from "@/components/paper-status-badge";

export default async function PapersPage() {
  let rows: (typeof papers.$inferSelect & { claimCount: number })[] = [];

  try {
    const paperRows = await db
      .select()
      .from(papers)
      .orderBy(desc(papers.createdAt))
      .limit(100);

    const counts = await Promise.all(
      paperRows.map((p) =>
        db
          .select({ value: countFn() })
          .from(claims)
          .where(eq(claims.paperId, p.id)),
      ),
    );

    rows = paperRows.map((p, i) => ({
      ...p,
      claimCount: counts[i]?.[0]?.value ?? 0,
    }));
  } catch { /* DB not available */ }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Papers</h1>
        <Link
          href="/upload"
          className="inline-flex h-9 items-center rounded-md bg-blue-700 px-3 text-sm font-medium text-white hover:bg-blue-800"
        >
          Upload
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted">
          No papers yet.{" "}
          <Link href="/upload" className="text-blue-700 underline">
            Upload one
          </Link>
          .
        </p>
      ) : (
        <div className="grid gap-4">
          {rows.map((paper) => (
            <Link
              key={paper.id}
              href={`/papers/${paper.id}`}
              className="block rounded-xl border border-stone-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold">{paper.title}</h2>
                  {paper.authors && paper.authors.length > 0 && (
                    <p className="mt-0.5 text-sm text-muted">
                      {paper.authors.join(", ")}
                    </p>
                  )}
                  {paper.abstract && (
                    <p className="mt-2 line-clamp-2 text-sm text-stone-600">
                      {paper.abstract}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-3 text-xs text-muted">
                    <span>{paper.claimCount} claims</span>
                    <span>&middot;</span>
                    <span>
                      {new Date(paper.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <PaperStatusBadge status={paper.status} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
