import { type TextareaHTMLAttributes, forwardRef } from "react";
import { cn } from "./cn";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  errorMessage?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, hint, errorMessage, id, ...props }, ref) => {
    const textareaId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label
            htmlFor={textareaId}
            className="font-[var(--font-sans)] text-sm font-medium text-[var(--color-ink)]"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={cn(
            "min-h-[100px] w-full rounded-[4px] border bg-white px-3 py-2 font-[var(--font-sans)] text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] transition-colors focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 disabled:cursor-not-allowed disabled:opacity-50",
            errorMessage
              ? "border-[var(--color-error)] focus:ring-[var(--color-error)]/20 focus:border-[var(--color-error)]"
              : "border-[var(--color-rule)]",
            className,
          )}
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
Textarea.displayName = "Textarea";
