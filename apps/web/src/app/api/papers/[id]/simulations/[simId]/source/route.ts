import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "@/lib/db";
import { simulations } from "@toiletpaper/db";
import { eq } from "drizzle-orm";

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

  const simDir = join(process.cwd(), ".simulations", id);
  const filePath = join(simDir, filename);

  try {
    const code = await readFile(filePath, "utf-8");
    const ext = filename.split(".").pop() ?? "";
    const language = ext === "py" ? "python" : ext === "ts" ? "typescript" : ext;

    return NextResponse.json({ filename, code, language, lines: code.split("\n").length });
  } catch (_e) {
    return NextResponse.json(
      { error: "file not found on disk", filename, code: null },
      { status: 404 },
    );
  }
}
