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
import { Container } from "@toiletpaper/ui";
import {
  Perforation,
  SectionHeader,
  Sheet,
  StatTile,
  CodeQuad,
  Eyebrow,
  Pill,
} from "@/components/brand";
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
      <div className="py-4">
        {/* Hero */}
        <section>
          <Eyebrow>Reproducibility engine for research papers</Eyebrow>
          <h1 className="mt-3 font-serif text-[44px] font-bold leading-[1.05] tracking-[-0.02em] text-[#1A1A1A] sm:text-[64px]">
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

          {/* How it works — each step rendered as a Sheet */}
          <ol className="mt-8 grid gap-4 sm:grid-cols-4">
            {[
              { n: "01", t: "Upload", d: "Drop a PDF or markdown file." },
              { n: "02", t: "Extract", d: "Claims, predicates, units, and confidence parsed from the text." },
              { n: "03", t: "Simulate", d: "Each claim runs through deterministic physics or an adversarial LLM judge." },
              { n: "04", t: "Verify", d: "A verdict report with measured-vs-expected and the source code that produced it." },
            ].map((step) => (
              <li key={step.n} className="contents">
                <Sheet index={step.n} title={step.t} description={step.d} />
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

        <Perforation />

        {/* Live stats */}
        <section>
          <SectionHeader
            eyebrow="Live counters"
            title="What&rsquo;s in the system right now"
            description="Numbers ticking from the production database — every upload, extraction, and simulation lands here in real time."
            size="sm"
          />
          <div className="mt-5 grid gap-5 sm:grid-cols-3">
            <Link href="/papers" className="block">
              <StatTile
                label="Papers"
                value={stats.papers}
                caption="all-time analyzed"
                interactive
              />
            </Link>
            <StatTile
              label="Claims Extracted"
              value={stats.claims.toLocaleString()}
              caption="quantitative facts pulled from text"
            />
            <StatTile
              label="Simulations"
              value={stats.simulations.toLocaleString()}
              caption="verdicts produced by the engine"
              tone="blue"
            />
          </div>
        </section>

        <Perforation />

        {/* How toiletpaper uses Donto for scientific reproducibility */}
        <section className="rounded-xl border border-[#E8E5DE] bg-white p-6 shadow-sm sm:p-8">
          <SectionHeader
            eyebrow="Why toiletpaper is built on a knowledge graph"
            title={
              <>
                A paper isn&rsquo;t a row. <br className="hidden sm:block" />
                It&rsquo;s an evidentiary world.
              </>
            }
            description={
              <>
                Scientific reproducibility lives or dies by traceability: which
                paragraph produced which claim, which simulation challenged it,
                what we believed yesterday vs.&nbsp;today, and why. A flat
                database flattens all of that. toiletpaper builds the analysis
                as a graph in{" "}
                <a
                  href="https://github.com/thomasdavis/donto"
                  className="font-semibold text-[#4A6FA5] underline decoration-[#4A6FA5]/30 underline-offset-2 hover:decoration-[#4A6FA5]"
                >
                  Donto
                </a>{" "}
                so every claim, span, verdict, and obligation is a typed,
                time-versioned, source-traceable fact — and the act of updating
                an opinion preserves the old one instead of overwriting it.
              </>
            }
          />

          <div className="mt-3 flex flex-wrap gap-2">
            <Pill tone="blue" dot>Bitemporal quads</Pill>
            <Pill tone="green" dot>Lineage-tracked</Pill>
            <Pill tone="amber" dot>Auditable</Pill>
            <Pill tone="muted" dot>SHACL-shaped</Pill>
          </div>

          <CodeQuad
            className="mt-6"
            caption="one quad written when a simulation lands a verdict"
            rows={[
              { key: "subject", value: "tp:claim:7c2…", tone: "red" },
              { key: "predicate", value: "tp:simulationVerdict", tone: "green" },
              { key: "object", value: "\"reproduced\"", tone: "amber" },
              {
                key: "context",
                value: "tp:paper:<id>:claims",
                hint: "candidate, can be promoted",
              },
              {
                key: "tx_lo",
                value: "2026-04-28T12:34Z",
                hint: "when we recorded it",
              },
              {
                key: "valid_lo",
                value: "null",
                hint: "always-true unless retracted",
              },
              {
                key: "lineage",
                value: "[stmt:abc, stmt:def]",
                hint: "statements this was derived from",
              },
            ]}
          />

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

        <Perforation />

        {/* Donto Knowledge Graph live stats */}
        <section>
          <SectionHeader
            eyebrow="Donto, live"
            title="What&rsquo;s in the graph right now"
            description="Real-time counts pulled from the Donto sidecar — statements, subjects, candidate contexts, and proof-obligation queue."
            size="sm"
          />
          <div className="mt-5 grid gap-5 sm:grid-cols-4">
            <StatTile
              label="Status"
              value={healthy ? "Online" : "Offline"}
              caption={healthy ? "/healthz returning 200" : "sidecar unreachable"}
              tone={healthy ? "green" : "red"}
            />
            <StatTile
              label="Statements"
              value={totalDontoStatements.toLocaleString()}
              caption={`across ${tpContexts.length} paper context${tpContexts.length === 1 ? "" : "s"}`}
            />
            <StatTile
              label="Subjects"
              value={dontoSubjects}
              caption="papers, claims, agents, runs"
            />
            <StatTile
              label="Candidate contexts"
              value={candidateCtxs.length}
              caption="staging area before promotion"
              tone="blue"
            />
          </div>
        </section>

        {/* Proof Obligations */}
        {totalObligations > 0 && (
          <>
            <Perforation />
            <section>
              <SectionHeader
                eyebrow="Proof obligations"
                eyebrowTone="amber"
                title="Loose ends still on the queue"
                description="Claims flagged by the simulation engine as fragile or low-confidence. Each one stays open until cleared by replication or new evidence."
                size="sm"
              />
              <div className="mt-5 grid gap-5 sm:grid-cols-3">
                {obligations.map((o) => (
                  <StatTile
                    key={`${o.obligation_type}-${o.status}`}
                    label={o.obligation_type.replace(/-/g, " ")}
                    value={o.count}
                    caption={o.status === "open" ? "open · awaiting evidence" : "closed"}
                    tone={o.status === "open" ? "amber" : "green"}
                  />
                ))}
              </div>
            </section>
          </>
        )}
        {/* Debug panels */}
        <DebugPanel label="Stats" data={stats} />
        <DebugPanel label="Donto Contexts" data={ctxData} />
        <DebugPanel label="Obligations" data={oblData} />
      </div>
    </Container>
  );
}
