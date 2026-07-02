import type { CodexReplicationDossier } from "@/lib/codex-replication-dossier";
import { formatUtcDateTime } from "@/lib/datetime";

function formatBytes(bytes: number | null) {
  if (bytes == null) return "-";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

function statusTone(status: CodexReplicationDossier["status"]) {
  switch (status) {
    case "auditable":
      return "border-[#2D6A4F]/30 bg-[#2D6A4F]/5 text-[#2D6A4F]";
    case "running":
      return "border-[#B07D2B]/40 bg-[#B07D2B]/10 text-[#6F4E13]";
    case "missing_workdir":
      return "border-[#9B2226]/30 bg-[#9B2226]/5 text-[#9B2226]";
    default:
      return "border-[#9B2226]/20 bg-[#9B2226]/5 text-[#9B2226]";
  }
}

function statusLabel(status: CodexReplicationDossier["status"]) {
  switch (status) {
    case "auditable":
      return "Auditable";
    case "running":
      return "Running";
    case "missing_workdir":
      return "Missing workdir";
    default:
      return "Incomplete";
  }
}

function countEntries(counts: Record<string, number>) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
}

function shortHash(hash: string | null, status: string) {
  if (hash) return `sha256:${hash.slice(0, 12)}...${hash.slice(-4)}`;
  if (status === "too_large") return "sha256:too large";
  return "sha256:-";
}

function dossierFileHref(apiHref: string, relativePath: string) {
  return `${apiHref}/files/${relativePath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`;
}

function CheckPill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className={`rounded-md border px-2 py-1 text-[11px] font-medium ${
        ok
          ? "border-[#2D6A4F]/30 bg-[#2D6A4F]/5 text-[#2D6A4F]"
          : "border-[#9B2226]/20 bg-[#9B2226]/5 text-[#9B2226]"
      }`}
    >
      {label}: {ok ? "yes" : "no"}
    </span>
  );
}

