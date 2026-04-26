import { type HTMLAttributes, forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./cn";

const alertVariants = cva(
  "flex items-start gap-3 rounded border p-4 text-sm leading-relaxed",
  {
    variants: {
      variant: {
        info: "border-[var(--color-info)]/20 bg-[var(--color-info-light)] text-[var(--color-info)]",
        success: "border-[var(--color-success)]/20 bg-[var(--color-success-light)] text-[var(--color-success)]",
        warning: "border-[var(--color-warning)]/20 bg-[var(--color-warning-light)] text-[var(--color-warning)]",
        error: "border-[var(--color-error)]/20 bg-[var(--color-error-light)] text-[var(--color-error)]",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  },
);

const alertIcons: Record<string, string> = {
  info: "i",
  success: "✓",
  warning: "!",
  error: "✗",
};

export interface AlertProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  title?: string;
}

export const Alert = forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant, title, children, ...props }, ref) => {
    const v = variant ?? "info";
    return (
      <div
        ref={ref}
        role="alert"
        className={cn(alertVariants({ variant, className }))}
        {...props}
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current/30 text-xs font-bold leading-none">
          {alertIcons[v]}
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          {title && <p className="mb-1 font-semibold leading-tight">{title}</p>}
          <div className="opacity-90">{children}</div>
        </div>
      </div>
    );
  },
);
Alert.displayName = "Alert";
