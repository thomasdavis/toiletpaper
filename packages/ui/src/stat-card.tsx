import { type HTMLAttributes, forwardRef } from "react";
import { cn } from "./cn";

export interface StatCardProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string | number;
  unit?: string;
  trend?: { direction: "up" | "down" | "flat"; value: string };
}

export const StatCard = forwardRef<HTMLDivElement, StatCardProps>(
  ({ className, label, value, unit, trend, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-[4px] border border-[var(--color-rule)] bg-white p-4 shadow-[var(--shadow-subtle)]",
        className,
      )}
      {...props}
    >
      <span className="block font-[var(--font-sans)] text-xs font-medium uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
        {label}
      </span>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="font-[var(--font-mono)] text-[30px] font-bold leading-tight text-[var(--color-ink)]">
          {value}
        </span>
        {unit && (
          <span className="font-[var(--font-sans)] text-sm text-[var(--color-ink-muted)]">
            {unit}
          </span>
        )}
      </div>
      {trend && (
        <span
          className={cn(
            "mt-1 inline-flex items-center gap-1 font-[var(--font-mono)] text-xs",
            trend.direction === "up" && "text-[var(--color-success)]",
            trend.direction === "down" && "text-[var(--color-error)]",
            trend.direction === "flat" && "text-[var(--color-ink-muted)]",
          )}
        >
          {trend.direction === "up" && "↑"}
          {trend.direction === "down" && "↓"}
          {trend.direction === "flat" && "→"}
          {trend.value}
        </span>
      )}
    </div>
  ),
);
StatCard.displayName = "StatCard";
