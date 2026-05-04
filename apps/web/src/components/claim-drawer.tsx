"use client";

import {
  Drawer,
  Badge,
  VerdictBadge,
  ConfidenceMeter,
  Label,
  Text,
  Code,
  Divider,
  Stack,
  ProgressBar,
  Button,
} from "@toiletpaper/ui";

// ── Shared types (serialized from server) ──────────────────────────

export interface SerializedSimulation {
  id: string;
  claimId: string;
  method: string;
  simulatorId: string | null;
  runId: string | null;
  replacesId: string | null;
  result: unknown;
  verdict: string | null;
  metadata: unknown;
  createdAt: string;
}

export interface SerializedClaim {
  id: string;
  paperId: string;
  text: string;
  canonicalText: string | null;
  status: string;
  confidence: number | null;
  category: string;
  predicate: string | null;
  value: string | null;
  unit: string | null;
  evidence: string | null;
  testability: number | null;
  testabilityReason: string | null;
  page: number | null;
  dontoSubjectIri: string | null;
  createdAt: string;
  simulations: SerializedSimulation[];
}

// ── Helpers ────────────────────────────────────────────────────────

function mapVerdict(verdict: string | null): "reproduced" | "contradicted" | "fragile" | "undetermined" {
  if (verdict === "confirmed" || verdict === "reproduced") return "reproduced";
  if (verdict === "refuted" || verdict === "contradicted") return "contradicted";
  if (verdict === "fragile") return "fragile";
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
} {
  if (!result || typeof result !== "object") return {};
  const r = result as Record<string, unknown>;
  return {
    reason: typeof r.reason === "string" ? r.reason : undefined,
    measured: r.measured != null ? (typeof r.measured === "object" ? JSON.stringify(r.measured) : String(r.measured)) : undefined,
    expected: r.expected != null ? (typeof r.expected === "object" ? JSON.stringify(r.expected) : String(r.expected)) : undefined,
    confidence: typeof r.confidence === "number" ? r.confidence : undefined,
  };
}

const categoryVariant: Record<string, "default" | "success" | "warning" | "danger" | "muted"> = {
  quantitative: "default",
  comparative: "default",
  causal: "warning",
  methodological: "muted",
  theoretical: "default",
};

export function getClaimVerdict(claim: SerializedClaim): "reproduced" | "contradicted" | "fragile" | "undetermined" | "untested" {
  if (claim.simulations.length === 0) return "untested";
  if (claim.simulations.some(s => s.verdict === "confirmed" || s.verdict === "reproduced")) return "reproduced";
  if (claim.simulations.some(s => s.verdict === "refuted" || s.verdict === "contradicted")) return "contradicted";
  if (claim.simulations.some(s => s.verdict === "fragile")) return "fragile";
  return "undetermined";
}

// ── ClaimDrawer ────────────────────────────────────────────────────

interface ClaimDrawerProps {
  claim: SerializedClaim | null;
  open: boolean;
  onClose: () => void;
  paperId: string;
}

