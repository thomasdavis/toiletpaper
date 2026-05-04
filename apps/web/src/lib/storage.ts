import { Storage } from "@google-cloud/storage";

export function parseGs(gsUrl: string): { bucket: string; key: string } {
  const m = gsUrl.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!m) throw new Error(`Invalid gs:// URL: ${gsUrl}`);
  return { bucket: m[1], key: m[2] };
}

export async function putObject(
  bucket: string,
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  const storage = new Storage();
  const file = storage.bucket(bucket).file(key);
  await file.save(body, { contentType });
}

export async function getObject(bucket: string, key: string): Promise<Buffer> {
  const storage = new Storage();
  const [buf] = await storage.bucket(bucket).file(key).download();
  return buf;
}

/**
 * List object names under a given prefix in a GCS bucket.
 * Returns just the file names (last path segment), not full keys.
 */
export async function listObjects(
  bucket: string,
  prefix: string,
): Promise<{ name: string; fullKey: string; size: number }[]> {
  const storage = new Storage();
  const [files] = await storage.bucket(bucket).getFiles({ prefix });
  return files
    .filter((f) => f.name !== prefix) // exclude the "directory" itself
    .map((f) => ({
      name: f.name.split("/").pop() ?? f.name,
      fullKey: f.name,
      size: Number(f.metadata.size ?? 0),
    }));
}
