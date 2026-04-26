import { db } from "@/lib/db";
import { papers, claims, simulations } from "@toiletpaper/db";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PaperStatusBadge } from "@/components/paper-status-badge";
import { getHistory } from "@/lib/donto";
import {
  Breadcrumb,
  Card,
  CardContent,
  Code,
  Container,
  Divider,
  Heading,
  Label,
  ProgressBar,
  Stack,
  StatCard,
  Text,
  VerdictBadge,
} from "@toiletpaper/ui";

type Simulation = typeof simulations.$inferSelect;
type Claim = typeof claims.$inferSelect;

interface ClaimWithSims extends Claim {
  simulations: Simulation[];
  dontoCategory?: string;
}

function mapVerdict(verdict: string | null) {
  if (verdict === "confirmed") return "reproduced" as const;
  if (verdict === "refuted") return "contradicted" as const;
  return "undetermined" as const;
}

function bestVerdict(sims: Simulation[]): "reproduced" | "contradicted" | "undetermined" {
  const verdicts = sims.map((s) => mapVerdict(s.verdict));
  if (verdicts.includes("reproduced")) return "reproduced";
  if (verdicts.includes("contradicted")) return "contradicted";
  return "undetermined";
}

function formatMethodName(method: string): string {
  return method
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function extractResultFields(result: unknown): {
  reason?: string;
  measured?: string;
  expected?: string;
  confidence?: number;
  baseline?: string;
  proposed?: string;
  llmAnalysis?: string;
  fittedExponent?: number;
  expectedExponent?: number;
} {
  if (!result || typeof result !== "object") return {};
  const r = result as Record<string, unknown>;
  return {
    reason: typeof r.reason === "string" ? r.reason : undefined,
    measured: r.measured != null ? (typeof r.measured === "object" ? JSON.stringify(r.measured) : String(r.measured)) : undefined,
    expected: r.expected != null ? (typeof r.expected === "object" ? JSON.stringify(r.expected) : String(r.expected)) : undefined,
    confidence: typeof r.confidence === "number" ? r.confidence : undefined,
    baseline: r.baseline != null ? String(r.baseline) : undefined,
    proposed: r.proposed != null ? String(r.proposed) : undefined,
    llmAnalysis: typeof r.llmAnalysis === "string" ? r.llmAnalysis : undefined,
    fittedExponent: typeof r.fittedExponent === "number" ? r.fittedExponent : undefined,
    expectedExponent: typeof r.expectedExponent === "number" ? r.expectedExponent : undefined,
  };
}

function extractMetadataFile(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const m = metadata as Record<string, unknown>;
  if (typeof m.simulation_file === "string") return m.simulation_file;
  return undefined;
}

export default async function ReportPage({
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
  let sims: Simulation[] = [];
  if (claimIds.length > 0) {
    const allSims = await Promise.all(
      claimIds.map((cid) =>
        db.select().from(simulations).where(eq(simulations.claimId, cid)),
      ),
    );
    sims = allSims.flat();
  }

  // Enrich claims with donto category
  const claimsWithSims: ClaimWithSims[] = await Promise.all(
    paperClaims.map(async (claim) => {
      const claimSims = sims.filter((s) => s.claimId === claim.id);
      let dontoCategory: string | undefined;

      if (claim.dontoSubjectIri) {
        try {
          const history = await getHistory(claim.dontoSubjectIri);
          if (history?.rows) {
            for (const row of history.rows) {
              if (row.predicate === "tp:category") {
                dontoCategory = String(row.object_lit?.v ?? row.object_iri ?? "");
              }
            }
          }
        } catch { /* dontosrv may be down */ }
      }

      return { ...claim, simulations: claimSims, dontoCategory };
    }),
  );

  // Partition claims by verdict group
  const tested = claimsWithSims.filter((c) => c.simulations.length > 0);
  const untested = claimsWithSims.filter((c) => c.simulations.length === 0);

  const reproduced = tested.filter((c) => bestVerdict(c.simulations) === "reproduced");
  const contradicted = tested.filter((c) => bestVerdict(c.simulations) === "contradicted");
  const undetermined = tested.filter((c) => bestVerdict(c.simulations) === "undetermined");

  // Determine analysis date from most recent simulation
  const latestSim = sims.reduce<Simulation | null>((latest, sim) => {
    if (!latest) return sim;
    return new Date(sim.createdAt) > new Date(latest.createdAt) ? sim : latest;
  }, null);

  const analysisDate = latestSim
    ? new Date(latestSim.createdAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

  // Methods used
  const methodsUsed = [...new Set(sims.map((s) => s.method))];

  // Build executive summary text
  const summaryParts: string[] = [];
  if (reproduced.length > 0) {
    summaryParts.push(
      `${reproduced.length} claim${reproduced.length !== 1 ? "s were" : " was"} successfully reproduced by independent simulation`,
    );
  }
  if (contradicted.length > 0) {
    summaryParts.push(
      `${contradicted.length} claim${contradicted.length !== 1 ? "s were" : " was"} contradicted by simulation results`,
    );
  }
  if (undetermined.length > 0) {
    summaryParts.push(
      `${undetermined.length} claim${undetermined.length !== 1 ? "s" : ""} produced inconclusive results`,
    );
  }
  if (untested.length > 0) {
    summaryParts.push(
      `${untested.length} claim${untested.length !== 1 ? "s were" : " was"} not tested`,
    );
  }

  const executiveSummary =
    tested.length > 0
      ? `Of ${paperClaims.length} claims extracted from this paper, ${tested.length} were subjected to adversarial simulation. ${summaryParts.join("; ")}.`
      : "No claims from this paper have been simulated yet.";

  return (
    <Container>
      <Stack gap={8}>
        {/* Breadcrumb */}
        <Breadcrumb>
          <Link href="/" className="hover:underline">Dashboard</Link>
          <Link href="/papers" className="hover:underline">Papers</Link>
          <Link href={`/papers/${id}`} className="hover:underline">
            {paper.title.length > 40 ? paper.title.slice(0, 40) + "..." : paper.title}
          </Link>
          <span>Analysis Report</span>
        </Breadcrumb>

        {/* Header */}
        <div className="border-b border-[var(--color-rule)] pb-6">
          <Stack gap={2}>
            <Stack direction="horizontal" align="start" gap={3}>
              <Heading level={2}>{paper.title}</Heading>
              <PaperStatusBadge status={paper.status} />
            </Stack>
            {paper.authors && paper.authors.length > 0 && (
              <Text color="muted">
                {paper.authors.join(", ")}
              </Text>
            )}
            <Text size="lg" weight="medium" color="light" className="mt-2">
              Toiletpaper Analysis Report
            </Text>
            <Text size="sm" color="muted">
              Analysis completed {analysisDate}
            </Text>
          </Stack>
        </div>

        {/* Executive Summary */}
        <section>
          <Heading level={4} className="mb-4">Executive Summary</Heading>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-4">
            <StatCard
              label="Reproduced"
              value={reproduced.length}
              className="border-l-2 border-l-[var(--color-reproduced)]"
            />
            <StatCard
              label="Contradicted"
              value={contradicted.length}
              className="border-l-2 border-l-[var(--color-contradicted)]"
            />
            <StatCard
              label="Inconclusive"
              value={undetermined.length}
              className="border-l-2 border-l-[var(--color-undetermined)]"
            />
            <StatCard
              label="Not Tested"
              value={untested.length}
              className="border-l-2 border-l-[var(--color-ink-faint)]"
            />
          </div>

          {/* Stacked bar */}
          {tested.length > 0 && (
            <div className="mb-4">
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-[var(--color-rule-faint)]">
                {reproduced.length > 0 && (
                  <div
                    className="bg-[var(--color-reproduced)]"
                    style={{ width: `${(reproduced.length / tested.length) * 100}%` }}
                  />
                )}
                {contradicted.length > 0 && (
                  <div
                    className="bg-[var(--color-contradicted)]"
                    style={{ width: `${(contradicted.length / tested.length) * 100}%` }}
                  />
                )}
                {undetermined.length > 0 && (
                  <div
                    className="bg-[var(--color-undetermined)]"
                    style={{ width: `${(undetermined.length / tested.length) * 100}%` }}
                  />
                )}
              </div>
              <Stack direction="horizontal" gap={4} className="mt-2">
                <Stack direction="horizontal" align="center" gap={1}>
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--color-reproduced)]" />
                  <Text size="xs" color="muted">Reproduced ({reproduced.length})</Text>
                </Stack>
                <Stack direction="horizontal" align="center" gap={1}>
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--color-contradicted)]" />
                  <Text size="xs" color="muted">Contradicted ({contradicted.length})</Text>
                </Stack>
                <Stack direction="horizontal" align="center" gap={1}>
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--color-undetermined)]" />
                  <Text size="xs" color="muted">Inconclusive ({undetermined.length})</Text>
                </Stack>
              </Stack>
            </div>
          )}

          <Card>
            <CardContent className="p-5">
              <Text size="sm" leading="relaxed" color="light">
                {executiveSummary}
              </Text>
            </CardContent>
          </Card>
        </section>

        <Divider />

        {/* Methodology */}
        <section>
          <Heading level={4} className="mb-4">Methodology</Heading>
          <Card>
            <CardContent className="p-5">
              <Stack gap={4}>
                <div>
                  <Label size="sm" className="mb-1 block">Claim Extraction</Label>
                  <Text size="sm" color="light" leading="relaxed">
                    Claims were extracted from the paper using GPT-5.4 with structured
                    prompting designed to identify quantitative, comparative, causal,
                    methodological, and theoretical assertions. Each claim was assigned a
                    confidence score reflecting extraction certainty and ingested into the
                    donto evidence substrate as an evidence node.
                  </Text>
                </div>
                <div>
                  <Label size="sm" className="mb-1 block">Simulation Methods</Label>
                  <Text size="sm" color="light" leading="relaxed">
                    Simulations were executed using the following method{methodsUsed.length !== 1 ? "s" : ""}:{" "}
                    {methodsUsed.map((m) => formatMethodName(m)).join(", ") || "none"}.
                    Physics claims are tested with MHD solvers; ML and general claims use
                    Claude Code to generate and execute verification scripts.
                  </Text>
                </div>
                <div>
                  <Label size="sm" className="mb-1 block">Verdict Criteria</Label>
                  <Stack gap={2}>
                    <Stack direction="horizontal" align="start" gap={2}>
                      <VerdictBadge verdict="reproduced" className="shrink-0 mt-0.5" />
                      <Text size="sm" color="light">
                        Simulation results are consistent with the claim within expected
                        tolerances. Measured values match or closely approximate expected values.
                      </Text>
                    </Stack>
                    <Stack direction="horizontal" align="start" gap={2}>
                      <VerdictBadge verdict="contradicted" className="shrink-0 mt-0.5" />
                      <Text size="sm" color="light">
                        Simulation results diverge significantly from the claim. Measured
                        values fall outside acceptable bounds or contradict the stated
                        relationship.
                      </Text>
                    </Stack>
                    <Stack direction="horizontal" align="start" gap={2}>
                      <VerdictBadge verdict="undetermined" className="shrink-0 mt-0.5" />
                      <Text size="sm" color="light">
                        Simulation did not produce a definitive result. This may be due to
                        insufficient data, numerical instability, or claims that are difficult
                        to test quantitatively.
                      </Text>
                    </Stack>
                  </Stack>
                </div>
              </Stack>
            </CardContent>
          </Card>
        </section>

        <Divider />

        {/* Claim-by-Claim Analysis */}
        <section>
          <Heading level={4} className="mb-4">Claim-by-Claim Analysis</Heading>

          {/* Reproduced claims */}
          {reproduced.length > 0 && (
            <Stack gap={4} className="mb-6">
              <Divider label={`Reproduced (${reproduced.length})`} />
              {reproduced.map((claim) => (
                <ClaimReportCard key={claim.id} claim={claim} />
              ))}
            </Stack>
          )}

          {/* Contradicted claims */}
          {contradicted.length > 0 && (
            <Stack gap={4} className="mb-6">
              <Divider label={`Contradicted (${contradicted.length})`} />
              {contradicted.map((claim) => (
                <ClaimReportCard key={claim.id} claim={claim} />
              ))}
            </Stack>
          )}

          {/* Undetermined claims */}
          {undetermined.length > 0 && (
            <Stack gap={4} className="mb-6">
              <Divider label={`Inconclusive (${undetermined.length})`} />
              {undetermined.map((claim) => (
                <ClaimReportCard key={claim.id} claim={claim} />
              ))}
            </Stack>
          )}

          {tested.length === 0 && (
            <Card>
              <CardContent className="p-5">
                <Text size="sm" color="muted">
                  No claims have been simulated yet.
                </Text>
              </CardContent>
            </Card>
          )}
        </section>

        {/* Untested claims */}
        {untested.length > 0 && (
          <>
            <Divider />
            <section>
              <Heading level={4} className="mb-4">
                Claims Not Tested ({untested.length})
              </Heading>
              <Text size="sm" color="muted" className="mb-4">
                The following claims were not subjected to simulation. Common reasons
                include: the claim is too abstract to simulate, non-testable with
                available methods, or pending simulation scheduling.
              </Text>
              <Stack gap={3}>
                {untested.map((claim) => (
                  <Card key={claim.id}>
                    <CardContent className="p-4">
                      <Stack direction="horizontal" align="start" gap={3}>
                        <VerdictBadge verdict="not-simulable" className="shrink-0 mt-0.5" />
                        <Stack gap={1} className="flex-1">
                          <Text size="sm" leading="relaxed">
                            {claim.text}
                          </Text>
                          <Stack direction="horizontal" gap={3}>
                            {claim.dontoCategory && (
                              <Text size="xs" color="muted">
                                Category: {claim.dontoCategory}
                              </Text>
                            )}
                            {claim.confidence != null && (
                              <Text size="xs" color="muted">
                                Extraction confidence: {(claim.confidence * 100).toFixed(0)}%
                              </Text>
                            )}
                          </Stack>
                        </Stack>
                      </Stack>
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            </section>
          </>
        )}

        {/* Footer */}
        <Divider />
        <div className="pb-8 text-center">
          <Text size="xs" color="faint">
            Generated by toiletpaper adversarial simulation engine.
            This report is automated and should be reviewed alongside the original paper.
          </Text>
        </div>
      </Stack>
    </Container>
  );
}

/* ------------------------------------------------------------------ */
/* Claim report card — detailed view for the report page              */
/* ------------------------------------------------------------------ */

function ClaimReportCard({ claim }: { claim: ClaimWithSims }) {
  const verdict = bestVerdict(claim.simulations);

  return (
    <Card>
      <CardContent className="p-5">
        <Stack gap={4}>
          {/* Claim text + verdict */}
          <Stack direction="horizontal" align="start" gap={3}>
            <VerdictBadge verdict={verdict} className="shrink-0 mt-1" />
            <Stack gap={1} className="flex-1">
              <Text size="sm" leading="relaxed" weight="medium">
                {claim.text}
              </Text>
              <Stack direction="horizontal" gap={3} wrap>
                {claim.dontoCategory && (
                  <Text size="xs" color="muted">
                    Category: {claim.dontoCategory}
                  </Text>
                )}
                {claim.confidence != null && (
                  <Text size="xs" color="muted">
                    Extraction confidence: {(claim.confidence * 100).toFixed(0)}%
                  </Text>
                )}
              </Stack>
            </Stack>
          </Stack>

          {/* Simulation results */}
          {claim.simulations.map((sim) => {
            const result = extractResultFields(sim.result);
            const simVerdict = mapVerdict(sim.verdict);
            const simFile = extractMetadataFile(sim.metadata);

            return (
              <div
                key={sim.id}
                className="rounded-lg border border-[var(--color-rule-faint)] bg-[var(--color-paper)] p-4"
              >
                <Stack gap={3}>
                  {/* Method + verdict */}
                  <Stack direction="horizontal" align="center" justify="between">
                    <Text size="xs" weight="semibold" color="muted">
                      {formatMethodName(sim.method)}
                    </Text>
                    <VerdictBadge verdict={simVerdict} />
                  </Stack>

                  {/* Reason */}
                  {result.reason && (
                    <div className="rounded border border-[var(--color-rule-faint)] bg-white p-3">
                      <Label size="xs" className="mb-1 block">Reason</Label>
                      <Text size="sm" leading="relaxed" color="light">
                        {result.reason}
                      </Text>
                    </div>
                  )}

                  {/* Quantitative results */}
                  {(result.measured != null || result.expected != null ||
                    result.fittedExponent != null || result.expectedExponent != null ||
                    result.baseline != null || result.proposed != null) && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {result.fittedExponent != null && (
                        <div>
                          <Label size="xs">Fitted Exponent</Label>
                          <Text size="sm" weight="semibold" className="font-mono">
                            {result.fittedExponent}
                          </Text>
                        </div>
                      )}
                      {result.expectedExponent != null && (
                        <div>
                          <Label size="xs">Expected Exponent</Label>
                          <Text size="sm" weight="semibold" className="font-mono">
                            {result.expectedExponent}
                          </Text>
                        </div>
                      )}
                      {result.measured != null && (
                        <div>
                          <Label size="xs">Measured</Label>
                          <Text size="sm" weight="semibold" className="font-mono">
                            {result.measured}
                          </Text>
                        </div>
                      )}
                      {result.expected != null && (
                        <div>
                          <Label size="xs">Expected</Label>
                          <Text size="sm" weight="semibold" className="font-mono">
                            {result.expected}
                          </Text>
                        </div>
                      )}
                      {result.baseline != null && (
                        <div>
                          <Label size="xs">Baseline</Label>
                          <Text size="sm" weight="semibold" className="font-mono">
                            {result.baseline}
                          </Text>
                        </div>
                      )}
                      {result.proposed != null && (
                        <div>
                          <Label size="xs">Proposed</Label>
                          <Text size="sm" weight="semibold" className="font-mono">
                            {result.proposed}
                          </Text>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Confidence */}
                  {result.confidence != null && (
                    <Stack direction="horizontal" align="center" gap={2}>
                      <Label size="xs">Verdict Confidence</Label>
                      <ProgressBar
                        value={result.confidence * 100}
                        color={
                          simVerdict === "reproduced"
                            ? "reproduced"
                            : simVerdict === "contradicted"
                              ? "contradicted"
                              : "fragile"
                        }
                        className="flex-1 max-w-48"
                      />
                      <Text size="xs" weight="medium" as="span" className="font-mono">
                        {(result.confidence * 100).toFixed(0)}%
                      </Text>
                    </Stack>
                  )}

                  {/* LLM Analysis */}
                  {result.llmAnalysis && (
                    <div>
                      <Label size="xs" className="mb-1 block">Detailed Analysis</Label>
                      <Text size="xs" color="light" leading="relaxed" className="whitespace-pre-wrap">
                        {result.llmAnalysis}
                      </Text>
                    </div>
                  )}

                  {/* Simulation file */}
                  {simFile && (
                    <Text size="xs" color="faint">
                      Simulation file: <Code>{simFile}</Code>
                    </Text>
                  )}
                </Stack>
              </div>
            );
          })}
        </Stack>
      </CardContent>
    </Card>
  );
}