export function ClaimDrawer({ claim, open, onClose, paperId }: ClaimDrawerProps) {
  if (!claim) return null;

  const verdict = getClaimVerdict(claim);
  const conf = claim.confidence;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      side="right"
      title="Claim Detail"
      className="max-w-lg"
    >
      <Stack gap={5}>
        {/* Full claim text */}
        <div>
          <Text size="sm" leading="relaxed" className="text-[var(--color-ink)]">
            {claim.text}
          </Text>
        </div>

        {/* Category + Verdict */}
        <Stack direction="horizontal" align="center" gap={2} wrap>
          {verdict !== "untested" && (
            <VerdictBadge verdict={verdict === "undetermined" ? "undetermined" : verdict} />
          )}
          {claim.category && claim.category !== "unknown" && (
            <Badge variant={categoryVariant[claim.category] ?? "muted"}>
              {claim.category}
            </Badge>
          )}
          <Badge variant="muted">{claim.status}</Badge>
        </Stack>

        {/* Confidence meter */}
        {conf != null && (
          <div>
            <Label size="xs" className="mb-1 block">Extraction Confidence</Label>
            <ConfidenceMeter value={conf * 100} />
          </div>
        )}

        {/* Testability */}
        {claim.testability != null && (
          <div>
            <Label size="xs" className="mb-1 block">Testability</Label>
            <Stack direction="horizontal" align="center" gap={2}>
              <ProgressBar
                value={claim.testability * 100}
                color={claim.testability >= 0.7 ? "success" : claim.testability >= 0.4 ? "warning" : "error"}
                className="flex-1"
              />
              <Text size="xs" weight="medium" as="span" className="font-mono">
                {(claim.testability * 100).toFixed(0)}%
              </Text>
            </Stack>
            {claim.testabilityReason && (
              <Text size="xs" color="muted" className="mt-1">{claim.testabilityReason}</Text>
            )}
          </div>
        )}

        <Divider />

        {/* Donto fields */}
        {(claim.predicate || claim.value || claim.evidence) && (
          <div>
            <Label size="xs" className="mb-2 block font-semibold">Donto Fields</Label>
            <div className="grid gap-3 sm:grid-cols-2">
              {claim.predicate && (
                <div>
                  <Label size="xs">Predicate</Label>
                  <Code>{claim.predicate}</Code>
                </div>
              )}
              {claim.value && (
                <div>
                  <Label size="xs">Value</Label>
                  <Text size="sm" weight="semibold">
                    {claim.value}
                    {claim.unit && (
                      <Text as="span" color="muted" weight="normal" className="ml-1">
                        {claim.unit}
                      </Text>
                    )}
                  </Text>
                </div>
              )}
              {claim.evidence && (
                <div className="sm:col-span-2">
                  <Label size="xs">Evidence</Label>
                  <Text size="xs" color="light" leading="relaxed">{claim.evidence}</Text>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Simulation Results */}
        {claim.simulations.length > 0 && (
          <div>
            <Label size="xs" className="mb-2 block font-semibold">
              Simulation Results ({claim.simulations.length})
            </Label>
            <Stack gap={3}>
              {claim.simulations.map((sim) => {
                const result = extractResultFields(sim.result);
                const simVerdict = mapVerdict(sim.verdict);
                return (
                  <div
                    key={sim.id}
                    className="rounded-lg border border-[var(--color-rule-faint)] bg-[var(--color-paper)] p-3"
                  >
                    <Stack gap={2}>
                      <Stack direction="horizontal" align="center" justify="between">
                        <VerdictBadge verdict={simVerdict} />
                        <Text size="xs" color="muted">
                          {formatMethodName(sim.method)}
                        </Text>
                      </Stack>
                      {result.reason && (
                        <Text size="xs" color="light" leading="relaxed">
                          {result.reason}
                        </Text>
                      )}
                      {(result.measured || result.expected) && (
                        <div className="grid grid-cols-2 gap-2">
                          {result.measured && (
                            <div>
                              <Label size="xs">Measured</Label>
                              <Text size="xs" weight="semibold" className="font-mono">{result.measured}</Text>
                            </div>
                          )}
                          {result.expected && (
                            <div>
                              <Label size="xs">Expected</Label>
                              <Text size="xs" weight="semibold" className="font-mono">{result.expected}</Text>
                            </div>
                          )}
                        </div>
                      )}
                      {result.confidence != null && (
                        <Stack direction="horizontal" align="center" gap={2}>
                          <Label size="xs">Confidence</Label>
                          <ProgressBar
                            value={result.confidence * 100}
                            color={
                              simVerdict === "reproduced"
                                ? "reproduced"
                                : simVerdict === "contradicted"
                                  ? "contradicted"
                                  : "fragile"
                            }
                            className="flex-1 max-w-32"
                          />
                          <Text size="xs" weight="medium" as="span" className="font-mono">
                            {(result.confidence * 100).toFixed(0)}%
                          </Text>
                        </Stack>
                      )}
                    </Stack>
                  </div>
                );
              })}
            </Stack>
          </div>
        )}

        {/* Inspect in Donto button */}
        {claim.dontoSubjectIri && (
          <>
            <Divider />
            <a
              href={`/api/donto/history?iri=${encodeURIComponent(claim.dontoSubjectIri)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-md border border-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary-faint)]"
            >
              Inspect in Donto
            </a>
          </>
        )}
      </Stack>
    </Drawer>
  );
}
