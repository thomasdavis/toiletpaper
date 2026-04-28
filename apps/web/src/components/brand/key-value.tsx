import type { ReactNode } from "react";

interface Pair {
  label: string;
  value: ReactNode;
  hint?: string;
}

interface Props {
  pairs: Pair[];
  /** Layout mode. `inline` uses a 2-column grid; `stacked` lists them vertically. */
  layout?: "inline" | "stacked";
  className?: string;
}

/**
 * A metadata definition list. Keys are uppercase tracked, values are
 * mono if numeric. Use for paper provenance, simulation parameters, etc.
 */
export function KeyValue({ pairs, layout = "inline", className }: Props) {
  return (
    <dl
      className={[
        layout === "inline"
          ? "grid grid-cols-1 gap-3 sm:grid-cols-2"
          : "flex flex-col gap-3",
        className ?? "",
      ].join(" ")}
    >
      {pairs.map((p) => (
        <div
          key={p.label}
          className="flex items-baseline justify-between gap-3 border-b border-dashed border-[#E8E5DE] pb-1.5"
        >
          <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9B9B9B]">
            {p.label}
            {p.hint && (
              <span className="ml-1 normal-case tracking-normal text-[#C8C3B8]">
                · {p.hint}
              </span>
            )}
          </dt>
          <dd className="text-right font-mono text-[13px] text-[#3D3D3D]">
            {p.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
