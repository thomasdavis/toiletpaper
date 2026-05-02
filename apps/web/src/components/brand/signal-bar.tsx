import { VERDICT_DISPLAY, type VerdictSummary } from "@/lib/verdict";

interface Props {
  summary: VerdictSummary;
  /** When provided, drives the headline copy ("X of N claims tested"). */
  totalClaims?: number;
  className?: string;
}

const HEIGHT = "h-2.5";

/**
 * Two-row distribution bar (PRD-008) that splits *signal* verdicts
 * (reproduced / contradicted / fragile / inconclusive) from *meta*
 * verdicts (not_applicable / vacuous / system_error / untested).
 *
 * The headline number is "tested": signal-bucket simulations as a
 * fraction of total. The breakdown bars below are scaled to the same
 * total so users can see, at a glance, how much of the analysis was
 * actually load-bearing vs. filtered-out.
 */
export function SignalBar({ summary, totalClaims, className }: Props) {
  const total = summary.total === 0 ? 1 : summary.total;
  const pct = (n: number) => `${(n / total) * 100}%`;

  const signalSegments = (
    [
      ["reproduced", summary.signal.reproduced],
      ["contradicted", summary.signal.contradicted],
      ["fragile", summary.signal.fragile],
      ["inconclusive", summary.signal.inconclusive],
    ] as const
  ).filter(([, v]) => v > 0);

  const metaSegments = (
    [
      ["not_applicable", summary.meta.not_applicable],
      ["vacuous", summary.meta.vacuous],
      ["system_error", summary.meta.system_error],
      ["untested", summary.meta.untested],
    ] as const
  ).filter(([, v]) => v > 0);

  return (
    <div className={className}>
      {/* Headline */}
      <p className="text-sm leading-relaxed text-[#3D3D3D]">
        <span className="font-mono font-semibold tabular-nums text-[#1A1A1A]">
          {summary.signalCount}
        </span>{" "}
        of{" "}
        <span className="font-mono font-semibold tabular-nums text-[#1A1A1A]">
          {summary.total}
        </span>{" "}
        simulations produced a real verdict
        {typeof totalClaims === "number" && (
          <>
            {" "}
            (across <span className="tabular-nums">{totalClaims}</span> claim
            {totalClaims === 1 ? "" : "s"})
          </>
        )}
        .
      </p>

      {/* Signal bar */}
      <div className="mt-4">
        <div className="mb-1 flex items-baseline justify-between text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9B9B9B]">
          <span>Tested</span>
          <span className="tabular-nums text-[#3D3D3D]">
            {summary.signalCount}
            <span className="ml-1 text-[#9B9B9B]">/ {summary.total}</span>
          </span>
        </div>
        <div className={`flex w-full overflow-hidden rounded-full bg-[#F0EDE6] ${HEIGHT}`}>
          {signalSegments.map(([k, v]) => (
            <div
              key={k}
              title={`${VERDICT_DISPLAY[k].label}: ${v}`}
              style={{ width: pct(v), background: VERDICT_DISPLAY[k].color }}
            />
          ))}
        </div>
        {signalSegments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#6B6B6B]">
            {signalSegments.map(([k, v]) => (
              <span key={k} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: VERDICT_DISPLAY[k].color }}
                  aria-hidden
                />
                <span className="tabular-nums text-[#1A1A1A]">{v}</span>
                <span className="lowercase">{VERDICT_DISPLAY[k].label}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Meta bar */}
      <div className="mt-5">
        <div className="mb-1 flex items-baseline justify-between text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9B9B9B]">
          <span>Filtered out</span>
          <span className="tabular-nums text-[#3D3D3D]">
            {summary.metaCount}
            <span className="ml-1 text-[#9B9B9B]">/ {summary.total}</span>
          </span>
        </div>
        <div className={`flex w-full overflow-hidden rounded-full bg-[#F0EDE6] ${HEIGHT}`}>
          {metaSegments.map(([k, v]) => (
            <div
              key={k}
              title={`${VERDICT_DISPLAY[k].label}: ${v}`}
              style={{ width: pct(v), background: VERDICT_DISPLAY[k].color }}
            />
          ))}
        </div>
        {metaSegments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#6B6B6B]">
            {metaSegments.map(([k, v]) => (
              <span key={k} className="flex items-center gap-1.5" title={VERDICT_DISPLAY[k].description}>
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: VERDICT_DISPLAY[k].color }}
                  aria-hidden
                />
                <span className="tabular-nums text-[#1A1A1A]">{v}</span>
                <span className="lowercase">{VERDICT_DISPLAY[k].label}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
