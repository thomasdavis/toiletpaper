import pdfParse from "pdf-parse";
import { createHash } from "node:crypto";

export interface ParsedPdf {
  text: string;
  pages: number;
  contentHash: string;
}

export async function extractTextFromPdf(buffer: Buffer): Promise<ParsedPdf> {
  const data = await pdfParse(buffer);
  const hash = createHash("sha256").update(data.text).digest("hex");
  return {
    text: data.text,
    pages: data.numpages,
    contentHash: hash,
  };
}
