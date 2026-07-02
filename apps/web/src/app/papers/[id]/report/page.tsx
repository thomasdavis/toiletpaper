export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import { db } from "@/lib/db";
import { papers, simulations, paperDontoIngest, replicationUnits } from "@toiletpaper/db";
import { eq, asc } from "drizzle-orm";
import { notFound } from "next/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const [paper] = await db.select().from(papers).where(eq(papers.id, id));
  if (!paper) return { title: "Report not found" };
  const description = `Full reproducibility report for "${paper.title}" — claim-by-claim simulation verdicts, measured vs. expected values, and confidence scores.`;
  return {
    title: `Report · ${paper.title}`,
    description,
    alternates: { canonical: `/papers/${id}/report` },
    openGraph: {
      title: `Report · ${paper.title}`,
      description,
      url: `/papers/${id}/report`,
      type: "article",
    },
  };
}
import {
  Container,
  Heading,
  Text,
  Code,
  Divider,
} from "@toiletpaper/ui";
import { ReportTabs } from "@/components/report-tabs";
import { HelpTip } from "@/components/help-tip";
import { DebugPanel } from "@/components/debug-panel";
import { PaperTabs } from "@/components/paper-tabs";
import { SignalBar } from "@/components/brand";
import { summarizeVerdicts, normalizeVerdict } from "@/lib/verdict";
import { getCurrentSimulationsForPaper } from "@/lib/current-simulations";
import { ReplicationReadiness } from "@/components/replication-readiness";
import { summarizeReplicationReadiness } from "@/lib/replication-readiness";
import { WholePaperCoverage } from "@/components/whole-paper-coverage";
import { summarizeWholePaperCoverage } from "@/lib/whole-paper-coverage";
import { ReplicationGapManifestPanel } from "@/components/replication-gap-manifest";
import { summarizeReplicationGapManifest } from "@/lib/replication-gap-manifest";
import { ArtifactBundlePanel } from "@/components/artifact-bundle-panel";
import { loadPaperArtifactManifest } from "@/lib/paper-artifacts";
import { summarizeArtifactGapCoverage } from "@/lib/artifact-gap-coverage";
import { latestCodexReplicationDossier } from "@/lib/codex-replication-dossier";
import { CodexReplicationDossierPanel } from "@/components/codex-replication-dossier";

type Simulation = typeof simulations.$inferSelect;

function mapVerdict(
  verdict: string | null,
  metadata?: unknown,
  reason?: string | null,
) {
  return normalizeVerdict(verdict, metadata, reason ?? undefined);
}

function resultReason(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  return typeof r.reason === "string" ? r.reason : null;
}

function bestVerdict(sims: Simulation[]): { verdict: string; conflicting: boolean } {
  if (sims.length === 0) return { verdict: "untested", conflicting: false };
  // Use most recent simulation's verdict
  const sorted = [...sims].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const verdicts = sims.map((s) => mapVerdict(s.verdict, s.metadata, resultReason(s.result)));
  const hasReproduced = verdicts.includes("reproduced");
  const hasContradicted = verdicts.includes("contradicted");
  const conflicting = hasReproduced && hasContradicted;
  return {
    verdict: mapVerdict(sorted[0].verdict, sorted[0].metadata, resultReason(sorted[0].result)),
    conflicting,
  };
}

function extractResult(result: unknown) {
  if (!result || typeof result !== "object") return {};
  const r = result as Record<string, unknown>;
  const fmt = (v: unknown) => v == null ? undefined : typeof v === "object" ? JSON.stringify(v) : String(v);
  return {
    reason: typeof r.reason === "string" ? r.reason : undefined,
    measured: fmt(r.measured),
    expected: fmt(r.expected),
    confidence: typeof r.confidence === "number" ? r.confidence : undefined,
    llmAnalysis: typeof r.llmAnalysis === "string" ? r.llmAnalysis : undefined,
    fittedExponent: typeof r.fittedExponent === "number" ? r.fittedExponent : undefined,
    expectedExponent: typeof r.expectedExponent === "number" ? r.expectedExponent : undefined,
  };
}

function extractFile(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return undefined;
  const m = metadata as Record<string, unknown>;
  return typeof m.simulation_file === "string" ? m.simulation_file : undefined;
}