export function CodexReplicationDossierPanel({
  dossier,
  apiHref,
}: {
  dossier: CodexReplicationDossier | null;
  apiHref: string;
}) {
  if (!dossier) {
    return (
      <section className="rounded-lg border border-[#E8E5DE] bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9B9B9B]">
              Full Paper Replication Dossier
            </h4>
            <p className="mt-1 text-sm leading-6 text-[#6B6B6B]">
              No Codex full-paper job has been created for this paper yet.
            </p>
          </div>
          <a
            href={apiHref}
            className="rounded-md border border-[#D4D0C8] bg-[#FAFAF8] px-3 py-1.5 text-xs font-medium text-[#3D3D3D] hover:bg-[#F5F3EF]"
          >
            JSON
          </a>
        </div>
      </section>
    );
  }

  const requiredMissing = dossier.files.filter(
    (file) => file.required && !file.exists,
  );
  const filesByPhase = ["input", "runtime", "output"].map((phase) => ({
    phase,
    files: dossier.files.filter((file) => file.phase === phase),
  }));

  return (
    <section className="rounded-lg border border-[#E8E5DE] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9B9B9B]">
            Full Paper Replication Dossier
          </h4>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[#3D3D3D]">
            Latest Codex job workdir audit: input graph, staged paper, prompt,
            runtime logs, full results, generated source, experiments, and
            coverage report.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold ${statusTone(
              dossier.status,
            )}`}
          >
            {statusLabel(dossier.status)}
          </span>
          <a
            href={apiHref}
            className="rounded-md border border-[#D4D0C8] bg-[#FAFAF8] px-3 py-1.5 text-xs font-medium text-[#3D3D3D] hover:bg-[#F5F3EF]"
          >
            JSON
          </a>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <div className="rounded-md border border-[#E8E5DE] bg-[#FAFAF8] px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9B9B9B]">
            Job
          </div>
          <div className="mt-1 font-mono text-xs text-[#1A1A1A]">
            {dossier.job.id.slice(0, 8)} / {dossier.job.state}
          </div>
        </div>
        <div className="rounded-md border border-[#E8E5DE] bg-[#FAFAF8] px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9B9B9B]">
            Core files
          </div>
          <div className="mt-1 font-mono text-xs text-[#1A1A1A]">
            {dossier.coreFilesPresent}/{dossier.coreFilesRequired}
          </div>
        </div>
        <div className="rounded-md border border-[#E8E5DE] bg-[#FAFAF8] px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9B9B9B]">
            Result units
          </div>
          <div className="mt-1 font-mono text-xs text-[#1A1A1A]">
            {dossier.results.uniqueUnitCount}/{dossier.results.expectedUnits || "?"}
          </div>
        </div>
        <div className="rounded-md border border-[#E8E5DE] bg-[#FAFAF8] px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9B9B9B]">
            Missing units
          </div>
          <div className="mt-1 font-mono text-xs text-[#1A1A1A]">
            {dossier.results.missingUnitCount}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <CheckPill label="workdir" ok={dossier.checks.workdirExists} />
        <CheckPill label="inputs" ok={dossier.checks.inputsPresent} />
        <CheckPill label="runtime trace" ok={dossier.checks.runtimeTracePresent} />
        <CheckPill label="outputs" ok={dossier.checks.outputsPresent} />
        <CheckPill label="all units" ok={dossier.checks.resultsCoverAllUnits} />
        <CheckPill
          label="coverage match"
          ok={dossier.checks.coverageReportMatchesResults}
        />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-md border border-[#E8E5DE] bg-[#FAFAF8] p-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9B9B9B]">
            Verdict distribution
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {countEntries(dossier.results.verdictCounts).map(([label, count]) => (
              <span key={label} className="font-mono text-[#3D3D3D]">
                {label}:{count}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-md border border-[#E8E5DE] bg-[#FAFAF8] p-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9B9B9B]">
            Evidence modes
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {countEntries(dossier.results.evidenceModeCounts).map(([label, count]) => (
              <span key={label} className="font-mono text-[#3D3D3D]">
                {label}:{count}
              </span>
            ))}
          </div>
        </div>
      </div>

      {requiredMissing.length > 0 && (
        <div className="mt-4 rounded-md border border-[#9B2226]/20 bg-[#9B2226]/5 p-3 text-xs text-[#9B2226]">
          Missing required dossier files:{" "}
          {requiredMissing.map((file) => file.relativePath).join(", ")}
        </div>
      )}

      <div className="mt-4 space-y-3">
        {filesByPhase.map(({ phase, files }) => (
          <div key={phase} className="rounded-md border border-[#E8E5DE]">
            <div className="border-b border-[#E8E5DE] bg-[#FAFAF8] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9B9B9B]">
              {phase}
            </div>
            <div className="divide-y divide-[#E8E5DE]">
              {files.map((file) => (
                <div
                  key={file.key}
                  className="grid gap-2 px-3 py-2 text-xs text-[#3D3D3D] md:grid-cols-[1fr_auto_auto_auto]"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-[#1A1A1A]">{file.label}</div>
                    {file.exists ? (
                      <a
                        href={dossierFileHref(apiHref, file.relativePath)}
                        target="_blank"
                        rel="noreferrer"
                        className="break-all font-mono text-[10px] text-[#4A5F8A] underline decoration-[#C8D2E8] underline-offset-2 hover:text-[#1A1A1A]"
                      >
                        {file.relativePath}
                      </a>
                    ) : (
                      <div className="break-all font-mono text-[10px] text-[#9B9B9B]">
                        {file.relativePath}
                      </div>
                    )}
                  </div>
                  <div className="font-mono text-[#6B6B6B]">
                    {file.exists ? formatBytes(file.byteLength) : "missing"}
                  </div>
                  <div
                    className="font-mono text-[#9B9B9B]"
                    title={file.sha256 ?? file.hashStatus}
                  >
                    {file.exists ? shortHash(file.sha256, file.hashStatus) : "-"}
                  </div>
                  <div className="font-mono text-[#9B9B9B]">
                    {file.updatedAt ? formatUtcDateTime(file.updatedAt) : "-"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {dossier.generatedArtifacts.length > 0 && (
        <div className="mt-4 rounded-md border border-[#E8E5DE]">
          <div className="border-b border-[#E8E5DE] bg-[#FAFAF8] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9B9B9B]">
            Generated source and experiment artifacts
          </div>
          <div className="divide-y divide-[#E8E5DE]">
            {dossier.generatedArtifacts.slice(0, 12).map((file) => (
              <div
                key={file.key}
                className="grid gap-2 px-3 py-2 text-xs md:grid-cols-[1fr_auto_auto]"
              >
                <a
                  href={dossierFileHref(apiHref, file.relativePath)}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all font-mono text-[#4A5F8A] underline decoration-[#C8D2E8] underline-offset-2 hover:text-[#1A1A1A]"
                >
                  {file.relativePath}
                </a>
                <div className="font-mono text-[#6B6B6B]">
                  {formatBytes(file.byteLength)}
                </div>
                <div
                  className="font-mono text-[#9B9B9B]"
                  title={file.sha256 ?? file.hashStatus}
                >
                  {shortHash(file.sha256, file.hashStatus)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
