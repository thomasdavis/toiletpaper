import { describe, expect, it } from "vitest";
import type { ReplicationUnit } from "@toiletpaper/simulator";
import { executeReplicationUnit } from "@toiletpaper/simulator";
import {
  CORRESPONDENCE_RECEIPT_SCHEMA_VERSION,
  claimCeilingFor,
  deriveDeterministicReceipt,
  parseCorrespondenceReceipt,
  validateCorrespondenceReceipt,
  type CorrespondenceReceipt,
} from "./replication-correspondence";

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
    falsificationCriteria: ["model with stated assumptions fails to reproduce"],
    requiredArtifacts: [],
    datasets: [],
    methods: [],
    metrics: [],
    baselines: [],
    parameters: [],
    computeBudget: { tier: "reduced", computeTier: "cpu", maxCpuHours: 4 },
    verifierCandidates: ["digital-physics-reduced-model"],
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
      tolerances: [{ name: "relative error", value: "1e-6", kind: "relative" }],
      parameters: [{ name: "lambda", value: "0.42", unit: "1/s" }],
    },
    proxy: { isProxy: true, relation: "reduced 0-D model of the reported system" },
    falsifier: {
      description: "Any lambda for which the analytic solution diverges from RK4.",
    },
    code: [{ path: "experiments/unit-1/run_decay.py", sha256: null }],
    resolvedBlockers: [],
    declaredBy: "codex",
    declaredAt: "2026-08-25T00:00:00.000Z",
    ...overrides,
  };
}

describe("validateCorrespondenceReceipt", () => {
  it("accepts a complete proxy receipt", () => {
    const validation = validateCorrespondenceReceipt(
      makeReceipt(),
      makeUnit(),
      "proxy_simulation",
    );
    expect(validation.errors).toEqual([]);
    expect(validation.valid).toBe(true);
  });

  it("fails when no receipt exists", () => {
    const validation = validateCorrespondenceReceipt(
      null,
      makeUnit(),
      "proxy_simulation",
    );
    expect(validation.valid).toBe(false);
    expect(validation.errors[0]).toMatch(/no correspondence receipt/);
  });

  it("fails when the receipt binds statement ids the unit does not have", () => {
    const foreign = "11111111-2222-4333-8444-555555555555";
    const validation = validateCorrespondenceReceipt(
      makeReceipt({
        binds: {
          claimIri: "ex:model-a",
          sourceStatementIds: [foreign],
          evidenceSpans: [],
        },
      }),
      makeUnit(),
      "proxy_simulation",
    );
    expect(validation.valid).toBe(false);
    expect(validation.errors.join(" ")).toContain(foreign);
  });

  it("fails when the receipt binds no statements at all", () => {
    const validation = validateCorrespondenceReceipt(
      makeReceipt({
        binds: { claimIri: "ex:model-a", sourceStatementIds: [], evidenceSpans: [] },
      }),
      makeUnit(),
      "proxy_simulation",
    );
    expect(validation.valid).toBe(false);
    expect(validation.errors.join(" ")).toMatch(/binds no source statement/);
  });

  it("requires proxy declaration for proxy_simulation mode", () => {
    const validation = validateCorrespondenceReceipt(
      makeReceipt({ proxy: { isProxy: false } }),
      makeUnit(),
      "proxy_simulation",
    );
    expect(validation.valid).toBe(false);
    expect(validation.errors.join(" ")).toMatch(/does not declare itself a proxy/);
  });

  it("requires code refs and system content for executable modes", () => {
    const validation = validateCorrespondenceReceipt(
      makeReceipt({
        code: [],
        system: {
          description: "something ran",
          equations: [],
          randomProcess: { kind: "none" },
          tolerances: [],
          parameters: [],
        },
      }),
      makeUnit(),
      "independent_implementation",
    );
    expect(validation.valid).toBe(false);
    expect(validation.errors.join(" ")).toMatch(/code reference/);
    expect(validation.errors.join(" ")).toMatch(/equations or parameters/);
  });

  it("requires seeds when the random process claims to be seeded", () => {
    const validation = validateCorrespondenceReceipt(
      makeReceipt({
        system: {
          ...makeReceipt().system,
          randomProcess: { kind: "seeded", seeds: [] },
        },
      }),
      makeUnit(),
      "proxy_simulation",
    );
    expect(validation.valid).toBe(false);
    expect(validation.errors.join(" ")).toMatch(/no seeds are declared/);
  });

  it("does not demand executable fields for static checks", () => {
    const validation = validateCorrespondenceReceipt(
      makeReceipt({
        code: [],
        proxy: { isProxy: false },
        system: {
          description: "Compared the quoted value against the extracted table value.",
          equations: [],
          randomProcess: { kind: "none" },
          tolerances: [],
          parameters: [],
        },
      }),
      makeUnit(),
      "static_check",
    );
    expect(validation.errors).toEqual([]);
    expect(validation.valid).toBe(true);
  });

  it("warns, but does not fail, on a missing falsifier", () => {
    const validation = validateCorrespondenceReceipt(
      makeReceipt({ falsifier: undefined }),
      makeUnit(),
      "proxy_simulation",
    );
    expect(validation.valid).toBe(true);
    expect(validation.warnings.join(" ")).toMatch(/falsifier/);
  });
});

