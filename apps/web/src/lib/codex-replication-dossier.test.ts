import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { summarizeCodexWorkdirDossier } from "./codex-replication-dossier";

type DossierInput = Parameters<typeof summarizeCodexWorkdirDossier>[0];

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "tp-codex-dossier-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function writeJson(relativePath: string, value: unknown) {
  const path = join(root, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(relativePath: string, value: string) {
  const path = join(root, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value);
}

function fakeJob() {
  return {
    id: "job-dossier-test",
    paperId: "paper-dossier-test",
    scope: "full_codex_paper",
    scopeArgs: {},
    state: "succeeded",
    totalUnits: 2,
    completedUnits: 2,
    failedUnits: 0,
    startedAt: new Date("2026-06-18T00:00:00.000Z"),
    finishedAt: new Date("2026-06-18T00:10:00.000Z"),
    triggeredBy: "test",
    errorSummary: null,
    createdAt: new Date("2026-06-18T00:00:00.000Z"),
  };
}

describe("Codex replication dossier", () => {
  it("marks a full workdir auditable when results and coverage agree", async () => {
    await writeJson("paper.json", { title: "fixture" });
    await writeText("paper-text.txt", "paper text");
    await writeJson("donto-statements.json", { count: 2, statements: [] });
    await writeJson("replication-units.json", [{ id: "u1" }, { id: "u2" }]);
    await writeJson("deterministic-executions.json", []);
    await writeJson("supplemental-artifacts.json", { bundleCount: 0 });
    await writeJson("artifact-gap-manifest.json", { requestCount: 0 });
    await writeJson("artifact-gap-coverage.json", { candidateRequestCount: 0 });
    await writeText("prompt.md", "replicate the paper");
    await writeJson("codex-command.json", { bin: "codex" });
    await writeText("toiletpaper-job-events.jsonl", "{}\n");
    await writeText("codex-events.jsonl", "{}\n");
    await writeJson("results.json", {
      schema_version: "toiletpaper.codex-full-paper-results.v1",
      status: "succeeded",
      summary: {
        total_units: 2,
        completed_units: 2,
        blocked_units: 0,
        failed_units: 0,
      },
      units: [
        {
          replication_unit_id: "u1",
          verdict: "reproduced",
          evidence_mode: "static_check",
          artifacts: ["experiments/full_paper_replication/check.json"],
        },
        {
          replication_unit_id: "u2",
          verdict: "inconclusive",
          evidence_mode: "insufficient",
          artifacts: [],
        },
      ],
    });
    await writeJson("experiments/full_paper_replication/coverage_report.json", {
      donto_statement_count: 10,
      replication_unit_count: 2,
      result_unit_count: 2,
      missing_unit_ids: [],
      unit_type_counts: { equation_check: 1, human_review: 1 },
      blocked_reasons: {},
    });
    await writeJson("replication-dossier-snapshot.json", {
      schemaVersion: "toiletpaper.codex-replication-dossier-snapshot.v1",
    });
    await writeJson("experiments/full_paper_replication/check.json", {
      ok: true,
    });
    await writeText("src/full_paper_replication.mjs", "export const ok = true;\n");

    const dossier = await summarizeCodexWorkdirDossier({
      paperId: "paper-dossier-test",
      job: fakeJob() as DossierInput["job"],
      workdir: root,
    });

    expect(dossier.status).toBe("auditable");
    expect(dossier.coreFilesPresent).toBe(dossier.coreFilesRequired);
    expect(dossier.results.uniqueUnitCount).toBe(2);
    expect(dossier.results.missingUnitCount).toBe(0);
    expect(dossier.results.verdictCounts).toMatchObject({
      reproduced: 1,
      inconclusive: 1,
    });
    const resultsFile = dossier.files.find(
      (file) => file.relativePath === "results.json",
    );
    expect(resultsFile?.sha256).toHaveLength(64);
    expect(resultsFile?.hashStatus).toBe("computed");
    expect(dossier.checks.coverageReportMatchesResults).toBe(true);
    expect(
      dossier.generatedArtifacts.some((file) =>
        file.relativePath.endsWith("check.json"),
      ),
    ).toBe(true);
    expect(
      dossier.generatedArtifacts.some((file) =>
        file.relativePath.endsWith("full_paper_replication.mjs"),
      ),
    ).toBe(true);
  });

  it("keeps missing result coverage incomplete", async () => {
    await writeJson("paper.json", {});
    await writeJson("donto-statements.json", { count: 2, statements: [] });
    await writeJson("replication-units.json", [{ id: "u1" }, { id: "u2" }]);
    await writeJson("deterministic-executions.json", []);
    await writeJson("supplemental-artifacts.json", {});
    await writeJson("artifact-gap-manifest.json", {});
    await writeJson("artifact-gap-coverage.json", {});
    await writeText("prompt.md", "prompt");
    await writeJson("codex-command.json", {});
    await writeText("toiletpaper-job-events.jsonl", "{}\n");
    await writeText("codex-events.jsonl", "{}\n");
    await writeJson("results.json", {
      status: "succeeded",
      units: [{ replication_unit_id: "u1", verdict: "reproduced" }],
    });
    await writeJson("experiments/full_paper_replication/coverage_report.json", {
      replication_unit_count: 2,
      result_unit_count: 1,
      missing_unit_ids: ["u2"],
    });
    await writeJson("replication-dossier-snapshot.json", {
      schemaVersion: "toiletpaper.codex-replication-dossier-snapshot.v1",
    });

    const dossier = await summarizeCodexWorkdirDossier({
      paperId: "paper-dossier-test",
      job: fakeJob() as DossierInput["job"],
      workdir: root,
    });

    expect(dossier.status).toBe("incomplete");
    expect(dossier.results.missingUnitCount).toBe(1);
    expect(dossier.checks.resultsCoverAllUnits).toBe(false);
  });
});
