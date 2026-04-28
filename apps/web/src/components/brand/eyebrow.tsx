import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Color override (defaults to brand blue). */
  tone?: "blue" | "olive" | "amber" | "muted";
  className?: string;
}

const TONES: Record<NonNullable<Props["tone"]>, string> = {
  blue: "text-[#4A6FA5]",
  olive: "text-[#2D6A4F]",
  amber: "text-[#B07D2B]",
  muted: "text-[#9B9B9B]",
};

export function Eyebrow({ children, tone = "blue", className }: Props) {
  return (
    <p
      className={[
        "text-[11px] font-semibold uppercase tracking-[0.2em]",
        TONES[tone],
        className ?? "",
      ].join(" ")}
    >
      {children}
    </p>
  );
}
