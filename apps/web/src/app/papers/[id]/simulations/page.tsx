import { db } from "@/lib/db";
import { papers, claims, simulations } from "@toiletpaper/db";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Container,
} from "@toiletpaper/ui";
import { SimulationsTable } from "./simulations-table";
import { DebugPanel } from "@/components/debug-panel";
import { PaperTabs } from "@/components/paper-tabs";

function mapVerdict(verdict: string | null, metadata?: unknown) {
  if (metadata && typeof metadata === "object") {
    const m = metadata as Record<string, unknown>;
    if (typeof m.original_verdict === "string") {
      const ov = m.original_verdict;
      if (ov === "reproduced") return "reproduced" as const;
      if (ov === "contradicted") return "contradicted" as const;
      if (ov === "fragile") return "fragile" as const;
    }
  }
  if (verdict === "confirmed") return "reproduced" as const;
  if (verdict === "refuted") return "contradicted" as const;
  return "inconclusive" as const;
}

function extractConfidence(result: unknown): number | undefined {
  if (!result || typeof result !== "object") return undefined;
  const r = result as Record<string, unknown>;
  return typeof r.confidence === "number" ? r.confidence : undefined;
}

export interface SimulationRow {
  id: string;
  claimId: string;
  claimText: string;
  method: string;
  verdict: string;
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

  const paperClaims = await db
    .select()
    .from(claims)
    .where(eq(claims.paperId, id));

  const claimIds = paperClaims.map((c) => c.id);
  let sims: (typeof simulations.$inferSelect)[] = [];
  if (claimIds.length > 0) {
    const allSims = await Promise.all(
      claimIds.map((cid) =>
        db.select().from(simulations).where(eq(simulations.claimId, cid)),
      ),
    );
    sims = allSims.flat();
  }

  const claimMap = new Map(paperClaims.map((c) => [c.id, c]));

  const rows: SimulationRow[] = sims.map((sim) => ({
    id: sim.id,
    claimId: sim.claimId,
    claimText: claimMap.get(sim.claimId)?.text ?? "Unknown claim",
    method: sim.method,
    verdict: mapVerdict(sim.verdict, sim.metadata),
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
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#B07D2B]">Inconclusive</p>
            <p className="mt-1 font-mono text-2xl font-bold text-[#B07D2B]">{rows.filter((r) => r.verdict === "inconclusive").length}</p>
          </div>
        </div>

        {/* Interactive table */}
        <SimulationsTable rows={rows} paperId={id} />

        {/* Debug */}
        <DebugPanel label="Simulations Data" data={rows} />
      </div>
    </Container>
  );
}
