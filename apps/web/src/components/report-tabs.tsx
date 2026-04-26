"use client";

import { useState } from "react";
import type { ReportClaim } from "@/app/papers/[id]/report/page";

type Tab = "all" | "contradicted" | "reproduced" | "inconclusive" | "untested";

const VERDICT_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  reproduced: { bg: "bg-[#D4EDE1]/30", border: "border-[#2D6A4F]/20", text: "text-[#2D6A4F]", dot: "bg-[#2D6A4F]" },
  contradicted: { bg: "bg-[#F5D5D6]/30", border: "border-[#9B2226]/20", text: "text-[#9B2226]", dot: "bg-[#9B2226]" },
  fragile: { bg: "bg-[#FFF3E0]/30", border: "border-[#E65100]/20", text: "text-[#E65100]", dot: "bg-[#E65100]" },
  inconclusive: { bg: "bg-[#F5ECD4]/30", border: "border-[#B07D2B]/20", text: "text-[#B07D2B]", dot: "bg-[#B07D2B]" },
  untested: { bg: "bg-[#F5F3EF]", border: "border-[#E8E5DE]", text: "text-[#9B9B9B]", dot: "bg-[#9B9B9B]" },
};

interface Props {
  claims: ReportClaim[];
  counts: { total: number; reproduced: number; contradicted: number; inconclusive: number; untested: number };
}

