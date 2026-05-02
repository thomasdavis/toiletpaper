export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import { db } from "@/lib/db";
import { papers, claims, simulations } from "@toiletpaper/db";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PaperStatusBadge } from "@/components/paper-status-badge";
import { ClaimCard } from "@/components/claim-card";
import { DontoContextInfo } from "@/components/donto-context-info";
import { DontoDetails } from "@/components/donto-details";
import { VerdictSummary } from "@/components/verdict-summary";
import { getHistory, getContexts } from "@/lib/donto";
import {
  Container,
  Heading,
  Text,
  Stack,
  EmptyState,
} from "@toiletpaper/ui";
import { DebugPanel } from "@/components/debug-panel";
import { PaperTabs } from "@/components/paper-tabs";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const [paper] = await db.select().from(papers).where(eq(papers.id, id));
  if (!paper) {
    return { title: "Paper not found" };
  }
  const authors =
    paper.authors && paper.authors.length > 0
      ? ` by ${paper.authors.slice(0, 3).join(", ")}${paper.authors.length > 3 ? " et al." : ""}`
      : "";
  const description =
    paper.abstract?.slice(0, 200) ??
    `Reproducibility analysis of "${paper.title}"${authors} on toiletpaper.`;
  return {
    title: paper.title,
    description,
    alternates: { canonical: `/papers/${id}` },
    openGraph: {
      title: paper.title,
      description,
      url: `/papers/${id}`,
      type: "article",
      authors: paper.authors ?? undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: paper.title,
      description,
    },
  };
}

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

          {paper.pdfUrl && (
            <div className="mt-4">
              <a
                href={`/api/papers/${id}/source`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-md border border-[#D4D0C8] bg-white px-3 py-1.5 text-[13px] font-medium text-[#3D3D3D] shadow-sm transition-all hover:bg-[#F5F3EF]"
              >
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M3 2h7l3 3v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
                  <path d="M5 9.5h6M5 11.5h4" strokeLinecap="round" />
                </svg>
                Source PDF
              </a>
            </div>
          )}
        </div>

        <PaperTabs
          paperId={id}
          active="overview"
          hasPdf={Boolean(paper.pdfUrl)}
          hasSims={sims.length > 0}
          counts={{ claims: paperClaims.length, simulations: sims.length }}
        />

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

        <DontoDetails paperId={id} />

        {/* Debug panels */}
        <DebugPanel label="Paper" data={paper} />
        <DebugPanel label="Claims" data={paperClaims} />
        <DebugPanel label="Donto History" data={dontoHistory} />
      </Stack>
    </Container>
  );
}
