import type { Metadata } from "next";
import { db } from "@/lib/db";
import { papers, claims, simulations } from "@toiletpaper/db";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const [paper] = await db.select().from(papers).where(eq(papers.id, id));
  if (!paper) return { title: "Simulations not found" };
  const description = `All simulation runs for "${paper.title}" — methods used, verdicts, confidence scores, and source code per run.`;
  return {
    title: `Simulations · ${paper.title}`,
    description,
    alternates: { canonical: `/papers/${id}/simulations` },
    openGraph: {
      title: `Simulations · ${paper.title}`,
      description,
      url: `/papers/${id}/simulations`,
      type: "article",
    },
  };
}
import {
  Container,
} from "@toiletpaper/ui";
import { SimulationsTable } from "./simulations-table";
import { DebugPanel } from "@/components/debug-panel";
import { PaperTabs } from "@/components/paper-tabs";
import { isSignal, normalizeVerdict, type Verdict } from "@/lib/verdict";
import { getCurrentSimulationsForPaper } from "@/lib/current-simulations";
import { ReplicationReadiness } from "@/components/replication-readiness";
import { summarizeReplicationReadiness } from "@/lib/replication-readiness";

function mapVerdict(
  verdict: string | null,
  metadata?: unknown,
  reason?: string | null,
) {
  return normalizeVerdict(verdict, metadata, reason);
}

function extractConfidence(result: unknown): number | undefined {
  if (!result || typeof result !== "object") return undefined;
  const r = result as Record<string, unknown>;
  return typeof r.confidence === "number" ? r.confidence : undefined;
}

function resultReason(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  return typeof r.reason === "string" ? r.reason : null;
}

export interface SimulationRow {
  id: string;
  claimId: string;
  claimText: string;
  method: string;
  verdict: Verdict;
  confidence: number | undefined;
  createdAt: string;
  result: unknown;
  metadata: unknown;
}

export default async function SimulationsListPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [paper] = await db.select().from(papers).where(eq(papers.id, id));
  if (!paper) notFound();

  const { claims: paperClaims, simulations: sims } =
    await getCurrentSimulationsForPaper(id);

  const claimMap = new Map(paperClaims.map((c) => [c.id, c]));
  const readinessSummary = summarizeReplicationReadiness(
    sims.map((sim) => ({
      ...sim,
      claimText: claimMap.get(sim.claimId)?.text ?? null,
      unitType: claimMap.get(sim.claimId)?.predicate ?? null,
    })),
  );

  const rows: SimulationRow[] = sims.map((sim) => ({
    id: sim.id,
    claimId: sim.claimId,
    claimText: claimMap.get(sim.claimId)?.text ?? "Unknown claim",
    method: sim.method,
    verdict: mapVerdict(sim.verdict, sim.metadata, resultReason(sim.result)),
    confidence: extractConfidence(sim.result),
    createdAt: sim.createdAt.toISOString(),
    result: sim.result,
    metadata: sim.metadata,
  }));

  return (
    <Container>
      <div className="space-y-6 py-4">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-[#9B9B9B]">
          <Link href="/" className="hover:text-[#1A1A1A]">Dashboard</Link>
          <span>/</span>
          <Link href="/papers" className="hover:text-[#1A1A1A]">Papers</Link>
          <span>/</span>
          <Link href={`/papers/${id}`} className="hover:text-[#1A1A1A]">
            {paper.title.length > 50 ? paper.title.slice(0, 50) + "…" : paper.title}
          </Link>
          <span>/</span>
          <span className="text-[#1A1A1A]">Simulations</span>
        </nav>

        {/* Header */}
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-[#1A1A1A]">
            {paper.title}
          </h1>
          <p className="mt-2 text-sm text-[#6B6B6B]">
            Simulations · {rows.length} run{rows.length !== 1 ? "s" : ""}
          </p>
        </div>

        <PaperTabs
          paperId={id}
          active="simulations"
          hasPdf={Boolean(paper.pdfUrl)}
          hasSims={sims.length > 0}
          counts={{ claims: paperClaims.length, simulations: sims.length }}
        />

        {/* Summary stats */}
        <div className="grid grid-cols-4 gap-4">
          <div className="rounded-lg border border-[#E8E5DE] bg-white p-4 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9B9B9B]">Total</p>
            <p className="mt-1 font-mono text-2xl font-bold text-[#1A1A1A]">{rows.length}</p>
          </div>
          <div className="rounded-lg border border-[#2D6A4F]/20 bg-[#D4EDE1]/20 p-4 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#2D6A4F]">Reproduced</p>
            <p className="mt-1 font-mono text-2xl font-bold text-[#2D6A4F]">{rows.filter((r) => r.verdict === "reproduced").length}</p>
          </div>
          <div className="rounded-lg border border-[#9B2226]/20 bg-[#F5D5D6]/20 p-4 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9B2226]">Contradicted</p>
            <p className="mt-1 font-mono text-2xl font-bold text-[#9B2226]">{rows.filter((r) => r.verdict === "contradicted").length}</p>
          </div>
          <div className="rounded-lg border border-[#B07D2B]/20 bg-[#F5ECD4]/20 p-4 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#8B8589]">No Signal</p>
            <p className="mt-1 font-mono text-2xl font-bold text-[#8B8589]">{rows.filter((r) => !isSignal(r.verdict)).length}</p>
          </div>
        </div>

        <ReplicationReadiness summary={readinessSummary} />

        {/* Interactive table */}
        <SimulationsTable rows={rows} paperId={id} />

        {/* Debug */}
        <DebugPanel label="Simulations Data" data={rows} />
      </div>
    </Container>
  );
}
