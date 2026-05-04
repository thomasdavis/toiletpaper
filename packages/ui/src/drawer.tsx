"use client";

import { type HTMLAttributes, type ReactNode, forwardRef, useEffect, useRef, useState } from "react";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPortal } = require("react-dom") as typeof import("react-dom");
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
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
      setMounted(true);
    }, []);

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

    if (!open || !mounted) return null;

    const content = (
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
                className="flex h-7 w-7 items-center justify-center rounded-[4px] text-[var(--color-ink-muted)] hover:bg-[var(--color-paper)] hover:text-[var(--color-ink)] cursor-pointer"
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

    return createPortal(content, document.body);
  },
);
Drawer.displayName = "Drawer";
