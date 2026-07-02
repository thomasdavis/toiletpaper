import { normalizeVerdict } from "@/lib/verdict";

interface SimulationInput {
  id: string;
  verdict?: string | null;
  result?: unknown;
  metadata?: unknown;
  evidenceMode?: string | null;
  limitations?: string[] | null;
  claimText?: string | null;
  unitType?: string | null;
}

export interface ReadinessExample {
  id: string;
  claimText: string | null;
  verdict: string;
  reason: string | null;
  artifactKinds: string[];
  requirements: string[];
  blockers: string[];
}

export interface ReplicationReadinessSummary {
  total: number;
  blocked: number;
  staticOnly: number;
  faithfulRecomputeBlocked: number;
  artifactKindCounts: Record<string, number>;
  requirementCounts: Record<string, number>;
  blockerCounts: Record<string, number>;
  unitTypeCounts: Record<string, number>;
  examples: ReadinessExample[];
}

interface ReadinessSignals {
  artifactKinds: string[];
  requirements: string[];
  blockers: string[];
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function increment(target: Record<string, number>, key: string) {
  const normalized = key.trim();
  if (!normalized) return;
  target[normalized] = (target[normalized] ?? 0) + 1;
}

function topEntries(source: Record<string, number>, limit: number) {
  return Object.fromEntries(
    Object.entries(source)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit),
  );
}

function resultReason(result: unknown) {
  const resultRecord = record(result);
  return typeof resultRecord?.reason === "string" ? resultRecord.reason : null;
}

function measurements(result: unknown) {
  const resultRecord = record(result);
  return record(resultRecord?.measurements);
}

function cleanBlocker(value: string) {
  return value.replace(/^[a-z0-9_-]+:\s*/i, "").trim();
}

function pushUnique(target: string[], value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return;
  if (target.some((item) => item.toLowerCase() === normalized.toLowerCase())) {
    return;
  }
  target.push(normalized);
}

function mergeUnique(...groups: string[][]) {
  const merged: string[] = [];
  for (const group of groups) {
    for (const item of group) pushUnique(merged, item);
  }
  return merged;
}

function inferWithoutRequirements(reason: string) {
  const requirements: string[] = [];
  const matches = reason.matchAll(
    /\bwithout\s+(?:access to\s+|the\s+)?([^.;]+)/gi,
  );

  for (const match of matches) {
    const phrase = match[1]
      .replace(/\band\b/gi, ",")
      .replace(/\bor\b/gi, ",");
    for (const rawTerm of phrase.split(/[,/]/)) {
      const term = rawTerm
        .replace(/\bexact\b/gi, "")
        .replace(/\brequired\b/gi, "")
        .replace(/\bartifact(?:s)?\b/gi, "")
        .replace(/\burls?\b/gi, "URL")
        .trim();
      if (term.length >= 3) pushUnique(requirements, term);
    }
  }

  return requirements;
}

function inferSignalsFromReason(reason: string | null): ReadinessSignals {
  if (!reason) {
    return { artifactKinds: [], requirements: [], blockers: [] };
  }

  const artifactKinds: string[] = [];
  const requirements: string[] = [];
  const blockers: string[] = [];
  const missingLike =
    /blocked|missing|without|unavailable|cannot be recomputed|no .*artifact/i.test(
      reason,
    );

  if (!missingLike) {
    return { artifactKinds, requirements, blockers };
  }

  if (/artifact-availability requirement/i.test(reason)) {
    pushUnique(requirements, "artifact availability");
    pushUnique(blockers, "artifact availability unresolved");
  }
  if (/executable recomputation requirement/i.test(reason)) {
    pushUnique(requirements, "executable recomputation");
  }
  if (/faithful recompute|faithful recomputation/i.test(reason)) {
    pushUnique(requirements, "faithful recomputation");
  }

  const exactArtifactUrlList = /exact code\/model-card\/data urls?/i.test(reason);
  if (/experiment artifact/i.test(reason)) {
    pushUnique(artifactKinds, "experiment artifacts");
    pushUnique(requirements, "experiment artifacts");
    pushUnique(blockers, "missing experiment artifacts");
  }
  if (/executable artifact/i.test(reason)) {
    pushUnique(artifactKinds, "executable artifacts");
    pushUnique(requirements, "executable artifacts");
    pushUnique(blockers, "missing executable artifacts");
  }
  if (exactArtifactUrlList) {
    pushUnique(artifactKinds, "code");
    pushUnique(artifactKinds, "model card");
    pushUnique(artifactKinds, "data");
    pushUnique(artifactKinds, "artifact URL");
    pushUnique(requirements, "exact code URL");
    pushUnique(requirements, "model card URL");
    pushUnique(requirements, "data URL");
    pushUnique(blockers, "missing exact artifact URLs");
  }

  const artifactRules: Array<[RegExp, string, string]> = [
    [/\bsource code\b|\bcode\b|implementation/i, "code", "source code"],
    [/model[- ]?card/i, "model card", "model card"],
    [/\bdataset\b|\bdata\b|training data|evaluation data/i, "data", "data"],
    [/checkpoint|model weights|weights/i, "checkpoint", "model weights"],
    [/\blabels?\b/i, "labels", "labels"],
    [/predictions?/i, "predictions", "predictions"],
    [/embeddings?/i, "embeddings", "embeddings"],
    [/\bsplits?\b|train\/test/i, "split", "exact split"],
    [/\bconfig(?:uration)?\b|hyperparameters?/i, "config", "configuration"],
    [/\bseed(?:s)?\b/i, "seed", "random seed"],
  ];

  for (const [pattern, artifactKind, requirement] of artifactRules) {
    if (pattern.test(reason)) {
      pushUnique(artifactKinds, artifactKind);
      if (
        !exactArtifactUrlList ||
        !["source code", "model card", "data"].includes(requirement)
      ) {
        pushUnique(requirements, requirement);
      }
    }
  }

  if (/\burls?\b/i.test(reason) && artifactKinds.length > 0) {
    pushUnique(artifactKinds, "artifact URL");
    pushUnique(requirements, "exact artifact URL");
  }

  for (const requirement of inferWithoutRequirements(reason)) {
    pushUnique(requirements, requirement);
  }

  if (/missing .*artifact|no .*artifact/i.test(reason) && blockers.length === 0) {
    pushUnique(blockers, "missing artifacts");
  }
  if (/cannot be recomputed/i.test(reason)) {
    pushUnique(blockers, "cannot recompute from paper alone");
  }
  if (/blocked/i.test(reason) && /recomput/i.test(reason)) {
    pushUnique(blockers, "blocked recomputation");
  }

  return { artifactKinds, requirements, blockers };
}

