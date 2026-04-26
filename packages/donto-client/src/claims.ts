import {
  DONTOSRV_URL,
  assert,
  assertBatch,
  donto,
  type AssertInput,
} from "./index";
import { TP_CONTEXT } from "./papers";

export async function assertClaim(
  claimId: string,
  claimText: string,
  paperIri: string,
) {
  const subjectIri = `tp:claim:${claimId}`;

  const stmts: AssertInput[] = [
    {
      subject: subjectIri,
      predicate: "rdf:type",
      object_iri: "tp:Claim",
      context: TP_CONTEXT,
    },
    {
      subject: subjectIri,
      predicate: "tp:claimText",
      object_lit: { v: claimText, dt: "xsd:string" },
      context: TP_CONTEXT,
    },
    {
      subject: subjectIri,
      predicate: "tp:extractedFrom",
      object_iri: paperIri,
      context: TP_CONTEXT,
    },
  ];

  return assertBatch(DONTOSRV_URL, stmts);
}

export async function assertClaimBatch(
  claims: { id: string; text: string }[],
  paperIri: string,
) {
  const stmts: AssertInput[] = claims.flatMap((c) => {
    const subjectIri = `tp:claim:${c.id}`;
    return [
      {
        subject: subjectIri,
        predicate: "rdf:type",
        object_iri: "tp:Claim",
        context: TP_CONTEXT,
      },
      {
        subject: subjectIri,
        predicate: "tp:claimText",
        object_lit: { v: c.text, dt: "xsd:string" },
        context: TP_CONTEXT,
      },
      {
        subject: subjectIri,
        predicate: "tp:extractedFrom",
        object_iri: paperIri,
        context: TP_CONTEXT,
      },
    ];
  });

  return assertBatch(DONTOSRV_URL, stmts);
}

export async function queryClaimsByPaper(paperIri: string) {
  const client = donto(DONTOSRV_URL);
  const results = await client.search(paperIri);
  return results.matches;
}

export async function getClaimHistory(claimIri: string) {
  const client = donto(DONTOSRV_URL);
  return client.history(claimIri);
}
