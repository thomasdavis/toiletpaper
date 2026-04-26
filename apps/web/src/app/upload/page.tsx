"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dropzone } from "@toiletpaper/ui";

type UploadState = "idle" | "uploading" | "extracting" | "done" | "error";

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File) => {
      setState("uploading");
      setError(null);
      try {
        const form = new FormData();
        form.append("file", file);

        setState("extracting");
        const res = await fetch("/api/upload", { method: "POST", body: form });
        const body = (await res.json()) as {
          id: string;
          claims?: number;
          error?: string;
        };

        if (!res.ok && !body.id) {
          throw new Error(body.error ?? `Upload failed (${res.status})`);
        }

        setState("done");

        if (body.error) {
          setError(body.error);
        }

        router.push(`/papers/${body.id}`);
      } catch (e) {
        setState("error");
        setError(e instanceof Error ? e.message : "Upload failed");
      }
    },
    [router],
  );

  const handleDrop = useCallback(
    (files: File[]) => {
      const pdf = files[0];
      if (pdf) upload(pdf);
    },
    [upload],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) upload(file);
    },
    [upload],
  );

  const busy = state === "uploading" || state === "extracting";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Upload a paper</h1>

      <Dropzone
        onDrop={handleDrop}
        className="cursor-pointer"
      >
        <div className="text-center">
          {state === "uploading" && (
            <p className="text-sm text-blue-700">Uploading PDF...</p>
          )}
          {state === "extracting" && (
            <>
              <Spinner />
              <p className="mt-2 text-sm font-medium text-blue-700">
                Extracting claims from paper...
              </p>
              <p className="mt-1 text-xs text-muted">
                Parsing PDF, sending to GPT-4o, ingesting into donto
              </p>
            </>
          )}
          {state === "done" && (
            <p className="text-sm text-green-700">
              Done! Redirecting to paper...
            </p>
          )}
          {(state === "idle" || state === "error") && (
            <>
              <p className="text-sm font-medium">
                Drag &amp; drop a PDF or Markdown file
              </p>
              <p className="mt-1 text-xs text-muted">
                Claims extracted via GPT-4o and ingested into donto
                automatically
              </p>
            </>
          )}
        </div>
      </Dropzone>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.md,.markdown,text/markdown"
        className="hidden"
        onChange={handleFileChange}
      />

      <button
        type="button"
        className="text-sm text-blue-700 underline disabled:opacity-50"
        onClick={() => fileInputRef.current?.click()}
        disabled={busy}
      >
        Choose file from disk
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

function Spinner() {
  return (
    <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-stone-200 border-t-blue-700" />
  );
}
