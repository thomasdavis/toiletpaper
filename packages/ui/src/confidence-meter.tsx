import { type HTMLAttributes, forwardRef } from "react";
import { cn } from "./cn";

export interface ConfidenceMeterProps extends HTMLAttributes<HTMLDivElement> {
  value: number; // 0-100
  size?: "sm" | "md" | "lg";
}

function getColor(v: number): string {
  if (v >= 80) return "var(--color-reproduced)";
  if (v >= 60) return "var(--color-primary)";
  if (v >= 40) return "var(--color-fragile)";
  if (v >= 20) return "var(--color-warning)";
  return "var(--color-contradicted)";
}

const sizes = {
  sm: { track: "h-1.5", text: "text-[10px]" },
  md: { track: "h-2", text: "text-xs" },
  lg: { track: "h-3", text: "text-sm" },
};

export const ConfidenceMeter = forwardRef<HTMLDivElement, ConfidenceMeterProps>(
  ({ className, value, size = "md", ...props }, ref) => {
    const clamped = Math.max(0, Math.min(100, value));
    const color = getColor(clamped);
    const s = sizes[size];

    return (
      <div ref={ref} className={cn("flex items-center gap-2", className)} {...props}>
        <div
          className={cn(
            "relative flex-1 overflow-hidden rounded-full bg-[var(--color-rule-faint)]",
            s.track,
          )}
        >
          <div
            className={cn("h-full rounded-full transition-all", s.track)}
            style={{ width: `${clamped}%`, backgroundColor: color }}
          />
        </div>
        <span
          className={cn(
            "min-w-[3.5ch] text-right font-[var(--font-mono)] font-semibold tabular-nums",
            s.text,
          )}
          style={{ color }}
        >
          {Math.round(clamped)}%
        </span>
      </div>
    );
  },
);
ConfidenceMeter.displayName = "ConfidenceMeter";
