import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { db } from "@/lib/db";
import { papers } from "@toiletpaper/db";
import {
  loadPaperArtifactManifest,
  savePaperArtifactBundle,
} from "@/lib/paper-artifacts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_MAX_TOTAL_BYTES = 250 * 1024 * 1024;
const MAX_FILE_COUNT = 100;
const URL_FETCH_TIMEOUT_MS = 60_000;

function maxTotalBytes() {
  const parsed = Number.parseInt(process.env.PAPER_ARTIFACT_MAX_BYTES ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_TOTAL_BYTES;
  return Math.min(parsed, 5 * 1024 * 1024 * 1024);
}

function privateIpv4(address: string) {
  const parts = address.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return true;
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

function privateIpv6(address: string) {
  const normalized = address.toLowerCase();
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("::ffff:") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
}

function hostnameForNetworkChecks(hostname: string) {
  return hostname.replace(/^\[|\]$/g, "");
}

function contentDispositionFilename(value: string | null) {
  if (!value) return null;
  const utf8 = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1].replace(/^"|"$/g, ""));
    } catch {
      return utf8[1].replace(/^"|"$/g, "");
    }
  }
  const ascii = value.match(/filename="?([^";]+)"?/i);
  return ascii?.[1] ?? null;
}

function filenameFromUrl(url: URL, contentDisposition: string | null) {
  const fromHeader = contentDispositionFilename(contentDisposition);
  if (fromHeader) return fromHeader;
  const pathName = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "");
  return pathName || `${url.hostname}-artifact`;
}

async function assertPublicArtifactUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https artifact URLs are accepted");
  }
  if (!url.hostname || url.username || url.password) {
    throw new Error("Artifact URL must not contain credentials");
  }

  const hostname = hostnameForNetworkChecks(url.hostname);
  const directIp = isIP(hostname);
  if (directIp === 4 && privateIpv4(hostname)) {
    throw new Error("Artifact URL resolves to a private IPv4 address");
  }
  if (directIp === 6 && privateIpv6(hostname)) {
    throw new Error("Artifact URL resolves to a private IPv6 address");
  }

  const records = directIp
    ? [{ address: hostname, family: directIp }]
    : await lookup(hostname, { all: true, verbatim: false });
  if (records.length === 0) throw new Error("Artifact URL hostname did not resolve");
  for (const record of records) {
    if (record.family === 4 && privateIpv4(record.address)) {
      throw new Error("Artifact URL resolves to a private IPv4 address");
    }
    if (record.family === 6 && privateIpv6(record.address)) {
      throw new Error("Artifact URL resolves to a private IPv6 address");
    }
  }

  return url;
}

function urlsFromFormData(formData: FormData) {
  const values = [
    ...formData.getAll("url"),
    ...formData.getAll("urls"),
    ...formData.getAll("artifactUrl"),
  ];
  return values
    .flatMap((value) => (typeof value === "string" ? value.split(/\r?\n|,/g) : []))
    .map((value) => value.trim())
    .filter(Boolean);
}

async function artifactFilesFromUrls(urls: string[], limit: number, existingBytes: number) {
  const fetchedFiles = [];
  let totalBytes = existingBytes;

  for (const rawUrl of urls) {
    const url = await assertPublicArtifactUrl(rawUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), URL_FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "user-agent": "toiletpaper.dev artifact fetcher",
          accept: "*/*",
        },
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      throw new Error(`Artifact URL ${url.href} returned HTTP ${res.status}`);
    }
    if (res.url) {
      await assertPublicArtifactUrl(res.url);
    }

    const declaredLength = Number.parseInt(res.headers.get("content-length") ?? "", 10);
    if (Number.isFinite(declaredLength) && declaredLength > 0 && totalBytes + declaredLength > limit) {
      throw new Error("Artifact URL downloads exceed the bundle size limit");
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    totalBytes += buffer.byteLength;
    if (totalBytes > limit) {
      throw new Error("Artifact URL downloads exceed the bundle size limit");
    }

    const finalUrl = new URL(res.url || url.href);
    fetchedFiles.push({
      originalName: filenameFromUrl(finalUrl, res.headers.get("content-disposition")),
      contentType: res.headers.get("content-type") ?? "application/octet-stream",
      buffer,
      source: {
        kind: "url" as const,
        url: url.href,
        finalUrl: finalUrl.href,
        fetchedAt: new Date().toISOString(),
        status: res.status,
      },
    });
  }

  return fetchedFiles;
}

async function requirePaper(id: string) {
  const [paper] = await db
    .select({ id: papers.id, title: papers.title })
    .from(papers)
    .where(eq(papers.id, id))
    .limit(1);
  return paper ?? null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const paper = await requirePaper(id);
  if (!paper) return NextResponse.json({ error: "not found" }, { status: 404 });

  const manifest = await loadPaperArtifactManifest(id);
  return NextResponse.json({ paper, manifest });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const paper = await requirePaper(id);
  if (!paper) return NextResponse.json({ error: "not found" }, { status: 404 });

  const formData = await req.formData();
  const note = formData.get("note");
  const rawFiles = [...formData.getAll("files"), ...formData.getAll("file")];
  const files = rawFiles.filter((item): item is File => item instanceof File);
  const urls = urlsFromFormData(formData);

  if (files.length === 0 && urls.length === 0) {
    return NextResponse.json({ error: "No artifact files or URLs provided" }, { status: 400 });
  }
  if (files.length + urls.length > MAX_FILE_COUNT) {
    return NextResponse.json(
      { error: `At most ${MAX_FILE_COUNT} files or URLs can be added per bundle` },
      { status: 413 },
    );
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const limit = maxTotalBytes();
  if (totalBytes > limit) {
    return NextResponse.json(
      {
        error: "Artifact bundle is too large",
        maxBytes: limit,
        receivedBytes: totalBytes,
      },
      { status: 413 },
    );
  }

  const uploadFiles = await Promise.all(
    files.map(async (file) => ({
      originalName: file.name || "artifact",
      contentType: file.type || "application/octet-stream",
      buffer: Buffer.from(await file.arrayBuffer()),
      source: { kind: "upload" as const },
    })),
  );
  let fetchedFiles;
  try {
    fetchedFiles = await artifactFilesFromUrls(urls, limit, totalBytes);
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Artifact URL import failed",
      },
      { status: 400 },
    );
  }

  const { bundle, manifest } = await savePaperArtifactBundle({
    paperId: id,
    note: typeof note === "string" ? note : null,
    files: [...uploadFiles, ...fetchedFiles],
  });

  return NextResponse.json({ paper, bundle, manifest }, { status: 201 });
}
