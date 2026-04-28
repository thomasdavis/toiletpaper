interface Props {
  size?: number;
  className?: string;
  /** When true, the trailing perforation line is hidden (compact mode). */
  compact?: boolean;
}

/**
 * A paper-roll seen end-on (circle with a center tube) with a short
 * perforated tail trailing off to the right — the moment before a sheet
 * tears off. Subtle wordmark-companion glyph for `toiletpaper`.
 */
export function Logo({ size = 22, className, compact = false }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <circle cx="9" cy="12" r="7" />
      <circle cx="9" cy="12" r="2" fill="currentColor" stroke="none" />
      {!compact && (
        <path d="M16.5 12 H 22" strokeDasharray="1.6 1.8" opacity="0.55" />
      )}
    </svg>
  );
}
