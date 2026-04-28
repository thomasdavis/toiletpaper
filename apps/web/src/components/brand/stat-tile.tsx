import type { ReactNode } from "react";

interface Props {
  label: string;
  value: ReactNode;
  /** Small caption rendered under the value, e.g. "+3 today". */
  caption?: string;
  /** Color tone for the value. */
  tone?: "default" | "green" | "red" | "amber" | "blue";
  /** Make the tile interactive (hover lift). */
  interactive?: boolean;
  className?: string;
}

const VALUE_TONES = {
  default: "text-[#1A1A1A]",
  green: "text-[#2D6A4F]",
  red: "text-[#9B2226]",
  amber: "text-[#B07D2B]",
  blue: "text-[#4A6FA5]",
} as const;

const BORDER_TONES = {
  default: "border-[#E8E5DE] bg-white",
  green: "border-[#2D6A4F]/25 bg-[#D4EDE1]/25",
  red: "border-[#9B2226]/25 bg-[#F5D5D6]/25",
  amber: "border-[#B07D2B]/25 bg-[#F5ECD4]/25",
  blue: "border-[#4A6FA5]/25 bg-[#DCE6F2]/25",
} as const;

/**
 * Branded stat tile — perforated top edge, tone-aware accent, mono
 * value. A drop-in replacement for the bare StatCard in @toiletpaper/ui
 * for places where we want the brand fingerprint.
 */
export function StatTile({
  label,
  value,
  caption,
  tone = "default",
  interactive = false,
  className,
}: Props) {
  return (
    <div
      className={[
        "relative rounded-lg border p-5 shadow-sm transition-all",
        BORDER_TONES[tone],
        interactive ? "hover:-translate-y-0.5 hover:shadow-md" : "",
        className ?? "",
      ].join(" ")}
    >
      <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9B9B9B]">
        {label}
      </span>
      <span
        className={[
          "mt-2 block font-mono text-3xl font-bold tracking-tight tabular-nums",
          VALUE_TONES[tone],
        ].join(" ")}
      >
        {value}
      </span>
      {caption && (
        <span className="mt-1 block text-[11px] text-[#6B6B6B]">{caption}</span>
      )}
    </div>
  );
}
