"use client";

import { type HTMLAttributes, type ReactNode, forwardRef, useEffect, useRef } from "react";
import { cn } from "./cn";

export interface DrawerProps extends HTMLAttributes<HTMLDivElement> {
  open: boolean;
  onClose: () => void;
  side?: "left" | "right";
  title?: string;
  footer?: ReactNode;
}

export const Drawer = forwardRef<HTMLDivElement, DrawerProps>(
  ({ className, open, onClose, side = "right", title, footer, children, ...props }, ref) => {
    const overlayRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (!open) return;
      const handleKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") onClose();
      };
      document.addEventListener("keydown", handleKey);
      document.body.style.overflow = "hidden";
      return () => {
        document.removeEventListener("keydown", handleKey);
        document.body.style.overflow = "";
      };
    }, [open, onClose]);

    if (!open) return null;

    return (
      <div
        ref={overlayRef}
        className="fixed inset-0 z-50 flex"
        onClick={(e) => {
          if (e.target === overlayRef.current) onClose();
        }}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/40" />

        {/* Panel */}
        <div
          ref={ref}
          className={cn(
            "relative z-10 flex h-full w-full max-w-md flex-col border-[var(--color-rule)] bg-white shadow-[var(--shadow-elevated)]",
            side === "right" ? "ml-auto border-l" : "mr-auto border-r",
            className,
          )}
          {...props}
        >
          {/* Header */}
          {title && (
            <div className="flex items-center justify-between border-b border-[var(--color-rule-faint)] px-6 py-4">
              <h2 className="font-[var(--font-serif)] text-lg font-bold text-[var(--color-ink)]">
                {title}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-[4px] text-[var(--color-ink-muted)] hover:bg-[var(--color-paper)] hover:text-[var(--color-ink)]"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
          )}

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>

          {/* Footer */}
          {footer && (
            <div className="border-t border-[var(--color-rule-faint)] px-6 py-3">
              {footer}
            </div>
          )}
        </div>
      </div>
    );
  },
);
Drawer.displayName = "Drawer";
