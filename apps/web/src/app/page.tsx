// Force per-request rendering — counts and donto health change constantly.
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import { db } from "@/lib/db";
import { papers, claims, simulations } from "@toiletpaper/db";
import { count } from "drizzle-orm";
import Link from "next/link";
import {
  dontoHealth,
  getContexts,
  getObligationSummary,
  getSubjects,
} from "@/lib/donto";
import {
  Container,
  Heading,
  StatCard,
} from "@toiletpaper/ui";
import { HelpTip } from "@/components/help-tip";
import { DebugPanel } from "@/components/debug-panel";

export const metadata: Metadata = {
  title: {
    absolute: "toiletpaper — Reproducibility engine for research papers",
  },
  description:
    "toiletpaper reads a research paper, extracts every quantitative claim, runs an adversarial physics simulation against each one, and tells you which results actually reproduce.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "toiletpaper — Reproducibility engine for research papers",
    description:
      "Upload a PDF; get an annotated paper with each claim color-coded reproduced, contradicted, or inconclusive — backed by deterministic simulations and a verdict report.",
    url: "/",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "toiletpaper — Reproducibility engine for research papers",
    description:
      "Upload a PDF; get an annotated paper with each claim color-coded reproduced, contradicted, or inconclusive.",
  },
};

export default async function DashboardPage() {
  let stats = { papers: 0, claims: 0, simulations: 0 };
  try {
    const [p, c, s] = await Promise.all([
      db.select({ value: count() }).from(papers),
      db.select({ value: count() }).from(claims),
      db.select({ value: count() }).from(simulations),
    ]);
    stats = {
      papers: p[0]?.value ?? 0,
      claims: c[0]?.value ?? 0,
      simulations: s[0]?.value ?? 0,
    };
  } catch { /* DB not up */ }

  const [healthy, ctxData, oblData, subData] = await Promise.all([
    dontoHealth(),
    getContexts(),
    getObligationSummary(),
    getSubjects(),
  ]);

  const tpContexts = ctxData?.contexts?.filter((c) =>
    c.context.startsWith("tp:paper:"),
  ) ?? [];
  const totalDontoStatements = tpContexts.reduce((s, c) => s + c.count, 0);
  const candidateCtxs = tpContexts.filter((c) => c.kind === "candidate");
  const obligations = oblData?.summary ?? [];
  const totalObligations = obligations.reduce((s, o) => s + o.count, 0);
  const dontoSubjects = subData?.subjects?.length ?? 0;

  return (
    <Container>
      <div className="space-y-10 py-4">
        {/* Hero: what is toiletpaper? */}
        <section>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#4A6FA5]">
            Reproducibility engine for research papers
          </p>
          <h1 className="mt-3 font-serif text-[56px] font-bold leading-[1.05] tracking-[-0.02em] text-[#1A1A1A] sm:text-[64px]">
            Don&rsquo;t take a paper&rsquo;s word for it.
          </h1>
          <p className="mt-5 max-w-2xl text-[18px] leading-[1.6] text-[#3D3D3D]">
            <strong className="font-semibold text-[#1A1A1A]">toiletpaper</strong> reads
            a research paper, pulls out every quantitative claim, and runs an adversarial
            simulation against each one — physics from scratch, not an LLM hand-wave —
            then tells you which results actually reproduce.
          </p>
          <p className="mt-4 max-w-2xl text-[15px] leading-[1.65] text-[#6B6B6B]">
            Upload a PDF or markdown. Within a few minutes you get an annotated copy of
            the paper with each claim color-coded <span className="font-semibold text-[#2D6A4F]">reproduced</span>,{" "}
            <span className="font-semibold text-[#9B2226]">contradicted</span>, or{" "}
            <span className="font-semibold text-[#B07D2B]">inconclusive</span>, plus the
            full simulation source, measured-vs-expected values, and a verdict report.
          </p>

          {/* How it works */}
          <ol className="mt-8 grid gap-4 sm:grid-cols-4">
            {[
              { n: "01", t: "Upload", d: "Drop a PDF or markdown file." },
              { n: "02", t: "Extract", d: "Claims, predicates, units, and confidence parsed from the text." },
              { n: "03", t: "Simulate", d: "Each claim runs through deterministic physics or an adversarial LLM judge." },
              { n: "04", t: "Verify", d: "A verdict report with measured-vs-expected and the source code that produced it." },
            ].map((step) => (
              <li
                key={step.n}
                className="rounded-lg border border-[#E8E5DE] bg-white p-4 shadow-sm"
              >
                <span className="font-mono text-[11px] font-semibold tracking-widest text-[#4A6FA5]">
                  {step.n}
                </span>
                <h3 className="mt-1 font-serif text-[17px] font-bold text-[#1A1A1A]">
                  {step.t}
                </h3>
                <p className="mt-1 text-[13px] leading-snug text-[#6B6B6B]">
                  {step.d}
                </p>
              </li>
            ))}
          </ol>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/upload">
              <button className="inline-flex h-12 items-center gap-2 rounded-md bg-[#4A6FA5] px-7 text-[15px] font-medium text-white shadow-sm transition-all hover:bg-[#3A5A87] active:bg-[#2E4A6F]">
                Upload a paper
              </button>
            </Link>
            <Link href="/papers">
              <button className="inline-flex h-12 items-center gap-2 rounded-md border border-[#D4D0C8] bg-white px-7 text-[15px] font-medium text-[#1A1A1A] shadow-sm transition-all hover:bg-[#F5F3EF] active:bg-[#E8E5DE]">
                Browse {stats.papers} analyzed paper{stats.papers !== 1 ? "s" : ""}
              </button>
            </Link>
          </div>
        </section>

        {/* Live stats */}
        <section>
          <h2 className="mb-4 flex items-center gap-2 text-[20px] font-bold leading-tight tracking-[-0.01em] text-[#1A1A1A]">
            <span className="inline-block h-5 w-1 rounded-full bg-[#4A6FA5]" />
            <span className="font-serif">Live stats</span>
          </h2>

          <div className="grid gap-5 sm:grid-cols-3">
            <Link href="/papers">
              <StatCard label="Papers" value={stats.papers} />
            </Link>
            <StatCard label="Claims Extracted" value={stats.claims} />
            <StatCard label="Simulations" value={stats.simulations} />
          </div>
          {/* Summary line */}
          <p className="mt-3 text-sm text-[#6B6B6B]">
            {stats.papers} paper{stats.papers !== 1 ? "s" : ""} analyzed, {stats.claims.toLocaleString()} claim{stats.claims !== 1 ? "s" : ""} extracted, {stats.simulations.toLocaleString()} simulation{stats.simulations !== 1 ? "s" : ""} completed
          </p>
        </section>

        {/* Donto Knowledge Graph */}
        <div>
          <h2 className="mb-4 flex items-center gap-2 text-[24px] font-bold leading-tight tracking-[-0.01em] text-[#1A1A1A]">
            <span className="inline-block h-6 w-1 rounded-full bg-[#4A6FA5]" />
            <span className="font-serif">Donto Knowledge Graph</span>
            <HelpTip text="Donto is a bitemporal knowledge graph that stores every extracted claim, its evidence chain, arguments, and lifecycle state. It tracks what we know, when we learned it, and how confident we are." />
          </h2>
          <div className="grid gap-5 sm:grid-cols-4">
            <div className={`rounded-lg border p-5 shadow-sm ${healthy ? "border-[#2D6A4F]/30 bg-[#D4EDE1]/30" : "border-[#9B2226]/30 bg-[#F5D5D6]/30"}`}>
              <span className="block text-[11px] font-semibold uppercase tracking-widest text-[#9B9B9B]">Status</span>
              <span className={`mt-2 block font-mono text-3xl font-bold tracking-tight ${healthy ? "text-[#2D6A4F]" : "text-[#9B2226]"}`}>
                {healthy ? "Online" : "Offline"}
              </span>
            </div>
            <div className="relative">
              <StatCard label="Statements" value={totalDontoStatements.toLocaleString()} />
              <div className="absolute top-3 right-3">
                <HelpTip text="Individual facts (triples) stored in the knowledge graph. Each claim generates 7-9 statements covering its text, category, value, evidence, and confidence." />
              </div>
            </div>
            <StatCard label="Subjects" value={dontoSubjects} />
            <div className="relative">
              <StatCard label="Candidate Contexts" value={candidateCtxs.length} />
              <div className="absolute top-3 right-3">
                <HelpTip text="Claims start in candidate contexts — a staging area where they can be promoted to verified status after simulation confirms them." />
              </div>
            </div>
          </div>
        </div>

        {/* Proof Obligations */}
        {totalObligations > 0 && (
          <div>
            <h2 className="mb-4 flex items-center gap-2 text-[24px] font-bold leading-tight tracking-[-0.01em] text-[#1A1A1A]">
              <span className="inline-block h-6 w-1 rounded-full bg-[#B07D2B]" />
              <span className="font-serif">Proof Obligations</span>
              <HelpTip text="Work items flagging claims that need additional verification — either because confidence is low or the claim type requires disambiguation." />
            </h2>
            <div className="grid gap-5 sm:grid-cols-3">
              {obligations.map((o) => (
                <div
                  key={`${o.obligation_type}-${o.status}`}
                  className="rounded-lg border border-[#E8E5DE] bg-white p-5 shadow-sm"
                >
                  <span className="block text-[11px] font-semibold uppercase tracking-widest text-[#9B9B9B]">
                    {o.obligation_type.replace(/-/g, " ")}
                  </span>
                  <div className="mt-2 flex items-baseline gap-3">
                    <span className="font-mono text-3xl font-bold tracking-tight text-[#1A1A1A]">
                      {o.count}
                    </span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${o.status === "open" ? "bg-[#F5ECD4] text-[#B07D2B]" : "bg-[#D4EDE1] text-[#2D6A4F]"}`}>
                      {o.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Debug panels */}
        <DebugPanel label="Stats" data={stats} />
        <DebugPanel label="Donto Contexts" data={ctxData} />
        <DebugPanel label="Obligations" data={oblData} />
      </div>
    </Container>
  );
}
