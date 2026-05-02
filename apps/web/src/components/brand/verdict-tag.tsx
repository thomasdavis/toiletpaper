import { Pill } from "./pill";
import { VERDICT_DISPLAY, type Verdict } from "@/lib/verdict";

/**
 * @deprecated re-export for callers expecting the old name
 */
export type VerdictKind = Verdict | "candidate" | "verified";

interface Props {
  kind: VerdictKind;
  /** Optional count next to the label. */
  count?: number;
  /** Override the displayed label (kind still drives color). */
  label?: string;
}

/**
 * Colored pill for a verdict / claim status. Backed by the
 * canonical PRD-002 8-state vocabulary; legacy kinds fall through
 * to a sensible default.
 */
export function VerdictTag({ kind, count, label }: Props) {
  if (kind === "candidate")
    return <Pill tone="blue" count={count} dot>{label ?? "Candidate"}</Pill>;
  if (kind === "verified")
    return <Pill tone="green" count={count} dot>{label ?? "Verified"}</Pill>;

  const d = VERDICT_DISPLAY[kind];
  return (
    <Pill tone={d.pillTone} count={count} dot>
      {label ?? d.label}
    </Pill>
  );
}
