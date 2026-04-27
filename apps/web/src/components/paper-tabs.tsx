import Link from "next/link";

type Tab = "overview" | "report" | "annotated" | "simulations";

interface Props {
  paperId: string;
  active: Tab;
  /** Show Annotated tab (only meaningful when a PDF/MD is attached). */
  hasPdf: boolean;
  /** Show Report + Simulations tabs (only meaningful once sims have run). */
  hasSims: boolean;
  counts?: {
    claims?: number;
    simulations?: number;
  };
}

interface TabDef {
  key: Tab;
  label: string;
  href: string;
  count?: number;
  show: boolean;
  icon: React.ReactNode;
}

export function PaperTabs({ paperId, active, hasPdf, hasSims, counts }: Props) {
  const tabs: TabDef[] = [
    {
      key: "overview",
      label: "Overview",
      href: `/papers/${paperId}`,
      count: counts?.claims,
      show: true,
      icon: (
        <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
          <path
            d="M2.5 3h11M2.5 8h11M2.5 13h7"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      ),
    },
    {
      key: "report",
      label: "Report",
      href: `/papers/${paperId}/report`,
      count: counts?.simulations,
      show: hasSims,
      icon: (
        <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
          <path
            d="M3 2h7l3 3v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M5 9h6M5 11.5h4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      ),
    },
    {
      key: "annotated",
      label: "Annotated",
      href: `/papers/${paperId}/annotated`,
      show: hasPdf,
      icon: (
        <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
          <path
            d="M3 2.5h7l3 3v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M10.5 6.5a2 2 0 1 0-3 1.7l-2.3 2.3a.7.7 0 1 0 1 1l2.3-2.3a2 2 0 0 0 2-2.7Z"
            fill="currentColor"
          />
        </svg>
      ),
    },
    {
      key: "simulations",
      label: "Simulations",
      href: `/papers/${paperId}/simulations`,
      count: counts?.simulations,
      show: hasSims,
      icon: (
        <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
          <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="8" cy="8" r="1.5" fill="currentColor" />
          <path
            d="M8 1.5v2M8 12.5v2M14.5 8h-2M3.5 8h-2"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      ),
    },
  ];

  const visible = tabs.filter((t) => t.show);

  return (
    <nav
      className="sticky top-0 z-20 -mx-4 mb-6 border-b border-[#E8E5DE] bg-[#FAFAF8]/90 px-4 backdrop-blur"
      aria-label="Paper sections"
    >
      <div className="flex gap-1 overflow-x-auto">
        {visible.map((t) => {
          const isActive = t.key === active;
          return (
            <Link
              key={t.key}
              href={t.href}
              aria-current={isActive ? "page" : undefined}
              className={[
                "group relative flex shrink-0 items-center gap-2 px-4 py-3 text-sm font-medium transition-colors",
                isActive
                  ? "text-[#1A1A1A]"
                  : "text-[#6B6B6B] hover:text-[#1A1A1A]",
              ].join(" ")}
            >
              <span
                className={[
                  "flex h-5 w-5 items-center justify-center transition-colors",
                  isActive ? "text-[#4A6FA5]" : "text-[#9B9B9B] group-hover:text-[#3D3D3D]",
                ].join(" ")}
              >
                {t.icon}
              </span>
              <span>{t.label}</span>
              {typeof t.count === "number" && (
                <span
                  className={[
                    "ml-0.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 font-mono text-[11px] font-semibold tabular-nums",
                    isActive
                      ? "bg-[#1A1A1A] text-white"
                      : "bg-[#E8E5DE] text-[#6B6B6B] group-hover:bg-[#D4D0C8]",
                  ].join(" ")}
                >
                  {t.count}
                </span>
              )}
              <span
                className={[
                  "absolute inset-x-3 -bottom-px h-0.5 rounded-full transition-all",
                  isActive
                    ? "bg-[#4A6FA5] opacity-100"
                    : "bg-transparent opacity-0",
                ].join(" ")}
                aria-hidden
              />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
