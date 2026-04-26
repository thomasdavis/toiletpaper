import { type HTMLAttributes, forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./cn";

const labelVariants = cva(
  "font-[var(--font-sans)] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]",
  {
    variants: {
      size: {
        xs: "text-[10px]",
        sm: "text-xs",
        default: "text-xs",
        lg: "text-sm",
      },
      weight: {
        normal: "font-normal",
        medium: "font-medium",
        semibold: "font-semibold",
      },
    },
    defaultVariants: {
      size: "default",
      weight: "medium",
    },
  },
);

export type LabelProps = HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof labelVariants>;

export const Label = forwardRef<HTMLSpanElement, LabelProps>(
  ({ className, size, weight, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(labelVariants({ size, weight, className }))}
      {...props}
    />
  ),
);
Label.displayName = "Label";
