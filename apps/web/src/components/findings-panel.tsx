"use client";

import { useMemo } from "react";
import { VerdictBadge, Text, Heading, Stack, EmptyState } from "@toiletpaper/ui";
import type { SerializedClaim } from "./claim-drawer";
import { getClaimVerdict, EvidenceModeBadge } from "./claim-drawer";

// ── Helpers ────────────────────────────────────────────────────────

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "...";
}

function extractMeasuredExpected(claim: SerializedClaim): { measured?: string; expected?: string } {
  for (const sim of claim.simulations) {
    const r = sim.result as Record<string, unknown> | null;
    if (!r) continue;
    const measured = r.measured != null
      ? (typeof r.measured === "object" ? JSON.stringify(r.measured) : String(r.measured))
      : undefined;
    const expected = r.expected != null
      ? (typeof r.expected === "object" ? JSON.stringify(r.expected) : String(r.expected))
      : undefined;
    if (measured || expected) return { measured, expected };
  }
  return {};
}

const NOT_EVALUATED_LABELS: Record<string, string> = {
  no_data: "Dataset unavailable",
  compute_unavailable: "Needs GPU/TPU",
  theoretical_claim: "Requires formal proof",
  insufficient_detail: "Insufficient methodology detail",
  observational_claim: "Needs real-world data",
  out_of_scope: "Out of scope (wet lab, clinical, etc.)",
};

function extractEvidenceMode(claim: SerializedClaim): string | null {
  for (const sim of claim.simulations) {
    if (sim.evidenceMode) return sim.evidenceMode;
  }
  return null;
}

function extractNotEvaluatedReason(claim: SerializedClaim): string | undefined {
  for (const sim of claim.simulations) {
    const r = sim.result as Record<string, unknown> | null;
    if (r?.not_evaluated_reason && typeof r.not_evaluated_reason === "string") {
      return r.not_evaluated_reason;
    }
    const m = sim.metadata as Record<string, unknown> | null;
    if (m?.not_evaluated_reason && typeof m.not_evaluated_reason === "string") {
      return m.not_evaluated_reason;
    }
  }
  return undefined;
}

// ── Verdict dot color ──────────────────────────────────────────────

const dotColor: Record<string, string> = {
  reproduced: "bg-[#2D6A4F]",
  contradicted: "bg-[#9B2226]",
  fragile: "bg-[#B07D2B]",
  undetermined: "bg-[#6B6B6B]",
  untested: "bg-[#D4D0C8]",
};

// ── ClaimRow ───────────────────────────────────────────────────────

