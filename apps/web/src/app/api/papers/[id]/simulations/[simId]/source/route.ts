import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "@/lib/db";
import { simulations } from "@toiletpaper/db";
import { eq } from "drizzle-orm";
import { getObject } from "@/lib/storage";

const UPLOADS_BUCKET = process.env.UPLOADS_BUCKET || "";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; simId: string }> },
) {
  const { id, simId } = await params;

  const [sim] = await db
    .select()
    .from(simulations)
    .where(eq(simulations.id, simId));

  if (!sim) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const meta = sim.metadata as Record<string, unknown> | null;
  const filename = meta?.simulation_file as string | undefined;

  if (!filename) {
    return NextResponse.json(
      { error: "no simulation file", filename: null, code: null },
      { status: 404 },
    );
  }

  const ext = filename.split(".").pop() ?? "";
  const language = ext === "py" ? "python" : ext === "ts" ? "typescript" : ext;

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
  const workdir =
    process.env.SIMULATOR_WORKDIR ?? join("/tmp", "tp-simulations");
  const filePath = join(workdir, id, filename);

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
