import { type HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./cn";

const codeVariants = cva("font-[var(--font-mono)]", {
  variants: {
    variant: {
      inline:
        "rounded-sm bg-[var(--color-paper-warm)] px-1.5 py-0.5 text-sm text-[var(--color-ink-light)] border border-[var(--color-rule-faint)]",
      block:
        "block overflow-x-auto rounded-none border border-[var(--color-rule)] bg-[var(--color-paper)] p-4 text-sm leading-relaxed text-[var(--color-ink-light)]",
    },
  },
  defaultVariants: {
    variant: "inline",
  },
});

export type CodeProps = HTMLAttributes<HTMLElement> &
  VariantProps<typeof codeVariants>;

export function Code({ className, variant, ...props }: CodeProps) {
  if (variant === "block") {
    return (
      <pre className={cn(codeVariants({ variant, className }))} {...props} />
    );
  }
  return (
    <code className={cn(codeVariants({ variant, className }))} {...props} />
  );
}
Code.displayName = "Code";
