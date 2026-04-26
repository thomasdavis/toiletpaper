import { db } from "@/lib/db";
import { papers, claims, simulations } from "@toiletpaper/db";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PaperStatusBadge } from "@/components/paper-status-badge";
import { ClaimCard } from "@/components/claim-card";
import { DontoContextInfo } from "@/components/donto-context-info";
import { getHistory, getContexts } from "@/lib/donto";

export default async function PaperDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [paper] = await db.select().from(papers).where(eq(papers.id, id));
  if (!paper) notFound();

  const paperClaims = await db
    .select()
    .from(claims)
    .where(eq(claims.paperId, id));

  const claimIds = paperClaims.map((c) => c.id);
  let sims: (typeof simulations.$inferSelect)[] = [];
  if (claimIds.length > 0) {
    const allSims = await Promise.all(
      claimIds.map((cid) =>
        db.select().from(simulations).where(eq(simulations.claimId, cid)),
      ),
    );
    sims = allSims.flat();
  }

  const paperIri = `tp:paper:${id}`;
  const claimsCtxIri = `tp:paper:${id}:claims`;

  const [dontoHistory, ctxData] = await Promise.all([
    getHistory(paperIri),
    getContexts(),
  ]);

  const paperCtx = ctxData?.contexts?.find(
    (c) => c.context === claimsCtxIri,
  );

  const claimsWithSims = paperClaims.map((claim) => ({
    ...claim,
    simulations: sims.filter((s) => s.claimId === claim.id),
  }));

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-start gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{paper.title}</h1>
          <PaperStatusBadge status={paper.status} />
        </div>
        {paper.authors && paper.authors.length > 0 && (
          <p className="mt-1 text-muted">{paper.authors.join(", ")}</p>
        )}
        {paper.abstract && (
          <p className="mt-4 text-sm leading-relaxed text-stone-600">
            {paper.abstract}
          </p>
        )}
      </div>

      {paperCtx && (
        <DontoContextInfo
          contextIri={claimsCtxIri}
          kind={paperCtx.kind}
          statementCount={paperCtx.count}
          dontoHistory={dontoHistory}
        />
      )}

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">
          Claims ({paperClaims.length})
        </h2>
        {claimsWithSims.length === 0 ? (
          <p className="text-sm text-muted">No claims extracted yet.</p>
        ) : (
          <div className="space-y-4">
            {claimsWithSims.map((claim) => (
              <ClaimCard key={claim.id} claim={claim} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
