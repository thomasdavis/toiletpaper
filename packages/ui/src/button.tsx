import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "rounded bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)]",
        secondary: "rounded border border-[var(--color-rule)] bg-white text-[var(--color-ink)] hover:bg-[var(--color-paper-warm)]",
        destructive: "rounded bg-[var(--color-error)] text-white hover:opacity-90",
        ghost: "rounded text-[var(--color-ink)] hover:bg-[var(--color-paper-warm)]",
        link: "text-[var(--color-primary)] underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 gap-1.5 px-3 text-xs",
        default: "h-10 gap-2 px-5 text-sm",
        lg: "h-12 gap-2.5 px-7 text-base",
        icon: "h-10 w-10 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  ),
);
Button.displayName = "Button";
