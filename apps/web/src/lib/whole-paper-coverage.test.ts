import { describe, expect, it } from "vitest";
import { summarizeWholePaperCoverage } from "./whole-paper-coverage";

describe("summarizeWholePaperCoverage", () => {
  it("summarizes unique unit coverage from current simulation rows", () => {
    const summary = summarizeWholePaperCoverage({
      dontoStatementCount: 12,
      units: [
        {
          id: "unit-1",
          unitType: "metric_recompute",
          sourceStatementIds: ["stmt-1"],
        },
        {
          id: "unit-2",
          unitType: "simulation",
          sourceStatementIds: ["stmt-2", "stmt-3"],
        },
      ],
      simulations: [
        {
          id: "sim-1",
          verdict: "reproduced",
          evidenceMode: "exact_artifact",
          metadata: { replication_unit_id: "unit-1" },
        },
        {
          id: "sim-2",
          verdict: "inconclusive",
          evidenceMode: "insufficient",
          metadata: { replication_unit_id: "unit-2" },
        },
      ],
    });

    expect(summary.dontoStatementCount).toBe(12);
    expect(summary.sourceStatementCount).toBe(3);
    expect(summary.replicationUnitCount).toBe(2);
    expect(summary.coveredUnitCount).toBe(2);
    expect(summary.missingResultCount).toBe(0);
    expect(summary.blockedOrInsufficientCount).toBe(1);
    expect(summary.coveragePercent).toBe(100);
    expect(summary.unitTypeCounts).toEqual({
      metric_recompute: 1,
      simulation: 1,
    });
    expect(summary.verdictCounts).toEqual({
      inconclusive: 1,
      reproduced: 1,
    });
  });
});
