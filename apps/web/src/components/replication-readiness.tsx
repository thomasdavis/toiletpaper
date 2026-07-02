import type { ReplicationReadinessSummary } from "@/lib/replication-readiness";

function pct(value: number, total: number) {
  return total <= 0 ? "0%" : `${Math.round((value / total) * 100)}%`;
}

function entries(record: Record<string, number>) {
  return Object.entries(record);
}

function DataPill({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E8E5DE] bg-[#FAFAF8] px-2.5 py-1 text-[11px] text-[#6B6B6B]">
      <span className="font-mono font-semibold text-[#1A1A1A]">{value}</span>
      <span>{label}</span>
    </span>
  );
}

export function ReplicationReadiness({
  summary,
}: {
  summary: ReplicationReadinessSummary;
}) {
  if (summary.total === 0) return null;

  const requirements = entries(summary.requirementCounts);
  const blockers = entries(summary.blockerCounts);
  const artifactKinds = entries(summary.artifactKindCounts);

  return (
    <section className="rounded-lg border border-[#E8E5DE] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9B9B9B]">
            Replication Readiness
          </h4>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[#3D3D3D]">
            {summary.blocked} of {summary.total} units still name missing artifacts,
            prerequisites, or blocked recomputations.
          </p>
        </div>
        <div className="grid min-w-[220px] grid-cols-3 gap-3 text-right">
          <div>
            <div className="font-mono text-xl font-bold text-[#1A1A1A]">
              {pct(summary.blocked, summary.total)}
            </div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-[#9B9B9B]">
              blocked
            </div>
          </div>
          <div>
            <div className="font-mono text-xl font-bold text-[#1A1A1A]">
              {summary.faithfulRecomputeBlocked}
            </div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-[#9B9B9B]">
              recompute
            </div>
          </div>
          <div>
            <div className="font-mono text-xl font-bold text-[#1A1A1A]">
              {summary.staticOnly}
            </div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-[#9B9B9B]">
              static
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9B9B9B]">
            Missing Artifact Kinds
          </div>
          <div className="flex flex-wrap gap-2">
            {artifactKinds.length > 0 ? (
              artifactKinds.map(([label, value]) => (
                <DataPill key={label} label={label} value={value} />
              ))
            ) : (
              <span className="text-sm text-[#9B9B9B]">No artifact kinds recorded.</span>
            )}
          </div>
        </div>

        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9B9B9B]">
            Required For Faithful Recompute
          </div>
          <div className="flex flex-wrap gap-2">
            {requirements.length > 0 ? (
              requirements.map(([label, value]) => (
                <DataPill key={label} label={label} value={value} />
              ))
            ) : (
              <span className="text-sm text-[#9B9B9B]">No recompute prerequisites recorded.</span>
            )}
          </div>
        </div>

        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9B9B9B]">
            Manifest Blockers
          </div>
          <div className="flex flex-wrap gap-2">
            {blockers.length > 0 ? (
              blockers.map(([label, value]) => (
                <DataPill key={label} label={label} value={value} />
              ))
            ) : (
              <span className="text-sm text-[#9B9B9B]">No manifest blockers recorded.</span>
            )}
          </div>
        </div>
      </div>

      {summary.examples.length > 0 && (
        <div className="mt-4 border-t border-[#E8E5DE] pt-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9B9B9B]">
            Example Blocked Units
          </div>
          <div className="space-y-2">
            {summary.examples.slice(0, 3).map((example) => (
              <div key={example.id} className="text-sm leading-6 text-[#3D3D3D]">
                <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#9B9B9B]">
                  {example.verdict}
                </span>{" "}
                {example.claimText && (
                  <span className="font-medium text-[#1A1A1A]">
                    {example.claimText.length > 120
                      ? `${example.claimText.slice(0, 120)}...`
                      : example.claimText}
                  </span>
                )}
                {example.reason && (
                  <span className="text-[#6B6B6B]"> — {example.reason}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
