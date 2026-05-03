export function parseGs(gsUrl: string): { bucket: string; key: string } {
  const m = gsUrl.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!m) throw new Error(`Invalid gs:// URL: ${gsUrl}`);
  return { bucket: m[1], key: m[2] };
}

async function gcs() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Storage } = require("@google-cloud/storage") as { Storage: new () => any };
  return new Storage();
}

export async function putObject(
  bucket: string,
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  const storage = await gcs();
  const file = storage.bucket(bucket).file(key);
  await file.save(body, { contentType });
}

export async function getObject(bucket: string, key: string): Promise<Buffer> {
  const storage = await gcs();
  const [buf] = await storage.bucket(bucket).file(key).download();
  return buf;
}
