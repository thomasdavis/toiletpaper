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
    const es = new EventSource(
      `/api/papers/${paperId}/simulation-log?stream=1&after=0`,
    );
    es.onopen = () => setConnected(true);
    es.onmessage = (e) => {
      const event = JSON.parse(e.data) as LogEvent;
      setEvents((prev) => [...prev.slice(-200), event]);
    };
    es.onerror = () => setConnected(false);
    return () => es.close();
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
  if (type === "assistant") return "text-blue-400";
  if (type === "user") return "text-green-400";
  if (type === "tool_use") return "text-yellow-400";
  if (type === "tool_result") return "text-orange-400";
  return "text-gray-400";
}

function summarize(e: LogEvent): string {
  const p = e.payload;
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
