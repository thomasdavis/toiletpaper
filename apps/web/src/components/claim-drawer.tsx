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
  evidenceMode: string | null;
  limitations: string[] | null;
  metadata: unknown;
  createdAt: string;
}

// ── Evidence mode helpers ─────────────────────────────────────────

export type EvidenceMode =
  | "exact_artifact"
  | "independent_implementation"
  | "proxy_simulation"
  | "static_check"
  | "formal_proof"
  | "insufficient";

const EVIDENCE_MODE_META: Record<EvidenceMode, { label: string; color: string }> = {
  exact_artifact:              { label: "Exact Artifact",    color: "bg-[#1B4332] text-white" },
  independent_implementation:  { label: "Independent Impl",  color: "bg-[#2D6A4F] text-white" },
  proxy_simulation:            { label: "Proxy Simulation",  color: "bg-[#B07D2B] text-white" },
  static_check:                { label: "Static Check",      color: "bg-[#2563EB] text-white" },
  formal_proof:                { label: "Formal Proof",      color: "bg-[#7C3AED] text-white" },
  insufficient:                { label: "Insufficient",      color: "bg-[#A8A29E] text-white" },
};

export function EvidenceModeBadge({ mode }: { mode: string | null }) {
  if (!mode) return null;
  const meta = EVIDENCE_MODE_META[mode as EvidenceMode];
  if (!meta) return null;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide ${meta.color}`}>
      {meta.label}
    </span>
  );
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
  sectionPath: string[] | null;
  charStart: number | null;
  charEnd: number | null;
  extractorModel: string | null;
  extractorVersion: string | null;
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

// ── Review data helpers ──────────────────────────────────────────

interface ReviewData {
  review_status: "approved" | "flagged" | "rejected";
  confidence_adjustment: number;
  issues: string[];
  verdict_change: null | "upgrade" | "downgrade";
  notes: string;
  reviewed_at?: string;
}

function extractReviewData(metadata: unknown): ReviewData | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as Record<string, unknown>;
  if (!m.review || typeof m.review !== "object") return null;
  const r = m.review as Record<string, unknown>;
  if (
    typeof r.review_status !== "string" ||
    !["approved", "flagged", "rejected"].includes(r.review_status)
  )
    return null;
  return {
    review_status: r.review_status as ReviewData["review_status"],
    confidence_adjustment: typeof r.confidence_adjustment === "number" ? r.confidence_adjustment : 0,
    issues: Array.isArray(r.issues) ? (r.issues as string[]) : [],
    verdict_change: r.verdict_change === "upgrade" || r.verdict_change === "downgrade" ? r.verdict_change : null,
    notes: typeof r.notes === "string" ? r.notes : "",
    reviewed_at: typeof r.reviewed_at === "string" ? r.reviewed_at : undefined,
  };
}

const REVIEW_STATUS_META: Record<
  ReviewData["review_status"],
  { label: string; color: string }
> = {
  approved: { label: "Reviewed", color: "bg-[#1B4332] text-white" },
  flagged: { label: "Flagged", color: "bg-[#B07D2B] text-white" },
  rejected: { label: "Rejected", color: "bg-[#991B1B] text-white" },
};

function ReviewBadge({ status }: { status: ReviewData["review_status"] }) {
  const meta = REVIEW_STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide ${meta.color}`}
    >
      {meta.label}
    </span>
  );
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
                const review = extractReviewData(sim.metadata);
                return (
                  <div
                    key={sim.id}
                    className="rounded-lg border border-[var(--color-rule-faint)] bg-[var(--color-paper)] p-3"
                  >
                    <Stack gap={2}>
                      <Stack direction="horizontal" align="center" justify="between">
                        <Stack direction="horizontal" align="center" gap={2} wrap>
                          <VerdictBadge verdict={simVerdict} />
                          <EvidenceModeBadge mode={sim.evidenceMode} />
                          {review && <ReviewBadge status={review.review_status} />}
                        </Stack>
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
                      {sim.limitations && sim.limitations.length > 0 && (
                        <div>
                          <Label size="xs" className="mb-1 block">Limitations</Label>
                          <div className="flex flex-wrap gap-1">
                            {sim.limitations.map((lim) => (
                              <span
                                key={lim}
                                className="rounded bg-[var(--color-paper-warm)] px-1.5 py-0.5 text-[10px] text-[var(--color-ink-muted)]"
                              >
                                {lim}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {review && (review.issues.length > 0 || review.notes || review.confidence_adjustment !== 0) && (
                        <div className="mt-1 rounded border border-[var(--color-rule-faint)] bg-[var(--color-paper-warm)] p-2">
                          <Label size="xs" className="mb-1 block font-semibold">
                            Adversarial Review
                          </Label>
                          {review.notes && (
                            <Text size="xs" color="light" leading="relaxed" className="mb-1">
                              {review.notes}
                            </Text>
                          )}
                          {review.confidence_adjustment !== 0 && (
                            <Text size="xs" color="muted" className="mb-1 font-mono">
                              Confidence adjustment: {review.confidence_adjustment > 0 ? "+" : ""}
                              {review.confidence_adjustment.toFixed(2)}
                            </Text>
                          )}
                          {review.verdict_change && (
                            <Text size="xs" color="muted" className="mb-1">
                              Reviewer suggests: {review.verdict_change}
                            </Text>
                          )}
                          {review.issues.length > 0 && (
                            <div className="mt-1">
                              <Label size="xs" className="mb-0.5 block">Issues</Label>
                              <ul className="list-inside list-disc space-y-0.5">
                                {review.issues.map((issue, idx) => (
                                  <li key={idx} className="text-[10px] text-[var(--color-ink-muted)]">
                                    {issue}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </Stack>
                  </div>
                );
              })}
            </Stack>
          </div>
        )}

        {/* Claim Metadata (collapsible) */}
        {(claim.canonicalText || claim.page != null || claim.sectionPath || claim.charStart != null || claim.extractorModel || claim.dontoSubjectIri) && (
          <>
            <Divider />
            <details className="group">
              <summary className="cursor-pointer text-xs font-medium text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]">
                Claim Metadata
              </summary>
              <div className="mt-2 rounded-lg border border-[var(--color-rule-faint)] bg-[var(--color-paper)] p-3">
                <div className="grid gap-2 text-xs">
                  {claim.canonicalText && claim.canonicalText !== claim.text && (
                    <div>
                      <span className="text-[#9B9B9B]">Canonical Text:</span>
                      <Text size="xs" color="light" className="mt-0.5">{claim.canonicalText}</Text>
                    </div>
                  )}
                  {claim.page != null && (
                    <div>
                      <span className="text-[#9B9B9B]">Page:</span>{" "}
                      <span className="font-mono">{claim.page}</span>
                    </div>
                  )}
                  {claim.sectionPath && claim.sectionPath.length > 0 && (
                    <div>
                      <span className="text-[#9B9B9B]">Section Path:</span>{" "}
                      <span className="font-mono">{claim.sectionPath.join(" > ")}</span>
                    </div>
                  )}
                  {claim.charStart != null && claim.charEnd != null && (
                    <div>
                      <span className="text-[#9B9B9B]">Character Span:</span>{" "}
                      <span className="font-mono">{claim.charStart}&#8211;{claim.charEnd}</span>
                    </div>
                  )}
                  {claim.extractorModel && (
                    <div>
                      <span className="text-[#9B9B9B]">Extractor Model:</span>{" "}
                      <span className="font-mono">{claim.extractorModel}</span>
                    </div>
                  )}
                  {claim.extractorVersion && (
                    <div>
                      <span className="text-[#9B9B9B]">Extractor Version:</span>{" "}
                      <span className="font-mono">{claim.extractorVersion}</span>
                    </div>
                  )}
                  {claim.dontoSubjectIri && (
                    <div>
                      <span className="text-[#9B9B9B]">Donto IRI:</span>{" "}
                      <Code className="text-[10px] break-all">{claim.dontoSubjectIri}</Code>
                    </div>
                  )}
                </div>
              </div>
            </details>
          </>
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
