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
