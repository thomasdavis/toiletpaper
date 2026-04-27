"use client";

import { useState } from "react";
import { useDebug } from "./debug-provider";

interface DebugPanelProps {
  label: string;
  data: unknown;
}

export function DebugPanel({ label, data }: DebugPanelProps) {
  const { debug } = useDebug();
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!debug) return null;

  const json = JSON.stringify(data, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API not available
    }
  };

  return (
    <div className="rounded-lg border border-[#333333] bg-[#1A1A1A] font-mono text-sm">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <span
            className="inline-block text-[#2D6A4F] transition-transform text-xs"
            style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}
          >
            &#9654;
          </span>
          <span className="text-xs font-semibold uppercase tracking-widest text-[#2D6A4F]">
            {label}
          </span>
        </div>
        <span className="text-[10px] text-[#555555]">DEBUG</span>
      </button>

      {expanded && (
        <div className="border-t border-[#333333] px-4 py-3">
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              onClick={handleCopy}
              className="rounded border border-[#333333] px-2.5 py-1 text-[11px] text-[#2D6A4F] transition-colors hover:bg-[#2D6A4F]/10 cursor-pointer"
            >
              {copied ? "Copied!" : "Copy JSON"}
            </button>
          </div>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-[#2D6A4F]">
            {json}
          </pre>
        </div>
      )}
    </div>
  );
}
