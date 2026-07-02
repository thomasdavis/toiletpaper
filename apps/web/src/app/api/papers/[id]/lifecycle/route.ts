import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getDontoEvidenceCoverage } from "@/lib/donto-coverage";
import { getCurrentSimulationsForPaper } from "@/lib/current-simulations";
import { isSignal, normalizeVerdict } from "@/lib/verdict";

const DONTOSRV_URL = env.DONTOSRV_URL || "http://localhost:7879";

/** The 11-stage claim lifecycle. */
const LIFECYCLE_STAGES = [
  { key: "ingested", label: "Ingested", description: "PDF parsed and text extracted" },
  { key: "extracted", label: "Statements Produced", description: "Graph statements linked to producing runs" },
  { key: "asserted", label: "Asserted in KG", description: "Claims stored as donto statements" },
  { key: "evidence_linked", label: "Evidence Linked", description: "Source spans linked to claims" },
  { key: "validated", label: "Schema Validated", description: "Claims pass SHACL shape checks" },
  { key: "simulated", label: "Simulated", description: "Physics simulations run" },
  { key: "verdict_issued", label: "Verdict Issued", description: "Simulation verdict recorded" },
  { key: "argued", label: "Arguments Wired", description: "Support/rebut arguments connected" },
  { key: "confidence_set", label: "Confidence Set", description: "Confidence scores updated" },
  { key: "certified", label: "Certified", description: "Verification certificate attached" },
  { key: "obligations_clear", label: "Obligations Clear", description: "No open proof obligations" },
] as const;

type LifecycleState = "complete" | "partial" | "pending" | "blocked";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const r = await fetch(url, {
      ...init,
      headers: { accept: "application/json", ...(init?.headers ?? {}) },
    });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

function resultReason(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const record = result as Record<string, unknown>;
  return typeof record.reason === "string" ? record.reason : null;
}

