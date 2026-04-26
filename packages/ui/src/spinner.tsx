import { type HTMLAttributes, forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./cn";

const spinnerVariants = cva("animate-spin rounded-full border-2 border-current border-t-transparent", {
  variants: {
    size: {
      sm: "h-4 w-4",
      default: "h-6 w-6",
      lg: "h-8 w-8",
      xl: "h-12 w-12",
    },
    color: {
      default: "text-[var(--color-primary)]",
      muted: "text-[var(--color-ink-faint)]",
      white: "text-white",
    },
  },
  defaultVariants: {
    size: "default",
    color: "default",
  },
});

export type SpinnerProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof spinnerVariants>;

export const Spinner = forwardRef<HTMLDivElement, SpinnerProps>(
  ({ className, size, color, ...props }, ref) => (
    <div
      ref={ref}
      role="status"
      aria-label="Loading"
      className={cn(spinnerVariants({ size, color, className }))}
      {...props}
    />
  ),
);
Spinner.displayName = "Spinner";
