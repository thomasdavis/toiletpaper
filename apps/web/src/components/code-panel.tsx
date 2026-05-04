"use client";

import { useState, useEffect, useCallback } from "react";
import { VerdictBadge, Text, Stack, EmptyState } from "@toiletpaper/ui";

// ── Types ──────────────────────────────────────────────────────────

interface SimFile {
  simId: string;
  filename: string;
  method: string;
  verdict: string | null;
}

function mapVerdict(verdict: string | null): "reproduced" | "contradicted" | "fragile" | "undetermined" {
  if (verdict === "confirmed" || verdict === "reproduced") return "reproduced";
  if (verdict === "refuted" || verdict === "contradicted") return "contradicted";
  if (verdict === "fragile") return "fragile";
  return "undetermined";
}

// ── Component ──────────────────────────────────────────────────────

interface CodePanelProps {
  paperId: string;
  simFiles: SimFile[];
}

export function CodePanel({ paperId, simFiles }: CodePanelProps) {
  const [selected, setSelected] = useState<SimFile | null>(simFiles[0] ?? null);
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadSource = useCallback(
    async (file: SimFile) => {
      setCode(null);
      setError(null);
      setLoading(true);
      try {
        const r = await fetch(
          `/api/papers/${paperId}/simulations/${file.simId}/source`,
        );
        if (!r.ok) {
          setError("Source file not available");
          return;
        }
        const data = (await r.json()) as { code: string };
        setCode(data.code);
      } catch {
        setError("Failed to load source");
      } finally {
        setLoading(false);
      }
    },
    [paperId],
  );

  useEffect(() => {
    if (selected) loadSource(selected);
  }, [selected, loadSource]);

  const handleCopy = useCallback(() => {
    if (code) {
      navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [code]);

  if (simFiles.length === 0) {
    return (
      <EmptyState
        title="No simulation source code"
        description="Source files will appear here once simulations have been run."
      />
    );
  }

  return (
    <div className="flex min-h-[500px] rounded-lg border border-[var(--color-rule-faint)] bg-white overflow-hidden">
      {/* File list sidebar */}
      <div className="w-64 shrink-0 border-r border-[var(--color-rule-faint)] bg-[var(--color-paper)] overflow-y-auto">
        <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-[var(--color-ink-faint)]">
          Files ({simFiles.length})
        </div>
        {simFiles.map((file) => {
          const isSelected = selected?.simId === file.simId;
          return (
            <button
              key={file.simId}
              type="button"
              onClick={() => setSelected(file)}
              className={[
                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors cursor-pointer",
                isSelected
                  ? "bg-white text-[var(--color-ink)] font-medium"
                  : "text-[var(--color-ink-muted)] hover:bg-[var(--color-paper-warm)] hover:text-[var(--color-ink)]",
              ].join(" ")}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[#1A1A1A] font-mono text-[9px] font-bold text-[#2D6A4F]">
                py
              </span>
              <span className="flex-1 min-w-0 truncate font-mono text-xs">
                {file.filename}
              </span>
            </button>
          );
        })}
      </div>

      {/* Code viewer */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        {selected && (
          <div className="flex items-center justify-between border-b border-[var(--color-rule-faint)] px-4 py-2 bg-[var(--color-paper)]">
            <Stack direction="horizontal" align="center" gap={2}>
              <Text size="xs" weight="medium" className="font-mono">
                {selected.filename}
              </Text>
              <VerdictBadge verdict={mapVerdict(selected.verdict)} />
            </Stack>
            <button
              type="button"
              onClick={handleCopy}
              disabled={!code}
              className="rounded-md bg-[#3D3D3D] px-3 py-1 text-xs font-medium text-[#D4D0C8] hover:bg-[#6B6B6B] disabled:opacity-40 transition-colors cursor-pointer"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        )}

        {/* Code area */}
        <div className="flex-1 overflow-auto bg-[#1A1A1A]">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#E8E5DE] border-t-[#4A6FA5]" />
            </div>
          )}

          {error && (
            <div className="p-6 text-sm text-[#9B9B9B]">{error}</div>
          )}

          {code && !loading && (
            <pre className="p-4 font-mono text-xs leading-6">
              {code.split("\n").map((line, i) => (
                <div key={i} className="flex">
                  <span className="inline-block w-10 shrink-0 select-none text-right text-[#6B6B6B]">
                    {i + 1}
                  </span>
                  <span className="ml-4 text-[#D4D0C8]">{line || " "}</span>
                </div>
              ))}
            </pre>
          )}

          {!selected && !loading && !error && (
            <div className="flex items-center justify-center py-16 text-sm text-[#6B6B6B]">
              Select a file from the sidebar
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
