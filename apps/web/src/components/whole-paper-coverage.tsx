import type { WholePaperCoverageSummary } from "@/lib/whole-paper-coverage";

function pct(value: number, total: number) {
  return total <= 0 ? "0%" : `${Math.round((value / total) * 100)}%`;
}

function entries(record: Record<string, number>, limit = 8) {
  return Object.entries(record).slice(0, limit);
}

function labelize(value: string) {
  return value.replace(/[-_]/g, " ");
}

function CountPill({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E8E5DE] bg-[#FAFAF8] px-2.5 py-1 text-[11px] text-[#6B6B6B]">
      <span className="font-mono font-semibold text-[#1A1A1A]">{value}</span>
      <span>{labelize(label)}</span>
    </span>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="min-w-0 rounded-md border border-[#E8E5DE] bg-[#FAFAF8] px-3 py-2">
      <div className="font-mono text-xl font-bold text-[#1A1A1A]">{value}</div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9B9B9B]">
        {label}
      </div>
      {detail && <div className="mt-1 text-xs text-[#6B6B6B]">{detail}</div>}
    </div>
  );
}

export function WholePaperCoverage({
  summary,
}: {
  summary: WholePaperCoverageSummary;
}) {
  if (summary.replicationUnitCount === 0 && summary.dontoStatementCount === 0) {
    return null;
  }

  const reproduced = summary.verdictCounts.reproduced ?? 0;
  const contradicted = summary.verdictCounts.contradicted ?? 0;
  const fragile = summary.verdictCounts.fragile ?? 0;
  const inconclusive = summary.verdictCounts.inconclusive ?? 0;
  const signalTotal = reproduced + contradicted + fragile + inconclusive;

  return (
    <section className="rounded-lg border border-[#E8E5DE] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9B9B9B]">
            Whole Paper Coverage
          </h4>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[#3D3D3D]">
            {summary.coveredUnitCount} of {summary.replicationUnitCount} replication
            units have current results from the Donto graph worklist.
          </p>
        </div>
        {summary.latestJob && (
          <div className="rounded-md border border-[#E8E5DE] bg-[#FAFAF8] px-3 py-2 text-right">
            <div className="font-mono text-xs text-[#3D3D3D]">
              {summary.latestJob.id.slice(0, 8)}
            </div>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9B9B9B]">
              {summary.latestJob.state}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Donto statements" value={summary.dontoStatementCount} />
        <Metric
          label="Source statements"
          value={summary.sourceStatementCount}
          detail="referenced by units"
        />
        <Metric
          label="Unit coverage"
          value={`${summary.coveragePercent}%`}
          detail={`${summary.coveredUnitCount}/${summary.replicationUnitCount}`}
        />
        <Metric
          label="Insufficient"
          value={summary.blockedOrInsufficientCount}
          detail={`${pct(summary.blockedOrInsufficientCount, summary.currentResultCount)} of results`}
        />
        <Metric label="Missing results" value={summary.missingResultCount} />
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#E8E5DE]">
        <div
          className="h-full rounded-full bg-[#2D6A4F]"
          style={{ width: `${Math.max(0, Math.min(summary.coveragePercent, 100))}%` }}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9B9B9B]">
            Unit Types
          </div>
          <div className="flex flex-wrap gap-2">
            {entries(summary.unitTypeCounts).map(([label, value]) => (
              <CountPill key={label} label={label} value={value} />
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9B9B9B]">
            Verdicts
          </div>
          <div className="flex flex-wrap gap-2">
            {signalTotal > 0 ? (
              entries(summary.verdictCounts).map(([label, value]) => (
                <CountPill key={label} label={label} value={value} />
              ))
            ) : (
              <span className="text-sm text-[#9B9B9B]">No current results.</span>
            )}
          </div>
        </div>

        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9B9B9B]">
            Evidence Modes
          </div>
          <div className="flex flex-wrap gap-2">
            {entries(summary.evidenceModeCounts).map(([label, value]) => (
              <CountPill key={label} label={label} value={value} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
