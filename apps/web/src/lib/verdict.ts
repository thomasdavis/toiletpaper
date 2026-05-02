/**
 * Verdict vocabulary (PRD-002).
 *
 * Eight states arranged in two buckets:
 *
 * - signal: a real test ran and produced a meaningful answer
 * - meta:   no useful answer; we know *why* there's no answer
 *
 * The signal/meta split is what lets the UI tell the truth about how
 * much of a paper's analysis is actually load-bearing.
 */

export const SIGNAL_VERDICTS = [
  "reproduced",
  "contradicted",
  "fragile",
  "inconclusive",
] as const;

export const META_VERDICTS = [
  "not_applicable",
  "vacuous",
  "system_error",
  "untested",
] as const;

export type SignalVerdict = (typeof SIGNAL_VERDICTS)[number];
export type MetaVerdict = (typeof META_VERDICTS)[number];
export type Verdict = SignalVerdict | MetaVerdict;

export const ALL_VERDICTS: readonly Verdict[] = [
  ...SIGNAL_VERDICTS,
  ...META_VERDICTS,
];

const SIGNAL_SET = new Set<string>(SIGNAL_VERDICTS);

export function isSignal(v: string | null | undefined): v is SignalVerdict {
  return typeof v === "string" && SIGNAL_SET.has(v);
}

/**
 * Map any DB verdict (legacy or current) to the canonical
 * 8-state vocabulary, peeking at metadata when needed.
 */
export function normalizeVerdict(
  raw: string | null | undefined,
  metadata?: unknown,
  reason?: string | null,
): Verdict {
  if (metadata && typeof metadata === "object") {
    const m = metadata as Record<string, unknown>;
    if (typeof m.original_verdict === "string") {
      const ov = m.original_verdict;
      if (
        ov === "reproduced" ||
        ov === "contradicted" ||
        ov === "fragile" ||
        ov === "inconclusive"
      ) {
        return ov;
      }
    }
  }

  // Legacy values written before the enum migration
  if (raw === "confirmed") return "reproduced";
  if (raw === "refuted") return "contradicted";

  // Pattern-match reasons that escaped the data backfill (defense in depth)
  if (typeof reason === "string") {
    if (/^Pipeline error/i.test(reason)) return "system_error";
    if (/^Simulation failed/i.test(reason)) return "system_error";
    if (
      /^(Tier 1 )?[Dd]imensional analysis(:| consistent\.) LHS: \[(dimensionless|count|N\/A|year)/.test(
        reason,
      )
    ) {
      return "vacuous";
    }
  }

  if (raw && (ALL_VERDICTS as readonly string[]).includes(raw)) {
    return raw as Verdict;
  }
  return "untested";
}

// ────────────────────────────────────────────────────────────────────────────
// Aggregation
// ────────────────────────────────────────────────────────────────────────────

export interface VerdictRow {
  verdict?: string | null;
  metadata?: unknown;
  result?: unknown;
}

export interface VerdictSummary {
  total: number;
  signal: Record<SignalVerdict, number>;
  meta: Record<MetaVerdict, number>;
  /** Number of signal verdicts. */
  signalCount: number;
  /** Number of meta verdicts. */
  metaCount: number;
  /** Fraction of rows in the signal bucket; 0 when total is 0. */
  ratio: number;
}

export function summarizeVerdicts(rows: VerdictRow[]): VerdictSummary {
  const signal: Record<SignalVerdict, number> = {
    reproduced: 0,
    contradicted: 0,
    fragile: 0,
    inconclusive: 0,
  };
  const meta: Record<MetaVerdict, number> = {
    not_applicable: 0,
    vacuous: 0,
    system_error: 0,
    untested: 0,
  };

  for (const r of rows) {
    const reason =
      r.result && typeof r.result === "object" && r.result !== null
        ? ((r.result as Record<string, unknown>).reason as string | undefined)
        : undefined;
    const v = normalizeVerdict(r.verdict, r.metadata, reason);
    if (isSignal(v)) signal[v]++;
    else meta[v as MetaVerdict]++;
  }

  const signalCount =
    signal.reproduced + signal.contradicted + signal.fragile + signal.inconclusive;
  const metaCount =
    meta.not_applicable + meta.vacuous + meta.system_error + meta.untested;
  const total = signalCount + metaCount;

  return {
    total,
    signal,
    meta,
    signalCount,
    metaCount,
    ratio: total === 0 ? 0 : signalCount / total,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Display tokens
// ────────────────────────────────────────────────────────────────────────────

export interface VerdictDisplay {
  label: string;
  /** css color */
  color: string;
  /** background tone, used by Pill */
  pillTone: "green" | "red" | "amber" | "blue" | "muted" | "neutral";
  bucket: "signal" | "meta";
  /** one-line tooltip */
  description: string;
}

export const VERDICT_DISPLAY: Record<Verdict, VerdictDisplay> = {
  reproduced: {
    label: "Reproduced",
    color: "#2D6A4F",
    pillTone: "green",
    bucket: "signal",
    description: "Simulation produced results consistent with the claim.",
  },
  contradicted: {
    label: "Contradicted",
    color: "#9B2226",
    pillTone: "red",
    bucket: "signal",
    description: "Simulation produced results inconsistent with the claim.",
  },
  fragile: {
    label: "Fragile",
    color: "#B07D2B",
    pillTone: "amber",
    bucket: "signal",
    description: "Result swings under parameter perturbation.",
  },
  inconclusive: {
    label: "Inconclusive",
    color: "#B07D2B",
    pillTone: "amber",
    bucket: "signal",
    description: "Simulation ran but couldn't confirm or contradict the claim.",
  },
  not_applicable: {
    label: "Not applicable",
    color: "#9B9B9B",
    pillTone: "muted",
    bucket: "meta",
    description: "No registered simulator applies to this claim.",
  },
  vacuous: {
    label: "Vacuous",
    color: "#9B9B9B",
    pillTone: "muted",
    bucket: "meta",
    description: "The applicable simulator's check passed/failed vacuously.",
  },
  system_error: {
    label: "System error",
    color: "#6A2B2B",
    pillTone: "red",
    bucket: "meta",
    description: "The simulator crashed; no analysis was performed.",
  },
  untested: {
    label: "Untested",
    color: "#C8C3B8",
    pillTone: "neutral",
    bucket: "meta",
    description: "No simulator was offered for this claim.",
  },
};

/**
 * Headline number for the paper page: how many claims have *any* signal
 * verdict at all. A claim is "tested" if at least one of its simulations
 * is in the signal bucket.
 */
export function testedClaimCount(
  rowsByClaim: Map<string, VerdictRow[]>,
): number {
  let n = 0;
  for (const rows of rowsByClaim.values()) {
    for (const r of rows) {
      const reason =
        r.result && typeof r.result === "object" && r.result !== null
          ? ((r.result as Record<string, unknown>).reason as string | undefined)
          : undefined;
      const v = normalizeVerdict(r.verdict, r.metadata, reason);
      if (isSignal(v)) {
        n++;
        break;
      }
    }
  }
  return n;
}
