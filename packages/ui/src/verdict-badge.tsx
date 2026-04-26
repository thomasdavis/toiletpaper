import { type HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./cn";

const verdictVariants = cva(
  "inline-flex items-center gap-1.5 rounded-sm px-2 py-1 font-[var(--font-sans)] text-xs font-semibold uppercase tracking-[0.05em]",
  {
    variants: {
      verdict: {
        reproduced:
          "border border-[var(--color-reproduced)]/20 bg-[var(--color-reproduced-light)] text-[var(--color-reproduced)]",
        contradicted:
          "border border-[var(--color-contradicted)]/20 bg-[var(--color-contradicted-light)] text-[var(--color-contradicted)]",
        fragile:
          "border border-[var(--color-fragile)]/20 bg-[var(--color-fragile-light)] text-[var(--color-fragile)]",
        undetermined:
          "border border-[var(--color-undetermined)]/20 bg-[var(--color-undetermined-light)] text-[var(--color-undetermined)]",
        "not-simulable":
          "border border-[var(--color-not-simulable)]/20 bg-[var(--color-not-simulable-light)] text-[var(--color-not-simulable)]",
      },
    },
    defaultVariants: {
      verdict: "undetermined",
    },
  },
);

const verdictIcons: Record<string, string> = {
  reproduced: "✓",
  contradicted: "✗",
  fragile: "⚠",
  undetermined: "—",
  "not-simulable": "∅",
};

export type VerdictBadgeProps = HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof verdictVariants>;

export function VerdictBadge({
  className,
  verdict,
  ...props
}: VerdictBadgeProps) {
  const v = verdict ?? "undetermined";
  return (
    <span className={cn(verdictVariants({ verdict, className }))} {...props}>
      <span aria-hidden="true">{verdictIcons[v]}</span>
      {v.replace("-", " ")}
    </span>
  );
}
