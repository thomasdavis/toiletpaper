"use client";

import { type HTMLAttributes, type ReactNode, forwardRef, useState } from "react";
import { cn } from "./cn";

/* ---- Sidebar shell ---- */

export interface SidebarProps extends HTMLAttributes<HTMLElement> {
  collapsed?: boolean;
  onToggle?: () => void;
}

export const Sidebar = forwardRef<HTMLElement, SidebarProps>(
  ({ className, collapsed = false, children, ...props }, ref) => (
    <aside
      ref={ref}
      className={cn(
        "flex flex-col border-r border-[var(--color-rule)] bg-white transition-[width] duration-200",
        collapsed ? "w-14" : "w-60",
        className,
      )}
      {...props}
    >
      {children}
    </aside>
  ),
);
Sidebar.displayName = "Sidebar";

/* ---- Section ---- */

export interface SidebarSectionProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
}

export const SidebarSection = forwardRef<HTMLDivElement, SidebarSectionProps>(
  ({ className, title, children, ...props }, ref) => (
    <div ref={ref} className={cn("px-3 py-2", className)} {...props}>
      {title && (
        <span className="mb-1 block px-2 font-[var(--font-sans)] text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-faint)]">
          {title}
        </span>
      )}
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  ),
);
SidebarSection.displayName = "SidebarSection";

/* ---- Item ---- */

export interface SidebarItemProps extends HTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  icon?: ReactNode;
}

export const SidebarItem = forwardRef<HTMLButtonElement, SidebarItemProps>(
  ({ className, active, icon, children, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      className={cn(
        "flex w-full items-center gap-2 rounded-[4px] px-2 py-1.5 text-left font-[var(--font-sans)] text-sm transition-colors",
        active
          ? "bg-[var(--color-primary-faint)] font-medium text-[var(--color-primary)]"
          : "text-[var(--color-ink-light)] hover:bg-[var(--color-paper)]",
        className,
      )}
      {...props}
    >
      {icon && <span className="shrink-0 text-base">{icon}</span>}
      {children}
    </button>
  ),
);
SidebarItem.displayName = "SidebarItem";
