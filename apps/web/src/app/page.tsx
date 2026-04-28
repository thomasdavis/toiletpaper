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

        {/* How toiletpaper uses Donto for scientific reproducibility */}
        <section className="rounded-xl border border-[#E8E5DE] bg-white p-6 shadow-sm sm:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#4A6FA5]">
            Why toiletpaper is built on a knowledge graph
          </p>
          <h2 className="mt-2 font-serif text-[32px] font-bold leading-tight tracking-[-0.01em] text-[#1A1A1A]">
            A paper isn&rsquo;t a row. It&rsquo;s an evidentiary world.
          </h2>
          <p className="mt-3 max-w-3xl text-[15px] leading-[1.65] text-[#3D3D3D]">
            Scientific reproducibility lives or dies by traceability: which
            paragraph produced which claim, which simulation challenged it, what
            we believed yesterday vs. today, and why. A flat database flattens
            all of that. toiletpaper builds the analysis as a graph in{" "}
            <a
              href="https://github.com/thomasdavis/donto"
              className="font-semibold text-[#4A6FA5] underline decoration-[#4A6FA5]/30 underline-offset-2 hover:decoration-[#4A6FA5]"
            >
              Donto
            </a>{" "}
            so every claim, span, verdict, and obligation is a typed,
            time-versioned, source-traceable fact &mdash; and the act of
            updating an opinion preserves the old one instead of overwriting it.
          </p>

          {/* Wire format sample */}
          <div className="mt-6 overflow-x-auto rounded-lg border border-[#E8E5DE] bg-[#FAFAF8] p-4 font-mono text-[12px] leading-[1.6] text-[#3D3D3D]">
            <div><span className="text-[#9B9B9B]">// one quad written when a claim is extracted</span></div>
            <div>
              <span className="text-[#4A6FA5]">subject</span>:{" "}
              <span className="text-[#9B2226]">tp:claim:7c2…</span>
            </div>
            <div>
              <span className="text-[#4A6FA5]">predicate</span>:{" "}
              <span className="text-[#2D6A4F]">tp:simulationVerdict</span>
            </div>
            <div>
              <span className="text-[#4A6FA5]">object</span>:{" "}
              <span className="text-[#B07D2B]">&quot;reproduced&quot;</span>
            </div>
            <div>
              <span className="text-[#4A6FA5]">context</span>:{" "}
              <span className="text-[#9B9B9B]">tp:paper:&lt;id&gt;:claims</span>{" "}
              <span className="text-[#9B9B9B]">// candidate, can be promoted</span>
            </div>
            <div>
              <span className="text-[#4A6FA5]">tx_lo</span>:{" "}
              <span className="text-[#3D3D3D]">2026-04-28T12:34Z</span>{" "}
              <span className="text-[#9B9B9B]">// when we recorded it</span>
            </div>
            <div>
              <span className="text-[#4A6FA5]">valid_lo</span>:{" "}
              <span className="text-[#3D3D3D]">null</span>{" "}
              <span className="text-[#9B9B9B]">// always-true unless retracted</span>
            </div>
            <div>
              <span className="text-[#4A6FA5]">lineage</span>:{" "}
              <span className="text-[#3D3D3D]">[stmt:abc, stmt:def]</span>{" "}
              <span className="text-[#9B9B9B]">// statements this was derived from</span>
            </div>
          </div>

          {/* What it lets toiletpaper do */}
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                title: "Replay our verdict at any point in time",
                body:
                  "Papers get retracted. Methodologies get refined. Models get replaced. Because every fact carries a transaction time, you can ask toiletpaper what it believed about a paper on the day it was published — not just today — and see exactly which re-extraction or new simulation flipped a verdict.",
              },
              {
                title: "Each paper is its own evidentiary world",
                body:
                  "Two papers can make contradictory claims about the same constant and never collide. Every paper gets its own quad context, so the verdict on Paper A’s neutrino mass never silently rewrites Paper B’s. Cross-paper analysis is intentional, not accidental.",
              },
              {
                title: "Candidate vs. vouched-for, by transaction",
                body:
                  "Freshly extracted claims land in a candidate context — not yet vouched for. Promotion to verified is a recorded transaction with a timestamp and an actor, so you can always answer “when did toiletpaper start believing this?” and “what evidence pushed it across the line?”",
              },
              {
                title: "A claim is structured data, not a sentence",
                body:
                  "“The muon g-2 anomaly is 4.2σ” is decomposed into predicate, value, unit, category, source-evidence, and confidence. That structure is what lets a deterministic simulator pick the claim up and actually run it. A pile of quoted sentences couldn’t be tested.",
              },
              {
                title: "Reproducibility includes how we read the paper",
                body:
                  "Every extraction stores the model, model-version, parser-version, byte-count, agent, and run. If GPT-4 said the half-life was 12.4 ± 0.3 yr and a re-extraction with a better model says 12.6 ± 0.1 yr, both readings sit side-by-side in the graph and the verdict shift is explainable, not magic.",
              },
              {
                title: "Verdicts are evidence, not labels",
                body:
                  "A “reproduced” verdict is wired as a supports edge from the simulation’s verdict statement to the claim’s text statement, with strength = simulation confidence. “Contradicted” wires a rebuts edge. Ask the graph “what supports this claim?” and you get a chain — paragraph → claim → simulation → verdict — not a boolean.",
              },
              {
                title: "Loose ends don’t get forgotten",
                body:
                  "When a simulation comes back fragile or low-confidence, toiletpaper opens a needs-replication obligation against the claim. The paper isn’t done until those obligations clear — it’s the audit checklist a careful reviewer would build by hand, kept by the system instead.",
              },
              {
                title: "An analysis with a known shape",
                body:
                  "Every paper marches through Asserted → Evidence-linked → Argued → Certified → Obligations-clear. The lifecycle is read out of the graph, not stored in a brittle status column, so it can never drift from what’s actually true about the paper.",
              },
              {
                title: "Every conclusion traces back to a quote",
                body:
                  "Derived statements list the source statement_ids they came from, so the verdict on a claim traces all the way back to the paragraph in the PDF that introduced it. Shape reports validate at ingest time that no required structure dropped on the way in.",
              },
              {
                title: "Time-travel queries on demand",
                body:
                  "A single GET /history call returns the full quad-by-quad audit log for any paper or claim: every assertion, retraction, actor, and timestamp. When a journal updates a paper or a result is challenged, you replay the history instead of guessing.",
              },
              {
                title: "Verdicts live in the graph, not next to it",
                body:
                  "tp:simulationVerdict, tp:verdictReason, tp:measuredValue, and tp:expectedValue are first-class facts asserted onto the claim. So “every claim where simulation came within 5% of the paper’s expected value” is one query away — across every paper toiletpaper has ever analyzed.",
              },
              {
                title: "Externally auditable conclusions",
                body:
                  "Donto attaches certificates with rule_iri, inputs, body, signature, and verifier. A journal, a reviewer, or a downstream agent can verify a toiletpaper verdict cryptographically without having to trust our infrastructure or even our codebase.",
              },
            ].map((c) => (
              <div
                key={c.title}
                className="rounded-lg border border-[#E8E5DE] bg-[#FAFAF8] p-4"
              >
                <h3 className="font-serif text-[16px] font-bold tracking-tight text-[#1A1A1A]">
                  {c.title}
                </h3>
                <p className="mt-1.5 text-[13px] leading-[1.55] text-[#3D3D3D]">
                  {c.body}
                </p>
              </div>
            ))}
          </div>

          <p className="mt-6 max-w-3xl text-[14px] leading-[1.6] text-[#6B6B6B]">
            Net effect: when a paper is updated, a model is replaced, or a
            verdict is challenged, toiletpaper has the data structures to show
            &mdash; quad by quad, with timestamps and signatures &mdash; what
            changed and why. That&rsquo;s what scientific review needs and
            what a verdict-as-JSON-blob can&rsquo;t give you.
          </p>
        </section>

        {/* Donto Knowledge Graph live stats */}
        <div>
          <h2 className="mb-4 flex items-center gap-2 text-[24px] font-bold leading-tight tracking-[-0.01em] text-[#1A1A1A]">
            <span className="inline-block h-6 w-1 rounded-full bg-[#4A6FA5]" />
            <span className="font-serif">Donto, live</span>
            <HelpTip text="Real-time counts pulled from the Donto sidecar — statements, subjects, candidate contexts, and current obligations." />
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
