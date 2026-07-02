import { describe, expect, it } from "vitest";
import { summarizeArtifactGapCoverage } from "./artifact-gap-coverage";
import type { ReplicationGapManifest } from "./replication-gap-manifest";
import type { PaperArtifactManifest } from "./paper-artifacts";

function gapManifest(): ReplicationGapManifest {
  return {
    totalCurrentResults: 4,
    blockedResults: 4,
    blockedUnits: 4,
    requestCount: 4,
    criticalRequestCount: 2,
    highRequestCount: 2,
    requests: [
      {
        id: "md-input-decks",
        kind: "md-input-decks",
        label: "Molecular dynamics input decks",
        priority: "critical",
        unitCount: 2,
        simulationCount: 2,
        unitTypes: { simulation: 2 },
        domains: { materials: 2 },
        sourceStatementIds: ["stmt-1"],
        examples: [],
      },
      {
        id: "potential-files",
        kind: "potential-files",
        label: "Interatomic potential files",
        priority: "critical",
        unitCount: 1,
        simulationCount: 1,
        unitTypes: { artifact_availability: 1 },
        domains: { materials: 1 },
        sourceStatementIds: ["stmt-2"],
        examples: [],
      },
      {
        id: "artifact-urls",
        kind: "artifact-urls",
        label: "Exact artifact URLs or repository references",
        priority: "high",
        unitCount: 1,
        simulationCount: 1,
        unitTypes: { artifact_availability: 1 },
        domains: { materials: 1 },
        sourceStatementIds: ["stmt-3"],
        examples: [],
      },
      {
        id: "image-data",
        kind: "image-data",
        label: "Microscopy images and measurement data",
        priority: "critical",
        unitCount: 1,
        simulationCount: 1,
        unitTypes: { dataset_integrity: 1 },
        domains: { materials: 1 },
        sourceStatementIds: ["stmt-4"],
        examples: [],
      },
    ],
  };
}

function artifactManifest(): PaperArtifactManifest {
  return {
    schemaVersion: "toiletpaper.paper-artifact-bundles.v1",
    paperId: "paper-1",
    updatedAt: "2026-06-18T00:00:00.000Z",
    bundleCount: 1,
    totalBytes: 30,
    bundles: [
      {
        id: "bundle-1",
        note: "LAMMPS input decks and AIREBO potential from public repository",
        createdAt: "2026-06-18T00:00:00.000Z",
        fileCount: 3,
        totalBytes: 30,
        files: [
          {
            id: "file-1",
            originalName: "graphene_interface.in",
            storedName: "graphene_interface.in",
            relativePath: "bundle-1/files/graphene_interface.in",
            contentType: "text/plain",
            byteLength: 10,
            sha256: "a".repeat(64),
            source: { kind: "upload" },
          },
          {
            id: "file-2",
            originalName: "CH.airebo",
            storedName: "CH.airebo",
            relativePath: "bundle-1/files/CH.airebo",
            contentType: "text/plain",
            byteLength: 10,
            sha256: "b".repeat(64),
            source: {
              kind: "url",
              url: "https://github.com/example/paper-artifacts/raw/main/CH.airebo",
              finalUrl: "https://github.com/example/paper-artifacts/raw/main/CH.airebo",
              fetchedAt: "2026-06-18T00:00:00.000Z",
              status: 200,
            },
          },
          {
            id: "file-3",
            originalName: "README.md",
            storedName: "README.md",
            relativePath: "bundle-1/files/README.md",
            contentType: "text/markdown",
            byteLength: 10,
            sha256: "c".repeat(64),
            source: { kind: "upload" },
          },
        ],
      },
    ],
  };
}

describe("summarizeArtifactGapCoverage", () => {
  it("maps uploaded/imported artifacts to missing artifact request kinds", () => {
    const coverage = summarizeArtifactGapCoverage({
      gapManifest: gapManifest(),
      artifactManifest: artifactManifest(),
    });

    expect(coverage.artifactFileCount).toBe(3);
    expect(coverage.candidateRequestCount).toBe(3);
    expect(coverage.unmatchedRequestCount).toBe(1);
    expect(
      coverage.requestCoverage.find((request) => request.requestKind === "md-input-decks")
        ?.matches[0]?.originalName,
    ).toBe("graphene_interface.in");
    expect(
      coverage.requestCoverage.find((request) => request.requestKind === "potential-files")
        ?.matches[0]?.sourceKind,
    ).toBe("url");
    expect(
      coverage.requestCoverage.find((request) => request.requestKind === "artifact-urls")
        ?.matches.some((match) => match.sourceUrl?.includes("github.com")),
    ).toBe(true);
    expect(
      coverage.requestCoverage.find((request) => request.requestKind === "image-data")
        ?.status,
    ).toBe("unmatched");
  });

  it("keeps empty artifact manifests as unmatched requests", () => {
    const coverage = summarizeArtifactGapCoverage({
      gapManifest: gapManifest(),
      artifactManifest: null,
    });

    expect(coverage.artifactFileCount).toBe(0);
    expect(coverage.candidateRequestCount).toBe(0);
    expect(coverage.unmatchedRequestCount).toBe(4);
    expect(coverage.unmatchedFiles).toEqual([]);
  });
});
