import type { ReplicationGapManifest } from "@/lib/replication-gap-manifest";
import type { ArtifactGapCoverage } from "@/lib/artifact-gap-coverage";

function priorityTone(priority: string) {
  if (priority === "critical") return "border-[#9B2226]/25 bg-[#9B2226]/5 text-[#9B2226]";
  if (priority === "high") return "border-[#B07D2B]/30 bg-[#B07D2B]/10 text-[#6F4E13]";
  return "border-[#E8E5DE] bg-[#FAFAF8] text-[#6B6B6B]";
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-md border border-[#E8E5DE] bg-[#FAFAF8] px-3 py-2">
      <div className="font-mono text-xl font-bold text-[#1A1A1A]">{value}</div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9B9B9B]">
        {label}
      </div>
    </div>
  );
}

function CountPill({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E8E5DE] bg-white px-2.5 py-1 text-[11px] text-[#6B6B6B]">
      <span className="font-mono font-semibold text-[#1A1A1A]">{value}</span>
      <span>{label.replace(/[-_]/g, " ")}</span>
    </span>
  );
}

export function ReplicationGapManifestPanel({
  manifest,
  apiHref,
  artifactCoverage,
}: {
  manifest: ReplicationGapManifest;
  apiHref?: string;
  artifactCoverage?: ArtifactGapCoverage | null;
}) {
  if (manifest.blockedResults === 0) return null;
  const coverageByKind = new Map(
    artifactCoverage?.requestCoverage.map((coverage) => [
      coverage.requestKind,
      coverage,
    ]) ?? [],
  );

  return (
    <section className="rounded-lg border border-[#E8E5DE] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9B9B9B]">
            Missing Artifact Manifest
          </h4>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[#3D3D3D]">
            These are the concrete inputs needed to move blocked units from
            source-grounded checks into faithful recomputation.
          </p>
        </div>
        {apiHref && (
          <a
            href={apiHref}
            className="rounded-md border border-[#D4D0C8] bg-[#FAFAF8] px-3 py-1.5 text-xs font-medium text-[#3D3D3D] hover:bg-[#F5F3EF]"
          >
            JSON
          </a>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Blocked results" value={manifest.blockedResults} />
        <Metric label="Blocked units" value={manifest.blockedUnits} />
        <Metric label="Requests" value={manifest.requestCount} />
        <Metric label="Critical" value={manifest.criticalRequestCount} />
        <Metric label="High" value={manifest.highRequestCount} />
      </div>

      {artifactCoverage && artifactCoverage.artifactFileCount > 0 && (
        <div className="mt-4 rounded-md border border-[#E8E5DE] bg-[#FAFAF8] px-3 py-3">
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-[#3D3D3D]">
            <span>
              <span className="font-mono font-semibold text-[#1A1A1A]">
                {artifactCoverage.candidateRequestCount}
              </span>{" "}
              request kind{artifactCoverage.candidateRequestCount === 1 ? "" : "s"} with
              candidate artifacts
            </span>
            <span>
              <span className="font-mono font-semibold text-[#1A1A1A]">
                {artifactCoverage.matchedFileCount}
              </span>{" "}
              matched file{artifactCoverage.matchedFileCount === 1 ? "" : "s"}
            </span>
            <span>
              <span className="font-mono font-semibold text-[#1A1A1A]">
                {artifactCoverage.unmatchedRequestCount}
              </span>{" "}
              request kind{artifactCoverage.unmatchedRequestCount === 1 ? "" : "s"} still
              without candidates
            </span>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {manifest.requests.slice(0, 8).map((request) => {
          const coverage = coverageByKind.get(request.kind);
          return (
            <div
              key={request.kind}
              className={`rounded-md border px-3 py-3 ${priorityTone(request.priority)}`}
            >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[#1A1A1A]">
                  {request.label}
                </div>
                <div className="mt-1 text-xs text-[#6B6B6B]">
                  {request.unitCount} unit{request.unitCount === 1 ? "" : "s"} /{" "}
                  {request.simulationCount} result{request.simulationCount === 1 ? "" : "s"} /{" "}
                  {request.sourceStatementIds.length} source statement
                  {request.sourceStatementIds.length === 1 ? "" : "s"}
                </div>
              </div>
              <span className="rounded-full border border-current/20 bg-white/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]">
                {request.priority}
              </span>
            </div>

            {coverage && coverage.matches.length > 0 && (
              <div className="mt-3 rounded border border-[#2D6A4F]/20 bg-[#2D6A4F]/5 px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#2D6A4F]">
                  Candidate artifacts
                </div>
                <div className="mt-2 space-y-1">
                  {coverage.matches.slice(0, 3).map((match) => (
                    <div
                      key={`${request.kind}:${match.fileId}`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#3D3D3D]"
                    >
                      <span className="font-medium text-[#1A1A1A]">
                        {match.originalName}
                      </span>
                      <span className="font-mono text-[#6B6B6B]">
                        {match.sourceKind}
                      </span>
                      <span className="font-mono text-[#9B9B9B]">
                        sha256:{match.sha256.slice(0, 12)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(request.unitTypes).slice(0, 5).map(([label, value]) => (
                <CountPill key={label} label={label} value={value} />
              ))}
            </div>

            {request.examples.length > 0 && (
              <div className="mt-3 space-y-2 border-t border-current/10 pt-3">
                {request.examples.slice(0, 2).map((example) => (
                  <div
                    key={`${request.kind}:${example.simulationId}`}
                    className="text-sm leading-6 text-[#3D3D3D]"
                  >
                    <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#9B9B9B]">
                      {example.unitType ?? "unit"}
                    </span>{" "}
                    {example.claimText && (
                      <span className="font-medium text-[#1A1A1A]">
                        {example.claimText.length > 120
                          ? `${example.claimText.slice(0, 120)}...`
                          : example.claimText}
                      </span>
                    )}
                    {example.reason && (
                      <span className="text-[#6B6B6B]"> - {example.reason}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
