import { type HTMLAttributes, forwardRef } from "react";
import { cva } from "class-variance-authority";
import { cn } from "./cn";

const progressVariants = cva("h-2 rounded-full transition-all", {
  variants: {
    tone: {
      default: "bg-[var(--color-primary)]",
      success: "bg-[var(--color-success)]",
      warning: "bg-[var(--color-warning)]",
      error: "bg-[var(--color-error)]",
      reproduced: "bg-[var(--color-reproduced)]",
      contradicted: "bg-[var(--color-contradicted)]",
      fragile: "bg-[var(--color-fragile)]",
    },
  },
  defaultVariants: {
    tone: "default",
  },
});

type ProgressTone = "default" | "success" | "warning" | "error" | "reproduced" | "contradicted" | "fragile";

export interface ProgressBarProps extends HTMLAttributes<HTMLDivElement> {
  value: number; // 0-100
  color?: ProgressTone;
  showLabel?: boolean;
}

export const ProgressBar = forwardRef<HTMLDivElement, ProgressBarProps>(
  ({ className, value, color = "default", showLabel = false, ...props }, ref) => {
    const clamped = Math.max(0, Math.min(100, value));
    return (
      <div ref={ref} className={cn("flex items-center gap-3", className)} {...props}>
        <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-rule-faint)]">
          <div
            className={cn(progressVariants({ tone: color }))}
            style={{ width: `${clamped}%` }}
          />
        </div>
        {showLabel && (
          <span className="min-w-[3ch] text-right font-[var(--font-mono)] text-xs tabular-nums text-[var(--color-ink-muted)]">
            {Math.round(clamped)}%
          </span>
        )}
      </div>
    );
  },
);
ProgressBar.displayName = "ProgressBar";
