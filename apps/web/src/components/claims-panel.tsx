"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  VerdictBadge,
  ConfidenceMeter,
  Text,
  EmptyState,
} from "@toiletpaper/ui";
import type { SerializedClaim } from "./claim-drawer";
import { getClaimVerdict } from "./claim-drawer";

// ── Filter types ───────────────────────────────────────────────────

type VerdictFilter = "all" | "contradicted" | "reproduced" | "fragile" | "undetermined" | "untested";

const FILTERS: { key: VerdictFilter; label: string; color: string }[] = [
  { key: "all", label: "All", color: "#1A1A1A" },
  { key: "contradicted", label: "Contradicted", color: "#9B2226" },
  { key: "reproduced", label: "Reproduced", color: "#2D6A4F" },
  { key: "fragile", label: "Fragile", color: "#B07D2B" },
  { key: "undetermined", label: "Inconclusive", color: "#6B6B6B" },
  { key: "untested", label: "Untested", color: "#D4D0C8" },
];

// ── Helpers ────────────────────────────────────────────────────────

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "...";
}

function mapVerdictForBadge(v: ReturnType<typeof getClaimVerdict>) {
  if (v === "untested") return "undetermined" as const;
  return v;
}

// ── Component ──────────────────────────────────────────────────────

interface ClaimsPanelProps {
  claims: SerializedClaim[];
  onClaimClick: (c: SerializedClaim) => void;
}

export function ClaimsPanel({ claims, onClaimClick }: ClaimsPanelProps) {
  const [filter, setFilter] = useState<VerdictFilter>("all");

  // Compute verdict for each claim once
  const claimsWithVerdict = useMemo(
    () => claims.map((c) => ({ claim: c, verdict: getClaimVerdict(c) })),
    [claims],
  );

  // Count per filter
  const counts = useMemo(() => {
    const counts: Record<VerdictFilter, number> = {
      all: claims.length,
      contradicted: 0,
      reproduced: 0,
      fragile: 0,
      undetermined: 0,
      untested: 0,
    };
    for (const { verdict } of claimsWithVerdict) {
      if (verdict in counts) {
        counts[verdict as VerdictFilter]++;
      }
    }
    return counts;
  }, [claimsWithVerdict, claims.length]);

  // Filtered list
  const filtered = useMemo(
    () =>
      filter === "all"
        ? claimsWithVerdict
        : claimsWithVerdict.filter((c) => c.verdict === filter),
    [claimsWithVerdict, filter],
  );

  if (claims.length === 0) {
    return (
      <EmptyState
        title="No claims extracted yet"
        description="Claims will appear here once extraction completes."
      />
    );
  }

  return (
    <div>
      {/* Filter pills */}
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const isActive = filter === f.key;
          const count = counts[f.key];
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={[
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                isActive
                  ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-white"
                  : "border-[var(--color-rule-faint)] bg-white text-[var(--color-ink-muted)] hover:border-[var(--color-rule)] hover:text-[var(--color-ink)]",
              ].join(" ")}
            >
              {f.key !== "all" && (
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: isActive ? "white" : f.color }}
                />
              )}
              {f.label}
              <span
                className={[
                  "ml-0.5 font-mono text-[11px] tabular-nums",
                  isActive ? "text-white/70" : "text-[var(--color-ink-faint)]",
                ].join(" ")}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Claims table */}
      <div className="rounded-lg border border-[var(--color-rule-faint)] bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10">#</TableHead>
              <TableHead className="w-32">Verdict</TableHead>
              <TableHead>Claim</TableHead>
              <TableHead className="w-36">Confidence</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(({ claim, verdict }, idx) => (
              <TableRow
                key={claim.id}
                onClick={() => onClaimClick(claim)}
                className="cursor-pointer"
              >
                <TableCell mono>
                  <Text size="xs" color="muted" as="span">
                    {idx + 1}
                  </Text>
                </TableCell>
                <TableCell>
                  <VerdictBadge verdict={mapVerdictForBadge(verdict)} />
                </TableCell>
                <TableCell>
                  <Text size="sm" as="span">
                    {truncate(claim.text, 90)}
                  </Text>
                </TableCell>
                <TableCell>
                  {claim.confidence != null ? (
                    <ConfidenceMeter value={claim.confidence * 100} size="sm" />
                  ) : (
                    <Text size="xs" color="faint" as="span">--</Text>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {filtered.length === 0 && (
          <div className="py-8 text-center text-sm text-[var(--color-ink-muted)]">
            No claims match this filter.
          </div>
        )}
      </div>
    </div>
  );
}
