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

type UploadState = "idle" | "uploading" | "extracting" | "done" | "error";

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

  const handleFiles = useCallback(
    (files: File[]) => {
      const pdf = files[0];
      if (pdf) upload(pdf);
    },
    [upload],
  );

  const busy = state === "uploading" || state === "extracting";

  return (
    <Container size="md">
      <Stack gap={6}>
        <Heading level={2}>Upload a paper</Heading>

        {state === "extracting" && (
          <Stack gap={2} align="center">
            <Spinner size="lg" />
            <Text size="sm" weight="medium" color="primary">
              Extracting claims from paper...
            </Text>
            <Text size="xs" color="muted">
              Parsing PDF, sending to GPT-4o, ingesting into donto
            </Text>
          </Stack>
        )}

        {state === "uploading" && (
          <Stack gap={2} align="center">
            <Spinner size="lg" />
            <Text size="sm" color="primary">Uploading PDF...</Text>
          </Stack>
        )}

        {state === "done" && (
          <Alert variant="success">
            Done! Redirecting to paper...
          </Alert>
        )}

        {(state === "idle" || state === "error") && (
          <FileUpload
            onFiles={handleFiles}
            accept="application/pdf,.md,.markdown,text/markdown"
            label="Drag & drop a PDF or Markdown file"
            hint="Claims extracted via GPT-4o and ingested into donto automatically"
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
