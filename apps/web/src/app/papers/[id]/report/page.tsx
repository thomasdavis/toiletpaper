import { db } from "@/lib/db";
import { papers, claims, simulations } from "@toiletpaper/db";
import { eq, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Container,
  Heading,
  Text,
  Code,
  Divider,
} from "@toiletpaper/ui";
import { ReportTabs } from "@/components/report-tabs";
import { HelpTip } from "@/components/help-tip";

type Simulation = typeof simulations.$inferSelect;

function mapVerdict(verdict: string | null, metadata?: unknown) {
  // Check metadata.original_verdict first — preserves fragile/undetermined/not-simulable
  if (metadata && typeof metadata === "object") {
    const m = metadata as Record<string, unknown>;
    if (typeof m.original_verdict === "string") {
      const ov = m.original_verdict;
      if (ov === "reproduced") return "reproduced" as const;
      if (ov === "contradicted") return "contradicted" as const;
      if (ov === "fragile") return "fragile" as const;
      // Fall through for other original verdicts
    }
  }
  if (verdict === "confirmed") return "reproduced" as const;
  if (verdict === "refuted") return "contradicted" as const;
  return "inconclusive" as const;
}

function bestVerdict(sims: Simulation[]): { verdict: string; conflicting: boolean } {
  if (sims.length === 0) return { verdict: "untested", conflicting: false };
  // Use most recent simulation's verdict
  const sorted = [...sims].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const verdicts = sims.map((s) => mapVerdict(s.verdict, s.metadata));
  const hasReproduced = verdicts.includes("reproduced");
  const hasContradicted = verdicts.includes("contradicted");
  const conflicting = hasReproduced && hasContradicted;
  return { verdict: mapVerdict(sorted[0].verdict, sorted[0].metadata), conflicting };
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
  verdict: "reproduced" | "contradicted" | "inconclusive" | "fragile" | "untested";
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

  const paperClaims = await db.select().from(claims).where(eq(claims.paperId, id)).orderBy(asc(claims.createdAt));

  const claimIds = paperClaims.map((c) => c.id);
  let sims: Simulation[] = [];
  if (claimIds.length > 0) {
    const allSims = await Promise.all(
      claimIds.map((cid) => db.select().from(simulations).where(eq(simulations.claimId, cid))),
    );
    sims = allSims.flat();
  }

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
          verdict: mapVerdict(s.verdict, s.metadata),
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
          <span className="text-[#1A1A1A]">Report</span>
        </nav>

        {/* Header */}
        <div className="border-b border-[#E8E5DE] pb-6">
          <Heading level={1}>{paper.title}</Heading>
          {paper.authors && paper.authors.length > 0 && (
            <p className="mt-2 text-[#6B6B6B]">{paper.authors.join(", ")}</p>
          )}
          <p className="mt-3 font-serif text-lg text-[#3D3D3D]">Toiletpaper Analysis Report</p>
          <p className="mt-1 text-sm text-[#9B9B9B]">{analysisDate}</p>
        </div>

        {/* Verdict legend */}
        <div className="flex items-start gap-2 rounded-lg border border-[#E8E5DE] bg-[#FAFAF8] px-4 py-3 text-[13px] leading-relaxed text-[#6B6B6B]">
          <HelpTip text="Verdicts: reproduced = simulation confirms claim. contradicted = simulation produces inconsistent results. fragile = result depends on parameters. inconclusive = insufficient data to decide." />
          <span>
            <strong className="text-[#3D3D3D]">reproduced</strong> = simulation confirms &middot;{" "}
            <strong className="text-[#3D3D3D]">contradicted</strong> = simulation contradicts &middot;{" "}
            <strong className="text-[#3D3D3D]">fragile</strong> = parameter-dependent &middot;{" "}
            <strong className="text-[#3D3D3D]">inconclusive</strong> = insufficient data
          </span>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-5 gap-4">
          <div className="rounded-lg border border-[#E8E5DE] bg-white p-4 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9B9B9B]">Total</p>
            <p className="mt-1 font-mono text-2xl font-bold text-[#1A1A1A]">{counts.total}</p>
          </div>
          <div className="rounded-lg border border-[#2D6A4F]/20 bg-[#D4EDE1]/20 p-4 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#2D6A4F]">Reproduced</p>
            <p className="mt-1 font-mono text-2xl font-bold text-[#2D6A4F]">{counts.reproduced}</p>
          </div>
          <div className="rounded-lg border border-[#9B2226]/20 bg-[#F5D5D6]/20 p-4 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9B2226]">Contradicted</p>
            <p className="mt-1 font-mono text-2xl font-bold text-[#9B2226]">{counts.contradicted}</p>
          </div>
          <div className="rounded-lg border border-[#B07D2B]/20 bg-[#F5ECD4]/20 p-4 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#B07D2B]">Inconclusive</p>
            <p className="mt-1 font-mono text-2xl font-bold text-[#B07D2B]">{counts.inconclusive}</p>
          </div>
          <div className="rounded-lg border border-[#E8E5DE] bg-white p-4 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9B9B9B]">Untested</p>
            <p className="mt-1 font-mono text-2xl font-bold text-[#9B9B9B]">{counts.untested}</p>
          </div>
        </div>

        {/* Distribution bar */}
        {counts.total - counts.untested > 0 && (
          <div className="flex h-2.5 overflow-hidden rounded-full">
            {counts.reproduced > 0 && <div className="bg-[#2D6A4F]" style={{ width: `${(counts.reproduced / counts.total) * 100}%` }} />}
            {counts.contradicted > 0 && <div className="bg-[#9B2226]" style={{ width: `${(counts.contradicted / counts.total) * 100}%` }} />}
            {counts.inconclusive > 0 && <div className="bg-[#B07D2B]" style={{ width: `${(counts.inconclusive / counts.total) * 100}%` }} />}
            {counts.untested > 0 && <div className="bg-[#E8E5DE]" style={{ width: `${(counts.untested / counts.total) * 100}%` }} />}
          </div>
        )}

        {/* Tabbed claim view */}
        <ReportTabs claims={reportClaims} counts={counts} />

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
