import { db } from "@/lib/db";
import { papers, claims, simulations } from "@toiletpaper/db";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Container,
} from "@toiletpaper/ui";
import { DebugPanel } from "@/components/debug-panel";
import { SimulationSource } from "@/components/simulation-source";

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

function formatMethodName(method: string): string {
  return method
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function extractResultFields(result: unknown): {
  reason?: string;
  measured?: string;
  expected?: string;
  confidence?: number;
} {
  if (!result || typeof result !== "object") return {};
  const r = result as Record<string, unknown>;
  const fmt = (v: unknown) => v == null ? undefined : typeof v === "object" ? JSON.stringify(v) : String(v);
  return {
    reason: typeof r.reason === "string" ? r.reason : undefined,
    measured: fmt(r.measured),
    expected: fmt(r.expected),
    confidence: typeof r.confidence === "number" ? r.confidence : undefined,
  };
}

function extractFile(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return undefined;
  const m = metadata as Record<string, unknown>;
  return typeof m.simulation_file === "string" ? m.simulation_file : undefined;
}

const VERDICT_STYLES: Record<string, { bg: string; border: string; text: string }> = {
  reproduced: { bg: "bg-[#D4EDE1]", border: "border-[#2D6A4F]/30", text: "text-[#2D6A4F]" },
  contradicted: { bg: "bg-[#F5D5D6]", border: "border-[#9B2226]/30", text: "text-[#9B2226]" },
  fragile: { bg: "bg-[#FFF3E0]", border: "border-[#E65100]/30", text: "text-[#E65100]" },
  inconclusive: { bg: "bg-[#F5ECD4]", border: "border-[#B07D2B]/30", text: "text-[#B07D2B]" },
};

export default async function SimulationDetailPage({
  params,
}: {
  params: Promise<{ id: string; simId: string }>;
}) {
  const { id, simId } = await params;

  const [paper] = await db.select().from(papers).where(eq(papers.id, id));
  if (!paper) notFound();

  const [sim] = await db.select().from(simulations).where(eq(simulations.id, simId));
  if (!sim) notFound();

  const [claim] = await db.select().from(claims).where(eq(claims.id, sim.claimId));

  const verdict = mapVerdict(sim.verdict, sim.metadata);
  const resultFields = extractResultFields(sim.result);
  const simulationFile = extractFile(sim.metadata);
  const verdictStyle = VERDICT_STYLES[verdict] ?? VERDICT_STYLES.inconclusive;

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
            {paper.title.length > 40 ? paper.title.slice(0, 40) + "…" : paper.title}
          </Link>
          <span>/</span>
          <Link href={`/papers/${id}/simulations`} className="hover:text-[#1A1A1A]">
            Simulations
          </Link>
          <span>/</span>
          <span className="text-[#1A1A1A]">{formatMethodName(sim.method)}</span>
        </nav>

        {/* Header */}
        <div className="border-b border-[#E8E5DE] pb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="font-serif text-3xl font-bold tracking-tight text-[#1A1A1A]">
                {formatMethodName(sim.method)}
              </h1>
              <p className="mt-2 text-sm text-[#6B6B6B]">
                Simulation ran on {new Date(sim.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
              </p>
            </div>
            {/* Large verdict badge */}
            <div className={`rounded-lg border px-6 py-3 ${verdictStyle.bg} ${verdictStyle.border}`}>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9B9B9B]">Verdict</p>
              <p className={`mt-1 text-2xl font-bold ${verdictStyle.text}`}>{verdict}</p>
            </div>
          </div>
        </div>

        {/* Claim */}
        {claim && (
          <div className="rounded-lg border border-[#E8E5DE] bg-white p-5">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9B9B9B] mb-2">Claim</p>
            <p className="text-sm leading-relaxed text-[#1A1A1A]">{claim.text}</p>
            <div className="mt-3">
              <Link
                href={`/papers/${id}`}
                className="text-sm font-medium text-[#4A6FA5] hover:underline"
              >
                View claim card
              </Link>
            </div>
          </div>
        )}

        {/* Reason */}
        {resultFields.reason && (
          <div className="rounded-lg border border-[#E8E5DE] bg-white p-5">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9B9B9B] mb-2">Reason</p>
            <p className="text-sm leading-relaxed text-[#3D3D3D]">{resultFields.reason}</p>
          </div>
        )}

        {/* Measured vs Expected */}
        {(resultFields.measured || resultFields.expected) && (
          <div className="grid gap-4 sm:grid-cols-2">
            {resultFields.measured && (
              <div className="rounded-lg border border-[#E8E5DE] bg-white p-5">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9B9B9B]">Measured</p>
                <p className="mt-2 font-mono text-lg font-bold text-[#1A1A1A]">{resultFields.measured}</p>
              </div>
            )}
            {resultFields.expected && (
              <div className="rounded-lg border border-[#E8E5DE] bg-white p-5">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9B9B9B]">Expected</p>
                <p className="mt-2 font-mono text-lg font-bold text-[#1A1A1A]">{resultFields.expected}</p>
              </div>
            )}
          </div>
        )}

        {/* Confidence */}
        {resultFields.confidence != null && (
          <div className="rounded-lg border border-[#E8E5DE] bg-white p-5">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9B9B9B] mb-2">Verdict Confidence</p>
            <div className="flex items-center gap-3">
              <div className="h-3 flex-1 max-w-64 rounded-full bg-[#E8E5DE]">
                <div
                  className={`h-3 rounded-full ${verdict === "reproduced" ? "bg-[#2D6A4F]" : verdict === "contradicted" ? "bg-[#9B2226]" : "bg-[#B07D2B]"}`}
                  style={{ width: `${resultFields.confidence * 100}%` }}
                />
              </div>
              <span className="font-mono text-lg font-bold text-[#1A1A1A]">
                {(resultFields.confidence * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        )}

        {/* Simulation file */}
        {simulationFile && (
          <div className="rounded-lg border border-[#E8E5DE] bg-white p-5">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9B9B9B] mb-2">Simulation File</p>
            <code className="rounded bg-[#F5F3EF] px-2.5 py-1.5 font-mono text-sm text-[#3D3D3D]">{simulationFile}</code>
          </div>
        )}

        {/* Simulation source code */}
        {simulationFile && (
          <SimulationSource paperId={id} simId={simId} filename={simulationFile} />
        )}

        {/* Full result JSON */}
        <div className="rounded-lg border border-[#E8E5DE] bg-white p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9B9B9B] mb-3">Full Result</p>
          <pre className="max-h-96 overflow-auto rounded-lg border border-[#E8E5DE] bg-[#FAFAF8] p-4 font-mono text-xs leading-relaxed text-[#3D3D3D]">
            {JSON.stringify(sim.result, null, 2)}
          </pre>
        </div>

        {/* Full metadata JSON */}
        {sim.metadata != null && (
          <div className="rounded-lg border border-[#E8E5DE] bg-white p-5">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9B9B9B] mb-3">Full Metadata</p>
            <pre className="max-h-96 overflow-auto rounded-lg border border-[#E8E5DE] bg-[#FAFAF8] p-4 font-mono text-xs leading-relaxed text-[#3D3D3D]">
              {JSON.stringify(sim.metadata, null, 2)}
            </pre>
          </div>
        )}

        {/* Navigation links */}
        <div className="flex items-center gap-4 border-t border-[#E8E5DE] pt-6">
          <Link
            href={`/papers/${id}/simulations`}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-[#E8E5DE] bg-white px-5 text-sm font-medium text-[#3D3D3D] shadow-sm transition-all hover:bg-[#F5F3EF]"
          >
            All Simulations
          </Link>
          <Link
            href={`/papers/${id}`}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-[#E8E5DE] bg-white px-5 text-sm font-medium text-[#3D3D3D] shadow-sm transition-all hover:bg-[#F5F3EF]"
          >
            Back to Paper
          </Link>
          <Link
            href={`/papers/${id}/report`}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-[#E8E5DE] bg-white px-5 text-sm font-medium text-[#3D3D3D] shadow-sm transition-all hover:bg-[#F5F3EF]"
          >
            View Report
          </Link>
        </div>

        {/* Debug panels */}
        <DebugPanel label="Simulation" data={sim} />
        {claim && <DebugPanel label="Claim" data={claim} />}
      </div>
    </Container>
  );
}
