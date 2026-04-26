import { DONTOSRV_URL, ensureContext, assertBatch } from "./index";

export const TP_CONTEXT = "tp:papers";

export async function ensurePaperContext() {
  return ensureContext(DONTOSRV_URL, {
    iri: TP_CONTEXT,
    kind: "source",
    mode: "permissive",
  });
}

export async function registerPaperDocument(
  paperIri: string,
  label: string,
  pdfUrl: string,
) {
  const r = await fetch(`${DONTOSRV_URL}/documents/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      iri: paperIri,
      media_type: "application/pdf",
      label,
      source_url: pdfUrl,
    }),
  });
  if (!r.ok)
    throw new Error(`dontosrv /documents/register: ${r.status} ${r.statusText}`);
  return (await r.json()) as { document_id: string };
}

export async function assertPaperMetadata(
  paperIri: string,
  title: string,
  authors: string[],
  abstract: string | null,
) {
  const stmts = [
    {
      subject: paperIri,
      predicate: "rdf:type",
      object_iri: "tp:Paper",
      context: TP_CONTEXT,
    },
    {
      subject: paperIri,
      predicate: "dc:title",
      object_lit: { v: title, dt: "xsd:string" },
      context: TP_CONTEXT,
    },
    ...authors.map((a) => ({
      subject: paperIri,
      predicate: "dc:creator",
      object_lit: { v: a, dt: "xsd:string" },
      context: TP_CONTEXT,
    })),
  ];

  if (abstract) {
    stmts.push({
      subject: paperIri,
      predicate: "dc:description",
      object_lit: { v: abstract, dt: "xsd:string" },
      context: TP_CONTEXT,
    });
  }

  return assertBatch(DONTOSRV_URL, stmts);
}