export function ReportTabs({ claims, counts }: Props) {
  const [tab, setTab] = useState<Tab>("contradicted");

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "contradicted", label: "Contradicted", count: counts.contradicted },
    { key: "reproduced", label: "Reproduced", count: counts.reproduced },
    { key: "inconclusive", label: "Inconclusive", count: counts.inconclusive },
    { key: "untested", label: "Untested", count: counts.untested },
    { key: "all", label: "All Claims", count: counts.total },
  ];

  const filtered = tab === "all" ? claims : claims.filter((c) => c.verdict === tab);

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-[#E8E5DE]">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.key
                ? "border-b-2 border-[#1A1A1A] text-[#1A1A1A]"
                : "text-[#9B9B9B] hover:text-[#3D3D3D]"
            }`}
          >
            {t.label}
            <span className={`ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold ${
              tab === t.key ? "bg-[#1A1A1A] text-white" : "bg-[#E8E5DE] text-[#6B6B6B]"
            }`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Claims list */}
      <div className="mt-4 space-y-3">
        {filtered.length === 0 && (
          <p className="py-12 text-center text-sm text-[#9B9B9B]">No claims in this category.</p>
        )}
        {filtered.map((claim) => (
          <ClaimRow key={claim.id} claim={claim} />
        ))}
      </div>
    </div>
  );
}

function ClaimRow({ claim }: { claim: ReportClaim }) {
  const [expanded, setExpanded] = useState(false);
  const colors = VERDICT_COLORS[claim.verdict] ?? VERDICT_COLORS.untested;

  // Get the first simulation's reason for the always-visible excerpt
  const firstReason = claim.simulations.length > 0 ? claim.simulations[0].reason : undefined;

  return (
    <div className={`rounded-lg border ${colors.border} ${colors.bg} overflow-hidden transition-shadow hover:shadow-md`}>
      {/* Summary row -- always visible, entire row is clickable */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-white/50 cursor-pointer"
      >
        {/* Expand arrow -- left-aligned, more visible */}
        <span className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs font-bold transition-transform ${expanded ? "rotate-90" : ""} ${colors.text} bg-white/60`}>
          &#9654;
        </span>

        {/* Verdict dot */}
        <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${colors.dot}`} />

        <div className="min-w-0 flex-1">
          <p className="text-sm leading-relaxed text-[#1A1A1A]">{claim.text}</p>

          {/* Always-visible reason excerpt */}
          {firstReason && (
            <p className="mt-1.5 text-xs leading-relaxed text-[#6B6B6B]">
              {firstReason.slice(0, 200)}
              {firstReason.length > 200 ? "..." : ""}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${colors.text} ${colors.bg} border ${colors.border}`}>
            {claim.verdict}
          </span>
          {claim.confidence != null && (
            <span className="text-xs text-[#9B9B9B]">ext. {(claim.confidence * 100).toFixed(0)}%</span>
          )}
        </div>
      </button>

      {/* Conflicting verdicts warning */}
      {claim.conflicting && (
        <div className="mx-4 mb-3 rounded border border-[#B07D2B]/30 bg-[#F5ECD4]/40 px-3 py-2 text-xs text-[#B07D2B]">
          Conflicting verdicts: simulations for this claim produced both reproduced and contradicted results. Showing the most recent verdict.
        </div>
      )}

      {/* Expanded details -- clearly differentiated */}
      {expanded && claim.simulations.length > 0 && (
        <div className="border-t border-[#E8E5DE] bg-white">
          <div className="ml-12 space-y-4 p-4">
            {claim.simulations.map((sim, i) => (
              <div key={i} className="rounded-lg border border-[#E8E5DE] bg-[#FAFAF8] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-widest text-[#9B9B9B]">{sim.method}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${VERDICT_COLORS[sim.verdict]?.text ?? "text-[#9B9B9B]"}`}>
                    {sim.verdict}
                  </span>
                </div>

                {sim.reason && (
                  <div className="rounded border border-[#E8E5DE] bg-white p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9B9B9B] mb-1">Why</p>
                    <p className="text-sm leading-relaxed text-[#3D3D3D]">{sim.reason}</p>
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  {sim.measured != null && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9B9B9B]">Measured</p>
                      <p className="mt-0.5 font-mono text-sm font-semibold text-[#1A1A1A]">{sim.measured}</p>
                    </div>
                  )}
                  {sim.expected != null && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9B9B9B]">Expected</p>
                      <p className="mt-0.5 font-mono text-sm font-semibold text-[#1A1A1A]">{sim.expected}</p>
                    </div>
                  )}
                  {sim.fittedExponent != null && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9B9B9B]">Fitted Exponent</p>
                      <p className="mt-0.5 font-mono text-sm font-semibold text-[#1A1A1A]">{sim.fittedExponent}</p>
                    </div>
                  )}
                  {sim.expectedExponent != null && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9B9B9B]">Expected Exponent</p>
                      <p className="mt-0.5 font-mono text-sm font-semibold text-[#1A1A1A]">{sim.expectedExponent}</p>
                    </div>
                  )}
                </div>

                {sim.confidence != null && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9B9B9B]">Verdict Confidence</p>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-2 flex-1 max-w-48 rounded-full bg-[#E8E5DE]">
                        <div
                          className={`h-2 rounded-full ${sim.verdict === "reproduced" ? "bg-[#2D6A4F]" : sim.verdict === "contradicted" ? "bg-[#9B2226]" : "bg-[#B07D2B]"}`}
                          style={{ width: `${sim.confidence * 100}%` }}
                        />
                      </div>
                      <span className="font-mono text-xs text-[#6B6B6B]">{(sim.confidence * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                )}

                {sim.llmAnalysis && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9B9B9B] mb-1">Detailed Analysis</p>
                    <p className="text-xs leading-relaxed text-[#6B6B6B]">{sim.llmAnalysis}</p>
                  </div>
                )}

                {sim.simulationFile && (
                  <p className="text-xs text-[#9B9B9B]">
                    Simulation: <code className="rounded bg-[#F5F3EF] px-1.5 py-0.5 font-mono text-[#3D3D3D]">{sim.simulationFile}</code>
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Untested claims -- no expansion needed */}
      {expanded && claim.simulations.length === 0 && (
        <div className="border-t border-[#E8E5DE] bg-white">
          <div className="ml-12 p-4">
            <p className="text-sm text-[#9B9B9B]">
              This claim was not tested. It may be too abstract, non-quantitative, or outside the scope of available simulation methods.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
