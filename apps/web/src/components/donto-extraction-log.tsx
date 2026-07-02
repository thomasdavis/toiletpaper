"use client";

import { useEffect, useMemo, useState } from "react";

interface LogEvent {
  seq: number;
  payload: {
    event?: string;
    index?: number;
    ordinal?: number;
    chunkCount?: number;
    chars?: number;
    statementCount?: number;
    anchoredCount?: number;
    factCount?: number;
    passes?: number;
    elapsedMs?: number;
    createdAt?: string;
    chunkPath?: string;
    qualityWarnings?: string[];
    qualityRetryCount?: number;
  };
}

interface LogResponse {
  summary: {
    status?: string;
    chunkCount?: number;
    maxChars?: number;
    overlapChars?: number;
    maxPasses?: number;
    maxTokens?: number;
    provider?: string;
    model?: string;
    chunksDir?: string;
  } | null;
  events: LogEvent[];
  lastSeq: number;
}

interface ChunkPreview {
  ordinal: number;
  filename: string;
  text: string;
  chars: number;
}

function formatDuration(ms?: number) {
  if (!ms) return "";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function eventOrdinal(event: LogEvent) {
  return event.payload.ordinal ?? (
    event.payload.index == null ? null : event.payload.index + 1
  );
}

export function DontoExtractionLog({
  paperId,
  isLive,
}: {
  paperId: string;
  isLive: boolean;
}) {
  const [data, setData] = useState<LogResponse | null>(null);
  const [chunkPreview, setChunkPreview] = useState<ChunkPreview | null>(null);
  const [chunkError, setChunkError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const response = await fetch(
        `/api/papers/${paperId}/donto/extraction-log?limit=100`,
        { cache: "no-store" },
      );
      if (!response.ok) return;
      const body = (await response.json()) as LogResponse;
      if (!cancelled) setData(body);
    }
    void load();
    if (!isLive) return () => {
      cancelled = true;
    };
    const timer = window.setInterval(() => void load(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [paperId, isLive]);

  async function loadChunk(ordinal: number) {
    setChunkError(null);
    if (chunkPreview?.ordinal === ordinal) {
      setChunkPreview(null);
      return;
    }
    const response = await fetch(
      `/api/papers/${paperId}/donto/extraction-log?chunk=${ordinal}`,
      { cache: "no-store" },
    );
    if (!response.ok) {
      setChunkError(`Chunk ${ordinal} is not available`);
      return;
    }
    setChunkPreview((await response.json()) as ChunkPreview);
  }

  const stats = useMemo(() => {
    const completed = (data?.events ?? []).filter(
      (event) =>
        event.payload.event === "chunk_succeeded" ||
        event.payload.event === "chunk_degraded" ||
        event.payload.event === "chunk_degraded_after_retry_error",
    );
    return {
      completed: completed.length,
      facts: completed.reduce((sum, event) => sum + (event.payload.factCount ?? 0), 0),
      statements: completed.reduce(
        (sum, event) => sum + (event.payload.statementCount ?? 0),
        0,
      ),
      anchored: completed.reduce(
        (sum, event) => sum + (event.payload.anchoredCount ?? 0),
        0,
      ),
      repairs: completed.reduce(
        (sum, event) => sum + (event.payload.qualityRetryCount ?? 0),
        0,
      ),
      degraded: completed.filter(
        (event) =>
          event.payload.event === "chunk_degraded" ||
          event.payload.event === "chunk_degraded_after_retry_error",
      ).length,
    };
  }, [data]);

  if (!data) return null;
  if (!data.summary && data.events.length === 0) return null;

  const total = data?.summary?.chunkCount ?? data?.events[0]?.payload.chunkCount ?? 0;
  const recent = data?.events.slice(-5).reverse() ?? [];

  return (
    <div className="mt-4 border-t border-[#E8E5DE] pt-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="font-semibold uppercase tracking-[0.16em] text-[#9B9B9B]">
          Donto Agent
        </span>
        <span className="text-[#6B6B6B]">
          {stats.completed} of {total || "?"} chunks
        </span>
        <span className="text-[#6B6B6B]">{stats.facts} facts</span>
        <span className="text-[#6B6B6B]">{stats.anchored} anchored</span>
        {stats.repairs > 0 && (
          <span className="text-[#B07D2B]">{stats.repairs} repairs</span>
        )}
        {stats.degraded > 0 && (
          <span className="text-[#9B2226]">{stats.degraded} degraded</span>
        )}
        {data?.summary?.model && (
          <span className="font-mono text-[11px] text-[#9B9B9B]">
            {data.summary.provider}/{data.summary.model}
          </span>
        )}
      </div>
      {recent.length > 0 && (
        <div className="mt-2 space-y-1 text-xs">
          {recent.map((event) => {
            const ordinal = eventOrdinal(event);
            return (
              <div
                key={event.seq}
                className="flex flex-wrap gap-x-3 gap-y-0.5 text-[#6B6B6B]"
              >
                <span className="font-mono text-[#3D3D3D]">
                  #{ordinal ?? event.seq}
                </span>
                <span>{event.payload.event ?? "event"}</span>
                {event.payload.factCount != null && (
                  <span>{event.payload.factCount} facts</span>
                )}
                {event.payload.anchoredCount != null && (
                  <span>{event.payload.anchoredCount} anchored</span>
                )}
                {event.payload.passes != null && (
                  <span>{event.payload.passes} passes</span>
                )}
                {event.payload.elapsedMs != null && (
                  <span>{formatDuration(event.payload.elapsedMs)}</span>
                )}
                {event.payload.qualityRetryCount ? (
                  <span className="font-medium text-[#B07D2B]">
                    {event.payload.qualityRetryCount} repair
                    {event.payload.qualityRetryCount === 1 ? "" : "s"}
                  </span>
                ) : null}
                {event.payload.qualityWarnings?.length ? (
                  <span
                    className="max-w-full truncate font-medium text-[#9B2226]"
                    title={event.payload.qualityWarnings.join("; ")}
                  >
                    {event.payload.qualityWarnings[0]}
                  </span>
                ) : null}
                {ordinal != null && (
                  <button
                    type="button"
                    onClick={() => void loadChunk(ordinal)}
                    title={event.payload.chunkPath}
                    className="font-medium text-[#4A6FA5] hover:underline"
                  >
                    {chunkPreview?.ordinal === ordinal ? "hide chunk" : "view chunk"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {chunkError && (
        <div className="mt-2 rounded border border-[#9B2226]/20 bg-[#9B2226]/5 px-2 py-1 text-xs text-[#9B2226]">
          {chunkError}
        </div>
      )}
      {chunkPreview && (
        <div className="mt-2 overflow-hidden rounded-md border border-[#E8E5DE] bg-[#FAFAF8]">
          <div className="flex items-center justify-between border-b border-[#E8E5DE] px-3 py-2 text-xs">
            <span className="font-mono text-[#3D3D3D]">
              {chunkPreview.filename}
            </span>
            <span className="text-[#9B9B9B]">{chunkPreview.chars} chars</span>
          </div>
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap px-3 py-2 font-mono text-[11px] leading-5 text-[#3D3D3D]">
            {chunkPreview.text}
          </pre>
        </div>
      )}
    </div>
  );
}
