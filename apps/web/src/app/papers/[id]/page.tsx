import { db } from "@/lib/db";
import { papers, claims, simulations } from "@toiletpaper/db";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PaperStatusBadge } from "@/components/paper-status-badge";
import { ClaimCard } from "@/components/claim-card";
import { DontoContextInfo } from "@/components/donto-context-info";
import { VerdictSummary } from "@/components/verdict-summary";
import { getHistory, getContexts } from "@/lib/donto";
import {
  Container,
  Heading,
  Text,
  Stack,
  EmptyState,
} from "@toiletpaper/ui";

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
    <Container>
      <Stack gap={8}>
        <div>
          <Stack direction="horizontal" align="start" gap={3}>
            <Heading level={2}>{paper.title}</Heading>
            <PaperStatusBadge status={paper.status} />
          </Stack>
          {paper.authors && paper.authors.length > 0 && (
            <Text color="muted" className="mt-1">
              {paper.authors.join(", ")}
            </Text>
          )}
          {paper.abstract && (
            <Text size="sm" color="light" leading="relaxed" className="mt-4">
              {paper.abstract}
            </Text>
          )}

          {/* Action buttons */}
          <div className="mt-5 flex items-center gap-3">
            {sims.length > 0 && (
              <Link href={`/papers/${id}/report`}>
                <button className="inline-flex h-12 items-center gap-2.5 rounded-md bg-[#4A6FA5] px-8 text-base font-medium text-white shadow-sm transition-all hover:bg-[#3A5A87] active:bg-[#2E4A6F]">
                  View Analysis Report
                </button>
              </Link>
            )}
            {paper.pdfUrl && (
              <Link href={`/papers/${id}/annotated`}>
                <button className="inline-flex h-12 items-center gap-2.5 rounded-md border border-[#E8E5DE] bg-white px-8 text-base font-medium text-[#3D3D3D] shadow-sm transition-all hover:bg-[#F5F3EF] active:bg-[#E8E5DE]">
                  Annotated View
                </button>
              </Link>
            )}
          </div>
        </div>

        {paperCtx && (
          <DontoContextInfo
            contextIri={claimsCtxIri}
            kind={paperCtx.kind}
            statementCount={paperCtx.count}
            dontoHistory={dontoHistory}
          />
        )}

        {sims.length > 0 && (
          <VerdictSummary simulations={sims} totalClaims={paperClaims.length} />
        )}

        <Stack gap={4}>
          <Heading level={5}>
            Claims ({paperClaims.length})
          </Heading>
          {claimsWithSims.length === 0 ? (
            <EmptyState
              title="No claims extracted yet"
              description="Claims will appear here once extraction completes."
            />
          ) : (
            <Stack gap={4}>
              {claimsWithSims.map((claim) => (
                <ClaimCard key={claim.id} claim={claim} />
              ))}
            </Stack>
          )}
        </Stack>
      </Stack>
    </Container>
  );
}
