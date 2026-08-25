import { readFileSync } from "node:fs";

// dontosrv gained a context-visibility guard (Authorization: Bearer <token>,
// SHA-256 digest policy). Global mutation routes (documents/register,
// agents/register, …) 404 uniformly without a granted token. The toiletpaper
// pipeline token lives on the box and is injected via env.
let cached: string | null | undefined;

function dontosrvToken(): string | null {
  if (cached !== undefined) return cached;
  cached = process.env.DONTOSRV_TOKEN?.trim() || null;
  if (!cached && process.env.DONTOSRV_TOKEN_FILE) {
    try {
      cached = readFileSync(process.env.DONTOSRV_TOKEN_FILE, "utf8").trim() || null;
    } catch {
      cached = null;
    }
  }
  return cached;
}

/** Headers for dontosrv requests: JSON content type plus the bearer when configured. */
export function dontosrvHeaders(json = true): Record<string, string> {
  const headers: Record<string, string> = {};
  if (json) headers["content-type"] = "application/json";
  const token = dontosrvToken();
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}
