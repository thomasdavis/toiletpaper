/**
 * Bundle/correspondence IO shared by the live Codex job path
 * (run-codex-replication-job.ts) and the recovery path
 * (ingest-codex-results.ts).
 *
 * - loads and parses the agent-written correspondence manifest,
 * - fills machine-derived sha256 digests for receipt code references,
 * - hashes the workdir files the bundle indexes,
 * - writes replication-bundle.json (+ .sha256 sidecar) and inserts the
 *   replication_bundles row (gracefully skipped when the table does not
 *   exist yet — drizzle push is a deployment step, not a runtime one).
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type postgres from "postgres";
import {
  parseCorrespondenceReceipt,
  type CorrespondenceReceipt,
} from "../../apps/web/src/lib/replication-correspondence";
import {
  buildReplicationBundle,
  type BuildReplicationBundleInput,
  type BundleFileDigest,
  type ReplicationBundle,
} from "../../apps/web/src/lib/replication-bundle";

export const CORRESPONDENCE_MANIFEST_FILENAME = "correspondence-manifest.json";
export const REPLICATION_BUNDLE_FILENAME = "replication-bundle.json";

export interface LoadedCorrespondenceManifest {
  path: string;
  exists: boolean;
  error: string | null;
  receiptCount: number;
  /** Receipts keyed by unit id; entries that failed structural parse are dropped. */
  receipts: Map<string, CorrespondenceReceipt>;
  unparseableEntries: number;
}

export async function loadCorrespondenceManifest(
  workdir: string,
): Promise<LoadedCorrespondenceManifest> {
  const path = join(workdir, CORRESPONDENCE_MANIFEST_FILENAME);
  const loaded: LoadedCorrespondenceManifest = {
    path,
    exists: false,
    error: null,
    receiptCount: 0,
    receipts: new Map(),
    unparseableEntries: 0,
  };
  if (!existsSync(path)) return loaded;
  loaded.exists = true;
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as {
      receipts?: unknown[];
    };
    const entries = Array.isArray(parsed.receipts) ? parsed.receipts : [];
    for (const entry of entries) {
      const receipt = parseCorrespondenceReceipt(entry);
      if (!receipt) {
        loaded.unparseableEntries += 1;
        continue;
      }
      loaded.receipts.set(receipt.unitId, receipt);
    }
    loaded.receiptCount = loaded.receipts.size;
  } catch (e) {
    loaded.error = e instanceof Error ? e.message : String(e);
  }
  return loaded;
}

