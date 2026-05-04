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
import { EvidenceModeBadge } from "./claim-drawer";

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

/** Render all key-value pairs from a JSONB object in a structured grid, skipping nulls */
function JsonKvGrid({ data, label }: { data: Record<string, unknown>; label: string }) {
  const entries = Object.entries(data).filter(([, v]) => v != null && v !== "");
  if (entries.length === 0) return null;
  return (
    <div>
      <Label size="xs" className="mb-1 block">{label}</Label>
      <div className="rounded border border-[var(--color-rule-faint)] bg-[var(--color-paper)] p-3">
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
          {entries.map(([key, val]) => (
            <div key={key} className="min-w-0">
              <span className="text-[var(--color-ink-muted)]">{key.replace(/[_-]/g, " ")}:</span>{" "}
              <span className="font-mono break-all">
                {typeof val === "object" ? JSON.stringify(val) : String(val)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SimulationRow({ sim, claimText }: SimRowProps) {
  const [expanded, setExpanded] = useState(false);
  const verdict = mapVerdict(sim.verdict);
  const result = sim.result as Record<string, unknown> | null;
  const reason = typeof result?.reason === "string" ? result.reason : null;
  const meta = sim.metadata as Record<string, unknown> | null;

  // Extract known result fields
  const resultConfidence = typeof result?.confidence === "number" ? result.confidence : null;
  // Collect "extra" result fields beyond reason/measured/expected/confidence
  const extraResultFields: Record<string, unknown> = {};
  if (result) {
    for (const [k, v] of Object.entries(result)) {
      if (!["reason", "measured", "expected", "confidence"].includes(k) && v != null && v !== "") {
        extraResultFields[k] = v;
      }
    }
  }

  // Extract known metadata fields
  const simFile = typeof meta?.simulation_file === "string" ? meta.simulation_file : null;
  const testType = typeof meta?.test_type === "string" ? meta.test_type : null;
  const metaPaperId = typeof meta?.paper_id === "string" ? meta.paper_id : null;
  const originalVerdict = typeof meta?.original_verdict === "string" ? meta.original_verdict : null;
  const review = meta?.review as Record<string, unknown> | null;
  // Collect "extra" metadata fields
  const extraMetaFields: Record<string, unknown> = {};
  if (meta) {
    for (const [k, v] of Object.entries(meta)) {
      if (!["simulation_file", "test_type", "paper_id", "original_verdict", "review"].includes(k) && v != null && v !== "") {
        extraMetaFields[k] = v;
      }
    }
  }

  return (
    <div className="rounded-lg border border-[var(--color-rule-faint)] bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--color-paper)] cursor-pointer"
      >
        <VerdictBadge verdict={verdict} />
        <EvidenceModeBadge mode={sim.evidenceMode} />
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

            {/* Result confidence */}
            {resultConfidence != null && (
              <div>
                <Label size="xs">Result Confidence</Label>
                <Text size="xs" weight="semibold" className="font-mono">{(resultConfidence * 100).toFixed(0)}%</Text>
              </div>
            )}

            {/* Extra result fields */}
            {Object.keys(extraResultFields).length > 0 && (
              <JsonKvGrid data={extraResultFields} label="Additional Result Fields" />
            )}

            {/* Structured metadata */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
              {sim.simulatorId && (
                <div><span className="text-[var(--color-ink-muted)]">Simulator ID:</span> <span className="font-mono">{sim.simulatorId}</span></div>
              )}
              {sim.runId && (
                <div><span className="text-[var(--color-ink-muted)]">Run ID:</span> <span className="font-mono">{sim.runId}</span></div>
              )}
              {sim.replacesId && (
                <div><span className="text-[var(--color-ink-muted)]">Replaces:</span> <span className="font-mono">{sim.replacesId}</span></div>
              )}
              {simFile && (
                <div><span className="text-[var(--color-ink-muted)]">Simulation File:</span> <span className="font-mono">{simFile}</span></div>
              )}
              {testType && (
                <div><span className="text-[var(--color-ink-muted)]">Test Type:</span> {testType}</div>
              )}
              {metaPaperId && (
                <div><span className="text-[var(--color-ink-muted)]">Paper ID:</span> <span className="font-mono">{metaPaperId}</span></div>
              )}
              {originalVerdict && (
                <div><span className="text-[var(--color-ink-muted)]">Original Verdict:</span> {originalVerdict}</div>
              )}
            </div>

            {/* Limitations */}
            {sim.limitations && sim.limitations.length > 0 && (
              <div>
                <Label size="xs" className="mb-1 block">Limitations</Label>
                <div className="flex flex-wrap gap-1">
                  {sim.limitations.map((lim) => (
                    <span key={lim} className="rounded bg-[var(--color-paper-warm)] px-1.5 py-0.5 text-[10px] text-[var(--color-ink-muted)]">{lim}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Review data */}
            {review && typeof review === "object" && (
              <div>
                <Label size="xs" className="mb-1 block">Review</Label>
                <div className="rounded border border-[var(--color-rule-faint)] bg-[var(--color-paper)] p-3">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                    {Object.entries(review).filter(([, v]) => v != null && v !== "").map(([k, v]) => (
                      <div key={k} className="min-w-0">
                        <span className="text-[var(--color-ink-muted)]">{k.replace(/[_-]/g, " ")}:</span>{" "}
                        <span className="font-mono break-all">
                          {typeof v === "object" ? JSON.stringify(v) : String(v)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Extra metadata fields */}
            {Object.keys(extraMetaFields).length > 0 && (
              <JsonKvGrid data={extraMetaFields} label="Additional Metadata" />
            )}

            {/* Timestamp */}
            <Text size="xs" color="faint">
              Ran: {new Date(sim.createdAt).toLocaleString()}
            </Text>

            {/* Full result JSON (fallback) */}
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

            {/* Full metadata JSON (fallback) */}
            {meta && (
              <details className="group">
                <summary className="cursor-pointer text-xs font-medium text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]">
                  Full metadata JSON
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
