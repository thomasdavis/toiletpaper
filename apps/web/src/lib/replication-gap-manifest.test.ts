import { describe, expect, it } from "vitest";
import { summarizeReplicationGapManifest } from "./replication-gap-manifest";

describe("summarizeReplicationGapManifest", () => {
  it("groups insufficient MD rows into actionable missing artifact requests", () => {
    const manifest = summarizeReplicationGapManifest({
      units: [
        {
          id: "unit-md",
          claimText: "MD simulations predict ITC of 85 +/- 12",
          unitType: "simulation",
          domain: "materials",
          sourceStatementIds: ["stmt-1"],
          requiredArtifacts: [
            { kind: "code", name: "paper implementation or model card" },
          ],
          blockers: [
            {
              code: "needs-artifact-url",
              detail: "Need an artifact reference before checking availability.",
            },
          ],
        },
      ],
      simulations: [
        {
          id: "sim-md",
          verdict: "inconclusive",
          evidenceMode: "insufficient",
          metadata: {
            replication_unit_id: "unit-md",
            unit_type: "simulation",
          },
          result: {
            reason:
              "Need MD inputs, potential files, structure files, trajectories, and EMA fitting artifacts.",
          },
          limitations: [
            "Need exact LAMMPS potential configuration and simulation input files.",
          ],
        },
      ],
    });

    expect(manifest.blockedResults).toBe(1);
    expect(manifest.blockedUnits).toBe(1);
    expect(manifest.requests.map((request) => request.kind)).toEqual(
      expect.arrayContaining([
        "md-input-decks",
        "potential-files",
        "structure-files",
        "trajectories",
        "fitting-artifacts",
        "artifact-urls",
      ]),
    );
    expect(
      manifest.requests.find((request) => request.kind === "md-input-decks")
        ?.sourceStatementIds,
    ).toEqual(["stmt-1"]);
  });

  it("ignores reproduced rows with sufficient evidence", () => {
    const manifest = summarizeReplicationGapManifest({
      units: [{ id: "unit-ok", unitType: "metric_recompute" }],
      simulations: [
        {
          id: "sim-ok",
          verdict: "reproduced",
          evidenceMode: "exact_artifact",
          metadata: { replication_unit_id: "unit-ok" },
          result: { reason: "Table value matches." },
        },
      ],
    });

    expect(manifest.blockedResults).toBe(0);
    expect(manifest.requestCount).toBe(0);
    expect(manifest.requests).toEqual([]);
  });
});