async function sha256OfFile(path: string, maxBytes: number) {
  const fileStat = await stat(path);
  if (!fileStat.isFile() || fileStat.size > maxBytes) return null;
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

function safeWorkdirRelativePath(relativePath: string) {
  return (
    relativePath.length > 0 &&
    !relativePath.startsWith("/") &&
    !relativePath.split(/[\\/]+/).includes("..")
  );
}

/**
 * Fill in sha256 digests for receipt code refs whose paths exist inside the
 * workdir. Digests we compute ourselves are trustworthy; agent-declared
 * digests are kept as-declared (the auditor can recompute).
 */
export async function resolveReceiptCodeDigests(
  receipt: CorrespondenceReceipt,
  workdir: string,
  maxBytes = 64 * 1024 * 1024,
): Promise<CorrespondenceReceipt> {
  const code = await Promise.all(
    receipt.code.map(async (ref) => {
      if (ref.sha256 || !safeWorkdirRelativePath(ref.path)) return ref;
      const absolute = join(workdir, ref.path);
      if (!existsSync(absolute)) return ref;
      try {
        return { ...ref, sha256: await sha256OfFile(absolute, maxBytes) };
      } catch {
        return ref;
      }
    }),
  );
  return { ...receipt, code };
}

export interface DescribeBundleFilesInput {
  workdir: string;
  files: Array<{
    relativePath: string;
    phase: "input" | "runtime" | "output";
  }>;
  maxBytes?: number;
}

export async function describeBundleFiles(
  input: DescribeBundleFilesInput,
): Promise<BundleFileDigest[]> {
  const maxBytes = input.maxBytes ?? 64 * 1024 * 1024;
  return Promise.all(
    input.files.map(async (file) => {
      const absolute = join(input.workdir, file.relativePath);
      try {
        const fileStat = await stat(absolute);
        if (!fileStat.isFile()) {
          return {
            relativePath: file.relativePath,
            phase: file.phase,
            sha256: null,
            byteLength: null,
            hashStatus: "missing",
          };
        }
        if (fileStat.size > maxBytes) {
          return {
            relativePath: file.relativePath,
            phase: file.phase,
            sha256: null,
            byteLength: fileStat.size,
            hashStatus: "too_large",
          };
        }
        return {
          relativePath: file.relativePath,
          phase: file.phase,
          sha256: createHash("sha256")
            .update(await readFile(absolute))
            .digest("hex"),
          byteLength: fileStat.size,
          hashStatus: "computed",
        };
      } catch {
        return {
          relativePath: file.relativePath,
          phase: file.phase,
          sha256: null,
          byteLength: null,
          hashStatus: "missing",
        };
      }
    }),
  );
}

export interface WriteReplicationBundleResult {
  bundle: ReplicationBundle;
  bundlePath: string;
  dbInsert: "inserted" | "skipped" | "failed";
  dbError: string | null;
}

/**
 * Build the bundle, write it into the workdir, and record it in
 * replication_bundles. The DB insert is best-effort by design: the bundle
 * FILE is the artifact of record; the row is the index. A missing table
 * (drizzle push not yet run) must not fail the job.
 */
export async function writeReplicationBundle(input: {
  sql: ReturnType<typeof postgres>;
  workdir: string;
  build: BuildReplicationBundleInput;
}): Promise<WriteReplicationBundleResult> {
  const bundle = buildReplicationBundle(input.build);
  const bundlePath = join(input.workdir, REPLICATION_BUNDLE_FILENAME);
  await writeFile(
    bundlePath,
    `${JSON.stringify(bundle.manifest, null, 2)}\n`,
  );
  await writeFile(
    `${bundlePath.replace(/\.json$/, "")}.sha256`,
    `${bundle.sha256}  ${REPLICATION_BUNDLE_FILENAME}\n`,
  );

  const coverage = bundle.manifest.coverage;
  const gatedSignal =
    coverage.verdicts.gatedSignal.reproduced +
    coverage.verdicts.gatedSignal.contradicted +
    coverage.verdicts.gatedSignal.fragile +
    coverage.verdicts.gatedSignal.inconclusive;
  const metaUnits =
    coverage.verdicts.meta.not_applicable +
    coverage.verdicts.meta.vacuous +
    coverage.verdicts.meta.system_error +
    coverage.verdicts.meta.untested;
  const validReceiptUnits = bundle.manifest.units.filter(
    (unit) => unit.receiptValid,
  ).length;

  let dbInsert: WriteReplicationBundleResult["dbInsert"] = "skipped";
  let dbError: string | null = null;
  try {
    await input.sql`
      INSERT INTO replication_bundles (
        paper_id,
        job_id,
        artifact_id,
        schema_version,
        sha256,
        manifest,
        workdir_path,
        total_units,
        gated_signal_units,
        demoted_signal_units,
        meta_units,
        missing_result_units,
        valid_receipt_units
      )
      VALUES (
        ${bundle.manifest.paper.id},
        ${bundle.manifest.job?.id ?? null},
        ${bundle.manifest.artifactId},
        ${bundle.manifest.schemaVersion},
        ${bundle.sha256},
        ${input.sql.json(JSON.parse(JSON.stringify(bundle.manifest)))},
        ${input.workdir},
        ${coverage.unitCount},
        ${gatedSignal},
        ${coverage.verdicts.demotedSignalCount},
        ${metaUnits},
        ${coverage.missingResultUnitIds.length},
        ${validReceiptUnits}
      )
      ON CONFLICT (artifact_id, sha256) DO NOTHING
    `;
    dbInsert = "inserted";
  } catch (e) {
    dbInsert = "failed";
    dbError = e instanceof Error ? e.message : String(e);
  }

  return { bundle, bundlePath, dbInsert, dbError };
}
