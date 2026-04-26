"use client";

import { type HTMLAttributes, type ReactNode, forwardRef, useEffect, useRef } from "react";
import { cn } from "./cn";

export interface DialogProps extends HTMLAttributes<HTMLDivElement> {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  footer?: ReactNode;
}

export const Dialog = forwardRef<HTMLDivElement, DialogProps>(
  ({ className, open, onClose, title, description, footer, children, ...props }, ref) => {
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
        className="fixed inset-0 z-50 flex items-center justify-center"
        onClick={(e) => {
          if (e.target === overlayRef.current) onClose();
        }}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/40" />

        {/* Panel */}
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          className={cn(
            "relative z-10 mx-4 w-full max-w-lg rounded-[8px] border border-[var(--color-rule)] bg-white shadow-[var(--shadow-elevated)]",
            className,
          )}
          {...props}
        >
          {/* Header */}
          {(title || description) && (
            <div className="border-b border-[var(--color-rule-faint)] px-6 py-4">
              {title && (
                <h2 className="font-[var(--font-serif)] text-lg font-bold text-[var(--color-ink)]">
                  {title}
                </h2>
              )}
              {description && (
                <p className="mt-1 font-[var(--font-sans)] text-sm text-[var(--color-ink-muted)]">
                  {description}
                </p>
              )}
            </div>
          )}

          {/* Body */}
          <div className="px-6 py-4">{children}</div>

          {/* Footer */}
          {footer && (
            <div className="flex justify-end gap-2 border-t border-[var(--color-rule-faint)] px-6 py-3">
              {footer}
            </div>
          )}

          {/* Close */}
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-[4px] text-[var(--color-ink-muted)] hover:bg-[var(--color-paper)] hover:text-[var(--color-ink)]"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      </div>
    );
  },
);
Dialog.displayName = "Dialog";
