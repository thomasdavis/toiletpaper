import type { ReactNode } from "react";

type Tone =
  | "neutral"
  | "blue"
  | "green"
  | "red"
  | "amber"
  | "muted";

const TONES: Record<Tone, string> = {
  neutral: "bg-[#E8E5DE] text-[#3D3D3D]",
  blue: "bg-[#DCE6F2] text-[#2E4A6F]",
  green: "bg-[#D4EDE1] text-[#2D6A4F]",
  red: "bg-[#F5D5D6] text-[#9B2226]",
  amber: "bg-[#F5ECD4] text-[#B07D2B]",
  muted: "bg-[#F0EDE6] text-[#9B9B9B]",
};

interface Props {
  children: ReactNode;
  /** Optional small numeric badge appended after the label. */
  count?: number;
  tone?: Tone;
  /** Small leading dot indicator. */
  dot?: boolean;
  className?: string;
}

/**
 * A compact rounded label with optional count and dot. Used for
 * verdict tags, contextual chips, and stat sub-labels.
 */
export function Pill({ children, count, tone = "neutral", dot, className }: Props) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tabular-nums",
        TONES[tone],
        className ?? "",
      ].join(" ")}
    >
      {dot && (
        <span
          className="inline-block h-1.5 w-1.5 rounded-full bg-current opacity-75"
          aria-hidden
        />
      )}
      <span>{children}</span>
      {typeof count === "number" && (
        <span className="rounded-full bg-white/50 px-1.5 font-mono text-[10px]">
          {count}
        </span>
      )}
    </span>
  );
}
