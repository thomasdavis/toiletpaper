import type { ReactNode } from "react";

interface Props {
  children?: ReactNode;
  /** Pre-heading number/label, e.g. "01". */
  index?: string;
  /** Title shown beneath the index. */
  title?: ReactNode;
  /** Body text. */
  description?: ReactNode;
  /** Hover lift effect. Default true. */
  hover?: boolean;
  className?: string;
}

/**
 * A card with a soft top "tear edge" — three thin perforation dots
 * subtly hint that this is one sheet torn from a roll. Used for
 * step strips, capability cards, and any short-form content cell.
 */
export function Sheet({
  children,
  index,
  title,
  description,
  hover = true,
  className,
}: Props) {
  return (
    <div
      className={[
        "relative overflow-hidden rounded-lg border border-[#E8E5DE] bg-white p-5 shadow-sm transition-all",
        hover ? "hover:-translate-y-0.5 hover:shadow-md" : "",
        className ?? "",
      ].join(" ")}
    >
      {index && (
        <span className="font-mono text-[11px] font-semibold tracking-[0.18em] text-[#4A6FA5]">
          {index}
        </span>
      )}
      {title && (
        <h3
          className={[
            "font-serif text-[17px] font-bold tracking-tight text-[#1A1A1A]",
            index ? "mt-1" : "",
          ].join(" ")}
        >
          {title}
        </h3>
      )}
      {description && (
        <p className="mt-1.5 text-[13px] leading-[1.55] text-[#3D3D3D]">
          {description}
        </p>
      )}
      {children}
    </div>
  );
}
