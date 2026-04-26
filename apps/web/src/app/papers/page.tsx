import { db } from "@/lib/db";
import { papers, claims } from "@toiletpaper/db";
import { desc, eq, count as countFn } from "drizzle-orm";
import Link from "next/link";
import { PaperStatusBadge } from "@/components/paper-status-badge";
import {
  Container,
  Heading,
  Text,
  Stack,
  Card,
  CardContent,
  Button,
  EmptyState,
} from "@toiletpaper/ui";

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
    <Container>
      <Stack gap={6}>
        <Stack direction="horizontal" align="center" justify="between">
          <Heading level={2}>Papers</Heading>
          <Link href="/upload">
            <Button size="sm">Upload</Button>
          </Link>
        </Stack>

        {rows.length === 0 ? (
          <EmptyState
            title="No papers yet"
            description="Upload a paper to get started with claim extraction and verification."
            action={
              <Link href="/upload">
                <Button>Upload one</Button>
              </Link>
            }
          />
        ) : (
          <Stack gap={4}>
            {rows.map((paper) => (
              <Link key={paper.id} href={`/papers/${paper.id}`}>
                <Card className="transition-shadow hover:shadow-md">
                  <CardContent className="p-5">
                    <Stack direction="horizontal" align="start" justify="between" gap={4}>
                      <div className="min-w-0 flex-1">
                        <Heading level={5} as="h2">{paper.title}</Heading>
                        {paper.authors && paper.authors.length > 0 && (
                          <Text size="sm" color="muted" className="mt-0.5">
                            {paper.authors.join(", ")}
                          </Text>
                        )}
                        {paper.abstract && (
                          <Text size="sm" color="light" className="mt-2 line-clamp-2">
                            {paper.abstract}
                          </Text>
                        )}
                        <Text size="xs" color="muted" className="mt-2">
                          {paper.claimCount} claims &middot;{" "}
                          {new Date(paper.createdAt).toLocaleDateString()}
                        </Text>
                      </div>
                      <PaperStatusBadge status={paper.status} />
                    </Stack>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </Stack>
        )}
      </Stack>
    </Container>
  );
}
