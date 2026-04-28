interface Segment {
  label: string;
  value: number;
  color: string;
}

interface Props {
  segments: Segment[];
  /** Total used for percentage; defaults to the sum of values. */
  total?: number;
  /** Show count + label markers below the bar. */
  showLegend?: boolean;
  height?: "sm" | "md" | "lg";
  className?: string;
}

const HEIGHTS = {
  sm: "h-1.5",
  md: "h-2.5",
  lg: "h-3.5",
} as const;

/**
 * A single segmented bar showing the distribution of verdicts (or any
 * categorical breakdown). Filters out zero-value segments so the bar
 * stays clean at small data sizes.
 */
export function DistributionBar({
  segments,
  total,
  showLegend = true,
  height = "md",
  className,
}: Props) {
  const sum = total ?? segments.reduce((s, x) => s + x.value, 0);
  const live = segments.filter((s) => s.value > 0);

  return (
    <div className={className}>
      <div
        className={[
          "flex w-full overflow-hidden rounded-full bg-[#F0EDE6]",
          HEIGHTS[height],
        ].join(" ")}
      >
        {live.map((s) => (
          <div
            key={s.label}
            style={{
              width: sum > 0 ? `${(s.value / sum) * 100}%` : "0%",
              background: s.color,
            }}
            title={`${s.label}: ${s.value}`}
          />
        ))}
      </div>
      {showLegend && live.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
          {live.map((s) => (
            <span
              key={s.label}
              className="flex items-center gap-1.5 text-[#6B6B6B]"
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: s.color }}
                aria-hidden
              />
              <span className="tabular-nums text-[#3D3D3D]">{s.value}</span>
              <span className="lowercase">{s.label}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
