"use client";

import { useState, useMemo } from "react";
import {
  VerdictBadge,
  Text,
  Label,
  Code,
  Stack,
  EmptyState,
} from "@toiletpaper/ui";
import type { SerializedClaim, SerializedSimulation } from "./claim-drawer";

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

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "...";
}

// ── SimulationRow ──────────────────────────────────────────────────

interface SimRowProps {
  sim: SerializedSimulation;
  claimText: string;
}

function SimulationRow({ sim, claimText }: SimRowProps) {
  const [expanded, setExpanded] = useState(false);
  const verdict = mapVerdict(sim.verdict);
  const result = sim.result as Record<string, unknown> | null;
  const reason = typeof result?.reason === "string" ? result.reason : null;
  const meta = sim.metadata as Record<string, unknown> | null;

  return (
    <div className="rounded-lg border border-[var(--color-rule-faint)] bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--color-paper)] cursor-pointer"
      >
        <VerdictBadge verdict={verdict} />
        <span className="flex-1 min-w-0 text-sm text-[var(--color-ink-light)]">
          {formatMethodName(sim.method)}
        </span>
        <span className="hidden shrink-0 text-xs text-[var(--color-ink-muted)] sm:block">
          {truncate(claimText, 40)}
        </span>
        <span
          className="shrink-0 text-xs text-[var(--color-ink-faint)] transition-transform"
          style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          &#9656;
        </span>
      </button>

      {expanded && (
        <div className="border-t border-[var(--color-rule-faint)] px-4 py-4">
          <Stack gap={3}>
            {/* Claim text */}
            <div>
              <Label size="xs" className="mb-1 block">Claim</Label>
              <Text size="sm" color="light" leading="relaxed">{claimText}</Text>
            </div>

            {/* Reason */}
            {reason && (
              <div>
                <Label size="xs" className="mb-1 block">Reason</Label>
                <div className="rounded border border-[var(--color-rule-faint)] bg-[var(--color-paper)] p-3">
                  <Text size="sm" color="light" leading="relaxed">{reason}</Text>
                </div>
              </div>
            )}

            {/* Measured vs Expected */}
            {(result?.measured != null || result?.expected != null) && (
              <div className="grid gap-3 sm:grid-cols-2">
                {result?.measured != null && (
                  <div>
                    <Label size="xs">Measured</Label>
                    <Text size="sm" weight="semibold" className="font-mono">
                      {typeof result.measured === "object"
                        ? JSON.stringify(result.measured)
                        : String(result.measured)}
                    </Text>
                  </div>
                )}
                {result?.expected != null && (
                  <div>
                    <Label size="xs">Expected</Label>
                    <Text size="sm" weight="semibold" className="font-mono">
                      {typeof result.expected === "object"
                        ? JSON.stringify(result.expected)
                        : String(result.expected)}
                    </Text>
                  </div>
                )}
              </div>
            )}

            {/* Timestamp */}
            <Text size="xs" color="faint">
              Ran: {new Date(sim.createdAt).toLocaleString()}
            </Text>

            {/* Full result JSON */}
            {result && (
              <details className="group">
                <summary className="cursor-pointer text-xs font-medium text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]">
                  Full result JSON
                </summary>
                <Code variant="block" className="mt-2 max-h-64 overflow-auto text-xs">
                  {JSON.stringify(result, null, 2)}
                </Code>
              </details>
            )}

            {/* Metadata */}
            {meta && (
              <details className="group">
                <summary className="cursor-pointer text-xs font-medium text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]">
                  Metadata
                </summary>
                <Code variant="block" className="mt-2 max-h-64 overflow-auto text-xs">
                  {JSON.stringify(meta, null, 2)}
                </Code>
              </details>
            )}
          </Stack>
        </div>
      )}
    </div>
  );
}

// ── SimulationsPanel ───────────────────────────────────────────────

interface SimulationsPanelProps {
  claims: SerializedClaim[];
  simulations: SerializedSimulation[];
}

export function SimulationsPanel({ claims, simulations }: SimulationsPanelProps) {
  // Build a map from claim id to claim text for display
  const claimTextMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of claims) {
      map.set(c.id, c.text);
    }
    return map;
  }, [claims]);

  if (simulations.length === 0) {
    return (
      <EmptyState
        title="No simulations yet"
        description="Simulation results will appear here once they have been run."
      />
    );
  }

  return (
    <div>
      <Text size="xs" color="muted" className="mb-3">
        {simulations.length} simulation{simulations.length !== 1 ? "s" : ""} across{" "}
        {new Set(simulations.map((s) => s.claimId)).size} claims
      </Text>
      <Stack gap={2}>
        {simulations.map((sim) => (
          <SimulationRow
            key={sim.id}
            sim={sim}
            claimText={claimTextMap.get(sim.claimId) ?? "Unknown claim"}
          />
        ))}
      </Stack>
    </div>
  );
}
