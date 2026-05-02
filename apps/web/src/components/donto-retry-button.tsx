"use client";

import { useState } from "react";

interface Props {
  paperId: string;
}

/**
 * Client island — fires the retry endpoint and refreshes the page
 * once the result is back. Only rendered when the Donto pill is in
 * `failed` state.
 */
export function DontoRetryButton({ paperId }: Props) {
  const [state, setState] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  async function retry() {
    setState("loading");
    setMsg(null);
    try {
      const r = await fetch(`/api/papers/${paperId}/donto/reingest`, {
        method: "POST",
      });
      if (r.ok) {
        setState("ok");
        // Reload to refresh the SSR pill state
        setTimeout(() => location.reload(), 500);
      } else {
        const body = await r.json().catch(() => ({}));
        setState("err");
        setMsg(body?.message ?? body?.error ?? `HTTP ${r.status}`);
      }
    } catch (e) {
      setState("err");
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <button
      onClick={retry}
      disabled={state === "loading"}
      className="inline-flex items-center gap-1 rounded-md border border-[#9B2226]/30 bg-[#F5D5D6]/30 px-2.5 py-0.5 text-[11px] font-semibold text-[#9B2226] hover:bg-[#F5D5D6]/60 disabled:opacity-60"
      title={msg ?? undefined}
    >
      {state === "loading" ? "retrying…" : state === "ok" ? "retried" : "retry"}
    </button>
  );
}
