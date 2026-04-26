import { db } from "@/lib/db";
import { papers, claims, simulations } from "@toiletpaper/db";
import { count } from "drizzle-orm";
import Link from "next/link";
import {
  dontoHealth,
  getContexts,
  getObligationSummary,
  getSubjects,
} from "@/lib/donto";
import {
  Container,
  Heading,
  Text,
  Stack,
  StatCard,
  Card,
  CardContent,
  Label,
  Button,
  Badge,
} from "@toiletpaper/ui";

export default async function DashboardPage() {
  let stats = { papers: 0, claims: 0, simulations: 0 };
  try {
    const [p, c, s] = await Promise.all([
      db.select({ value: count() }).from(papers),
      db.select({ value: count() }).from(claims),
      db.select({ value: count() }).from(simulations),
    ]);
    stats = {
      papers: p[0]?.value ?? 0,
      claims: c[0]?.value ?? 0,
      simulations: s[0]?.value ?? 0,
    };
  } catch { /* DB not up */ }

  const [healthy, ctxData, oblData, subData] = await Promise.all([
    dontoHealth(),
    getContexts(),
    getObligationSummary(),
    getSubjects(),
  ]);

  const tpContexts = ctxData?.contexts?.filter((c) =>
    c.context.startsWith("tp:paper:"),
  ) ?? [];
  const totalDontoStatements = tpContexts.reduce((s, c) => s + c.count, 0);
  const candidateCtxs = tpContexts.filter((c) => c.kind === "candidate");
  const obligations = oblData?.summary ?? [];
  const totalObligations = obligations.reduce((s, o) => s + o.count, 0);
  const dontoSubjects = subData?.subjects?.length ?? 0;

  return (
    <Container>
      <Stack gap={8}>
        <div>
          <Heading level={1}>Dashboard</Heading>
          <Text color="muted" className="mt-1">
            Upload papers, extract claims, simulate physics, verify truth.
          </Text>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Link href="/papers">
            <StatCard label="Papers" value={stats.papers} />
          </Link>
          <StatCard label="Claims Extracted" value={stats.claims} />
          <StatCard label="Simulations" value={stats.simulations} />
        </div>

        <div>
          <Heading level={5} className="mb-3">Donto Knowledge Graph</Heading>
          <div className="grid gap-4 sm:grid-cols-4">
            <StatCard
              label="Status"
              value={healthy ? "Online" : "Offline"}
              className={healthy ? "text-green-600" : "text-red-600"}
            />
            <StatCard label="Statements" value={totalDontoStatements} />
            <StatCard label="Subjects" value={dontoSubjects} />
            <StatCard
              label="Candidate Contexts"
              value={candidateCtxs.length}
            />
          </div>
        </div>

        {totalObligations > 0 && (
          <div>
            <Heading level={5} className="mb-3">Proof Obligations</Heading>
            <div className="grid gap-3 sm:grid-cols-3">
              {obligations.map((o) => (
                <Card key={`${o.obligation_type}-${o.status}`}>
                  <CardContent className="p-4">
                    <Label>{o.obligation_type}</Label>
                    <Stack direction="horizontal" gap={2} align="baseline" className="mt-1">
                      <Text size="xl" weight="bold">{o.count}</Text>
                      <Badge
                        variant={o.status === "open" ? "warning" : "success"}
                      >
                        {o.status}
                      </Badge>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        <Stack direction="horizontal" gap={3}>
          <Link href="/upload">
            <Button>Upload a paper</Button>
          </Link>
          <Link href="/papers">
            <Button variant="secondary">Browse papers</Button>
          </Link>
        </Stack>
      </Stack>
    </Container>
  );
}
