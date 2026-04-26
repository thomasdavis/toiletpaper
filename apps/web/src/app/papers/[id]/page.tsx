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
  Button,
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
          <Stack gap={4}>
            <Stack direction="horizontal" align="center" justify="between">
              <div /> {/* spacer for alignment */}
              <Link href={`/papers/${id}/report`}>
                <Button variant="secondary" size="sm">
                  View Full Report
                </Button>
              </Link>
            </Stack>
            <VerdictSummary simulations={sims} totalClaims={paperClaims.length} />
          </Stack>
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