function isBlockedLike(input: {
  verdict: string;
  evidenceMode?: string | null;
  reason: string | null;
  requirements: string[];
  blockers: string[];
}) {
  if (input.requirements.length > 0 || input.blockers.length > 0) return true;
  if (input.verdict === "inconclusive" && input.evidenceMode === "insufficient") {
    return true;
  }
  if (
    input.verdict === "not_applicable" ||
    input.verdict === "system_error" ||
    input.verdict === "untested"
  ) {
    return true;
  }
  return /blocked|missing|cannot be recomputed|without .*?(data|code|label|split|config|artifact|checkpoint)|no .*artifact/i.test(
    input.reason ?? "",
  );
}

export function summarizeReplicationReadiness(
  simulations: SimulationInput[],
): ReplicationReadinessSummary {
  const artifactKindCounts: Record<string, number> = {};
  const requirementCounts: Record<string, number> = {};
  const blockerCounts: Record<string, number> = {};
  const unitTypeCounts: Record<string, number> = {};
  const examples: ReadinessExample[] = [];

  let blocked = 0;
  let staticOnly = 0;
  let faithfulRecomputeBlocked = 0;

  for (const sim of simulations) {
    const m = measurements(sim.result);
    const metadata = record(sim.metadata);
    const reason = resultReason(sim.result);
    const verdict = normalizeVerdict(sim.verdict, sim.metadata, reason);
    const inferred = inferSignalsFromReason(reason);
    const artifactKinds = mergeUnique(
      stringArray(m?.required_artifact_kinds),
      inferred.artifactKinds,
    );
    const requirements = mergeUnique(
      stringArray(m?.required_for_faithful_recompute),
      inferred.requirements,
    );
    const blockers = mergeUnique(
      stringArray(m?.manifest_blockers).map(cleanBlocker),
      inferred.blockers,
    );
    const unitType =
      sim.unitType ??
      (typeof m?.unit_type === "string" ? m.unit_type : null) ??
      (typeof metadata?.unit_type === "string" ? metadata.unit_type : null);
    const deterministicEvidenceMode =
      typeof m?.deterministic_evidence_mode === "string"
        ? m.deterministic_evidence_mode
        : null;

    if (verdict === "inconclusive" && sim.evidenceMode === "insufficient") {
      pushUnique(blockers, "insufficient evidence");
    }

    for (const kind of artifactKinds) increment(artifactKindCounts, kind);
    for (const requirement of requirements) {
      increment(requirementCounts, requirement);
    }
    for (const blocker of blockers) increment(blockerCounts, blocker);
    if (unitType) increment(unitTypeCounts, unitType);

    const blockedLike = isBlockedLike({
      verdict,
      evidenceMode: sim.evidenceMode,
      reason,
      requirements,
      blockers,
    });

    if (sim.evidenceMode === "static_check" || deterministicEvidenceMode === "static_check") {
      staticOnly += 1;
    }
    if (
      blockedLike &&
      (requirements.length > 0 || /recompute|recomputed/i.test(reason ?? ""))
    ) {
      faithfulRecomputeBlocked += 1;
    }

    if (blockedLike) {
      blocked += 1;
      if (examples.length < 6) {
        examples.push({
          id: sim.id,
          claimText: sim.claimText ?? null,
          verdict,
          reason,
          artifactKinds,
          requirements,
          blockers,
        });
      }
    }
  }

  return {
    total: simulations.length,
    blocked,
    staticOnly,
    faithfulRecomputeBlocked,
    artifactKindCounts: topEntries(artifactKindCounts, 8),
    requirementCounts: topEntries(requirementCounts, 8),
    blockerCounts: topEntries(blockerCounts, 8),
    unitTypeCounts: topEntries(unitTypeCounts, 8),
    examples,
  };
}