function ClaimRow({
  claim,
  onClick,
}: {
  claim: SerializedClaim;
  onClick: (c: SerializedClaim) => void;
}) {
  const verdict = getClaimVerdict(claim);
  const { measured, expected } = extractMeasuredExpected(claim);
  const evidenceMode = extractEvidenceMode(claim);

  return (
    <button
      type="button"
      onClick={() => onClick(claim)}
      className="flex w-full items-center gap-3 rounded-lg border border-[var(--color-rule-faint)] bg-white px-4 py-3 text-left transition-colors hover:bg-[var(--color-paper-warm)] cursor-pointer"
    >
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotColor[verdict]}`} />
      {evidenceMode && <EvidenceModeBadge mode={evidenceMode} />}
      <span className="flex-1 min-w-0 text-sm text-[var(--color-ink)]">
        {truncate(claim.text, 80)}
      </span>
      {(measured || expected) && (
        <span className="hidden shrink-0 text-right font-mono text-[11px] text-[var(--color-ink-muted)] sm:block">
          {measured && <span>{truncate(measured, 20)}</span>}
          {measured && expected && <span className="mx-1 text-[var(--color-rule)]">/</span>}
          {expected && <span>{truncate(expected, 20)}</span>}
        </span>
      )}
      <span className="shrink-0 text-xs text-[var(--color-ink-faint)]">&#9656;</span>
    </button>
  );
}

// ── FindingsPanel ──────────────────────────────────────────────────

interface FindingsPanelProps {
  claims: SerializedClaim[];
  onClaimClick: (c: SerializedClaim) => void;
}

export function FindingsPanel({ claims, onClaimClick }: FindingsPanelProps) {
  const { contradicted, fragile, reproduced, untested } = useMemo(() => {
    const contradicted: SerializedClaim[] = [];
    const fragile: SerializedClaim[] = [];
    const reproduced: SerializedClaim[] = [];
    const untested: SerializedClaim[] = [];

    for (const claim of claims) {
      const v = getClaimVerdict(claim);
      if (v === "contradicted") contradicted.push(claim);
      else if (v === "fragile") fragile.push(claim);
      else if (v === "reproduced") reproduced.push(claim);
      else untested.push(claim);
    }
    return { contradicted, fragile, reproduced, untested };
  }, [claims]);

  if (claims.length === 0) {
    return (
      <EmptyState
        title="No claims extracted yet"
        description="Claims will appear here once extraction completes."
      />
    );
  }

  const hasFindings = contradicted.length > 0 || fragile.length > 0 || reproduced.length > 0;

  if (!hasFindings) {
    return (
      <EmptyState
        title="No simulation results yet"
        description="Findings will appear here once simulations have been run against the extracted claims."
      />
    );
  }

  return (
    <Stack gap={6}>
      {/* Contradicted */}
      {contradicted.length > 0 && (
        <section>
          <Heading level={5} className="mb-3">
            <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-[#9B2226]" />
            Contradicted ({contradicted.length})
          </Heading>
          <Text size="xs" color="muted" className="mb-3">
            Claims where simulation results diverge from paper assertions.
          </Text>
          <Stack gap={2}>
            {contradicted.map((c) => (
              <ClaimRow key={c.id} claim={c} onClick={onClaimClick} />
            ))}
          </Stack>
        </section>
      )}

      {/* Fragile */}
      {fragile.length > 0 && (
        <section>
          <Heading level={5} className="mb-3">
            <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-[#B07D2B]" />
            Fragile ({fragile.length})
          </Heading>
          <Text size="xs" color="muted" className="mb-3">
            Claims with borderline or unstable simulation results.
          </Text>
          <Stack gap={2}>
            {fragile.map((c) => (
              <ClaimRow key={c.id} claim={c} onClick={onClaimClick} />
            ))}
          </Stack>
        </section>
      )}

      {/* Reproduced highlights (top 5) */}
      {reproduced.length > 0 && (
        <section>
          <Heading level={5} className="mb-3">
            <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-[#2D6A4F]" />
            Reproduced Highlights ({Math.min(reproduced.length, 5)} of {reproduced.length})
          </Heading>
          <Text size="xs" color="muted" className="mb-3">
            Top confirmed claims. View all in the Claims tab.
          </Text>
          <Stack gap={2}>
            {reproduced.slice(0, 5).map((c) => (
              <ClaimRow key={c.id} claim={c} onClick={onClaimClick} />
            ))}
          </Stack>
          {reproduced.length > 5 && (
            <Text size="xs" color="muted" className="mt-2">
              +{reproduced.length - 5} more reproduced claims in Claims tab
            </Text>
          )}
        </section>
      )}

      {/* Not Evaluated */}
      {untested.length > 0 && (
        <section>
          <Heading level={5} className="mb-3">
            <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-[#D4D0C8]" />
            Not Evaluated ({untested.length})
          </Heading>
          <Text size="xs" color="muted" className="mb-3">
            Claims that could not be tested computationally.
          </Text>
          <Stack gap={2}>
            {untested.map((c) => {
              const reason = extractNotEvaluatedReason(c);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onClaimClick(c)}
                  className="flex w-full items-center gap-3 rounded-lg border border-[var(--color-rule-faint)] bg-white px-4 py-3 text-left transition-colors hover:bg-[var(--color-paper-warm)] cursor-pointer"
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#D4D0C8]" />
                  <span className="flex-1 min-w-0 text-sm text-[var(--color-ink)]">
                    {truncate(c.text, 80)}
                  </span>
                  {reason && (
                    <span className="shrink-0 rounded bg-[var(--color-paper-warm)] px-2 py-0.5 text-[11px] text-[var(--color-ink-muted)]">
                      {NOT_EVALUATED_LABELS[reason] ?? reason}
                    </span>
                  )}
                  <span className="shrink-0 text-xs text-[var(--color-ink-faint)]">&#9656;</span>
                </button>
              );
            })}
          </Stack>
        </section>
      )}
    </Stack>
  );
}
