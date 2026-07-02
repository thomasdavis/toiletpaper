"use client";

import { useEffect, useRef, useState } from "react";

interface LogEvent {
  seq: number;
  eventType: string;
  payload: any;
  createdAt: string;
}

export function SimulationStream({ paperId }: { paperId: string }) {
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let es: EventSource | null = null;

    async function connect() {
      let afterSeq = 0;
      try {
        const res = await fetch(
          `/api/papers/${paperId}/simulation-log?tail=1&limit=80`,
        );
        if (res.ok) {
          const data = (await res.json()) as { logs?: LogEvent[]; lastSeq?: number };
          if (cancelled) return;
          const logs = data.logs ?? [];
          setEvents(logs);
          afterSeq = data.lastSeq ?? logs[logs.length - 1]?.seq ?? 0;
        }
      } catch {
        // Fall through to a live stream from seq 0.
      }

      if (cancelled) return;
      es = new EventSource(
        `/api/papers/${paperId}/simulation-log?stream=1&after=${afterSeq}`,
      );
      es.onopen = () => setConnected(true);
      es.onmessage = (e) => {
        const event = JSON.parse(e.data) as LogEvent;
        setEvents((prev) => {
          if (prev.some((existing) => existing.seq === event.seq)) return prev;
          return [...prev.slice(-199), event];
        });
      };
      es.onerror = () => setConnected(false);
    }

    void connect();
    return () => {
      cancelled = true;
      es?.close();
    };
  }, [paperId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  if (events.length === 0 && !connected) return null;

  return (
    <div className="mt-6 rounded-lg border border-[#E8E5DE] bg-[#1a1a1a] p-4">
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`h-2 w-2 rounded-full ${connected ? "bg-green-400 animate-pulse" : "bg-gray-500"}`}
        />
        <span className="font-mono text-xs text-gray-400">
          Simulation Log {connected ? "(live)" : "(disconnected)"}
        </span>
        <span className="ml-auto font-mono text-xs text-gray-500">
          {events.length} events
        </span>
      </div>
      <div className="max-h-96 overflow-y-auto font-mono text-xs leading-5">
        {events.map((e) => (
          <div key={e.seq} className="border-b border-gray-800 py-1">
            <span className="text-gray-500">[{e.seq}]</span>{" "}
            <span className={eventColor(e.eventType)}>{e.eventType}</span>{" "}
            <span className="text-gray-300">{summarize(e)}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function eventColor(type: string): string {
  if (type === "job_started" || type === "job_finished") return "text-green-400";
  if (type === "job_failed" || type === "codex_timeout") return "text-red-400";
  if (type === "codex_progress") return "text-cyan-400";
  if (type.startsWith("codex")) return "text-purple-300";
  if (type === "assistant") return "text-blue-400";
  if (type === "user") return "text-green-400";
  if (type === "tool_use") return "text-yellow-400";
  if (type === "tool_result") return "text-orange-400";
  return "text-gray-400";
}

function summarize(e: LogEvent): string {
  const p = e.payload;
  if (e.eventType === "job_started") {
    return `${p?.title ?? "Paper"} · ${p?.totalUnits ?? "?"} units · ${p?.workdir ?? ""}`;
  }
  if (e.eventType === "job_finished") {
    return `finished · ingested=${p?.ingested ?? 0} failed=${p?.failed ?? 0} · ${p?.workdir ?? ""}`;
  }
  if (e.eventType === "job_failed") {
    return String(p?.error ?? "job failed").slice(0, 160);
  }
  if (e.eventType === "codex_progress") {
    return `${p?.message ?? "progress"} · completed=${p?.completed_units ?? 0} failed=${p?.failed_units ?? 0} current=${p?.current_unit_id ?? ""}`;
  }
  if (typeof p?.text === "string") return p.text.slice(0, 160);
  if (typeof p?.message === "string") return p.message.slice(0, 160);
  if (typeof p?.type === "string") {
    return `${p.type} ${JSON.stringify(p).slice(0, 140)}`;
  }
  if (p?.message?.content) {
    const blocks = p.message.content;
    if (Array.isArray(blocks)) {
      for (const b of blocks) {
        if (b.type === "text") return b.text?.slice(0, 120) ?? "";
        if (b.type === "tool_use") return `${b.name}(${JSON.stringify(b.input).slice(0, 80)})`;
        if (b.type === "tool_result")
          return (typeof b.content === "string" ? b.content : JSON.stringify(b.content))?.slice(0, 120) ?? "";
      }
    }
    if (typeof blocks === "string") return blocks.slice(0, 120);
  }
  if (p?.message?.role === "user" && typeof p?.message?.content === "string") {
    return p.message.content.slice(0, 120);
  }
  return JSON.stringify(p).slice(0, 100);
}
