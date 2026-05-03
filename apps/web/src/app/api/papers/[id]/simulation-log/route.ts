import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { simulationLogs } from "@toiletpaper/db";
import { eq, gt, and, asc } from "drizzle-orm";

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
  const stream = url.searchParams.get("stream") === "1";

  if (!stream) {
    const logs = await db
      .select()
      .from(simulationLogs)
      .where(
        and(eq(simulationLogs.paperId, id), gt(simulationLogs.seq, afterSeq)),
      )
      .orderBy(asc(simulationLogs.seq))
      .limit(200);

    return NextResponse.json({ logs, lastSeq: logs[logs.length - 1]?.seq ?? afterSeq });
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
