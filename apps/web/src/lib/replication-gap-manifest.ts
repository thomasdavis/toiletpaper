import { normalizeVerdict } from "./verdict";

interface UnitInput {
  id: string;
  claimText?: string | null;
  unitType?: string | null;
  domain?: string | null;
  sourceStatementIds?: string[] | null;
  requiredArtifacts?: unknown;
  blockers?: unknown;
}

interface SimulationInput {
  id: string;
  claimId?: string | null;
  verdict?: string | null;
  evidenceMode?: string | null;
  result?: unknown;
  metadata?: unknown;
  limitations?: string[] | null;
  claimText?: string | null;
}

interface Rule {
  kind: string;
  label: string;
  priority: "critical" | "high" | "medium";
  pattern: RegExp;
}

export interface ArtifactGapRequest {
  id: string;
  kind: string;
  label: string;
  priority: "critical" | "high" | "medium";
  unitCount: number;
  simulationCount: number;
  unitTypes: Record<string, number>;
  domains: Record<string, number>;
  sourceStatementIds: string[];
  examples: Array<{
    simulationId: string;
    replicationUnitId: string | null;
    claimText: string | null;
    reason: string | null;
    limitation: string | null;
    unitType: string | null;
  }>;
}

export interface ReplicationGapManifest {
  totalCurrentResults: number;
  blockedResults: number;
  blockedUnits: number;
  requestCount: number;
  criticalRequestCount: number;
  highRequestCount: number;
  requests: ArtifactGapRequest[];
}

const RULES: Rule[] = [
  {
    kind: "md-input-decks",
    label: "Molecular dynamics input decks",
    priority: "critical",
    pattern: /\b(lammps|nemd|md inputs?|input decks?|pair[- ]?style|simulation inputs?|input files?)\b/i,
  },
  {
    kind: "potential-files",
    label: "Interatomic potential files",
    priority: "critical",
    pattern: /\b(potential files?|airebo|eam potential|interatomic potential|force field)\b/i,
  },
  {
    kind: "structure-files",
    label: "Atomistic structure or geometry files",
    priority: "critical",
    pattern: /\b(structure files?|atomistic geometry|geometry generation|void geometry|cell geometry)\b/i,
  },
  {
    kind: "trajectories",
    label: "Simulation trajectories and raw MD outputs",
    priority: "critical",
    pattern: /\b(trajectory|trajectories|dump files?|raw md|heat flux|temperature profile)\b/i,
  },
  {
    kind: "image-data",
    label: "Microscopy images and measurement data",
    priority: "critical",
    pattern: /\b(hrtem|tem image|microscopy|image data|segmentation|void statistics|image-derived|measurement data)\b/i,
  },
  {
    kind: "fitting-artifacts",
    label: "Fitting equations, parameters, and scripts",
    priority: "high",
    pattern: /\b(ema|fitting|fit parameter|kapitza|equation|formula|model fitting)\b/i,
  },
  {
    kind: "clean-source",
    label: "Clean manuscript source for corrupted equations",
    priority: "high",
    pattern: /\b(corrupted pdf|clean equation|source manuscript|equation rendering|clean source)\b/i,
  },
  {
    kind: "raw-measurements",
    label: "Raw experimental measurements",
    priority: "critical",
    pattern: /\b(raw experimental|raw measurement|lfa|laser flash|dsc|density|archimedes|porosity|batch record|laboratory record)\b/i,
  },
  {
    kind: "monte-carlo-code",
    label: "Monte Carlo or percolation implementation",
    priority: "high",
    pattern: /\b(monte carlo|percolation|excluded[- ]volume)\b/i,
  },
  {
    kind: "source-code",
    label: "Executable source code or scripts",
    priority: "high",
    pattern: /\b(source code|implementation|script|executable|generation script|released code)\b/i,
  },
  {
    kind: "datasets",
    label: "Datasets and raw data files",
    priority: "high",
    pattern: /\b(dataset|data file|raw data|training data|evaluation data)\b/i,
  },
  {
    kind: "config",
    label: "Configuration and parameter files",
    priority: "medium",
    pattern: /\b(config|configuration|parameter file|hyperparameter)\b/i,
  },
  {
    kind: "seeds",
    label: "Random seeds or replication seed policy",
    priority: "medium",
    pattern: /\b(seed|random seed|seed policy|seed count)\b/i,
  },
  {
    kind: "artifact-urls",
    label: "Exact artifact URLs or repository references",
    priority: "high",
    pattern: /\b(artifact url|artifact reference|released configuration|repository|doi for data|archive)\b/i,
  },
  {
    kind: "external-study-data",
    label: "External cited study data",
    priority: "medium",
    pattern: /\b(cited study|external work|literature-background|referenced work)\b/i,
  },
  {
    kind: "human-method-review",
    label: "Manual method reconstruction notes",
    priority: "medium",
    pattern: /\b(human[- ]?method[- ]?review|manual method|method reconstruction|specialized verifier)\b/i,
  },
];

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

