import { Pill } from "./pill";

export type VerdictKind =
  | "reproduced"
  | "contradicted"
  | "fragile"
  | "inconclusive"
  | "untested"
  | "candidate"
  | "verified";

const MAP: Record<VerdictKind, { tone: Parameters<typeof Pill>[0]["tone"]; label: string }> = {
  reproduced: { tone: "green", label: "Reproduced" },
  contradicted: { tone: "red", label: "Contradicted" },
  fragile: { tone: "amber", label: "Fragile" },
  inconclusive: { tone: "amber", label: "Inconclusive" },
  untested: { tone: "muted", label: "Untested" },
  candidate: { tone: "blue", label: "Candidate" },
  verified: { tone: "green", label: "Verified" },
};

interface Props {
  kind: VerdictKind;
  /** Optional count next to the label. */
  count?: number;
  /** Override the displayed label (kind still drives color). */
  label?: string;
}

/**
 * Colored pill for a verdict / claim status. Standardized so the
 * same set of colors is used wherever a verdict appears.
 */
export function VerdictTag({ kind, count, label }: Props) {
  const m = MAP[kind];
  return (
    <Pill tone={m.tone} count={count} dot>
      {label ?? m.label}
    </Pill>
  );
}
