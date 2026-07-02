"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatUtcDateTime } from "@/lib/datetime";

interface Props {
  paperId: string;
  status: string;
  claimCount: number;
  simulationCount: number;
  ingestState?: string | null;
  statementCount?: number | null;
  lastErrorCode?: string | null;
  simulationGenerationEnabled: boolean;
  latestSimulationJob?: {
    id: string;
    state: string;
    totalUnits: number;
    completedUnits: number;
    failedUnits: number;
    startedAt: string | null;
    finishedAt: string | null;
    errorSummary: string | null;
  } | null;
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
  simulationGenerationEnabled,
  latestSimulationJob,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [simState, setSimState] = useState<"idle" | "starting" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const simulationGenerationPaused = !simulationGenerationEnabled;

  const activeSimulationJob =
    latestSimulationJob?.state === "queued" ||
    latestSimulationJob?.state === "running";
  const completedJobUnits =
    (latestSimulationJob?.completedUnits ?? 0) +
    (latestSimulationJob?.failedUnits ?? 0);
  const jobPercent =
    latestSimulationJob && latestSimulationJob.totalUnits > 0
      ? Math.round((completedJobUnits / latestSimulationJob.totalUnits) * 100)
      : 0;
  const isLive =
    status === "extracting" ||
    status === "simulating" ||
    ingestState === "queued" ||
    ingestState === "running" ||
    activeSimulationJob ||
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

  const hasGraphInput = ingestState === "succeeded" && (statementCount ?? 0) > 0;
  const simulationStepState =
    latestSimulationJob?.state === "failed"
      ? "failed"
      : activeSimulationJob
        ? "current"
        : latestSimulationJob?.state === "succeeded"
          ? "done"
          : simulationGenerationPaused && simulationCount === 0
            ? "pending"
            : status === "error" && claimCount > 0
              ? "failed"
              : status === "simulating" || simState === "starting"
                ? "current"
                : simulationCount > 0 || status === "done"
                  ? "done"
                  : "pending";

  const simulationStepDetail = latestSimulationJob
    ? latestSimulationJob.state === "queued"
      ? `${latestSimulationJob.totalUnits} units queued`
      : latestSimulationJob.state === "running"
        ? `${completedJobUnits}/${latestSimulationJob.totalUnits} units (${jobPercent}%)`
        : latestSimulationJob.state === "failed"
          ? latestSimulationJob.errorSummary ?? "Failed"
          : `${latestSimulationJob.completedUnits}/${latestSimulationJob.totalUnits} units complete`
    : simulationGenerationPaused && simulationCount === 0
      ? "Paused"
      : simulationCount > 0
        ? `${simulationCount} runs`
        : simulationStepState === "current"
          ? "Running"
          : simulationStepState === "failed"
            ? "Failed"
            : hasGraphInput
              ? "Ready from graph"
              : "Ready after claims";

  const canStartSimulation =
    !simulationGenerationPaused &&
    !activeSimulationJob &&
    (claimCount > 0 || hasGraphInput) &&
    status !== "extracting" &&
    status !== "simulating" &&
    status !== "error";
  const simulationButtonLabel =
    simulationCount > 0 ? "Run full replication" : "Start simulation";

  return (
    <div className="mb-6 rounded-lg border border-[#E8E5DE] bg-white p-4">
      <div className="mb-3 flex items-center gap-3">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[#9B9B9B]">
            Processing
          </h4>
          <p className="mt-1 text-sm text-[#6B6B6B]">
            {simulationGenerationPaused
              ? "Simulation generation paused while fact extraction is upgraded"
              : isLive || isPending
                ? "Live updates active"
                : "Current pipeline state"}
          </p>
        </div>
        {canStartSimulation && (
          <button
            type="button"
            onClick={startSimulation}
            disabled={simState === "starting"}
            className="ml-auto rounded-md bg-[#1A1A1A] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#333] disabled:opacity-60"
          >
            {simState === "starting" ? "Starting simulation..." : simulationButtonLabel}
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
                : hasGraphInput
                  ? "Graph ready"
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
          detail={simulationStepDetail}
          state={simulationStepState}
        />
      </div>

      {latestSimulationJob && (
        <div className="mt-3 rounded-md border border-[#E8E5DE] bg-[#FAFAF8] px-3 py-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#6B6B6B]">
            <span className="font-mono text-[#3D3D3D]">
              Codex job {latestSimulationJob.id.slice(0, 8)}
            </span>
            <span>{latestSimulationJob.state}</span>
            <span>
              {latestSimulationJob.completedUnits} complete /{" "}
              {latestSimulationJob.failedUnits} failed /{" "}
              {latestSimulationJob.totalUnits} total
            </span>
            {latestSimulationJob.startedAt && (
              <span>started {formatUtcDateTime(latestSimulationJob.startedAt)}</span>
            )}
          </div>
          {activeSimulationJob && latestSimulationJob.totalUnits > 0 && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#E8E5DE]">
              <div
                className="h-full rounded-full bg-[#2D6A4F]"
                style={{ width: `${Math.max(2, Math.min(jobPercent, 100))}%` }}
              />
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-md border border-[#9B2226]/20 bg-[#9B2226]/5 px-3 py-2 text-sm text-[#9B2226]">
          {error}
        </div>
      )}
    </div>
  );
}
