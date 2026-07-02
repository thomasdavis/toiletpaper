import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  loadPaperArtifactManifest,
  paperArtifactManifestPath,
  resolvePaperArtifactFile,
  safeArtifactName,
  savePaperArtifactBundle,
} from "./paper-artifacts";

let root: string;
const previousRoot = process.env.PAPER_ARTIFACTS_DIR;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "tp-paper-artifacts-"));
  process.env.PAPER_ARTIFACTS_DIR = root;
});

afterEach(async () => {
  if (previousRoot === undefined) {
    delete process.env.PAPER_ARTIFACTS_DIR;
  } else {
    process.env.PAPER_ARTIFACTS_DIR = previousRoot;
  }
  await rm(root, { recursive: true, force: true });
});

describe("paper artifact bundles", () => {
  it("sanitizes names without allowing path traversal", () => {
    expect(safeArtifactName("../raw data/table 1.csv")).toBe("table-1.csv");
    expect(safeArtifactName("LAMMPS input deck.in")).toBe("LAMMPS-input-deck.in");
    expect(safeArtifactName("")).toBe("artifact");
  });

  it("persists bundle files, checksums, and a stable manifest", async () => {
    const paperId = "paper-artifact-test";
    const first = Buffer.from("alpha");
    const second = Buffer.from("beta");

    const { bundle } = await savePaperArtifactBundle({
      paperId,
      note: "source data and scripts",
      files: [
        { originalName: "raw table.csv", contentType: "text/csv", buffer: first },
        {
          originalName: "raw table.csv",
          contentType: "text/csv",
          buffer: second,
          source: {
            kind: "url",
            url: "https://example.org/raw-table.csv",
            finalUrl: "https://example.org/raw-table.csv",
            fetchedAt: "2026-06-18T00:00:00.000Z",
            status: 200,
          },
        },
      ],
    });

    expect(bundle.fileCount).toBe(2);
    expect(bundle.files.map((file) => file.storedName)).toEqual([
      "raw-table.csv",
      "raw-table-2.csv",
    ]);
    expect(bundle.files[0].sha256).toHaveLength(64);

    const manifest = await loadPaperArtifactManifest(paperId);
    expect(manifest.bundleCount).toBe(1);
    expect(manifest.totalBytes).toBe(first.byteLength + second.byteLength);
    expect(manifest.bundles[0].note).toBe("source data and scripts");
    expect(manifest.bundles[0].files[0].source.kind).toBe("upload");
    expect(manifest.bundles[0].files[1].source).toMatchObject({
      kind: "url",
      url: "https://example.org/raw-table.csv",
      status: 200,
    });

    const stored = await readFile(join(root, paperId, bundle.files[1].relativePath), "utf8");
    expect(stored).toBe("beta");
    const resolved = await resolvePaperArtifactFile({
      paperId,
      bundleId: bundle.id,
      fileId: bundle.files[1].id,
    });
    expect(resolved?.bundle.id).toBe(bundle.id);
    expect(resolved?.file.originalName).toBe("raw table.csv");
    expect(resolved?.file.source.kind).toBe("url");
    await expect(readFile(resolved?.absolutePath ?? "", "utf8")).resolves.toBe("beta");

    const manifestText = await readFile(paperArtifactManifestPath(paperId), "utf8");
    expect(JSON.parse(manifestText).schemaVersion).toBe(
      "toiletpaper.paper-artifact-bundles.v1",
    );
  });
});
