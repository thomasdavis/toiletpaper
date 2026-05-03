export async function putObject(
  bucket: string,
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  const { Storage } = await import("@google-cloud/storage");
  const storage = new Storage();
  const file = storage.bucket(bucket).file(key);
  await file.save(body, { contentType });
}