export interface ReportClaim {
  id: string;
  text: string;
  confidence: number | null;
  category?: string;
  verdict:
    | "reproduced"
    | "contradicted"
    | "inconclusive"
    | "fragile"
    | "untested"
    | "not_applicable"
    | "vacuous"
    | "system_error";
  conflicting?: boolean;
  simulations: {
    method: string;
    verdict: string;
    reason?: string;
    measured?: string;
    expected?: string;
    confidence?: number;
    fittedExponent?: number;
    expectedExponent?: number;
    llmAnalysis?: string;
    simulationFile?: string;
  }[];
}

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [paper] = await db.select().from(papers).where(eq(papers.id, id));
  if (!paper) notFound();

  const [
    { claims: paperClaims, simulations: sims, latestJob: latestSimulationJob },
    replicationUnitRows,
    dontoIngestRows,
  ] = await Promise.all([
    getCurrentSimulationsForPaper(id),
    db.select().from(replicationUnits).where(eq(replicationUnits.paperId, id)),
    db.select().from(paperDontoIngest).where(eq(paperDontoIngest.paperId, id)),
  ]);
  const dontoIngestRow = dontoIngestRows[0] ?? null;
  paperClaims.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const reportClaims: ReportClaim[] = paperClaims.map((claim) => {
    const claimSims = sims.filter((s) => s.claimId === claim.id);
    const { verdict, conflicting } = bestVerdict(claimSims);
    return {
      id: claim.id,
      text: claim.text,
      confidence: claim.confidence,
      verdict: verdict as ReportClaim["verdict"],
      conflicting,
      simulations: claimSims.map((s) => {
        const r = extractResult(s.result);
        return {
          method: s.method.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          verdict: mapVerdict(s.verdict, s.metadata, r.reason),
          reason: r.reason,
          measured: r.measured,
          expected: r.expected,
          confidence: r.confidence,
          fittedExponent: r.fittedExponent,
          expectedExponent: r.expectedExponent,
          llmAnalysis: r.llmAnalysis,
          simulationFile: extractFile(s.metadata),
        };
      }),
    };
  });

  const counts = {
    total: reportClaims.length,
    reproduced: reportClaims.filter((c) => c.verdict === "reproduced").length,
    contradicted: reportClaims.filter((c) => c.verdict === "contradicted").length,
    inconclusive: reportClaims.filter((c) => c.verdict === "inconclusive").length,
    untested: reportClaims.filter((c) => c.verdict === "untested").length,
  };

  const latestSim = sims.reduce<Simulation | null>((latest, sim) =>
    !latest || new Date(sim.createdAt) > new Date(latest.createdAt) ? sim : latest, null);
  const analysisDate = latestSim
    ? new Date(latestSim.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : "Pending";
  const claimById = new Map(paperClaims.map((claim) => [claim.id, claim]));
  const readinessSummary = summarizeReplicationReadiness(
    sims.map((sim) => ({
      ...sim,
      claimText: claimById.get(sim.claimId)?.text ?? null,
      unitType: claimById.get(sim.claimId)?.predicate ?? null,
    })),
  );
  const wholePaperCoverage = summarizeWholePaperCoverage({
    dontoStatementCount: dontoIngestRow?.statementCount ?? 0,
    units: replicationUnitRows.map((unit) => ({
      id: unit.id,
      unitType: unit.unitType,
      sourceStatementIds: unit.sourceStatementIds,
      state: unit.state,
    })),
    simulations: sims,
    latestJob: latestSimulationJob
      ? {
          id: latestSimulationJob.id,
          state: latestSimulationJob.state,
          totalUnits: latestSimulationJob.totalUnits,
          completedUnits: latestSimulationJob.completedUnits,
          failedUnits: latestSimulationJob.failedUnits,
        }
      : null,
  });
  const artifactManifest = summarizeReplicationGapManifest({
    units: replicationUnitRows.map((unit) => ({
      id: unit.id,
      claimText: unit.claimText,
      unitType: unit.unitType,
      domain: unit.domain,
      sourceStatementIds: unit.sourceStatementIds,
      requiredArtifacts: unit.requiredArtifacts,
      blockers: unit.blockers,
    })),
    simulations: sims.map((sim) => ({
      ...sim,
      claimText: claimById.get(sim.claimId)?.text ?? null,
    })),
  });
  const artifactBundles = await loadPaperArtifactManifest(id).catch(() => null);
  const artifactGapCoverage = summarizeArtifactGapCoverage({
    gapManifest: artifactManifest,
    artifactManifest: artifactBundles,
  });
  const codexDossier = await latestCodexReplicationDossier(id).catch(() => null);

  return (
    <Container>
      <div className="space-y-6 py-4">
        {/* Header */}
        <div>
          <Heading level={1}>{paper.title}</Heading>
          {paper.authors && paper.authors.length > 0 && (
            <p className="mt-2 text-[#6B6B6B]">{paper.authors.join(", ")}</p>
          )}
          <p className="mt-3 font-serif text-lg text-[#3D3D3D]">Toiletpaper Analysis Report</p>
          <p className="mt-1 text-sm text-[#9B9B9B]">{analysisDate}</p>
        </div>

        <PaperTabs
          paperId={id}
          active="report"
          hasPdf={Boolean(paper.pdfUrl)}
          hasSims={sims.length > 0}
          counts={{ claims: paperClaims.length, simulations: sims.length }}
        />

        {/* Truth-bar: signal vs meta */}
        <SignalBar
          summary={summarizeVerdicts(sims)}
          totalClaims={paperClaims.length}
          className="rounded-xl border border-[#E8E5DE] bg-white p-5 shadow-sm"
        />

        <WholePaperCoverage summary={wholePaperCoverage} />

        <CodexReplicationDossierPanel
          dossier={codexDossier}
          apiHref={`/api/papers/${id}/replication-dossier`}
        />

        <ReplicationReadiness summary={readinessSummary} />

        <ReplicationGapManifestPanel
          manifest={artifactManifest}
          apiHref={`/api/papers/${id}/artifact-manifest`}
          artifactCoverage={artifactGapCoverage}
        />

        <ArtifactBundlePanel paperId={id} />

        {/* Tabbed claim view */}
        <ReportTabs claims={reportClaims} counts={counts} />

        {/* Debug panels */}
        <DebugPanel label="Report Claims" data={reportClaims} />
        <DebugPanel label="Simulations" data={sims} />

        {/* Footer */}
        <Divider />
        <p className="pb-8 text-center text-xs text-[#9B9B9B]">
          Generated by toiletpaper adversarial simulation engine.
          This report is automated and should be reviewed alongside the original paper.
        </p>
      </div>
    </Container>
  );
}
