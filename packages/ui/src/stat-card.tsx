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
        "rounded-lg border border-[#E8E5DE] bg-white p-5 shadow-sm",
        className,
      )}
      {...props}
    >
      <span className="block text-[11px] font-semibold uppercase tracking-widest text-[#9B9B9B]">
        {label}
      </span>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-mono text-3xl font-bold tracking-tight text-[#1A1A1A]">
          {value}
        </span>
        {unit && (
          <span className="text-sm text-[#9B9B9B]">{unit}</span>
        )}
      </div>
      {trend && (
        <span
          className={cn(
            "mt-2 inline-flex items-center gap-1 font-mono text-xs font-medium",
            trend.direction === "up" && "text-[#2D6A4F]",
            trend.direction === "down" && "text-[#9B2226]",
            trend.direction === "flat" && "text-[#9B9B9B]",
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
