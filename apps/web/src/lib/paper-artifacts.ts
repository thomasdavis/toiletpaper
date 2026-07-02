import { randomUUID, createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import {
  basename,
  extname,
  isAbsolute,
  join,
  normalize,
  parse,
  relative,
  resolve,
} from "node:path";

export const PAPER_ARTIFACT_MANIFEST_VERSION =
  "toiletpaper.paper-artifact-bundles.v1";

export interface PaperArtifactFile {
  id: string;
  originalName: string;
  storedName: string;
  relativePath: string;
  contentType: string;
  byteLength: number;
  sha256: string;
  source: {
    kind: "upload" | "url";
    url?: string;
    finalUrl?: string;
    fetchedAt?: string;
    status?: number;
  };
}

export interface PaperArtifactBundle {
  id: string;
  note: string | null;
  createdAt: string;
  fileCount: number;
  totalBytes: number;
  files: PaperArtifactFile[];
}

export interface PaperArtifactManifest {
  schemaVersion: typeof PAPER_ARTIFACT_MANIFEST_VERSION;
  paperId: string;
  updatedAt: string;
  bundleCount: number;
  totalBytes: number;
  bundles: PaperArtifactBundle[];
}

export interface ArtifactFileInput {
  originalName: string;
  contentType?: string | null;
  buffer: Buffer;
  source?: PaperArtifactFile["source"];
}

const SAFE_PAPER_ID_RE = /^[a-zA-Z0-9_-]+$/;
const SAFE_ARTIFACT_ID_RE = /^[a-zA-Z0-9_-]+$/;

export function paperArtifactsRoot() {
  const explicit = process.env.PAPER_ARTIFACTS_DIR?.trim();
  if (explicit) return explicit;
  const workdir = process.env.SIMULATOR_WORKDIR ?? join("/tmp", "tp-simulations");
  return join(workdir, "paper-artifacts");
}

export function assertSafePaperId(paperId: string) {
  if (!SAFE_PAPER_ID_RE.test(paperId)) {
    throw new Error("invalid paper id for artifact path");
  }
}

export function paperArtifactDir(paperId: string) {
  assertSafePaperId(paperId);
  return join(paperArtifactsRoot(), paperId);
}

export function paperArtifactManifestPath(paperId: string) {
  return join(paperArtifactDir(paperId), "manifest.json");
}

export function safeArtifactName(name: string) {
  const base = basename(name || "artifact");
  const parsed = parse(base);
  const stem =
    parsed.name
      .normalize("NFKD")
      .replace(/[^\w.-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "artifact";
  const ext = extname(base)
    .normalize("NFKD")
    .replace(/[^.\w-]+/g, "")
    .slice(0, 32);
  return `${stem}${ext}`;
}

export function safeArtifactRelativePath(value: string) {
  if (
    !value ||
    value.startsWith("/") ||
    value.includes("\0") ||
    value.includes("\\")
  ) {
    return null;
  }
  const normalized = normalize(value);
  if (
    !normalized ||
    normalized === "." ||
    normalized.startsWith("..") ||
    normalized.includes("/../")
  ) {
    return null;
  }
  return normalized;
}

function uniqueStoredName(name: string, used: Set<string>) {
  const safe = safeArtifactName(name);
  if (!used.has(safe)) {
    used.add(safe);
    return safe;
  }

  const parsed = parse(safe);
  for (let i = 2; i < 1000; i += 1) {
    const candidate = `${parsed.name}-${i}${parsed.ext}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }

  const fallback = `${parsed.name}-${randomUUID()}${parsed.ext}`;
  used.add(fallback);
  return fallback;
}

function emptyManifest(paperId: string): PaperArtifactManifest {
  return {
    schemaVersion: PAPER_ARTIFACT_MANIFEST_VERSION,
    paperId,
    updatedAt: new Date(0).toISOString(),
    bundleCount: 0,
    totalBytes: 0,
    bundles: [],
  };
}

export async function loadPaperArtifactManifest(
  paperId: string,
): Promise<PaperArtifactManifest> {
  const manifestPath = paperArtifactManifestPath(paperId);
  if (!existsSync(manifestPath)) return emptyManifest(paperId);

  const parsed = JSON.parse(await readFile(manifestPath, "utf8")) as PaperArtifactManifest;
  if (parsed.paperId !== paperId) {
    throw new Error(`artifact manifest paper id mismatch for ${paperId}`);
  }

  const bundles = (Array.isArray(parsed.bundles) ? parsed.bundles : []).map(
    (bundle) => ({
      ...bundle,
      files: Array.isArray(bundle.files)
        ? bundle.files.map((file) => ({
            ...file,
            source: file.source ?? { kind: "upload" as const },
          }))
        : [],
    }),
  );
  return {
    ...emptyManifest(paperId),
    ...parsed,
    schemaVersion: PAPER_ARTIFACT_MANIFEST_VERSION,
    bundleCount: bundles.length,
    totalBytes: bundles.reduce((sum, bundle) => sum + bundle.totalBytes, 0),
    bundles,
  };
}

async function savePaperArtifactManifest(
  paperId: string,
  manifest: PaperArtifactManifest,
) {
  const dir = paperArtifactDir(paperId);
  await mkdir(dir, { recursive: true });
  const manifestPath = paperArtifactManifestPath(paperId);
  const tmpPath = `${manifestPath}.${randomUUID()}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await rename(tmpPath, manifestPath);
}

export async function savePaperArtifactBundle(input: {
  paperId: string;
  note?: string | null;
  files: ArtifactFileInput[];
}) {
  const bundleId = randomUUID();
  const now = new Date().toISOString();
  const bundleDir = join(paperArtifactDir(input.paperId), bundleId);
  const filesDir = join(bundleDir, "files");
  await mkdir(filesDir, { recursive: true });

  const usedNames = new Set<string>();
  const files: PaperArtifactFile[] = [];
  for (const file of input.files) {
    const storedName = uniqueStoredName(file.originalName, usedNames);
    const relativePath = join(bundleId, "files", storedName);
    const sha256 = createHash("sha256").update(file.buffer).digest("hex");
    await writeFile(join(filesDir, storedName), file.buffer);
    files.push({
      id: randomUUID(),
      originalName: file.originalName,
      storedName,
      relativePath,
      contentType: file.contentType || "application/octet-stream",
      byteLength: file.buffer.byteLength,
      sha256,
      source: file.source ?? { kind: "upload" },
    });
  }

  const bundle: PaperArtifactBundle = {
    id: bundleId,
    note: input.note?.trim() || null,
    createdAt: now,
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.byteLength, 0),
    files,
  };

  const existing = await loadPaperArtifactManifest(input.paperId);
  const bundles = [bundle, ...existing.bundles];
  const manifest: PaperArtifactManifest = {
    schemaVersion: PAPER_ARTIFACT_MANIFEST_VERSION,
    paperId: input.paperId,
    updatedAt: now,
    bundleCount: bundles.length,
    totalBytes: bundles.reduce((sum, item) => sum + item.totalBytes, 0),
    bundles,
  };
  await savePaperArtifactManifest(input.paperId, manifest);
  return { bundle, manifest };
}

export async function resolvePaperArtifactFile(input: {
  paperId: string;
  bundleId: string;
  fileId: string;
}) {
  assertSafePaperId(input.paperId);
  if (
    !SAFE_ARTIFACT_ID_RE.test(input.bundleId) ||
    !SAFE_ARTIFACT_ID_RE.test(input.fileId)
  ) {
    return null;
  }

  const manifest = await loadPaperArtifactManifest(input.paperId);
  const bundle = manifest.bundles.find((item) => item.id === input.bundleId);
  const file = bundle?.files.find((item) => item.id === input.fileId);
  if (!bundle || !file) return null;

  const relativePath = safeArtifactRelativePath(file.relativePath);
  if (!relativePath || !relativePath.startsWith(`${bundle.id}/files/`)) {
    throw new Error("artifact manifest contains an unsafe file path");
  }

  const root = resolve(paperArtifactDir(input.paperId));
  const absolutePath = resolve(root, relativePath);
  const rootRelativePath = relative(root, absolutePath);
  if (
    !rootRelativePath ||
    rootRelativePath.startsWith("..") ||
    isAbsolute(rootRelativePath)
  ) {
    throw new Error("artifact manifest resolved outside the paper artifact root");
  }

  return {
    manifest,
    bundle,
    file: {
      ...file,
      relativePath,
    },
    absolutePath,
  };
}

export function formatArtifactBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}
