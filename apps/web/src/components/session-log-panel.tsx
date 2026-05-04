"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";

// ── Types ──────────────────────────────────────────────────────────────

interface LogEvent {
  seq: number;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

interface Props {
  paperId: string;
  isLive?: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function relativeTime(iso: string, sessionStart?: string): string {
  const d = new Date(iso);
  if (sessionStart) {
    const start = new Date(sessionStart);
    const diffMs = d.getTime() - start.getTime();
    if (diffMs < 0) return "0s";
    const secs = Math.floor(diffMs / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    const remSecs = secs % 60;
    if (mins < 60) return `${mins}m ${remSecs}s`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m`;
  }
  // Fallback: relative to now
  const diffMs = Date.now() - d.getTime();
  const secs = Math.floor(diffMs / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

function extractModel(payload: Record<string, unknown>): string | null {
  const msg = payload.message as Record<string, unknown> | undefined;
  return (msg?.model as string) ?? null;
}

function extractTextContent(payload: Record<string, unknown>): string {
  const msg = payload.message as Record<string, unknown> | undefined;
  const content = msg?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block.type === "text") return block.text ?? "";
    }
  }
  return "";
}

function extractThinkingContent(payload: Record<string, unknown>): string {
  const msg = payload.message as Record<string, unknown> | undefined;
  const content = msg?.content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block.type === "thinking") return block.thinking ?? "";
    }
  }
  return "";
}

interface ToolUseInfo {
  name: string;
  input: Record<string, unknown>;
  id: string;
}

function extractToolUse(payload: Record<string, unknown>): ToolUseInfo | null {
  const msg = payload.message as Record<string, unknown> | undefined;
  const content = msg?.content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block.type === "tool_use") {
        return {
          name: block.name ?? "unknown",
          input: block.input ?? {},
          id: block.id ?? "",
        };
      }
    }
  }
  return null;
}

function extractToolResult(payload: Record<string, unknown>): string {
  const msg = payload.message as Record<string, unknown> | undefined;
  const content = msg?.content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block.type === "tool_result") {
        const c = block.content;
        if (typeof c === "string") return c;
        if (Array.isArray(c)) {
          return c
            .map((item: Record<string, unknown>) =>
              item.type === "text" ? (item.text as string) : JSON.stringify(item),
            )
            .join("\n");
        }
        return JSON.stringify(c);
      }
    }
  }
  return "";
}

function extractUserMessage(payload: Record<string, unknown>): string {
  const msg = payload.message as Record<string, unknown> | undefined;
  const content = msg?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    // User messages can contain text blocks or tool_result blocks
    const parts: string[] = [];
    for (const block of content) {
      if (block.type === "text") parts.push(block.text ?? "");
      else if (typeof block === "string") parts.push(block);
    }
    return parts.join("\n");
  }
  return "";
}

// ── Event type badge ────────────────────────────────────────────────────

function EventBadge({ eventType }: { eventType: string }) {
  let label = eventType;
  let classes =
    "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider";

  if (eventType === "assistant_text") {
    label = "Assistant";
    classes += " bg-[#4A6FA5]/10 text-[#4A6FA5]";
  } else if (eventType === "thinking") {
    label = "Thinking";
    classes += " bg-purple-100 text-purple-700";
  } else if (eventType.startsWith("tool_use:")) {
    label = eventType.replace("tool_use:", "");
    classes += " bg-amber-100 text-amber-800";
  } else if (eventType === "tool_result") {
    label = "Result";
    classes += " bg-orange-100 text-orange-700";
  } else if (eventType === "user") {
    label = "User";
    classes += " bg-emerald-100 text-emerald-700";
  } else {
    classes += " bg-gray-100 text-gray-600";
  }

  return <span className={classes}>{label}</span>;
}

// ── Truncatable output ──────────────────────────────────────────────────

function TruncatedOutput({
  text,
  maxLines = 20,
}: {
  text: string;
  maxLines?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const lines = text.split("\n");
  const needsTruncation = lines.length > maxLines;
  const displayText =
    needsTruncation && !expanded
      ? lines.slice(0, maxLines).join("\n")
      : text;

  return (
    <div>
      <pre className="whitespace-pre-wrap break-all text-[12px] leading-5">
        {displayText}
      </pre>
      {needsTruncation && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1 text-[11px] text-[#4A6FA5] hover:underline cursor-pointer"
        >
          {expanded
            ? "Show less"
            : `Show ${lines.length - maxLines} more lines`}
        </button>
      )}
    </div>
  );
}

// ── Individual event renderers ──────────────────────────────────────────

function AssistantTextBlock({
  event,
  model,
  timeLabel,
}: {
  event: LogEvent;
  model: string | null;
  timeLabel: string;
}) {
  const text = extractTextContent(event.payload);
  if (!text.trim()) return null;

  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
      <div className="mb-2 flex items-center gap-2">
        <EventBadge eventType={event.eventType} />
        {model && (
          <span className="text-[10px] font-mono text-[#6B6B6B]">{model}</span>
        )}
        <span className="ml-auto text-[10px] text-[#9B9B9B]">{timeLabel}</span>
      </div>
      <div className="text-[13px] leading-6 text-[#1A1A1A] whitespace-pre-wrap">
        {text}
      </div>
    </div>
  );
}

function ThinkingBlock({
  event,
  timeLabel,
}: {
  event: LogEvent;
  timeLabel: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const text = extractThinkingContent(event.payload);
  if (!text.trim()) return null;

  return (
    <div className="rounded-lg border border-purple-100 bg-purple-50/50 p-3">
      <div className="flex items-center gap-2">
        <EventBadge eventType="thinking" />
        <span className="ml-auto text-[10px] text-[#9B9B9B]">{timeLabel}</span>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[11px] text-purple-600 hover:underline cursor-pointer"
        >
          {expanded ? "Hide" : "Show"}
        </button>
      </div>
      {expanded && (
        <div className="mt-2 text-[12px] leading-5 text-purple-900/70 whitespace-pre-wrap italic">
          {text}
        </div>
      )}
    </div>
  );
}

function ToolUseBashBlock({
  event,
  timeLabel,
}: {
  event: LogEvent;
  timeLabel: string;
}) {
  const toolUse = extractToolUse(event.payload);
  if (!toolUse) return null;

  const command = (toolUse.input as Record<string, string>).command ?? "";
  const description = (toolUse.input as Record<string, string>).description;

  return (
    <div className="rounded-lg border border-[#333] bg-[#1a1a1a] p-4 font-mono">
      <div className="mb-2 flex items-center gap-2">
        <EventBadge eventType={event.eventType} />
        {description && (
          <span className="text-[11px] text-[#888]">{description}</span>
        )}
        <span className="ml-auto text-[10px] text-[#555]">{timeLabel}</span>
      </div>
      <div className="text-[12px] leading-5 text-[#e0e0e0]">
        <span className="text-green-400 select-none">$ </span>
        <span className="break-all">{command}</span>
      </div>
    </div>
  );
}

function ToolUseWriteBlock({
  event,
  timeLabel,
}: {
  event: LogEvent;
  timeLabel: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const toolUse = extractToolUse(event.payload);
  if (!toolUse) return null;

  const filePath = (toolUse.input as Record<string, string>).file_path ?? "";
  const content = (toolUse.input as Record<string, string>).content ?? "";
  const toolName = toolUse.name;
  const shortPath = filePath.split("/").slice(-3).join("/");

  return (
    <div className="rounded-lg border border-[#333] bg-[#1a1a1a] p-4">
      <div className="mb-2 flex items-center gap-2">
        <EventBadge eventType={event.eventType} />
        <span className="font-mono text-[11px] text-[#e0e0e0] truncate max-w-[400px]" title={filePath}>
          {shortPath}
        </span>
        <span className="ml-auto text-[10px] text-[#555]">{timeLabel}</span>
      </div>
      {content && (
        <div className="mt-1">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[11px] text-[#4A6FA5] hover:underline cursor-pointer"
          >
            {expanded
              ? "Hide content"
              : `Show ${toolName === "Edit" ? "diff" : "content"} (${content.split("\n").length} lines)`}
          </button>
          {expanded && (
            <pre className="mt-2 max-h-80 overflow-auto rounded bg-[#111] p-3 text-[11px] leading-5 text-[#ccc]">
              {content}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function ToolUseReadBlock({
  event,
  timeLabel,
}: {
  event: LogEvent;
  timeLabel: string;
}) {
  const toolUse = extractToolUse(event.payload);
  if (!toolUse) return null;

  const filePath = (toolUse.input as Record<string, string>).file_path ?? "";
  const shortPath = filePath.split("/").slice(-3).join("/");

  return (
    <div className="flex items-center gap-2 rounded-lg border border-[#E8E5DE] bg-[#FAFAF8] px-3 py-2">
      <EventBadge eventType={event.eventType} />
      <span
        className="font-mono text-[11px] text-[#6B6B6B] truncate max-w-[500px]"
        title={filePath}
      >
        {shortPath}
      </span>
      <span className="ml-auto text-[10px] text-[#9B9B9B]">{timeLabel}</span>
    </div>
  );
}

function ToolResultBlock({
  event,
  timeLabel,
}: {
  event: LogEvent;
  timeLabel: string;
}) {
  const text = extractToolResult(event.payload);
  if (!text.trim()) return null;

  return (
    <div className="rounded-lg border border-[#333] bg-[#1a1a1a] p-3 font-mono">
      <div className="mb-2 flex items-center gap-2">
        <EventBadge eventType="tool_result" />
        <span className="ml-auto text-[10px] text-[#555]">{timeLabel}</span>
      </div>
      <div className="text-[#e0e0e0]">
        <TruncatedOutput text={text} maxLines={20} />
      </div>
    </div>
  );
}

function UserBlock({
  event,
  timeLabel,
}: {
  event: LogEvent;
  timeLabel: string;
}) {
  const text = extractUserMessage(event.payload);
  if (!text.trim()) return null;

  return (
    <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 px-4 py-3">
      <div className="mb-1 flex items-center gap-2">
        <EventBadge eventType="user" />
        <span className="ml-auto text-[10px] text-[#9B9B9B]">{timeLabel}</span>
      </div>
      <div className="text-[13px] text-[#1A1A1A] whitespace-pre-wrap line-clamp-4">
        {text}
      </div>
    </div>
  );
}

function GenericBlock({
  event,
  timeLabel,
}: {
  event: LogEvent;
  timeLabel: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded border border-[#E8E5DE] bg-[#FAFAF8] px-3 py-2">
      <EventBadge eventType={event.eventType} />
      <span className="text-[11px] text-[#9B9B9B] truncate">
        {JSON.stringify(event.payload).slice(0, 100)}
      </span>
      <span className="ml-auto text-[10px] text-[#9B9B9B]">{timeLabel}</span>
    </div>
  );
}

// ── Event renderer dispatch ─────────────────────────────────────────────

function EventRow({
  event,
  sessionStart,
}: {
  event: LogEvent;
  sessionStart?: string;
}) {
  const timeLabel = relativeTime(event.createdAt, sessionStart);
  const model = extractModel(event.payload);

  if (event.eventType === "assistant_text") {
    return (
      <AssistantTextBlock event={event} model={model} timeLabel={timeLabel} />
    );
  }
  if (event.eventType === "thinking") {
    return <ThinkingBlock event={event} timeLabel={timeLabel} />;
  }
  if (event.eventType === "tool_use:Bash") {
    return <ToolUseBashBlock event={event} timeLabel={timeLabel} />;
  }
  if (
    event.eventType === "tool_use:Write" ||
    event.eventType === "tool_use:Edit"
  ) {
    return <ToolUseWriteBlock event={event} timeLabel={timeLabel} />;
  }
  if (event.eventType === "tool_use:Read") {
    return <ToolUseReadBlock event={event} timeLabel={timeLabel} />;
  }
  if (event.eventType === "tool_result") {
    return <ToolResultBlock event={event} timeLabel={timeLabel} />;
  }
  if (event.eventType === "user") {
    return <UserBlock event={event} timeLabel={timeLabel} />;
  }
  // Other tool_use types (e.g. tool_use:WebSearch, tool_use:Grep, etc.)
  if (event.eventType.startsWith("tool_use:")) {
    const toolUse = extractToolUse(event.payload);
    if (toolUse) {
      return (
        <div className="flex items-center gap-2 rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2">
          <EventBadge eventType={event.eventType} />
          <span className="text-[11px] text-[#6B6B6B] font-mono truncate">
            {JSON.stringify(toolUse.input).slice(0, 120)}
          </span>
          <span className="ml-auto text-[10px] text-[#9B9B9B]">
            {timeLabel}
          </span>
        </div>
      );
    }
  }

  return <GenericBlock event={event} timeLabel={timeLabel} />;
}

// ── Summary header ──────────────────────────────────────────────────────

function SessionSummary({
  events,
  isLive,
}: {
  events: LogEvent[];
  isLive: boolean;
}) {
  const breakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of events) {
      const key = e.eventType.startsWith("tool_use:") ? "tool_use" : e.eventType;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [events]);

  const durationLabel = useMemo(() => {
    if (events.length < 2) return null;
    const first = new Date(events[0].createdAt).getTime();
    const last = new Date(events[events.length - 1].createdAt).getTime();
    const diffMs = last - first;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "< 1 minute";
    if (mins < 60) return `${mins} minutes`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m`;
  }, [events]);

  return (
    <div className="rounded-lg border border-[#E8E5DE] bg-white p-4 mb-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          {isLive && (
            <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
          )}
          <span className="text-[13px] font-semibold text-[#1A1A1A]">
            Session: {events.length} events
            {durationLabel && ` over ${durationLabel}`}
          </span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {breakdown.assistant_text != null && (
            <span className="text-[11px] text-[#6B6B6B]">
              {breakdown.assistant_text} text
            </span>
          )}
          {breakdown.thinking != null && (
            <span className="text-[11px] text-[#6B6B6B]">
              {breakdown.thinking} thinking
            </span>
          )}
          {breakdown.tool_use != null && (
            <span className="text-[11px] text-[#6B6B6B]">
              {breakdown.tool_use} tool calls
            </span>
          )}
          {breakdown.tool_result != null && (
            <span className="text-[11px] text-[#6B6B6B]">
              {breakdown.tool_result} results
            </span>
          )}
          {breakdown.user != null && (
            <span className="text-[11px] text-[#6B6B6B]">
              {breakdown.user} user
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────

export function SessionLogPanel({ paperId, isLive = false }: Props) {
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [firstSeq, setFirstSeq] = useState<number | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(isLive);

  // Fetch initial events (latest page)
  useEffect(() => {
    let cancelled = false;

    async function fetchInitial() {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/papers/${paperId}/simulation-log?after=0`,
        );
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        if (cancelled) return;
        const logs: LogEvent[] = data.logs ?? [];
        setEvents(logs);
        if (logs.length > 0) {
          setFirstSeq(logs[0].seq);
          // The API returns max 200; if we got 200, there might be more
          setHasMore(logs.length >= 200);
        }
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchInitial();
    return () => {
      cancelled = true;
    };
  }, [paperId]);

  // SSE for live updates
  useEffect(() => {
    if (!isLive) return;

    const lastSeq =
      events.length > 0 ? events[events.length - 1].seq : 0;
    const es = new EventSource(
      `/api/papers/${paperId}/simulation-log?stream=1&after=${lastSeq}`,
    );

    es.onopen = () => setSseConnected(true);
    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as LogEvent;
        setEvents((prev) => {
          // Deduplicate by seq
          if (prev.length > 0 && prev[prev.length - 1].seq >= event.seq) {
            return prev;
          }
          return [...prev, event];
        });
      } catch {
        // skip
      }
    };
    es.onerror = () => setSseConnected(false);

    return () => es.close();
    // Only reconnect when isLive changes, not on every events change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperId, isLive]);

  // Auto-scroll when live
  useEffect(() => {
    if (autoScrollRef.current && isLive) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [events, isLive]);

  // Load more (older events)
  const loadMore = useCallback(async () => {
    if (!firstSeq || firstSeq <= 1 || loadingMore) return;
    setLoadingMore(true);
    try {
      // We want events before firstSeq. The API only supports after=N,
      // so we fetch from 0 and cap at firstSeq-1
      const wantAfter = Math.max(0, firstSeq - 201);
      const res = await fetch(
        `/api/papers/${paperId}/simulation-log?after=${wantAfter}`,
      );
      if (!res.ok) return;
      const data = await res.json();
      const logs: LogEvent[] = (data.logs ?? []).filter(
        (l: LogEvent) => l.seq < firstSeq,
      );
      if (logs.length > 0) {
        setEvents((prev) => [...logs, ...prev]);
        setFirstSeq(logs[0].seq);
        setHasMore(logs[0].seq > 1);
      } else {
        setHasMore(false);
      }
    } catch {
      // silent
    } finally {
      setLoadingMore(false);
    }
  }, [paperId, firstSeq, loadingMore]);

  // Track scroll position to disable auto-scroll when user scrolls up
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function onScroll() {
      if (!container) return;
      const { scrollTop, scrollHeight, clientHeight } = container;
      autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 100;
    }
    container.addEventListener("scroll", onScroll);
    return () => container.removeEventListener("scroll", onScroll);
  }, []);

  const sessionStart = events.length > 0 ? events[0].createdAt : undefined;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-[13px] text-[#9B9B9B]">Loading session log...</div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="text-[13px] text-[#9B9B9B] mb-1">
            No session log available
          </div>
          <div className="text-[11px] text-[#B0B0B0]">
            Run the backfill script to import historical sessions
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <SessionSummary events={events} isLive={isLive && sseConnected} />

      <div
        ref={containerRef}
        className="max-h-[calc(100vh-16rem)] overflow-y-auto"
      >
        {/* Load more button */}
        {hasMore && (
          <div className="flex justify-center py-3">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="rounded-md border border-[#E8E5DE] bg-white px-3 py-1.5 text-[12px] text-[#6B6B6B] hover:bg-[#F5F3EF] disabled:opacity-50 cursor-pointer"
            >
              {loadingMore ? "Loading..." : "Load older events"}
            </button>
          </div>
        )}

        {/* Events */}
        <div className="space-y-2">
          {events.map((event) => (
            <EventRow
              key={event.seq}
              event={event}
              sessionStart={sessionStart}
            />
          ))}
        </div>

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
