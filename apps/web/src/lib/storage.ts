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
  const mod = await import(/* webpackIgnore: true */ "@google-cloud/storage");
  const storage = new mod.Storage();
  const file = storage.bucket(bucket).file(key);
  await file.save(body, { contentType });
}

export async function getObject(bucket: string, key: string): Promise<Buffer> {
  const mod = await import(/* webpackIgnore: true */ "@google-cloud/storage");
  const storage = new mod.Storage();
  const [buf] = await storage.bucket(bucket).file(key).download();
  return buf;
}
