interface Props {
  className?: string;
  /** Smaller vertical gap. Useful inside cards or tight stacks. */
  tight?: boolean;
}

/**
 * Quiet section rule — a hairline divider with a single centered middle-dot.
 * Reads as a typographic section break, not a metaphor.
 */
export function Perforation({ className, tight = false }: Props) {
  return (
    <div
      className={[
        "relative flex items-center justify-center",
        tight ? "my-8" : "my-14",
        className ?? "",
      ].join(" ")}
      role="separator"
      aria-hidden
    >
      <div className="h-px w-full bg-[#E8E5DE]" />
      <span className="absolute select-none bg-[#FAFAF8] px-3 text-[#C8C3B8]">
        ·
      </span>
    </div>
  );
}
