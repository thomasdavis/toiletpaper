import type { ReactNode } from "react";
import { Eyebrow } from "./eyebrow";

interface Props {
  /** Small uppercase preamble. */
  eyebrow?: string;
  eyebrowTone?: "blue" | "olive" | "amber" | "muted";
  /** Main heading. */
  title: ReactNode;
  /** Optional supporting paragraph. */
  description?: ReactNode;
  /** Right-rail slot, e.g. action buttons. */
  actions?: ReactNode;
  /** Heading level (h1 for the page hero, h2 for sections). Default h2. */
  as?: "h1" | "h2" | "h3";
  /** Smaller vertical scale, for sub-sections. */
  size?: "lg" | "md" | "sm";
  className?: string;
}

const SIZES: Record<NonNullable<Props["size"]>, { title: string }> = {
  lg: { title: "text-[44px] leading-[1.05] tracking-[-0.02em] sm:text-[56px]" },
  md: { title: "text-[28px] leading-tight tracking-[-0.01em] sm:text-[32px]" },
  sm: { title: "text-[20px] leading-tight tracking-[-0.01em]" },
};

export function SectionHeader({
  eyebrow,
  eyebrowTone = "blue",
  title,
  description,
  actions,
  as = "h2",
  size = "md",
  className,
}: Props) {
  const Heading = as;
  return (
    <header
      className={[
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className ?? "",
      ].join(" ")}
    >
      <div>
        {eyebrow && <Eyebrow tone={eyebrowTone}>{eyebrow}</Eyebrow>}
        <Heading
          className={[
            "mt-2 font-serif font-bold text-[#1A1A1A]",
            SIZES[size].title,
          ].join(" ")}
        >
          {title}
        </Heading>
        {description && (
          <p className="mt-3 max-w-3xl text-[15px] leading-[1.65] text-[#3D3D3D]">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </header>
  );
}
