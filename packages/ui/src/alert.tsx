import { type HTMLAttributes, forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./cn";

const alertVariants = cva(
  "flex gap-3 rounded-[4px] border p-4 font-[var(--font-sans)] text-sm",
  {
    variants: {
      variant: {
        info: "border-[var(--color-info)]/20 bg-[var(--color-info-light)] text-[var(--color-info)]",
        success:
          "border-[var(--color-success)]/20 bg-[var(--color-success-light)] text-[var(--color-success)]",
        warning:
          "border-[var(--color-warning)]/20 bg-[var(--color-warning-light)] text-[var(--color-warning)]",
        error:
          "border-[var(--color-error)]/20 bg-[var(--color-error-light)] text-[var(--color-error)]",
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
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current/30 text-xs font-bold">
          {alertIcons[v]}
        </span>
        <div className="flex-1">
          {title && <p className="mb-1 font-semibold">{title}</p>}
          <div className="leading-relaxed opacity-90">{children}</div>
        </div>
      </div>
    );
  },
);
Alert.displayName = "Alert";
