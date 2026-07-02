import { describe, expect, it } from "vitest";
import { summarizeReplicationReadiness } from "./replication-readiness";

describe("summarizeReplicationReadiness", () => {
  it("counts insufficient inconclusive results as blocked", () => {
    const summary = summarizeReplicationReadiness([
      {
        id: "sim-1",
        verdict: "inconclusive",
        evidenceMode: "insufficient",
        unitType: "simulation",
        result: {
          reason: "The model cannot be faithfully reproduced from staged artifacts.",
        },
      },
    ]);

    expect(summary.total).toBe(1);
    expect(summary.blocked).toBe(1);
    expect(summary.unitTypeCounts).toEqual({ simulation: 1 });
    expect(summary.blockerCounts).toEqual({
      "insufficient evidence": 1,
    });
  });
});
