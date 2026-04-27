"use client";

import { useState, useEffect } from "react";

interface Props {
  paperId: string;
  simId: string;
  filename: string;
}

export function SimulationSource({ paperId, simId, filename }: Props) {
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!expanded || code !== null) return;
    setLoading(true);
    fetch(`/api/papers/${paperId}/simulations/${simId}/source`)
      .then(async (r) => {
        if (!r.ok) {
          setError("Source file not available");
          return;
        }
        const data = (await r.json()) as { filename: string; code: string; lines: number };
        setCode(data.code);
      })
      .catch(() => setError("Failed to load source"))
      .finally(() => setLoading(false));
  }, [expanded, code, paperId, simId]);

  const handleCopy = () => {
    if (code) {
      navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="rounded-lg border border-[#E8E5DE] bg-white overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between p-5 text-left hover:bg-[#FAFAF8] transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[#1A1A1A] text-xs font-bold text-[#2D6A4F]">
            {"</>"}
          </span>
          <div>
            <p className="text-sm font-semibold text-[#1A1A1A]">Simulation Source Code</p>
            <p className="text-xs text-[#9B9B9B]">{filename}</p>
          </div>
        </div>
        <span className={`text-[#9B9B9B] transition-transform ${expanded ? "rotate-180" : ""}`}>
          ▼
        </span>
      </button>

      {expanded && (
        <div className="border-t border-[#E8E5DE]">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#E8E5DE] border-t-[#4A6FA5]" />
            </div>
          )}

          {error && (
            <div className="p-5 text-sm text-[#9B9B9B]">{error}</div>
          )}

          {code && (
            <div className="relative">
              <div className="absolute right-3 top-3 z-10">
                <button
                  onClick={handleCopy}
                  className="rounded-md bg-[#3D3D3D] px-3 py-1.5 text-xs font-medium text-[#D4D0C8] hover:bg-[#6B6B6B] transition-colors"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <div className="max-h-[600px] overflow-auto bg-[#1A1A1A]">
                <pre className="p-5 pr-20 font-mono text-xs leading-6">
                  {code.split("\n").map((line, i) => (
                    <div key={i} className="flex">
                      <span className="inline-block w-12 shrink-0 select-none text-right text-[#6B6B6B]">
                        {i + 1}
                      </span>
                      <span className="ml-4 text-[#D4D0C8]">{line || " "}</span>
                    </div>
                  ))}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