function resultReason(result: unknown) {
  const resultRecord = record(result);
  return typeof resultRecord?.reason === "string" ? resultRecord.reason : null;
}

function measurements(result: unknown) {
  const resultRecord = record(result);
  return record(resultRecord?.measurements);
}

function replicationUnitId(sim: SimulationInput) {
  const metadata = record(sim.metadata);
  if (typeof metadata?.replication_unit_id === "string") {
    return metadata.replication_unit_id;
  }
  const result = record(sim.result);
  if (typeof result?.replicationUnitId === "string") {
    return result.replicationUnitId;
  }
  return null;
}

function metadataString(metadata: unknown, key: string) {
  const metadataRecord = record(metadata);
  return typeof metadataRecord?.[key] === "string"
    ? metadataRecord[key]
    : null;
}

function sourceStatementIds(unit: UnitInput | undefined, sim: SimulationInput) {
  const fromUnit = unit?.sourceStatementIds ?? [];
  if (fromUnit.length > 0) return fromUnit;
  const metadata = record(sim.metadata);
  return stringArray(metadata?.source_statement_ids);
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function increment(target: Record<string, number>, key: string | null | undefined) {
  const normalized = (key ?? "unknown").trim() || "unknown";
  target[normalized] = (target[normalized] ?? 0) + 1;
}

function addUnique(target: string[], values: string[]) {
  for (const value of values) {
    if (!target.includes(value)) target.push(value);
  }
}

function priorityRank(priority: ArtifactGapRequest["priority"]) {
  if (priority === "critical") return 0;
  if (priority === "high") return 1;
  return 2;
}

function artifactRecords(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map(record)
    .filter((item): item is Record<string, unknown> => Boolean(item));
}

function blockerDetails(value: unknown) {
  return artifactRecords(value)
    .map((item) => {
      const code = typeof item.code === "string" ? item.code : "";
      const detail = typeof item.detail === "string" ? item.detail : "";
      return `${code} ${detail}`.trim();
    })
    .filter(Boolean);
}

function requiredArtifactText(unit: UnitInput | undefined) {
  return artifactRecords(unit?.requiredArtifacts)
    .map((item) => {
      const kind = typeof item.kind === "string" ? item.kind : "";
      const name = typeof item.name === "string" ? item.name : "";
      return `${kind} ${name}`.trim();
    })
    .filter(Boolean);
}

function isBoilerplateLimitation(text: string) {
  return /the local paper source and extracted graph were used/i.test(text);
}

function signalTexts(sim: SimulationInput, unit: UnitInput | undefined) {
  const m = measurements(sim.result);
  return [
    resultReason(sim.result),
    ...stringArray(sim.limitations),
    ...stringArray(m?.required_artifact_kinds),
    ...stringArray(m?.required_for_faithful_recompute),
    ...stringArray(m?.manifest_blockers),
    ...requiredArtifactText(unit),
    ...blockerDetails(unit?.blockers),
  ].filter(
    (text): text is string =>
      typeof text === "string" &&
      text.trim().length > 0 &&
      !isBoilerplateLimitation(text),
  );
}

function matchedRules(texts: string[]) {
  const combined = texts.join("\n");
  const matches = RULES.filter((rule) => rule.pattern.test(combined));
  return matches.length > 0
    ? matches
    : [
        {
          kind: "unclassified-replication-evidence",
          label: "Unclassified replication evidence",
          priority: "medium" as const,
          pattern: /.*/,
        },
      ];
}

function isBlockedResult(sim: SimulationInput) {
  const reason = resultReason(sim.result);
  const verdict = normalizeVerdict(sim.verdict, sim.metadata, reason);
  return (
    sim.evidenceMode === "insufficient" ||
    verdict === "inconclusive" ||
    verdict === "not_applicable" ||
    verdict === "untested" ||
    verdict === "system_error"
  );
}

export function summarizeReplicationGapManifest(input: {
  units: UnitInput[];
  simulations: SimulationInput[];
}): ReplicationGapManifest {
  const unitById = new Map(input.units.map((unit) => [unit.id, unit]));
  const requestsByKind = new Map<string, ArtifactGapRequest>();
  const requestUnitIds = new Map<string, Set<string>>();
  const blockedUnitIds = new Set<string>();
  let blockedResults = 0;

  for (const sim of input.simulations) {
    if (!isBlockedResult(sim)) continue;
    blockedResults += 1;

    const unitId = replicationUnitId(sim);
    if (unitId) blockedUnitIds.add(unitId);
    const unit = unitId ? unitById.get(unitId) : undefined;
    const claimText = sim.claimText ?? unit?.claimText ?? null;
    const unitType =
      unit?.unitType ??
      metadataString(sim.metadata, "unit_type") ??
      null;
    const domain =
      unit?.domain ??
      metadataString(sim.metadata, "domain") ??
      null;
    const texts = signalTexts(sim, unit);

    for (const rule of matchedRules(texts)) {
      const key = rule.kind;
      const existing =
        requestsByKind.get(key) ??
        {
          id: normalizeKey(rule.kind),
          kind: rule.kind,
          label: rule.label,
          priority: rule.priority,
          unitCount: 0,
          simulationCount: 0,
          unitTypes: {},
          domains: {},
          sourceStatementIds: [],
          examples: [],
        };

      existing.simulationCount += 1;
      if (unitId) {
        const unitSet = requestUnitIds.get(key) ?? new Set<string>();
        if (!unitSet.has(unitId)) {
          unitSet.add(unitId);
          existing.unitCount += 1;
        }
        requestUnitIds.set(key, unitSet);
      }
      increment(existing.unitTypes, unitType);
      increment(existing.domains, domain);
      addUnique(existing.sourceStatementIds, sourceStatementIds(unit, sim));

      if (existing.examples.length < 5) {
        existing.examples.push({
          simulationId: sim.id,
          replicationUnitId: unitId,
          claimText,
          reason: resultReason(sim.result),
          limitation: stringArray(sim.limitations)[0] ?? null,
          unitType,
        });
      }

      requestsByKind.set(key, existing);
    }
  }

  const requests = [...requestsByKind.values()].sort((a, b) => {
    return (
      priorityRank(a.priority) - priorityRank(b.priority) ||
      b.unitCount - a.unitCount ||
      a.label.localeCompare(b.label)
    );
  });

  return {
    totalCurrentResults: input.simulations.length,
    blockedResults,
    blockedUnits: blockedUnitIds.size,
    requestCount: requests.length,
    criticalRequestCount: requests.filter((request) => request.priority === "critical").length,
    highRequestCount: requests.filter((request) => request.priority === "high").length,
    requests,
  };
}
