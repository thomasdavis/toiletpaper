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
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-muted">
          Upload papers, extract claims, simulate physics, verify truth.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Papers" value={stats.papers} href="/papers" />
        <StatCard label="Claims Extracted" value={stats.claims} />
        <StatCard label="Simulations" value={stats.simulations} />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Donto Knowledge Graph</h2>
        <div className="grid gap-4 sm:grid-cols-4">
          <StatCard
            label="Status"
            value={healthy ? "Online" : "Offline"}
            accent={healthy ? "green" : "red"}
          />
          <StatCard label="Statements" value={totalDontoStatements} />
          <StatCard label="Subjects" value={dontoSubjects} />
          <StatCard
            label="Candidate Contexts"
            value={candidateCtxs.length}
          />
        </div>
      </div>

      {totalObligations > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold">Proof Obligations</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {obligations.map((o) => (
              <div
                key={`${o.obligation_type}-${o.status}`}
                className="rounded-lg border border-stone-200 bg-white p-4"
              >
                <p className="text-xs text-muted">{o.obligation_type}</p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-xl font-bold">{o.count}</span>
                  <span
                    className={`text-xs font-medium ${o.status === "open" ? "text-amber-600" : "text-green-600"}`}
                  >
                    {o.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <Link
          href="/upload"
          className="inline-flex h-10 items-center rounded-md bg-blue-700 px-4 text-sm font-medium text-white hover:bg-blue-800"
        >
          Upload a paper
        </Link>
        <Link
          href="/papers"
          className="inline-flex h-10 items-center rounded-md border border-stone-200 px-4 text-sm font-medium hover:bg-stone-50"
        >
          Browse papers
        </Link>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  href,
  accent,
}: {
  label: string;
  value: number | string;
  href?: string;
  accent?: "green" | "red";
}) {
  const accentColor =
    accent === "green"
      ? "text-green-600"
      : accent === "red"
        ? "text-red-600"
        : "";
  const inner = (
    <div className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${accentColor}`}>{value}</p>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}
