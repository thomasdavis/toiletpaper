interface Field {
  key: string;
  value: string;
  /** Inline annotation rendered grayed-out after the value. */
  hint?: string;
  /** Color tone for the value. */
  tone?: "blue" | "green" | "red" | "amber" | "muted";
}

interface Props {
  /** Optional caption above the code block. */
  caption?: string;
  rows: Field[];
  className?: string;
}

const VALUE_TONES = {
  blue: "text-[#2E4A6F]",
  green: "text-[#2D6A4F]",
  red: "text-[#9B2226]",
  amber: "text-[#B07D2B]",
  muted: "text-[#3D3D3D]",
} as const;

/**
 * A monospace block that pretty-prints a single Donto quad
 * (subject / predicate / object / context + bitemporal fields).
 * Used in marketing copy, debug panels, and the wire-format demo.
 */
export function CodeQuad({ caption, rows, className }: Props) {
  return (
    <div
      className={[
        "overflow-x-auto rounded-lg border border-[#E8E5DE] bg-[#FAFAF8] p-4 font-mono text-[12px] leading-[1.7] text-[#3D3D3D]",
        className ?? "",
      ].join(" ")}
    >
      {caption && (
        <div className="mb-2 text-[#9B9B9B]">
          <span aria-hidden>{"// "}</span>
          {caption}
        </div>
      )}
      {rows.map((r) => {
        const tone = r.tone ?? "muted";
        return (
          <div key={r.key}>
            <span className="text-[#4A6FA5]">{r.key}</span>
            <span className="text-[#9B9B9B]">: </span>
            <span className={VALUE_TONES[tone]}>{r.value}</span>
            {r.hint && (
              <span className="text-[#9B9B9B]"> {"// " + r.hint}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
