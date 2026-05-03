export { extractTextFromPdf, type ParsedPdf } from "./pdf";
export {
  extractClaimsFromText,
  type ExtractedClaim,
  type ExtractionResult,
} from "./llm";
export { ingestPaperIntoDonto, type IngestResult } from "./ingest";

export async function extractPaper(
  pdfBuffer: Buffer,
  paperId: string,
  apiKey: string,
  mediaType: string = "application/pdf",
) {
  const { extractTextFromPdf: parse } = await import("./pdf");
  const { extractClaimsFromText: extract } = await import("./llm");
  const { ingestPaperIntoDonto: ingest } = await import("./ingest");

  const pdf = await parse(pdfBuffer);
  const extraction = await extract(pdf.text, apiKey);
  const result = await ingest(paperId, pdf.text, pdf.contentHash, extraction, mediaType);

  return {
    pdf,
    extraction,
    donto: result,
  };
}
