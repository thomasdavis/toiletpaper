import { type HTMLAttributes, type ReactNode, forwardRef } from "react";
import { cn } from "./cn";

export interface NavBarProps extends HTMLAttributes<HTMLElement> {
  brand?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}

export const NavBar = forwardRef<HTMLElement, NavBarProps>(
  ({ className, brand, children, actions, ...props }, ref) => (
    <nav
      ref={ref}
      className={cn(
        "border-b border-[var(--color-rule)] bg-white",
        className,
      )}
      {...props}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        {brand && (
          <span className="font-[var(--font-serif)] text-lg font-bold tracking-tight text-[var(--color-ink)]">
            {brand}
          </span>
        )}
        <div className="flex items-center gap-4 font-[var(--font-sans)] text-sm text-[var(--color-ink-muted)]">
          {children}
        </div>
        {actions && <div className="ml-auto flex items-center gap-3">{actions}</div>}
      </div>
    </nav>
  ),
);
NavBar.displayName = "NavBar";
