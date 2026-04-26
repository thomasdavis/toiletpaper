import { type HTMLAttributes, type ReactNode, forwardRef, Children } from "react";
import { cn } from "./cn";

export interface BreadcrumbProps extends HTMLAttributes<HTMLElement> {
  separator?: ReactNode;
}

export const Breadcrumb = forwardRef<HTMLElement, BreadcrumbProps>(
  ({ className, separator = "/", children, ...props }, ref) => {
    const items = Children.toArray(children);
    return (
      <nav
        ref={ref}
        aria-label="Breadcrumb"
        className={cn(
          "flex items-center gap-1.5 font-[var(--font-sans)] text-sm",
          className,
        )}
        {...props}
      >
        {items.map((child, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && (
              <span className="text-[var(--color-ink-faint)]" aria-hidden="true">
                {separator}
              </span>
            )}
            <span
              className={cn(
                i === items.length - 1
                  ? "font-medium text-[var(--color-ink)]"
                  : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]",
              )}
            >
              {child}
            </span>
          </span>
        ))}
      </nav>
    );
  },
);
Breadcrumb.displayName = "Breadcrumb";
