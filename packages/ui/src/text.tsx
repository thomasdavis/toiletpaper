import { type HTMLAttributes, forwardRef, type ElementType } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./cn";

const textVariants = cva("font-[var(--font-sans)]", {
  variants: {
    size: {
      xs: "text-xs",
      sm: "text-sm",
      base: "text-base",
      lg: "text-lg",
      xl: "text-xl",
    },
    weight: {
      normal: "font-normal",
      medium: "font-medium",
      semibold: "font-semibold",
      bold: "font-bold",
    },
    color: {
      default: "text-[var(--color-ink)]",
      light: "text-[var(--color-ink-light)]",
      muted: "text-[var(--color-ink-muted)]",
      faint: "text-[var(--color-ink-faint)]",
      primary: "text-[var(--color-primary)]",
      success: "text-[var(--color-success)]",
      warning: "text-[var(--color-warning)]",
      error: "text-[var(--color-error)]",
    },
    leading: {
      tight: "leading-tight",
      snug: "leading-snug",
      normal: "leading-normal",
      relaxed: "leading-relaxed",
    },
  },
  defaultVariants: {
    size: "base",
    weight: "normal",
    color: "default",
    leading: "normal",
  },
});

export type TextProps = HTMLAttributes<HTMLElement> &
  VariantProps<typeof textVariants> & {
    as?: ElementType;
  };

export const Text = forwardRef<HTMLElement, TextProps>(
  ({ className, size, weight, color, leading, as: Tag = "p", ...props }, ref) => (
    <Tag
      ref={ref}
      className={cn(textVariants({ size, weight, color, leading, className }))}
      {...props}
    />
  ),
);
Text.displayName = "Text";
