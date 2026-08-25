import { describe, expect, it } from "vitest";
import type { ReplicationUnit } from "@toiletpaper/simulator";
import {
  CORRESPONDENCE_RECEIPT_SCHEMA_VERSION,
  type CorrespondenceReceipt,
} from "./replication-correspondence";
import { gateUnitVerdict } from "./replication-gates";
import {
  buildReplicationBundle,
  canonicalJson,
  replicationBundleArtifactId,
  sha256OfCanonicalJson,
  type BundleUnitInput,
} from "./replication-bundle";

const STMT_A = "3f9a1c2e-4b5d-4e6f-8a9b-0c1d2e3f4a5b";
const STMT_B = "7b8c9d0e-1f2a-4b3c-9d4e-5f6a7b8c9d0e";

function makeUnit(
  id: string,
  statementId: string,
  overrides: Partial<ReplicationUnit> = {},
): ReplicationUnit {
  return {
    id,
    paperId: "paper-1",
    claimIri: `ex:claim-${id}`,
    sourceStatementIds: [statementId],
    domain: "physics",
    unitType: "simulation",
    claimText: "claim text",
    evidenceQuotes: ["quoted evidence"],
    hypothesis: "hypothesis",
    expectedOutcome: "outcome",
    falsificationCriteria: [],
    requiredArtifacts: [],
    datasets: [],
    methods: [],
    metrics: [],
    baselines: [],
    parameters: [],
    computeBudget: { tier: "reduced", computeTier: "cpu" },
    verifierCandidates: [],
    planner: {
      plannerId: "donto-graph-replication-v1",
      version: "1.0.0",
      source: "deterministic",
    },
    state: "planned",
    blockers: [],
    ...overrides,
  };
}

function makeReceipt(unit: ReplicationUnit): CorrespondenceReceipt {
  return {
    schemaVersion: CORRESPONDENCE_RECEIPT_SCHEMA_VERSION,
    unitId: unit.id,
    binds: {
      claimIri: unit.claimIri,
      sourceStatementIds: [...unit.sourceStatementIds],
      evidenceSpans: [...unit.evidenceQuotes],
    },
    system: {
      description: "RK4 decay model, dt=1e-3.",
      equations: ["dN/dt = -lambda N"],
      randomProcess: { kind: "none" },
      tolerances: [{ name: "rel", value: "1e-6" }],
      parameters: [{ name: "lambda", value: "0.42" }],
    },
    proxy: { isProxy: true, relation: "reduced model" },
    falsifier: { description: "analytic divergence" },
    code: [{ path: "run.py", sha256: "ab".repeat(32) }],
    resolvedBlockers: [],
    declaredBy: "codex",
    declaredAt: "2026-08-25T00:00:00.000Z",
  };
}

function admittedInput(unitId: string, statementId: string): BundleUnitInput {
  const unit = makeUnit(unitId, statementId);
  const receipt = makeReceipt(unit);
  return {
    unit,
    receipt,
    gated: gateUnitVerdict({
      unit,
      rawVerdict: "reproduced",
      rawEvidenceMode: "proxy_simulation",
      receipt,
      executionEvidence: {
        measurements: { value: 1 },
        reportedArtifacts: ["out.json"],
      },
    }),
    confidence: 0.9,
    reason: "matches within tolerance",
    simulationId: `sim-${unitId}`,
    artifacts: [{ path: "out.json", sha256: null }],
    missingResult: false,
  };
}

function missingResultInput(unitId: string, statementId: string): BundleUnitInput {
  const unit = makeUnit(unitId, statementId);
  return {
    unit,
    receipt: null,
    gated: gateUnitVerdict({
      unit,
      rawVerdict: undefined,
      rawEvidenceMode: undefined,
      receipt: null,
      executionEvidence: { measurements: null, reportedArtifacts: [] },
    }),
    confidence: null,
    reason: "no result returned for this unit",
    simulationId: null,
    artifacts: [],
    missingResult: true,
  };
}

