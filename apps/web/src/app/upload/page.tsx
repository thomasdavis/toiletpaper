"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Container,
  Heading,
  Text,
  Stack,
  FileUpload,
  Spinner,
  Alert,
} from "@toiletpaper/ui";

type UploadState = "idle" | "uploading" | "done" | "error";

export default function UploadPage() {
  const router = useRouter();
  const [state, setState] = useState<UploadState>("idle");
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File) => {
      setState("uploading");
      setError(null);
      try {
        const form = new FormData();
        form.append("file", file);

        const res = await fetch("/api/upload", { method: "POST", body: form });
        const body = (await res.json()) as {
          id: string;
          url?: string;
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

        router.push(body.url ?? `/papers/${body.id}`);
      } catch (e) {
        setState("error");
        setError(e instanceof Error ? e.message : "Upload failed");
      }
    },
    [router],
  );

  const handleFiles = useCallback(
    (files: File[]) => {
      const pdf = files[0];
      if (pdf) upload(pdf);
    },
    [upload],
  );

  const busy = state === "uploading";

  return (
    <Container size="md">
      <Stack gap={6}>
        <Heading level={2}>Upload a paper</Heading>

        {state === "uploading" && (
          <Stack gap={2} align="center">
            <Spinner size="lg" />
            <Text size="sm" color="primary">Creating paper URL...</Text>
          </Stack>
        )}

        {state === "done" && (
          <Alert variant="success">
            Opening paper...
          </Alert>
        )}

        {(state === "idle" || state === "error") && (
          <FileUpload
            onFiles={handleFiles}
            accept="application/pdf,.md,.markdown,text/markdown"
            label="Drag & drop a PDF or Markdown file"
            hint="Claims are extracted and ingested into donto automatically"
            disabled={busy}
          />
        )}

        {error && (
          <Alert variant="error">{error}</Alert>
        )}
      </Stack>
    </Container>
  );
}
