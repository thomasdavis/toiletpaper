import { type HTMLAttributes, forwardRef } from "react";
import { cn } from "./cn";
import { VerdictBadge } from "./verdict-badge";
import { ConfidenceMeter } from "./confidence-meter";

export interface ClaimCardProps extends HTMLAttributes<HTMLDivElement> {
  claim: string;
  verdict?: "reproduced" | "contradicted" | "fragile" | "undetermined" | "not-simulable";
  confidence?: number;
  value?: string | number;
  unit?: string;
  evidence?: string;
  source?: string;
}

export const ClaimCard = forwardRef<HTMLDivElement, ClaimCardProps>(
  ({ className, claim, verdict, confidence, value, unit, evidence, source, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-[4px] border border-[var(--color-rule)] bg-white shadow-[var(--shadow-subtle)]",
        className,
      )}
      {...props}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-[var(--color-rule-faint)] p-4">
        <p className="flex-1 font-[var(--font-sans)] text-sm leading-snug text-[var(--color-ink)]">
          {claim}
        </p>
        {verdict && <VerdictBadge verdict={verdict} className="shrink-0" />}
      </div>

      {/* Body */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-4 p-4">
        {confidence != null && (
          <div>
            <span className="mb-1 block font-[var(--font-sans)] text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
              Confidence
            </span>
            <ConfidenceMeter value={confidence} size="sm" />
          </div>
        )}
        {value != null && (
          <div>
            <span className="mb-1 block font-[var(--font-sans)] text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
              Value
            </span>
            <span className="font-[var(--font-mono)] text-sm font-semibold tabular-nums text-[var(--color-ink)]">
              {value}
              {unit && (
                <span className="ml-1 font-[var(--font-sans)] text-xs font-normal text-[var(--color-ink-muted)]">
                  {unit}
                </span>
              )}
            </span>
          </div>
        )}
        {evidence && (
          <div className="col-span-full">
            <span className="mb-1 block font-[var(--font-sans)] text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
              Evidence
            </span>
            <p className="font-[var(--font-sans)] text-xs leading-relaxed text-[var(--color-ink-light)]">
              {evidence}
            </p>
          </div>
        )}
        {source && (
          <div className="col-span-full">
            <span className="mb-1 block font-[var(--font-sans)] text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
              Source
            </span>
            <span className="font-[var(--font-mono)] text-xs text-[var(--color-primary)]">
              {source}
            </span>
          </div>
        )}
      </div>
    </div>
  ),
);
ClaimCard.displayName = "ClaimCard";
