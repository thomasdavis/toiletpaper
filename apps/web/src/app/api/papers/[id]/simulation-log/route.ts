import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { simulationLogs } from "@toiletpaper/db";
import { eq, gt, lt, and, asc, desc } from "drizzle-orm";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json()) as {
    events: Array<{ seq: number; eventType: string; payload: unknown }>;
  };

  if (!body.events?.length) {
    return NextResponse.json({ stored: 0 });
  }

  await db.insert(simulationLogs).values(
    body.events.map((e) => ({
      paperId: id,
      seq: e.seq,
      eventType: e.eventType,
      payload: e.payload,
    })),
  );

  return NextResponse.json({ stored: body.events.length });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(req.url);
  const afterSeq = parseInt(url.searchParams.get("after") ?? "0", 10);
  const beforeSeq = parseInt(url.searchParams.get("before") ?? "", 10);
  const limit = clampLimit(url.searchParams.get("limit"));
  const tail = url.searchParams.get("tail") === "1";
  const stream = url.searchParams.get("stream") === "1";

  if (!stream) {
    if (Number.isFinite(beforeSeq) && beforeSeq > 0) {
      const rows = await db
        .select()
        .from(simulationLogs)
        .where(and(eq(simulationLogs.paperId, id), lt(simulationLogs.seq, beforeSeq)))
        .orderBy(desc(simulationLogs.seq))
        .limit(limit);
      const logs = rows.reverse();

      return NextResponse.json({
        logs,
        firstSeq: logs[0]?.seq ?? beforeSeq,
        lastSeq: logs[logs.length - 1]?.seq ?? beforeSeq,
        hasMore: logs.length === limit && (logs[0]?.seq ?? 0) > 1,
      });
    }

    if (tail) {
      const rows = await db
        .select()
        .from(simulationLogs)
        .where(eq(simulationLogs.paperId, id))
        .orderBy(desc(simulationLogs.seq))
        .limit(limit);
      const logs = rows.reverse();

      return NextResponse.json({
        logs,
        firstSeq: logs[0]?.seq ?? 0,
        lastSeq: logs[logs.length - 1]?.seq ?? 0,
        hasMore: logs.length === limit && (logs[0]?.seq ?? 0) > 1,
      });
    }

    const logs = await db
      .select()
      .from(simulationLogs)
      .where(and(eq(simulationLogs.paperId, id), gt(simulationLogs.seq, afterSeq)))
      .orderBy(asc(simulationLogs.seq))
      .limit(limit);

    return NextResponse.json({
      logs,
      firstSeq: logs[0]?.seq ?? afterSeq,
      lastSeq: logs[logs.length - 1]?.seq ?? afterSeq,
      hasMore: logs.length === limit,
    });
  }

  const encoder = new TextEncoder();
  let lastSent = afterSeq;
  let alive = true;

  const readable = new ReadableStream({
    async start(controller) {
      while (alive) {
        const logs = await db
          .select()
          .from(simulationLogs)
          .where(
            and(eq(simulationLogs.paperId, id), gt(simulationLogs.seq, lastSent)),
          )
          .orderBy(asc(simulationLogs.seq))
          .limit(50);

        for (const log of logs) {
          const data = JSON.stringify({
            seq: log.seq,
            eventType: log.eventType,
            payload: log.payload,
            createdAt: log.createdAt,
          });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          lastSent = log.seq;
        }

        await new Promise((r) => setTimeout(r, 1000));
      }
    },
    cancel() {
      alive = false;
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function clampLimit(raw: string | null) {
  const parsed = Number.parseInt(raw ?? "200", 10);
  if (!Number.isFinite(parsed)) return 200;
  return Math.max(1, Math.min(parsed, 500));
}
