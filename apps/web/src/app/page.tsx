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
  Text,
  StatCard,
  Button,
} from "@toiletpaper/ui";

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
        <div>
          <Heading level={1}>Dashboard</Heading>
          <Text color="muted" className="mt-2">
            Upload papers, extract claims, simulate physics, verify truth.
          </Text>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <Link href="/papers">
            <StatCard label="Papers" value={stats.papers} />
          </Link>
          <StatCard label="Claims Extracted" value={stats.claims} />
          <StatCard label="Simulations" value={stats.simulations} />
        </div>

        <div>
          <Heading level={4} className="mb-4">Donto Knowledge Graph</Heading>
          <div className="grid gap-5 sm:grid-cols-4">
            <div className={`rounded-lg border p-5 shadow-sm ${healthy ? "border-[#2D6A4F]/30 bg-[#D4EDE1]/30" : "border-[#9B2226]/30 bg-[#F5D5D6]/30"}`}>
              <span className="block text-[11px] font-semibold uppercase tracking-widest text-[#9B9B9B]">Status</span>
              <span className={`mt-2 block font-mono text-3xl font-bold tracking-tight ${healthy ? "text-[#2D6A4F]" : "text-[#9B2226]"}`}>
                {healthy ? "Online" : "Offline"}
              </span>
            </div>
            <StatCard label="Statements" value={totalDontoStatements.toLocaleString()} />
            <StatCard label="Subjects" value={dontoSubjects} />
            <StatCard label="Candidate Contexts" value={candidateCtxs.length} />
          </div>
        </div>

        {totalObligations > 0 && (
          <div>
            <Heading level={4} className="mb-4">Proof Obligations</Heading>
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

        <div className="flex gap-4 pt-2">
          <Link href="/upload">
            <Button size="lg">Upload a paper</Button>
          </Link>
          <Link href="/papers">
            <Button variant="secondary" size="lg">Browse papers</Button>
          </Link>
        </div>
      </div>
    </Container>
  );
}
