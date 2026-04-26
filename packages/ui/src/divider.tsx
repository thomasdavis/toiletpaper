import { type HTMLAttributes, forwardRef } from "react";
import { cn } from "./cn";

export interface DividerProps extends HTMLAttributes<HTMLDivElement> {
  label?: string;
}

export const Divider = forwardRef<HTMLDivElement, DividerProps>(
  ({ className, label, ...props }, ref) => {
    if (label) {
      return (
        <div
          ref={ref}
          className={cn("flex items-center gap-4 py-2", className)}
          {...props}
        >
          <div className="h-px flex-1 bg-[var(--color-rule-faint)]" />
          <span className="font-[var(--font-sans)] text-xs font-medium uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
            {label}
          </span>
          <div className="h-px flex-1 bg-[var(--color-rule-faint)]" />
        </div>
      );
    }
    return (
      <div
        ref={ref}
        className={cn("my-4 h-px w-full bg-[var(--color-rule-faint)]", className)}
        {...props}
      />
    );
  },
);
Divider.displayName = "Divider";
