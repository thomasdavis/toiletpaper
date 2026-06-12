"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  paperId: string;
  status: string;
  claimCount: number;
  simulationCount: number;
  ingestState?: string | null;
  statementCount?: number | null;
  lastErrorCode?: string | null;
}

function stepTone(state: "done" | "current" | "pending" | "failed") {
  switch (state) {
    case "done":
      return "border-[#2D6A4F]/30 bg-[#2D6A4F]/5 text-[#2D6A4F]";
    case "current":
      return "border-[#B07D2B]/40 bg-[#B07D2B]/10 text-[#6F4E13]";
    case "failed":
      return "border-[#9B2226]/30 bg-[#9B2226]/5 text-[#9B2226]";
    default:
      return "border-[#E8E5DE] bg-[#FAFAF8] text-[#6B6B6B]";
  }
}

function Step({
  label,
  detail,
  state,
}: {
  label: string;
  detail: string;
  state: "done" | "current" | "pending" | "failed";
}) {
  return (
    <div className={`rounded-md border px-3 py-2 ${stepTone(state)}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em]">
        {label}
      </div>
      <div className="mt-1 text-sm">{detail}</div>
    </div>
  );
}

export function PaperProcessingPanel({
  paperId,
  status,
  claimCount,
  simulationCount,
  ingestState,
  statementCount,
  lastErrorCode,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [simState, setSimState] = useState<"idle" | "starting" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const isLive =
    status === "extracting" ||
    status === "simulating" ||
    ingestState === "queued" ||
    ingestState === "running" ||
    simState === "starting";

  useEffect(() => {
    if (!isLive) return;
    const timer = window.setInterval(() => {
      startTransition(() => router.refresh());
    }, 4000);
    return () => window.clearInterval(timer);
  }, [isLive, router, startTransition]);

  async function startSimulation() {
    setSimState("starting");
    setError(null);
    try {
      const response = await fetch("/api/simulate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paper_id: paperId }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error ?? `Simulation failed (${response.status})`);
      }
      startTransition(() => router.refresh());
      setSimState("idle");
    } catch (e) {
      setSimState("error");
      setError(e instanceof Error ? e.message : "Simulation failed");
    }
  }

  const extractionState =
    status === "error" && claimCount === 0
      ? "failed"
      : claimCount > 0 || ["extracted", "simulating", "done"].includes(status)
        ? "done"
        : status === "extracting"
          ? "current"
          : "pending";

  const ingestStepState =
    ingestState === "failed"
      ? "failed"
      : ingestState === "succeeded"
        ? "done"
        : ingestState === "queued" || ingestState === "running"
          ? "current"
          : "pending";

  const simulationStepState =
    status === "error" && claimCount > 0
      ? "failed"
      : status === "simulating" || simState === "starting"
        ? "current"
        : simulationCount > 0 || status === "done"
          ? "done"
          : "pending";

  const canStartSimulation =
    claimCount > 0 &&
    simulationCount === 0 &&
    status !== "extracting" &&
    status !== "simulating" &&
    status !== "error";

  return (
    <div className="mb-6 rounded-lg border border-[#E8E5DE] bg-white p-4">
      <div className="mb-3 flex items-center gap-3">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[#9B9B9B]">
            Processing
          </h4>
          <p className="mt-1 text-sm text-[#6B6B6B]">
            {isLive || isPending ? "Live updates active" : "Current pipeline state"}
          </p>
        </div>
        {canStartSimulation && (
          <button
            type="button"
            onClick={startSimulation}
            disabled={simState === "starting"}
            className="ml-auto rounded-md bg-[#1A1A1A] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#333] disabled:opacity-60"
          >
            {simState === "starting" ? "Starting simulation..." : "Start simulation"}
          </button>
        )}
      </div>

      <div className="grid gap-2 md:grid-cols-4">
        <Step label="Source" detail="Uploaded" state="done" />
        <Step
          label="Claims"
          detail={
            extractionState === "current"
              ? "Extracting"
              : claimCount > 0
                ? `${claimCount} extracted`
                : extractionState === "failed"
                  ? "Failed"
                  : "Pending"
          }
          state={extractionState}
        />
        <Step
          label="Donto"
          detail={
            ingestState === "succeeded"
              ? `${statementCount ?? 0} statements`
              : ingestState === "failed"
                ? lastErrorCode ?? "Failed"
                : ingestState === "queued" || ingestState === "running"
                  ? "Ingesting"
                  : "Pending"
          }
          state={ingestStepState}
        />
        <Step
          label="Simulation"
          detail={
            simulationCount > 0
              ? `${simulationCount} runs`
              : simulationStepState === "current"
                ? "Running"
                : simulationStepState === "failed"
                  ? "Failed"
                  : "Ready after claims"
          }
          state={simulationStepState}
        />
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-[#9B2226]/20 bg-[#9B2226]/5 px-3 py-2 text-sm text-[#9B2226]">
          {error}
        </div>
      )}
    </div>
  );
}