describe("canonicalJson", () => {
  it("sorts keys at every level and is stable under key order", () => {
    const a = { b: 1, a: { d: [1, 2], c: "x" } };
    const b = { a: { c: "x", d: [1, 2] }, b: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(canonicalJson(a)).toBe('{"a":{"c":"x","d":[1,2]},"b":1}');
  });

  it("drops undefined object values and nulls undefined array slots", () => {
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
    expect(canonicalJson([undefined, 1])).toBe("[null,1]");
  });

  it("hashes identically for semantically identical values", () => {
    expect(sha256OfCanonicalJson({ x: 1, y: 2 })).toBe(
      sha256OfCanonicalJson({ y: 2, x: 1 }),
    );
  });
});

describe("buildReplicationBundle", () => {
  it("builds a content-addressed bundle with honest coverage accounting", () => {
    const bundle = buildReplicationBundle({
      paper: { id: "paper-1", title: "A Paper", sourceSha256: "cd".repeat(32) },
      job: { id: "job-1", resultStatus: "partial", exitCode: 0, timedOut: false },
      units: [
        admittedInput("u1", STMT_A),
        missingResultInput("u2", STMT_B),
      ],
      dontoStatementCount: 100,
      files: [
        {
          relativePath: "results.json",
          phase: "output",
          sha256: "ef".repeat(32),
          byteLength: 42,
          hashStatus: "computed",
        },
      ],
      createdAt: "2026-08-25T00:00:00.000Z",
    });

    expect(bundle.manifest.artifactId).toBe("tp.replication.paper-1.job-1");
    expect(bundle.manifest.units).toHaveLength(2);
    expect(bundle.sha256).toMatch(/^[0-9a-f]{64}$/);

    const coverage = bundle.manifest.coverage;
    expect(coverage.unitCount).toBe(2);
    expect(coverage.unitsWithResults).toBe(1);
    expect(coverage.missingResultUnitIds).toEqual(["u2"]);
    expect(coverage.verdicts.gatedSignal.reproduced).toBe(1);
    // The missing unit counts as untested — a coverage gap NEVER reads as reproduced.
    expect(coverage.verdicts.meta.untested).toBe(1);
    expect(coverage.reproducedRate).toEqual({
      numerator: 1,
      denominator: 2,
      value: 0.5,
    });
  });

  it("counts demoted signal verdicts separately, never in the signal bucket", () => {
    const unit = makeUnit("u3", STMT_A);
    const gated = gateUnitVerdict({
      unit,
      rawVerdict: "reproduced",
      rawEvidenceMode: "proxy_simulation",
      receipt: null, // no correspondence receipt → demotion
      executionEvidence: {
        measurements: { value: 1 },
        reportedArtifacts: ["out.json"],
      },
    });
    const bundle = buildReplicationBundle({
      paper: { id: "paper-1" },
      job: { id: "job-2", resultStatus: "succeeded", exitCode: 0, timedOut: false },
      units: [
        {
          unit,
          receipt: null,
          gated,
          confidence: 0.9,
          reason: "ran clean",
          simulationId: "sim-u3",
          artifacts: [],
          missingResult: false,
        },
      ],
      dontoStatementCount: 10,
      files: [],
    });

    const coverage = bundle.manifest.coverage;
    expect(coverage.verdicts.gatedSignal.reproduced).toBe(0);
    expect(coverage.verdicts.meta.untested).toBe(1);
    expect(coverage.verdicts.demotedSignalCount).toBe(1);
    expect(coverage.gateFailureCounts.correspondence).toBe(1);
    expect(bundle.manifest.units[0].verdict.ungatedVerdict).toBe("reproduced");
    expect(coverage.reproducedRate.numerator).toBe(0);
  });

  it("keeps per-unit claim ceilings unmerged", () => {
    const bundle = buildReplicationBundle({
      paper: { id: "paper-1" },
      job: null,
      units: [admittedInput("u1", STMT_A), missingResultInput("u2", STMT_B)],
      dontoStatementCount: 5,
      files: [],
    });
    const ceilings = bundle.manifest.units.map((entry) => entry.verdict.claimCeiling);
    expect(ceilings).toContain("proxy_dynamics");
    expect(ceilings).toContain("none");
    // The coverage section only histograms ceilings; there is no merged paper-level ceiling field.
    expect(
      (bundle.manifest.coverage as unknown as Record<string, unknown>)
        .claimCeiling,
    ).toBeUndefined();
    expect(bundle.manifest.coverage.claimCeilings).toEqual({
      proxy_dynamics: 1,
      none: 1,
    });
  });

  it("is content-addressed: same inputs → same sha; any change → different sha", () => {
    const input = {
      paper: { id: "paper-1" },
      job: null,
      units: [admittedInput("u1", STMT_A)],
      dontoStatementCount: 5,
      files: [],
      createdAt: "2026-08-25T00:00:00.000Z",
    };
    const first = buildReplicationBundle(input);
    const second = buildReplicationBundle(input);
    expect(first.sha256).toBe(second.sha256);

    const changed = buildReplicationBundle({
      ...input,
      dontoStatementCount: 6,
    });
    expect(changed.sha256).not.toBe(first.sha256);
  });

  it("derives graph-scope artifact ids without a job", () => {
    expect(replicationBundleArtifactId("p", null)).toBe("tp.replication.p.graph");
    expect(replicationBundleArtifactId("p", "j")).toBe("tp.replication.p.j");
  });
});