describe("parseCorrespondenceReceipt", () => {
  it("parses snake_case agent output", () => {
    const receipt = parseCorrespondenceReceipt({
      unit_id: "paper-1:replication:unit-1",
      binds: {
        claim_iri: "ex:model-a",
        source_statement_ids: [STMT],
        evidence_spans: ["quoted span"],
      },
      simulated_system: {
        description: "RK4 decay model",
        equations: ["dN/dt = -lambda N"],
        random_process: { kind: "seeded", seeds: [7] },
        tolerances: [{ name: "abs", value: "1e-9" }],
        parameters: [{ name: "lambda", value: 0.42 }],
      },
      proxy: { is_proxy: true, relation: "reduced model" },
      code: [{ path: "run.py" }],
      declared_by: "codex",
    });
    expect(receipt).not.toBeNull();
    expect(receipt?.unitId).toBe("paper-1:replication:unit-1");
    expect(receipt?.binds.sourceStatementIds).toEqual([STMT]);
    expect(receipt?.system.randomProcess).toEqual({
      kind: "seeded",
      seeds: [7],
      description: undefined,
    });
    expect(receipt?.system.parameters[0]).toEqual({
      name: "lambda",
      value: "0.42",
      unit: undefined,
    });
    expect(receipt?.proxy.isProxy).toBe(true);
  });

  it("returns null for junk", () => {
    expect(parseCorrespondenceReceipt(null)).toBeNull();
    expect(parseCorrespondenceReceipt("nope")).toBeNull();
    expect(parseCorrespondenceReceipt({})).toBeNull();
  });
});

describe("claimCeilingFor", () => {
  it("maps evidence modes with a valid receipt", () => {
    expect(claimCeilingFor("exact_artifact", true)).toBe(
      "original_artifact_reexecution",
    );
    expect(claimCeilingFor("independent_implementation", true)).toBe(
      "independent_reimplementation",
    );
    expect(claimCeilingFor("proxy_simulation", true)).toBe("proxy_dynamics");
    expect(claimCeilingFor("static_check", true)).toBe("static_text_consistency");
    expect(claimCeilingFor("formal_proof", true)).toBe("formal_statement_proof");
    expect(claimCeilingFor("insufficient", true)).toBe("none");
  });

  it("caps executable modes at static consistency without a valid receipt", () => {
    expect(claimCeilingFor("exact_artifact", false)).toBe(
      "static_text_consistency",
    );
    expect(claimCeilingFor("proxy_simulation", false)).toBe(
      "static_text_consistency",
    );
    expect(claimCeilingFor("static_check", false)).toBe(
      "static_text_consistency",
    );
    expect(claimCeilingFor("insufficient", false)).toBe("none");
  });
});

describe("deriveDeterministicReceipt", () => {
  it("derives a valid static-check receipt from a deterministic execution", () => {
    const unit = makeUnit({ unitType: "equation_check" });
    const execution = executeReplicationUnit(unit);
    const receipt = deriveDeterministicReceipt(unit, execution);
    expect(receipt.declaredBy).toBe("deterministic-executor");
    expect(receipt.binds.sourceStatementIds).toEqual(unit.sourceStatementIds);
    const validation = validateCorrespondenceReceipt(receipt, unit, "static_check");
    expect(validation.errors).toEqual([]);
    expect(validation.valid).toBe(true);
  });
});
