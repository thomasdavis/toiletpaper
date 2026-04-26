"use client";

import { useState, useCallback } from "react";

interface DontoRow {
  predicate: string;
  objectIri?: string | null;
  objectLit?: { v: unknown; dt: string } | null;
  context: string;
  statementId: string;
}

export function ClaimDontoInspect({ iri }: { iri: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<DontoRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const handleToggle = useCallback(async () => {
    const next = !open;
    setOpen(next);
    if (next && !loaded) {
      setLoading(true);
      try {
        const r = await fetch(
          `/api/donto/history?iri=${encodeURIComponent(iri)}`,
        );
        if (r.ok) {
          const json = await r.json();
          setData(
            (json.rows ?? []).map(
              (row: {
                predicate: string;
                object_iri?: string | null;
                object_lit?: { v: unknown; dt: string } | null;
                context: string;
                statement_id: string;
              }) => ({
                predicate: row.predicate,
                objectIri: row.object_iri,
                objectLit: row.object_lit,
                context: row.context,
                statementId: row.statement_id,
              }),
            ),
          );
        }
      } catch {
        /* dontosrv may be down */
      }
      setLoading(false);
      setLoaded(true);
    }
  }, [open, loaded, iri]);

  return (
    <div className="border-t border-[#E8E5DE] px-5 py-2">
      <button
        type="button"
        onClick={handleToggle}
        className="flex items-center gap-1.5 text-xs font-medium text-[#4A6FA5] hover:text-[#3A5A87] transition-colors cursor-pointer"
      >
        <span
          className="inline-block transition-transform"
          style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          &#9656;
        </span>
        Inspect in Donto
      </button>
      {open && (
        <div className="mt-2">
          {loading ? (
            <div className="flex items-center gap-2 py-2">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-[#4A6FA5] border-t-transparent" />
              <span className="text-xs text-[#6B6B6B]">Loading...</span>
            </div>
          ) : data && data.length > 0 ? (
            <div className="space-y-1.5">
              {data.map((row, i) => (
                <div
                  key={`${row.statementId}-${i}`}
                  className="flex items-start gap-2 rounded bg-[#FAFAF8] px-2 py-1.5"
                >
                  <span className="shrink-0 font-mono text-[11px] font-medium text-[#4A6FA5]">
                    {row.predicate}
                  </span>
                  <span className="flex-1 text-[11px] text-[#3D3D3D] break-all">
                    {row.objectIri
                      ? row.objectIri
                      : row.objectLit
                        ? `${row.objectLit.v} (${row.objectLit.dt})`
                        : "---"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-[#6B6B6B]">
              No triples found for this entity.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
