"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface ArtifactFile {
  id: string;
  originalName: string;
  storedName: string;
  relativePath: string;
  contentType: string;
  byteLength: number;
  sha256: string;
  source?: {
    kind: "upload" | "url";
    url?: string;
    finalUrl?: string;
    fetchedAt?: string;
    status?: number;
  };
}

interface ArtifactBundle {
  id: string;
  note: string | null;
  createdAt: string;
  fileCount: number;
  totalBytes: number;
  files: ArtifactFile[];
}

interface ArtifactManifest {
  updatedAt: string;
  bundleCount: number;
  totalBytes: number;
  bundles: ArtifactBundle[];
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

function shortHash(hash: string) {
  return hash.length > 16 ? `${hash.slice(0, 12)}...${hash.slice(-4)}` : hash;
}

function artifactFileHref(endpoint: string, bundle: ArtifactBundle, file: ArtifactFile) {
  return `${endpoint}/${encodeURIComponent(bundle.id)}/files/${encodeURIComponent(file.id)}`;
}

export function ArtifactBundlePanel({ paperId }: { paperId: string }) {
  const [manifest, setManifest] = useState<ArtifactManifest | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [urlText, setUrlText] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const mounted = useRef(true);

  const endpoint = `/api/papers/${paperId}/artifact-bundles`;
  const selectedBytes = useMemo(
    () => files.reduce((sum, file) => sum + file.size, 0),
    [files],
  );
  const urls = useMemo(
    () =>
      urlText
        .split(/\r?\n|,/g)
        .map((value) => value.trim())
        .filter(Boolean),
    [urlText],
  );

  useEffect(() => {
    mounted.current = true;
    fetch(endpoint)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Artifact list failed with ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (mounted.current) setManifest(data.manifest);
      })
      .catch((e) => {
        if (mounted.current) {
          setError(e instanceof Error ? e.message : String(e));
        }
      });
    return () => {
      mounted.current = false;
    };
  }, [endpoint]);

  async function upload() {
    if (files.length === 0 && urls.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      for (const file of files) form.append("files", file);
      for (const url of urls) form.append("url", url);
      if (note.trim()) form.append("note", note.trim());
      const res = await fetch(endpoint, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Upload failed with ${res.status}`);
      setManifest(data.manifest);
      setFiles([]);
      setUrlText("");
      setNote("");
      setInputKey((value) => value + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-[#E8E5DE] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9B9B9B]">
            Supplemental Artifacts
          </h4>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[#3D3D3D]">
            Upload or import source datasets, scripts, input decks, raw
            measurements, trajectories, images, and configuration files for the
            next full-paper replication run.
          </p>
        </div>
        <a
          href={endpoint}
          className="rounded-md border border-[#D4D0C8] bg-[#FAFAF8] px-3 py-1.5 text-xs font-medium text-[#3D3D3D] hover:bg-[#F5F3EF]"
        >
          JSON
        </a>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="block rounded-md border border-[#E8E5DE] bg-[#FAFAF8] px-3 py-2">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9B9B9B]">
            Files
          </span>
          <input
            key={inputKey}
            type="file"
            multiple
            className="mt-2 block w-full text-xs text-[#3D3D3D] file:mr-3 file:rounded-md file:border file:border-[#D4D0C8] file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-[#3D3D3D]"
            onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
          />
        </label>

        <label className="block rounded-md border border-[#E8E5DE] bg-[#FAFAF8] px-3 py-2 sm:col-span-2">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9B9B9B]">
            Bundle note
          </span>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. LAMMPS decks and raw thermal conductivity tables"
            className="mt-2 w-full rounded-md border border-[#D4D0C8] bg-white px-3 py-2 text-sm text-[#1A1A1A] outline-none focus:border-[#6B6B6B]"
          />
        </label>

        <label className="block rounded-md border border-[#E8E5DE] bg-[#FAFAF8] px-3 py-2 sm:col-span-3">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9B9B9B]">
            Artifact URLs
          </span>
          <textarea
            value={urlText}
            onChange={(event) => setUrlText(event.target.value)}
            placeholder="https://example.org/data/archive.zip"
            rows={3}
            className="mt-2 w-full resize-y rounded-md border border-[#D4D0C8] bg-white px-3 py-2 font-mono text-xs text-[#1A1A1A] outline-none focus:border-[#6B6B6B]"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={upload}
          disabled={busy || (files.length === 0 && urls.length === 0)}
          className="rounded-md border border-[#1A1A1A] bg-[#1A1A1A] px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:border-[#D4D0C8] disabled:bg-[#E8E5DE] disabled:text-[#9B9B9B]"
        >
          {busy ? "Uploading..." : "Upload bundle"}
        </button>
        <span className="text-xs text-[#6B6B6B]">
          {files.length} selected / {urls.length} URL{urls.length === 1 ? "" : "s"} / {formatBytes(selectedBytes)}
        </span>
        {error && <span className="text-xs font-medium text-[#9B2226]">{error}</span>}
      </div>

      <div className="mt-5 border-t border-[#E8E5DE] pt-4">
        <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-[#6B6B6B]">
          <span>
            <span className="font-mono font-semibold text-[#1A1A1A]">
              {manifest?.bundleCount ?? 0}
            </span>{" "}
            bundle{manifest?.bundleCount === 1 ? "" : "s"}
          </span>
          <span>
            <span className="font-mono font-semibold text-[#1A1A1A]">
              {formatBytes(manifest?.totalBytes ?? 0)}
            </span>{" "}
            stored
          </span>
        </div>

        {manifest && manifest.bundles.length > 0 ? (
          <div className="space-y-3">
            {manifest.bundles.slice(0, 6).map((bundle) => (
              <div key={bundle.id} className="rounded-md border border-[#E8E5DE] bg-[#FAFAF8] p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-mono text-xs font-semibold text-[#1A1A1A]">
                      {bundle.id}
                    </div>
                    {bundle.note && (
                      <div className="mt-1 text-sm leading-6 text-[#3D3D3D]">
                        {bundle.note}
                      </div>
                    )}
                  </div>
                  <div className="text-right text-xs text-[#6B6B6B]">
                    <div>{bundle.fileCount} file{bundle.fileCount === 1 ? "" : "s"}</div>
                    <div className="font-mono">{formatBytes(bundle.totalBytes)}</div>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {bundle.files.slice(0, 5).map((file) => (
                    <div key={file.id} className="rounded border border-[#E8E5DE] bg-white px-2.5 py-2 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="min-w-0 break-all font-medium text-[#1A1A1A]">
                          {file.originalName}
                        </span>
                        <span className="font-mono text-[#6B6B6B]">{formatBytes(file.byteLength)}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-[#9B9B9B]">
                        <span>{file.source?.kind ?? "upload"}</span>
                        <span className="break-all">{file.relativePath}</span>
                        <span title={file.sha256}>sha256:{shortHash(file.sha256)}</span>
                        {file.source?.finalUrl && (
                          <a
                            href={file.source.finalUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="break-all text-[#4A5F8A] underline decoration-[#C8D2E8] underline-offset-2 hover:text-[#1A1A1A]"
                          >
                            source URL
                          </a>
                        )}
                        <a
                          href={artifactFileHref(endpoint, bundle, file)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#1A1A1A] underline decoration-[#D4D0C8] underline-offset-2 hover:text-[#4A5F8A]"
                        >
                          download
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[#9B9B9B]">No supplemental artifact bundles uploaded yet.</p>
        )}
      </div>
    </section>
  );
}
