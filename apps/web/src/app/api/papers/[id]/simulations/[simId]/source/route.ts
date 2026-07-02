import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join, normalize } from "node:path";
import { db } from "@/lib/db";
import { simulations } from "@toiletpaper/db";
import { eq } from "drizzle-orm";
import { getObject } from "@/lib/storage";

const UPLOADS_BUCKET = process.env.UPLOADS_BUCKET || "";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; simId: string }> },
) {
  const { id, simId } = await params;
  const url = new URL(req.url);

  const [sim] = await db
    .select()
    .from(simulations)
    .where(eq(simulations.id, simId));

  if (!sim) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const meta = record(sim.metadata);
  const result = record(sim.result);
  const requestedRaw = url.searchParams.get("file");
  const requestedFile = safeRelativePath(requestedRaw);
  if (requestedRaw && !requestedFile) {
    return NextResponse.json(
      { error: "invalid file path", filename: null, code: null },
      { status: 400 },
    );
  }
  if (requestedFile && !isTextArtifact(requestedFile)) {
    return NextResponse.json(
      { error: "file is not a text artifact", filename: requestedFile, code: null },
      { status: 415 },
    );
  }
  const simulationFile = safeRelativePath(
    typeof meta?.simulation_file === "string" ? meta.simulation_file : null,
  );
  const artifactFiles = Array.isArray(result?.artifacts)
    ? result.artifacts
        .map((item) => (typeof item === "string" ? safeRelativePath(item) : null))
        .filter((item): item is string => Boolean(item))
        .filter(isTextArtifact)
    : [];
  const allowedFiles = new Set(
    [simulationFile, ...artifactFiles].filter(
      (item): item is string =>
        typeof item === "string" && isTextArtifact(item),
    ),
  );
  if (requestedFile && allowedFiles.size > 0 && !allowedFiles.has(requestedFile)) {
    return NextResponse.json(
      { error: "file is not listed for this simulation", filename: requestedFile, code: null },
      { status: 403 },
    );
  }
  const filename = requestedFile ?? simulationFile ?? artifactFiles[0] ?? null;

  if (!filename) {
    return NextResponse.json(
      { error: "no simulation file", filename: null, code: null },
      { status: 404 },
    );
  }

  const ext = filename.split(".").pop() ?? "";
  const language =
    ext === "py"
      ? "python"
      : ext === "ts"
        ? "typescript"
        : ext === "json"
          ? "json"
          : ext;

  const workdir =
    typeof meta?.workdir === "string"
      ? meta.workdir
      : typeof result?.workdir === "string"
        ? result.workdir
        : null;

  if (workdir) {
    const filePath = join(workdir, filename);
    try {
      const code = await readFile(filePath, "utf-8");
      return NextResponse.json({
        filename,
        code,
        language,
        lines: code.split("\n").length,
      });
    } catch {
      // Fall through to legacy storage paths.
    }
  }

  // 1. Try GCS first (works on Cloud Run and locally when bucket is set)
  if (UPLOADS_BUCKET) {
    const gcsKey = `simulations/${id}/${filename}`;
    try {
      const buf = await getObject(UPLOADS_BUCKET, gcsKey);
      const code = buf.toString("utf-8");
      return NextResponse.json({
        filename,
        code,
        language,
        lines: code.split("\n").length,
      });
    } catch (_e) {
      // GCS miss — fall through to local filesystem
    }
  }

  // 2. Fall back to local filesystem (dev mode)
  const legacyWorkdir =
    process.env.SIMULATOR_WORKDIR ?? join("/tmp", "tp-simulations");
  const filePath = join(legacyWorkdir, id, filename);

  try {
    const code = await readFile(filePath, "utf-8");
    return NextResponse.json({ filename, code, language, lines: code.split("\n").length });
  } catch (_e) {
    return NextResponse.json(
      { error: "file not found on disk", filename, code: null },
      { status: 404 },
    );
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function safeRelativePath(value: string | null | undefined) {
  if (!value) return null;
  if (value.startsWith("/") || value.includes("\0") || value.includes("\\")) {
    return null;
  }
  const normalized = normalize(value);
  if (!normalized || normalized === "." || normalized.startsWith("..")) {
    return null;
  }
  return normalized;
}

function isTextArtifact(file: string) {
  const ext = file.split(".").pop()?.toLowerCase();
  return (
    ext === "py" ||
    ext === "ts" ||
    ext === "tsx" ||
    ext === "js" ||
    ext === "json" ||
    ext === "md" ||
    ext === "txt"
  );
}
