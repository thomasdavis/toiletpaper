interface Props {
  /** Optional label centered on the perforation (e.g. "sheet 2 · how it works"). */
  label?: string;
  /** Page background color punched through behind the label. Defaults to site bg. */
  punchBg?: string;
  className?: string;
  /** Smaller vertical gap. Useful inside cards or tight stacks. */
  tight?: boolean;
}

/**
 * A horizontal row of evenly-spaced dots that visually echoes the
 * tear-perforation between sheets of toilet paper. Used as a section
 * divider; with `label`, it doubles as a "sheet 2 of 4" marker.
 *
 * Implementation: a 2px-tall element whose background is a repeating
 * radial-gradient — one dot per period — so the line stays crisp on
 * any width without an SVG round-trip.
 */
export function Perforation({
  label,
  punchBg = "#FAFAF8",
  className,
  tight = false,
}: Props) {
  return (
    <div
      className={[
        "relative flex items-center justify-center",
        tight ? "my-6" : "my-12",
        className ?? "",
      ].join(" ")}
      aria-hidden={!label}
      role={label ? "separator" : undefined}
    >
      <div
        className="h-2 w-full"
        style={{
          backgroundImage:
            "radial-gradient(circle, #C8C3B8 1.5px, transparent 1.6px)",
          backgroundSize: "14px 100%",
          backgroundRepeat: "repeat-x",
          backgroundPosition: "center",
        }}
      />
      {label && (
        <span
          className="absolute px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-[#9B9B9B]"
          style={{ background: punchBg }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
