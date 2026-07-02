import { describe, expect, it } from "vitest";
import { buildReplicationUnitsFromDonto, type DontoStatementInput } from "./replication";

function statement(
  statementId: string,
  subject: string,
  predicate: string,
  value: string,
): DontoStatementInput {
  return {
    statementId,
    subject,
    predicate,
    object_lit: { v: value, dt: "xsd:string" },
    evidence_quote: value,
  };
}

describe("buildReplicationUnitsFromDonto", () => {
  it("keeps every non-metadata scientific statement as a replication unit", () => {
    const units = buildReplicationUnitsFromDonto({
      paperId: "paper-1",
      statements: [
        statement("stmt-1", "tp:paper:1", "schema:name", "A materials paper"),
        statement("stmt-2", "tp:claim:1", "tp:evidence", "Source sentence"),
        statement("stmt-3", "tp:claim:1", "tp:claimText", "Graphene improves tensile strength."),
        statement("stmt-4", "mat:composite", "hasDensity", "2.7 g/cm3"),
        statement("stmt-5", "mat:composite", "improvesStrength", "15%"),
      ],
    });

    expect(units).toHaveLength(3);
    expect(units.map((unit) => unit.unitType)).toEqual([
      "human_review",
      "metric_recompute",
      "baseline_contrast",
    ]);
    expect(units.every((unit) => unit.domain === "materials")).toBe(true);
  });

  it("routes broad physics dynamics into simulation units", () => {
    const units = buildReplicationUnitsFromDonto({
      paperId: "paper-2",
      statements: [
        statement("stmt-1", "tp:process:1", "simulatesMagneticFieldEvolution", "stable reconnection"),
      ],
    });

    expect(units).toHaveLength(1);
    expect(units[0].unitType).toBe("simulation");
    expect(units[0].verifierCandidates).toContain("digital-physics-reduced-model");
  });
});
