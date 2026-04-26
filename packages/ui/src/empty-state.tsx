import { type HTMLAttributes, type ReactNode, forwardRef } from "react";
import { cn } from "./cn";

export interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ className, icon, title, description, action, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex flex-col items-center justify-center py-16 text-center",
        className,
      )}
      {...props}
    >
      {icon && (
        <div className="mb-4 text-[var(--color-ink-faint)]">{icon}</div>
      )}
      <h3 className="font-[var(--font-serif)] text-lg font-semibold text-[var(--color-ink)]">
        {title}
      </h3>
      {description && (
        <p className="mt-1 max-w-sm font-[var(--font-sans)] text-sm text-[var(--color-ink-muted)]">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  ),
);
EmptyState.displayName = "EmptyState";
