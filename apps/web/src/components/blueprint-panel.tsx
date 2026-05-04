"use client";

import { Heading, Text, Stack } from "@toiletpaper/ui";

interface BlueprintCluster {
  claim_ids: string[];
  test_strategy: string;
  compute_tier: string;
  required_data: string[];
  required_packages: string[];
  expected_outputs: string[];
  invalid_shortcuts: string[];
  minimum_valid_test: string;
}

interface Blueprint {
  clusters: BlueprintCluster[];
}

interface Props {
  blueprint: unknown;
  modelUsed: string | null;
  createdAt: string | null;
}

const STRATEGY_COLORS: Record<string, string> = {
  independent_implementation: "bg-[#2D6A4F]/10 text-[#2D6A4F] border-[#2D6A4F]/30",
  proxy_simulation: "bg-[#4A6FA5]/10 text-[#4A6FA5] border-[#4A6FA5]/30",
  static_check: "bg-[#B07D2B]/10 text-[#B07D2B] border-[#B07D2B]/30",
  algebraic: "bg-[#7B5EA7]/10 text-[#7B5EA7] border-[#7B5EA7]/30",
};

const TIER_COLORS: Record<string, string> = {
  cpu: "bg-[#E8E5DE] text-[#6B6B6B]",
  gpu: "bg-[#9B2226]/10 text-[#9B2226] border-[#9B2226]/30",
};

export function BlueprintPanel({ blueprint, modelUsed, createdAt }: Props) {
  const bp = blueprint as Blueprint | null;
  if (!bp || !bp.clusters || bp.clusters.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <Text color="light">No blueprint data available.</Text>
      </div>
    );
  }

  return (
    <Stack gap={6}>
      {/* Header */}
      <div>
        <Heading level={4}>Replication Blueprint</Heading>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-[#9B9B9B]">
          <span>{bp.clusters.length} cluster{bp.clusters.length !== 1 ? "s" : ""}</span>
          {modelUsed && (
            <>
              <span className="text-[#D4D0C8]">/</span>
              <span className="font-mono">{modelUsed}</span>
            </>
          )}
          {createdAt && (
            <>
              <span className="text-[#D4D0C8]">/</span>
              <span>{new Date(createdAt).toLocaleDateString()}</span>
            </>
          )}
        </div>
      </div>

      {/* Clusters */}
      <div className="space-y-4">
        {bp.clusters.map((cluster, i) => (
          <div
            key={i}
            className="rounded-lg border border-[#E8E5DE] bg-white p-5"
          >
            {/* Cluster header */}
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#F5F3EF] font-mono text-[11px] font-bold text-[#6B6B6B]">
                  {i + 1}
                </span>
                <span
                  className={[
                    "inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-medium",
                    STRATEGY_COLORS[cluster.test_strategy] ?? "bg-[#E8E5DE] text-[#6B6B6B]",
                  ].join(" ")}
                >
                  {cluster.test_strategy.replace(/_/g, " ")}
                </span>
                <span
                  className={[
                    "inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider",
                    TIER_COLORS[cluster.compute_tier] ?? "bg-[#E8E5DE] text-[#6B6B6B]",
                  ].join(" ")}
                >
                  {cluster.compute_tier}
                </span>
              </div>
            </div>

            {/* Claim IDs */}
            <div className="mb-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#9B9B9B] mb-1">
                Claims
              </div>
              <div className="flex flex-wrap gap-1">
                {cluster.claim_ids.map((cid) => (
                  <span
                    key={cid}
                    className="rounded border border-[#E8E5DE] bg-[#FAFAF8] px-1.5 py-0.5 font-mono text-[10px] text-[#6B6B6B]"
                    title={cid}
                  >
                    {cid.length > 12 ? cid.slice(0, 8) + "..." : cid}
                  </span>
                ))}
              </div>
            </div>

            {/* Minimum valid test */}
            {cluster.minimum_valid_test && (
              <div className="mb-3 rounded-md bg-[#F5F3EF] p-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#9B9B9B] mb-1">
                  Minimum Valid Test
                </div>
                <Text size="sm">{cluster.minimum_valid_test}</Text>
              </div>
            )}

            {/* Details grid */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {cluster.required_data.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#9B9B9B] mb-1">
                    Required Data
                  </div>
                  <ul className="space-y-0.5">
                    {cluster.required_data.map((d, j) => (
                      <li key={j} className="text-[12px] text-[#3D3D3D]">
                        {d}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {cluster.required_packages.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#9B9B9B] mb-1">
                    Packages
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {cluster.required_packages.map((pkg) => (
                      <span
                        key={pkg}
                        className="rounded border border-[#E8E5DE] bg-[#FAFAF8] px-1.5 py-0.5 font-mono text-[11px] text-[#6B6B6B]"
                      >
                        {pkg}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {cluster.expected_outputs.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#9B9B9B] mb-1">
                    Expected Outputs
                  </div>
                  <ul className="space-y-0.5">
                    {cluster.expected_outputs.map((o, j) => (
                      <li key={j} className="text-[12px] text-[#3D3D3D]">
                        {o}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Invalid shortcuts */}
            {cluster.invalid_shortcuts.length > 0 && (
              <div className="mt-3 rounded-md border border-[#9B2226]/20 bg-[#9B2226]/5 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#9B2226] mb-1">
                  Invalid Shortcuts
                </div>
                <ul className="space-y-0.5">
                  {cluster.invalid_shortcuts.map((s, j) => (
                    <li key={j} className="text-[12px] text-[#9B2226]/80">
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </Stack>
  );
}
