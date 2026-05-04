"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

interface Props {
  paperId: string;
  hasPdf: boolean;
  hasSims: boolean;
  counts: {
    claims: number;
    simulations: number;
    reproduced: number;
    contradicted: number;
    fragile: number;
  };
}

interface NavItem {
  key: string;
  label: string;
  href: string;
  count?: number;
  countColor?: string;
  show: boolean;
  group: "views" | "analysis" | "data";
}

export function PaperSidebar({ paperId, hasPdf, hasSims, counts }: Props) {
  const pathname = usePathname();

  const items: NavItem[] = [
    { key: "overview", label: "Overview", href: `/papers/${paperId}`, show: true, group: "views" },
    { key: "findings", label: "Findings", href: `/papers/${paperId}?tab=findings`, show: hasSims, group: "views", count: counts.contradicted > 0 ? counts.contradicted : undefined, countColor: "bg-[#9B2226] text-white" },
    { key: "annotated", label: "Annotated Paper", href: `/papers/${paperId}/annotated`, show: hasPdf, group: "views" },
    { key: "report", label: "Full Report", href: `/papers/${paperId}/report`, show: hasSims, count: counts.simulations, group: "views" },
    { key: "claims", label: "Claims", href: `/papers/${paperId}?tab=claims`, show: true, group: "analysis", count: counts.claims },
    { key: "simulations", label: "Simulations", href: `/papers/${paperId}?tab=simulations`, show: hasSims, group: "analysis", count: counts.simulations },
    { key: "code", label: "Code", href: `/papers/${paperId}?tab=code`, show: hasSims, group: "analysis" },
    { key: "evidence", label: "Evidence Graph", href: `/papers/${paperId}?tab=evidence`, show: true, group: "data" },
  ];

  function isActive(item: NavItem): boolean {
    if (item.href.includes("?tab=")) {
      const tab = item.href.split("?tab=")[1];
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        return pathname === `/papers/${paperId}` && params.get("tab") === tab;
      }
      return false;
    }
    return pathname === item.href;
  }

  const groups = [
    { key: "views", label: "Views" },
    { key: "analysis", label: "Analysis" },
    { key: "data", label: "Data" },
  ];

  return (
    <nav className="w-56 shrink-0 border-r border-[#E8E5DE] bg-[#FAFAF8] py-4 overflow-y-auto">
      {groups.map((group) => {
        const groupItems = items.filter((i) => i.show && i.group === group.key);
        if (groupItems.length === 0) return null;
        return (
          <div key={group.key} className="mb-4">
            <div className="px-4 pb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9B9B9B]">
              {group.label}
            </div>
            {groupItems.map((item) => {
              const active = isActive(item);
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={[
                    "flex items-center justify-between px-4 py-2 text-[13px] cursor-pointer transition-colors",
                    active
                      ? "bg-white font-semibold text-[#1A1A1A] border-r-2 border-r-[#4A6FA5]"
                      : "text-[#6B6B6B] hover:bg-white hover:text-[#1A1A1A]",
                  ].join(" ")}
                >
                  <span>{item.label}</span>
                  {item.count != null && (
                    <span
                      className={[
                        "inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 font-mono text-[10px] font-semibold tabular-nums",
                        item.countColor ?? (active ? "bg-[#1A1A1A] text-white" : "bg-[#E8E5DE] text-[#6B6B6B]"),
                      ].join(" ")}
                    >
                      {item.count}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        );
      })}

      {/* Verdict mini-summary */}
      {hasSims && (
        <div className="mx-4 mt-2 rounded-lg border border-[#E8E5DE] bg-white p-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9B9B9B] mb-2">Verdicts</div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[12px]">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#2D6A4F]" />
                Reproduced
              </span>
              <span className="font-mono font-semibold">{counts.reproduced}</span>
            </div>
            <div className="flex items-center justify-between text-[12px]">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#9B2226]" />
                Contradicted
              </span>
              <span className="font-mono font-semibold">{counts.contradicted}</span>
            </div>
            <div className="flex items-center justify-between text-[12px]">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#B07D2B]" />
                Fragile
              </span>
              <span className="font-mono font-semibold">{counts.fragile}</span>
            </div>
          </div>
          {/* Mini bar */}
          <div className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-[#E8E5DE]">
            {counts.reproduced > 0 && <div className="bg-[#2D6A4F]" style={{ width: `${(counts.reproduced / counts.claims) * 100}%` }} />}
            {counts.contradicted > 0 && <div className="bg-[#9B2226]" style={{ width: `${(counts.contradicted / counts.claims) * 100}%` }} />}
            {counts.fragile > 0 && <div className="bg-[#B07D2B]" style={{ width: `${(counts.fragile / counts.claims) * 100}%` }} />}
          </div>
        </div>
      )}
    </nav>
  );
}