function coverageState(value: number, total: number): LifecycleState {
  if (total <= 0) return "pending";
  if (value >= total) return "complete";
  if (value > 0) return "partial";
  return "pending";
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function stageState(input: {
  key: (typeof LIFECYCLE_STAGES)[number]["key"];
  paperTriples: number;
  statementCount: number;
  producedByCount: number;
  spanLinkedCount: number;
  shapeAnnotatedCount: number;
  confidenceRatedCount: number;
  certificateCount: number;
  verifiedCertificateCount: number;
  argumentCount: number;
  openObligationCount: number;
  simulationCount: number;
  simulationsWithVerdicts: number;
  signalVerdictCount: number;
  latestJobState: string | null;
  latestJobTotalUnits: number;
  latestJobFinishedUnits: number;
}) {
  const {
    key,
    paperTriples,
    statementCount,
    producedByCount,
    spanLinkedCount,
    shapeAnnotatedCount,
    confidenceRatedCount,
    certificateCount,
    verifiedCertificateCount,
    argumentCount,
    openObligationCount,
    simulationCount,
    simulationsWithVerdicts,
    signalVerdictCount,
    latestJobState,
    latestJobTotalUnits,
    latestJobFinishedUnits,
  } = input;

  switch (key) {
    case "ingested":
      return {
        state: paperTriples > 0 ? "complete" : "pending",
        evidence: `${formatCount(paperTriples)} paper entity triples`,
      };
    case "extracted":
      return {
        state: coverageState(producedByCount, statementCount),
        evidence: `${formatCount(producedByCount)} of ${formatCount(statementCount)} statements linked to extraction or simulation production runs`,
      };
    case "asserted":
      return {
        state: statementCount > 0 ? "complete" : "pending",
        evidence: `${formatCount(statementCount)} active graph statements`,
      };
    case "evidence_linked":
      return {
        state: coverageState(spanLinkedCount, statementCount),
        evidence: `${formatCount(spanLinkedCount)} of ${formatCount(statementCount)} statements anchored to source spans`,
      };
    case "validated":
      return {
        state: coverageState(shapeAnnotatedCount, statementCount),
        evidence: `${formatCount(shapeAnnotatedCount)} of ${formatCount(statementCount)} statements have shape validation annotations`,
      };
    case "simulated": {
      const jobComplete =
        latestJobState === "succeeded" &&
        latestJobTotalUnits > 0 &&
        latestJobFinishedUnits >= latestJobTotalUnits;
      const jobActive = latestJobState === "queued" || latestJobState === "running";
      return {
        state: jobComplete ? "complete" : simulationCount > 0 || jobActive ? "partial" : "pending",
        evidence:
          latestJobTotalUnits > 0
            ? `${formatCount(latestJobFinishedUnits)} of ${formatCount(latestJobTotalUnits)} latest-job units finished`
            : `${formatCount(simulationCount)} current simulation rows`,
      };
    }
    case "verdict_issued":
      return {
        state: coverageState(simulationsWithVerdicts, simulationCount),
        evidence: `${formatCount(simulationsWithVerdicts)} of ${formatCount(simulationCount)} simulation rows have verdicts; ${formatCount(signalVerdictCount)} are signal verdicts`,
      };
    case "argued":
      return {
        state: argumentCount > 0 ? "complete" : "pending",
        evidence: `${formatCount(argumentCount)} active Donto arguments`,
      };
    case "confidence_set":
      return {
        state: coverageState(confidenceRatedCount, statementCount),
        evidence: `${formatCount(confidenceRatedCount)} of ${formatCount(statementCount)} statements have confidence overlays`,
      };
    case "certified":
      return {
        state: coverageState(certificateCount, statementCount),
        evidence: `${formatCount(certificateCount)} of ${formatCount(statementCount)} statements have certificates; ${formatCount(verifiedCertificateCount)} verified`,
      };
    case "obligations_clear":
      return {
        state:
          statementCount <= 0
            ? "pending"
            : openObligationCount > 0
              ? "blocked"
              : "complete",
        evidence: `${formatCount(openObligationCount)} open proof obligations`,
      };
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const paperIri = `tp:paper:${id}`;

  const [coverage, currentSimulationData, paperHistory] = await Promise.all([
    getDontoEvidenceCoverage(id).catch(() => null),
    getCurrentSimulationsForPaper(id).catch(() => ({
      claims: [],
      latestJob: null,
      simulations: [],
      allSimulations: [],
    })),
    fetchJson<{ subject: string; count: number; rows: Array<{ predicate: string; object_lit?: { v: unknown } | null }> }>(
      `${DONTOSRV_URL}/history/${encodeURIComponent(paperIri)}`,
    ),
  ]);

  const simulations = currentSimulationData.simulations;
  const latestJob = currentSimulationData.latestJob;
  const simulationsWithVerdicts = simulations.filter((sim) => sim.verdict != null).length;
  const signalVerdictCount = simulations.filter((sim) =>
    isSignal(normalizeVerdict(sim.verdict, sim.metadata, resultReason(sim.result))),
  ).length;
  const latestJobFinishedUnits =
    (latestJob?.completedUnits ?? 0) + (latestJob?.failedUnits ?? 0);
  const paperTriples = paperHistory?.count ?? 0;

  const stages = LIFECYCLE_STAGES.map((stage) => {
    const result = stageState({
      key: stage.key,
      paperTriples,
      statementCount: coverage?.statementCount ?? 0,
      producedByCount: coverage?.producedByCount ?? 0,
      spanLinkedCount: coverage?.spanLinkedCount ?? 0,
      shapeAnnotatedCount: coverage?.shapeAnnotatedCount ?? 0,
      confidenceRatedCount: coverage?.confidenceRatedCount ?? 0,
      certificateCount: coverage?.certificateCount ?? 0,
      verifiedCertificateCount: coverage?.verifiedCertificateCount ?? 0,
      argumentCount: coverage?.argumentCount ?? 0,
      openObligationCount: coverage?.openObligationCount ?? 0,
      simulationCount: simulations.length,
      simulationsWithVerdicts,
      signalVerdictCount,
      latestJobState: latestJob?.state ?? null,
      latestJobTotalUnits: latestJob?.totalUnits ?? 0,
      latestJobFinishedUnits,
    });

    return {
      ...stage,
      ...result,
      complete: result.state === "complete",
    };
  });

  const completedCount = stages.filter((s) => s.complete).length;
  const partialCount = stages.filter((s) => s.state === "partial").length;
  const blockedCount = stages.filter((s) => s.state === "blocked").length;

  return NextResponse.json({
    paperId: id,
    stages,
    completedCount,
    partialCount,
    blockedCount,
    totalStages: LIFECYCLE_STAGES.length,
    openObligationCount: coverage?.openObligationCount ?? 0,
    argumentCount: coverage?.argumentCount ?? 0,
    statementCount: coverage?.statementCount ?? 0,
    coverage,
    simulation: {
      currentRows: simulations.length,
      rowsWithVerdicts: simulationsWithVerdicts,
      signalVerdicts: signalVerdictCount,
      latestJob: latestJob
        ? {
            id: latestJob.id,
            state: latestJob.state,
            totalUnits: latestJob.totalUnits,
            completedUnits: latestJob.completedUnits,
            failedUnits: latestJob.failedUnits,
          }
        : null,
    },
  });
}
