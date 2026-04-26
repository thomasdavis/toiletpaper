import { type HTMLAttributes } from "react";
import { cn } from "./cn";

export interface LifecycleStageProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  reached: boolean;
  current?: boolean;
}

export function LifecycleStage({
  className,
  label,
  reached,
  current,
  ...props
}: LifecycleStageProps) {
  return (
    <div
      className={cn("flex items-center gap-2", className)}
      {...props}
    >
      <div
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors",
          reached
            ? "border-[var(--color-reproduced)] bg-[var(--color-reproduced)] text-white"
            : "border-[var(--color-rule)] bg-white text-[var(--color-ink-faint)]",
          current && !reached && "border-[var(--color-primary)] text-[var(--color-primary)]",
        )}
      >
        {reached ? "✓" : "•"}
      </div>
      <span
        className={cn(
          "font-[var(--font-sans)] text-sm",
          reached ? "font-medium text-[var(--color-ink)]" : "text-[var(--color-ink-muted)]",
          current && !reached && "font-medium text-[var(--color-primary)]",
        )}
      >
        {label}
      </span>
    </div>
  );
}
