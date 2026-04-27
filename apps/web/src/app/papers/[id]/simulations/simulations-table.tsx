"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { SimulationRow } from "./page";

type Tab = "all" | "reproduced" | "contradicted" | "inconclusive" | "fragile";
type SortKey = "date" | "confidence" | "verdict";
type SortDir = "asc" | "desc";

const VERDICT_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  reproduced: { bg: "bg-[#D4EDE1]/30", border: "border-[#2D6A4F]/20", text: "text-[#2D6A4F]" },
  contradicted: { bg: "bg-[#F5D5D6]/30", border: "border-[#9B2226]/20", text: "text-[#9B2226]" },
  fragile: { bg: "bg-[#FFF3E0]/30", border: "border-[#E65100]/20", text: "text-[#E65100]" },
  inconclusive: { bg: "bg-[#F5ECD4]/30", border: "border-[#B07D2B]/20", text: "text-[#B07D2B]" },
};

function formatMethodName(method: string): string {
  return method
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface Props {
  rows: SimulationRow[];
  paperId: string;
}

export function SimulationsTable({ rows, paperId }: Props) {
  const [tab, setTab] = useState<Tab>("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const counts = useMemo(() => ({
    all: rows.length,
    reproduced: rows.filter((r) => r.verdict === "reproduced").length,
    contradicted: rows.filter((r) => r.verdict === "contradicted").length,
    inconclusive: rows.filter((r) => r.verdict === "inconclusive").length,
    fragile: rows.filter((r) => r.verdict === "fragile").length,
  }), [rows]);

  const filtered = useMemo(() => {
    let result = tab === "all" ? rows : rows.filter((r) => r.verdict === tab);

    result = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "date":
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case "confidence":
          cmp = (a.confidence ?? 0) - (b.confidence ?? 0);
          break;
        case "verdict":
          cmp = a.verdict.localeCompare(b.verdict);
          break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });

    return result;
  }, [rows, tab, sortKey, sortDir]);

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.all },
    { key: "contradicted", label: "Contradicted", count: counts.contradicted },
    { key: "reproduced", label: "Reproduced", count: counts.reproduced },
    { key: "inconclusive", label: "Inconclusive", count: counts.inconclusive },
    { key: "fragile", label: "Fragile", count: counts.fragile },
  ];

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  };

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-[#E8E5DE]">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
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

      {/* Sort controls */}
      <div className="mt-3 flex items-center gap-2 text-xs text-[#9B9B9B]">
        <span>Sort by:</span>
        {(["date", "confidence", "verdict"] as SortKey[]).map((key) => (
          <button
            key={key}
            onClick={() => handleSort(key)}
            className={`rounded-full px-3 py-1 transition-colors cursor-pointer ${
              sortKey === key
                ? "bg-[#1A1A1A] text-white"
                : "bg-[#F5F3EF] text-[#6B6B6B] hover:bg-[#E8E5DE]"
            }`}
          >
            {key.charAt(0).toUpperCase() + key.slice(1)}{sortIndicator(key)}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="mt-4 space-y-2">
        {filtered.length === 0 && (
          <p className="py-12 text-center text-sm text-[#9B9B9B]">No simulations in this category.</p>
        )}
        {filtered.map((row) => {
          const colors = VERDICT_COLORS[row.verdict] ?? VERDICT_COLORS.inconclusive;
          const isExpanded = expandedId === row.id;

          return (
            <div key={row.id} className={`rounded-lg border ${colors.border} ${colors.bg} overflow-hidden`}>
              <button
                onClick={() => setExpandedId(isExpanded ? null : row.id)}
                className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-white/50 cursor-pointer"
              >
                {/* Expand arrow */}
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs font-bold transition-transform ${isExpanded ? "rotate-90" : ""} ${colors.text} bg-white/60`}>
                  &#9654;
                </span>

                {/* Claim text (truncated) */}
                <span className="min-w-0 flex-1 truncate text-sm text-[#1A1A1A]">
                  {row.claimText.length > 100 ? row.claimText.slice(0, 100) + "..." : row.claimText}
                </span>

                {/* Method */}
                <span className="shrink-0 rounded bg-[#F5F3EF] px-2.5 py-1 text-xs font-medium text-[#3D3D3D]">
                  {formatMethodName(row.method)}
                </span>

                {/* Verdict badge */}
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${colors.text} ${colors.bg} border ${colors.border}`}>
                  {row.verdict}
                </span>

                {/* Confidence */}
                {row.confidence != null && (
                  <span className="shrink-0 font-mono text-xs text-[#6B6B6B]">
                    {(row.confidence * 100).toFixed(0)}%
                  </span>
                )}

                {/* Date */}
                <span className="shrink-0 text-xs text-[#9B9B9B]">
                  {new Date(row.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              </button>

              {isExpanded && (
                <div className="border-t border-[#E8E5DE] bg-white p-4">
                  <div className="space-y-4">
                    {/* Full claim text */}
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9B9B9B] mb-1">Claim</p>
                      <p className="text-sm leading-relaxed text-[#1A1A1A]">{row.claimText}</p>
                    </div>

                    {/* Result JSON */}
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9B9B9B] mb-1">Result</p>
                      <pre className="max-h-64 overflow-auto rounded-lg border border-[#E8E5DE] bg-[#FAFAF8] p-3 font-mono text-xs leading-relaxed text-[#3D3D3D]">
                        {JSON.stringify(row.result, null, 2)}
                      </pre>
                    </div>

                    {/* Links */}
                    <div className="flex gap-3">
                      <Link
                        href={`/papers/${paperId}/simulations/${row.id}`}
                        className="text-sm font-medium text-[#4A6FA5] hover:underline"
                      >
                        View full details
                      </Link>
                      <Link
                        href={`/papers/${paperId}`}
                        className="text-sm font-medium text-[#4A6FA5] hover:underline"
                      >
                        Back to paper
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
