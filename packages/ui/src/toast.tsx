"use client";

import { type HTMLAttributes, forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./cn";

const toastVariants = cva(
  "pointer-events-auto flex items-center gap-3 rounded-[4px] border px-4 py-3 font-[var(--font-sans)] text-sm shadow-[var(--shadow-medium)] transition-all",
  {
    variants: {
      variant: {
        default: "border-[var(--color-rule)] bg-white text-[var(--color-ink)]",
        success:
          "border-[var(--color-success)]/20 bg-[var(--color-success-light)] text-[var(--color-success)]",
        error:
          "border-[var(--color-error)]/20 bg-[var(--color-error-light)] text-[var(--color-error)]",
        warning:
          "border-[var(--color-warning)]/20 bg-[var(--color-warning-light)] text-[var(--color-warning)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface ToastProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof toastVariants> {
  onClose?: () => void;
}

export const Toast = forwardRef<HTMLDivElement, ToastProps>(
  ({ className, variant, onClose, children, ...props }, ref) => (
    <div
      ref={ref}
      role="status"
      className={cn(toastVariants({ variant, className }))}
      {...props}
    >
      <div className="flex-1">{children}</div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 opacity-50 hover:opacity-100"
          aria-label="Dismiss"
        >
          ✕
        </button>
      )}
    </div>
  ),
);
Toast.displayName = "Toast";
