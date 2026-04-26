import { type InputHTMLAttributes, forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./cn";

const inputVariants = cva(
  "w-full rounded-[4px] border bg-white px-3 font-[var(--font-sans)] text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      inputSize: {
        sm: "h-8 text-xs",
        default: "h-10",
        lg: "h-12 text-base",
      },
      error: {
        true: "border-[var(--color-error)] focus:ring-[var(--color-error)]/20 focus:border-[var(--color-error)]",
        false: "border-[var(--color-rule)]",
      },
    },
    defaultVariants: {
      inputSize: "default",
      error: false,
    },
  },
);

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size">,
    VariantProps<typeof inputVariants> {
  label?: string;
  hint?: string;
  errorMessage?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, inputSize, error, label, hint, errorMessage, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
    const hasError = error || !!errorMessage;

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label
            htmlFor={inputId}
            className="font-[var(--font-sans)] text-sm font-medium text-[var(--color-ink)]"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(inputVariants({ inputSize, error: hasError, className }))}
          {...props}
        />
        {errorMessage && (
          <span className="font-[var(--font-sans)] text-xs text-[var(--color-error)]">
            {errorMessage}
          </span>
        )}
        {hint && !errorMessage && (
          <span className="font-[var(--font-sans)] text-xs text-[var(--color-ink-muted)]">
            {hint}
          </span>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";
