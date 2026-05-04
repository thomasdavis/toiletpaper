import { NextResponse } from "next/server";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { listObjects } from "@/lib/storage";

const UPLOADS_BUCKET = process.env.UPLOADS_BUCKET || "";

export const dynamic = "force-dynamic";

/**
 * GET /api/papers/{id}/artifacts
 *
 * Returns a list of all simulation artifact files for a paper.
 * Tries GCS first (production), falls back to local filesystem (dev).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // 1. Try GCS
  if (UPLOADS_BUCKET) {
    try {
      const prefix = `simulations/${id}/`;
      const files = await listObjects(UPLOADS_BUCKET, prefix);
      return NextResponse.json({
        source: "gcs",
        bucket: UPLOADS_BUCKET,
        files: files.map((f) => ({
          name: f.name,
          key: f.fullKey,
          size: f.size,
        })),
      });
    } catch (e) {
      // GCS failed — fall through to local
      console.warn(
        `GCS listing failed for paper ${id}:`,
        e instanceof Error ? e.message : e,
      );
    }
  }

  // 2. Fall back to local filesystem
  const workdir =
    process.env.SIMULATOR_WORKDIR ?? join("/tmp", "tp-simulations");
  const paperDir = join(workdir, id);

  try {
    const entries = readdirSync(paperDir);
    const files = entries.map((name) => {
      const st = statSync(join(paperDir, name));
      return { name, key: `simulations/${id}/${name}`, size: st.size };
    });
    return NextResponse.json({ source: "local", bucket: null, files });
  } catch (_e) {
    return NextResponse.json({ source: "none", bucket: null, files: [] });
  }
}
