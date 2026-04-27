import {
  Badge,
  Card,
  CardContent,
  Label,
  Text,
  Code,
  ProgressBar,
  VerdictBadge,
  Stack,
  Divider,
} from "@toiletpaper/ui";
import type { simulations } from "@toiletpaper/db";
import { getHistory } from "@/lib/donto";
import { CollapsibleDetails } from "./collapsible-details";
import { ClaimDontoInspect } from "./claim-donto-inspect";
import { HelpTip } from "@/components/help-tip";
import { DebugPanel } from "./debug-panel";

interface Claim {
  id: string;
  text: string;
  status: string;
  confidence: number | null;
  dontoSubjectIri: string | null;
  simulations: (typeof simulations.$inferSelect)[];
}

function mapVerdict(verdict: string | null) {
  if (verdict === "confirmed") return "reproduced" as const;
  if (verdict === "refuted") return "contradicted" as const;
  return "undetermined" as const;
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
    baseline: r.baseline != null ? (typeof r.baseline === "object" ? JSON.stringify(r.baseline) : String(r.baseline)) : undefined,
    proposed: r.proposed != null ? (typeof r.proposed === "object" ? JSON.stringify(r.proposed) : String(r.proposed)) : undefined,
    llmAnalysis: typeof r.llmAnalysis === "string" ? r.llmAnalysis : undefined,
    fittedExponent: typeof r.fittedExponent === "number" ? r.fittedExponent : undefined,
    expectedExponent: typeof r.expectedExponent === "number" ? r.expectedExponent : undefined,
  };
}

