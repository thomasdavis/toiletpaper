"use client";

import { type HTMLAttributes, forwardRef, useState, useCallback } from "react";
import { cn } from "./cn";

export interface Tab {
  id: string;
  label: string;
  disabled?: boolean;
}

export interface TabGroupProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  tabs: Tab[];
  value?: string;
  defaultValue?: string;
  onChange?: (id: string) => void;
}

export const TabGroup = forwardRef<HTMLDivElement, TabGroupProps>(
  ({ className, tabs, value, defaultValue, onChange, ...props }, ref) => {
    const [internal, setInternal] = useState(defaultValue ?? tabs[0]?.id ?? "");
    const active = value ?? internal;

    const handleClick = useCallback(
      (id: string) => {
        setInternal(id);
        onChange?.(id);
      },
      [onChange],
    );

    return (
      <div
        ref={ref}
        role="tablist"
        className={cn(
          "flex border-b border-[var(--color-rule)]",
          className,
        )}
        {...props}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            disabled={tab.disabled}
            onClick={() => handleClick(tab.id)}
            className={cn(
              "relative px-4 py-2 font-[var(--font-sans)] text-sm transition-colors",
              active === tab.id
                ? "font-medium text-[var(--color-primary)]"
                : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]",
              tab.disabled && "pointer-events-none opacity-40",
            )}
          >
            {tab.label}
            {active === tab.id && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 bg-[var(--color-primary)]" />
            )}
          </button>
        ))}
      </div>
    );
  },
);
TabGroup.displayName = "TabGroup";
