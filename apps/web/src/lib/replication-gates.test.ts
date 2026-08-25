import { describe, expect, it } from "vitest";
import type { ReplicationUnit } from "@toiletpaper/simulator";
import {
  CORRESPONDENCE_RECEIPT_SCHEMA_VERSION,
  type CorrespondenceReceipt,
} from "./replication-correspondence";
import {
  canonicalEvidenceMode,
  canonicalVerdict,
  evaluateCompilationGate,
  evaluateExecutionGate,
  evaluateExtractionGate,
  gateUnitVerdict,
} from "./replication-gates";

const STMT = "3f9a1c2e-4b5d-4e6f-8a9b-0c1d2e3f4a5b";

function makeUnit(overrides: Partial<ReplicationUnit> = {}): ReplicationUnit {
  return {
    id: "paper-1:replication:unit-1",
    paperId: "paper-1",
    claimIri: "ex:model-a",
    sourceStatementIds: [STMT],
    domain: "physics",
    unitType: "simulation",
    claimText: "model a reproduces the reported decay rate",
    evidenceQuotes: ["the decay rate was measured at 0.42 per second"],
    hypothesis: "a digital model reproduces the reported decay rate",
    expectedOutcome: "reduced model reproduces the trend",
    falsificationCriteria: [],
    requiredArtifacts: [],
    datasets: [],
    methods: [],
    metrics: [],
    baselines: [],
    parameters: [],
    computeBudget: { tier: "reduced", computeTier: "cpu", maxCpuHours: 4 },
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

function makeReceipt(
  overrides: Partial<CorrespondenceReceipt> = {},
): CorrespondenceReceipt {
  return {
    schemaVersion: CORRESPONDENCE_RECEIPT_SCHEMA_VERSION,
    unitId: "paper-1:replication:unit-1",
    binds: {
      claimIri: "ex:model-a",
      sourceStatementIds: [STMT],
      evidenceSpans: ["the decay rate was measured at 0.42 per second"],
    },
    system: {
      description: "First-order decay ODE integrated with RK4, dt=1e-3.",
      equations: ["dN/dt = -lambda * N"],
      randomProcess: { kind: "none" },
      tolerances: [{ name: "relative error", value: "1e-6" }],
      parameters: [{ name: "lambda", value: "0.42", unit: "1/s" }],
    },
    proxy: { isProxy: true, relation: "reduced 0-D model" },
    falsifier: { description: "analytic solution divergence" },
    code: [{ path: "experiments/unit-1/run_decay.py", sha256: null }],
    resolvedBlockers: [],
    declaredBy: "codex",
    declaredAt: "2026-08-25T00:00:00.000Z",
    ...overrides,
  };
}

describe("canonicalVerdict", () => {
  it("passes through the eight canonical values", () => {
    expect(canonicalVerdict("reproduced")).toBe("reproduced");
    expect(canonicalVerdict("vacuous")).toBe("vacuous");
  });

  it("maps unknown or missing verdicts to untested, not inconclusive", () => {
    expect(canonicalVerdict(undefined)).toBe("untested");
    expect(canonicalVerdict("confirmed")).toBe("untested");
    expect(canonicalVerdict("great success")).toBe("untested");
  });
});

describe("canonicalEvidenceMode", () => {
  it("maps unknown or missing modes to insufficient, never proxy_simulation", () => {
    expect(canonicalEvidenceMode(undefined)).toBe("insufficient");
    expect(canonicalEvidenceMode("")).toBe("insufficient");
    expect(canonicalEvidenceMode("vibes")).toBe("insufficient");
    expect(canonicalEvidenceMode("proxy_simulation")).toBe("proxy_simulation");
  });
});

describe("evaluateExtractionGate", () => {
  it("passes a bound unit and records span coverage", () => {
    const record = evaluateExtractionGate(makeUnit());
    expect(record.status).toBe("passed");
    expect(record.observed.sourceStatementCount).toBe(1);
  });

  it("fails a unit with no source statements", () => {
    const record = evaluateExtractionGate(makeUnit({ sourceStatementIds: [] }));
    expect(record.status).toBe("failed");
  });

  it("fails a unit whose primary statement id is not a UUID", () => {
    const record = evaluateExtractionGate(
      makeUnit({ sourceStatementIds: ["stmt-1"] }),
    );
    expect(record.status).toBe("failed");
  });

  it("warns on missing evidence quotes without failing", () => {
    const record = evaluateExtractionGate(makeUnit({ evidenceQuotes: [] }));
    expect(record.status).toBe("passed");
    expect(record.warnings.join(" ")).toMatch(/no extracted evidence quotes/);
  });
});

describe("evaluateCompilationGate", () => {
  it("fails on unresolved blocking blockers and surfaces them", () => {
    const record = evaluateCompilationGate(
      makeUnit({
        blockers: [
          {
            code: "needs-artifact-url",
            detail: "Need code before faithful replication.",
            severity: "blocking",
          },
        ],
      }),
      null,
    );
    expect(record.status).toBe("failed");
    expect(record.reasons.join(" ")).toContain("needs-artifact-url");
  });

  it("passes when the receipt declares a resolution for the blocker", () => {
    const record = evaluateCompilationGate(
      makeUnit({
        blockers: [
          {
            code: "needs-artifact-url",
            detail: "Need code before faithful replication.",
            severity: "blocking",
          },
        ],
      }),
      makeReceipt({
        resolvedBlockers: [
          {
            code: "needs-artifact-url",
            resolution:
              "Used staged supplemental bundle file inputs/config.yaml",
            artifacts: ["supplemental-artifacts/b1/files/config.yaml"],
          },
        ],
      }),
    );
    expect(record.status).toBe("passed");
    expect(record.observed.resolvedBlockerCount).toBe(1);
  });

  it("treats warning blockers as warnings only", () => {
    const record = evaluateCompilationGate(
      makeUnit({
        blockers: [
          {
            code: "needs-seed-count",
            detail: "Seed policy unclear.",
            severity: "warning",
          },
        ],
      }),
      null,
    );
    expect(record.status).toBe("passed");
    expect(record.warnings.join(" ")).toContain("needs-seed-count");
  });
});

describe("evaluateExecutionGate", () => {
  it("passes with measurements", () => {
    expect(
      evaluateExecutionGate({
        measurements: { value: 0.42 },
        reportedArtifacts: [],
      }).status,
    ).toBe("passed");
  });

  it("passes with reported artifacts", () => {
    expect(
      evaluateExecutionGate({
        measurements: null,
        reportedArtifacts: ["experiments/unit-1/out.json"],
      }).status,
    ).toBe("passed");
  });

  it("fails with neither", () => {
    expect(
      evaluateExecutionGate({ measurements: {}, reportedArtifacts: [] }).status,
    ).toBe("failed");
  });
});

describe("gateUnitVerdict", () => {
  const executionEvidence = {
    measurements: { decay_rate: 0.42 },
    reportedArtifacts: ["experiments/unit-1/out.json"],
  };

  it("admits a signal verdict when every gate passes", () => {
    const gated = gateUnitVerdict({
      unit: makeUnit(),
      rawVerdict: "reproduced",
      rawEvidenceMode: "proxy_simulation",
      receipt: makeReceipt(),
      executionEvidence,
    });
    expect(gated.verdict).toBe("reproduced");
    expect(gated.demoted).toBe(false);
    expect(gated.claimCeiling).toBe("proxy_dynamics");
    expect(gated.gates).toHaveLength(4);
    expect(gated.gates.every((gate) => gate.status === "passed")).toBe(true);
  });

  it("demotes a signal verdict without a correspondence receipt", () => {
    const gated = gateUnitVerdict({
      unit: makeUnit(),
      rawVerdict: "reproduced",
      rawEvidenceMode: "proxy_simulation",
      receipt: null,
      executionEvidence,
    });
    expect(gated.verdict).toBe("untested");
    expect(gated.demoted).toBe(true);
    expect(gated.ungatedVerdict).toBe("reproduced");
    expect(gated.gateFailures.map((failure) => failure.gate)).toContain(
      "correspondence",
    );
    // Without an auditable receipt the executable mode caps at static.
    expect(gated.claimCeiling).toBe("static_text_consistency");
  });

  it("demotes a signal verdict that left no execution evidence", () => {
    const gated = gateUnitVerdict({
      unit: makeUnit(),
      rawVerdict: "contradicted",
      rawEvidenceMode: "proxy_simulation",
      receipt: makeReceipt(),
      executionEvidence: { measurements: null, reportedArtifacts: [] },
    });
    expect(gated.verdict).toBe("untested");
    expect(gated.ungatedVerdict).toBe("contradicted");
    expect(gated.gateFailures.map((failure) => failure.gate)).toContain(
      "execution",
    );
  });

  it("demotes signal verdicts carrying insufficient evidence mode", () => {
    const gated = gateUnitVerdict({
      unit: makeUnit(),
      rawVerdict: "reproduced",
      rawEvidenceMode: "insufficient",
      receipt: makeReceipt(),
      executionEvidence,
    });
    expect(gated.verdict).toBe("untested");
    expect(gated.demoted).toBe(true);
    expect(
      gated.gateFailures.some((failure) => failure.gate === "verdict"),
    ).toBe(true);
  });

  it("demotes on unresolved blocking blockers", () => {
    const gated = gateUnitVerdict({
      unit: makeUnit({
        blockers: [
          {
            code: "needs-artifact-url",
            detail: "Need released code.",
            severity: "blocking",
          },
        ],
      }),
      rawVerdict: "reproduced",
      rawEvidenceMode: "proxy_simulation",
      receipt: makeReceipt(),
      executionEvidence,
    });
    expect(gated.verdict).toBe("untested");
    expect(gated.gateFailures.map((failure) => failure.gate)).toContain(
      "compilation",
    );
  });

  it("passes meta verdicts through unchanged with gates recorded", () => {
    const gated = gateUnitVerdict({
      unit: makeUnit(),
      rawVerdict: "not_applicable",
      rawEvidenceMode: "insufficient",
      receipt: null,
      executionEvidence: { measurements: null, reportedArtifacts: [] },
    });
    expect(gated.verdict).toBe("not_applicable");
    expect(gated.demoted).toBe(false);
    expect(gated.ungatedVerdict).toBeNull();
    expect(gated.gates).toHaveLength(4);
  });

  it("maps garbage verdicts to untested (never inconclusive)", () => {
    const gated = gateUnitVerdict({
      unit: makeUnit(),
      rawVerdict: "success!!",
      rawEvidenceMode: undefined,
      receipt: null,
      executionEvidence: { measurements: null, reportedArtifacts: [] },
    });
    expect(gated.verdict).toBe("untested");
    expect(gated.demoted).toBe(false);
  });
});