export async function ClaimCard({ claim }: { claim: Claim }) {
  let dontoData: {
    category?: string;
    evidence?: string;
    predicate?: string;
    value?: string;
    unit?: string;
    confidence?: string;
  } = {};

  if (claim.dontoSubjectIri) {
    try {
      const history = await getHistory(claim.dontoSubjectIri);
      if (history?.rows) {
        for (const row of history.rows) {
          const val = String(row.object_lit?.v ?? row.object_iri ?? "");
          switch (row.predicate) {
            case "tp:category":
              dontoData.category = val;
              break;
            case "tp:evidence":
              dontoData.evidence = val;
              break;
            case "tp:predicate":
              dontoData.predicate = val;
              break;
            case "tp:value":
              dontoData.value = val;
              break;
            case "tp:unit":
              dontoData.unit = val;
              break;
            case "tp:confidence":
              dontoData.confidence = val;
              break;
          }
        }
      }
    } catch { /* dontosrv may be down */ }
  }

  const conf = claim.confidence ?? (dontoData.confidence ? parseFloat(dontoData.confidence) : null);
  const category = dontoData.category;

  const categoryVariant: Record<string, "default" | "success" | "warning" | "danger" | "muted"> = {
    quantitative: "default",
    comparative: "default",
    causal: "warning",
    methodological: "muted",
    theoretical: "default",
  };

  return (
    <Card>
      <CardContent className="p-5">
        <Stack direction="horizontal" align="start" gap={3}>
          <Text size="sm" leading="relaxed" className="flex-1">{claim.text}</Text>
          <Stack align="end" gap={1} className="shrink-0">
            <Badge
              variant={
                claim.status === "asserted"
                  ? "success"
                  : claim.status === "error"
                    ? "danger"
                    : "muted"
              }
            >
              {claim.status}
            </Badge>
            {category && (
              <Badge variant={categoryVariant[category] ?? "muted"}>
                {category}
              </Badge>
            )}
          </Stack>
        </Stack>

        {conf != null && (
          <div className="mt-3">
            <Stack direction="horizontal" align="center" gap={2}>
              <Label size="xs">Confidence</Label>
              <HelpTip text="How confident the extraction model (GPT-5.4) is that this is a genuine testable claim from the paper." />
              <ProgressBar
                value={conf * 100}
                color={conf >= 0.9 ? "success" : conf >= 0.7 ? "warning" : "error"}
                className="flex-1"
              />
              <Text size="xs" weight="medium" as="span">
                {(conf * 100).toFixed(0)}%
              </Text>
            </Stack>
          </div>
        )}

        {(dontoData.value || dontoData.predicate || dontoData.evidence) && (
          <>
            <Divider />
            <div className="grid gap-2 sm:grid-cols-2">
              {dontoData.predicate && (
                <div>
                  <Label size="xs">Predicate</Label>
                  <Code>{dontoData.predicate}</Code>
                </div>
              )}
              {dontoData.value && (
                <div>
                  <Label size="xs">Value</Label>
                  <Text size="sm" weight="semibold">
                    {dontoData.value}
                    {dontoData.unit && (
                      <Text as="span" color="muted" weight="normal" className="ml-1">
                        {dontoData.unit}
                      </Text>
                    )}
                  </Text>
                </div>
              )}
              {dontoData.evidence && (
                <div className="sm:col-span-2">
                  <Label size="xs">Evidence</Label>
                  <Text size="xs" color="light">{dontoData.evidence}</Text>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>

      {claim.dontoSubjectIri && (
        <ClaimDontoInspect iri={claim.dontoSubjectIri} />
      )}

      {claim.simulations.length > 0 && (
        <div className="border-t border-stone-100 px-5 py-4">
          <Label size="xs" className="mb-3 block">Simulation Results</Label>
          <Stack gap={4}>
            {claim.simulations.map((sim) => {
              const result = extractResultFields(sim.result);
              const verdict = mapVerdict(sim.verdict);
              const simConfidence = result.confidence;

              return (
                <div
                  key={sim.id}
                  className="rounded-lg border border-[var(--color-rule-faint)] bg-[var(--color-paper)] p-4"
                >
                  <Stack gap={3}>
                    {/* Header: verdict + method */}
                    <Stack direction="horizontal" align="center" justify="between">
                      <Stack direction="horizontal" align="center" gap={1}>
                        <VerdictBadge verdict={verdict} />
                        <HelpTip text="Based on independent simulation — not the paper's own evaluation." />
                      </Stack>
                      <Text size="xs" color="muted">
                        {formatMethodName(sim.method)}
                      </Text>
                    </Stack>

                    {/* Reason — the key explanation */}
                    {result.reason && (
                      <div className="rounded border border-[var(--color-rule-faint)] bg-white p-3">
                        <Text size="sm" leading="relaxed" color="light">
                          {result.reason}
                        </Text>
                      </div>
                    )}

                    {/* Measured vs Expected */}
                    {(result.measured !== undefined || result.expected !== undefined ||
                      result.fittedExponent !== undefined || result.expectedExponent !== undefined) ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {result.fittedExponent !== undefined && (
                          <div>
                            <Label size="xs">Fitted Exponent</Label>
                            <Text size="sm" weight="semibold" className="font-mono">
                              {result.fittedExponent}
                            </Text>
                          </div>
                        )}
                        {result.expectedExponent !== undefined && (
                          <div>
                            <Label size="xs">Expected Exponent</Label>
                            <Text size="sm" weight="semibold" className="font-mono">
                              {result.expectedExponent}
                            </Text>
                          </div>
                        )}
                        {result.measured !== undefined && (
                          <div>
                            <Label size="xs">Measured</Label>
                            <Text size="sm" weight="semibold" className="font-mono">
                              {result.measured}
                            </Text>
                          </div>
                        )}
                        {result.expected !== undefined && (
                          <div>
                            <Label size="xs">Expected</Label>
                            <Text size="sm" weight="semibold" className="font-mono">
                              {result.expected}
                            </Text>
                          </div>
                        )}
                      </div>
                    ) : null}

                    {/* Baseline vs Proposed */}
                    {(result.baseline !== undefined || result.proposed !== undefined) ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {result.baseline !== undefined && (
                          <div>
                            <Label size="xs">Baseline</Label>
                            <Text size="sm" weight="semibold" className="font-mono">
                              {result.baseline}
                            </Text>
                          </div>
                        )}
                        {result.proposed !== undefined && (
                          <div>
                            <Label size="xs">Proposed</Label>
                            <Text size="sm" weight="semibold" className="font-mono">
                              {result.proposed}
                            </Text>
                          </div>
                        )}
                      </div>
                    ) : null}

                    {/* Confidence in verdict */}
                    {simConfidence !== undefined ? (
                      <Stack direction="horizontal" align="center" gap={2}>
                        <Label size="xs">Verdict Confidence</Label>
                        <ProgressBar
                          value={simConfidence * 100}
                          color={
                            verdict === "reproduced"
                              ? "reproduced"
                              : verdict === "contradicted"
                                ? "contradicted"
                                : "fragile"
                          }
                          className="flex-1 max-w-48"
                        />
                        <Text size="xs" weight="medium" as="span" className="font-mono">
                          {(simConfidence * 100).toFixed(0)}%
                        </Text>
                      </Stack>
                    ) : null}

                    {/* Collapsible full details */}
                    {(result.llmAnalysis != null || sim.metadata != null) ? (
                      <CollapsibleDetails summary="Full result details">
                        <Stack gap={3}>
                          {result.llmAnalysis != null ? (
                            <div>
                              <Label size="xs" className="mb-1 block">LLM Analysis</Label>
                              <Text size="xs" color="light" leading="relaxed" className="whitespace-pre-wrap">
                                {result.llmAnalysis}
                              </Text>
                            </div>
                          ) : null}
                          {sim.metadata != null ? (
                            <div>
                              <Label size="xs" className="mb-1 block">Metadata</Label>
                              <Code variant="block">
                                {JSON.stringify(sim.metadata, null, 2)}
                              </Code>
                            </div>
                          ) : null}
                          {sim.result != null ? (
                            <div>
                              <Label size="xs" className="mb-1 block">Raw Result</Label>
                              <Code variant="block">
                                {JSON.stringify(sim.result, null, 2)}
                              </Code>
                            </div>
                          ) : null}
                        </Stack>
                      </CollapsibleDetails>
                    ) : null}

                    {/* Debug panel for individual simulation */}
                    <DebugPanel label="Simulation Result" data={sim} />
                  </Stack>
                </div>
              );
            })}
          </Stack>
        </div>
      )}

      {/* Debug panels */}
      <div className="px-5 pb-4">
        <Stack gap={2}>
          <DebugPanel label="Claim Data" data={claim} />
          <DebugPanel label="Donto Data" data={dontoData} />
        </Stack>
      </div>
    </Card>
  );
}
