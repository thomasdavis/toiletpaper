import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FIXTURE_PDF = join(
  import.meta.dirname!,
  "fixtures",
  "graphene-aluminum-composites.pdf",
);

const WEB_URL = "http://localhost:3001";
const DONTOSRV_URL = process.env.DONTOSRV_URL ?? "http://localhost:7879";
const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://toiletpaper:toiletpaper@127.0.0.1:5434/toiletpaper";

async function fetchJson(url: string, init?: RequestInit) {
  const r = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      accept: "application/json",
    },
  });
  const body = await r.json();
  return { status: r.status, body };
}

// ─── Prerequisites ──────────────────────────────────────────────────────────

describe("prerequisites", () => {
  it("web server is reachable", async () => {
    const r = await fetch(WEB_URL);
    expect(r.status).toBe(200);
  });

  it("dontosrv is healthy", async () => {
    const r = await fetch(`${DONTOSRV_URL}/health`);
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("ok");
  });

  it("primary postgres is reachable", async () => {
    const { body } = await fetchJson(`${WEB_URL}/api/papers`);
    expect(Array.isArray(body)).toBe(true);
  });

  it("fixture PDF exists and is readable", () => {
    const buf = readFileSync(FIXTURE_PDF);
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.slice(0, 5).toString()).toBe("%PDF-");
  });
});

// ─── Layer 1: PDF Parsing ───────────────────────────────────────────────────

describe("pdf parsing", () => {
  it("extracts text from the fixture PDF", async () => {
    const { extractTextFromPdf } = await import(
      "../packages/extractor/src/pdf"
    );
    const buf = readFileSync(FIXTURE_PDF);
    const result = await extractTextFromPdf(buf as Buffer);

    expect(result.pages).toBe(4);
    expect(result.text.length).toBeGreaterThan(5000);
    expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.text).toContain("Thermal Conductivity Enhancement");
    expect(result.text).toContain("graphene");
    expect(result.text).toContain("274");
    expect(result.text).toContain("aluminum");
  });

  it("content hash is deterministic", async () => {
    const { extractTextFromPdf } = await import(
      "../packages/extractor/src/pdf"
    );
    const buf = readFileSync(FIXTURE_PDF);
    const r1 = await extractTextFromPdf(buf as Buffer);
    const r2 = await extractTextFromPdf(buf as Buffer);
    expect(r1.contentHash).toBe(r2.contentHash);
  });
});

// ─── Layer 2: LLM Extraction (calls OpenAI) ────────────────────────────────

describe("llm extraction", () => {
  const apiKey = process.env.OPENAI_API_KEY;

  it.skipIf(!apiKey)(
    "extracts claims from paper text via GPT-4o",
    { timeout: 60_000 },
    async () => {
      const { extractTextFromPdf } = await import(
        "../packages/extractor/src/pdf"
      );
      const { extractClaimsFromText } = await import(
        "../packages/extractor/src/llm"
      );

      const buf = readFileSync(FIXTURE_PDF);
      const pdf = await extractTextFromPdf(buf as Buffer);
      const result = await extractClaimsFromText(pdf.text, apiKey!);

      // Verify structure
      expect(result.title).toBeTruthy();
      expect(result.title.toLowerCase()).toContain("thermal");
      expect(result.authors).toBeInstanceOf(Array);
      expect(result.authors.length).toBeGreaterThanOrEqual(2);
      expect(result.claims).toBeInstanceOf(Array);
      expect(result.claims.length).toBeGreaterThanOrEqual(3);

      // Verify claim structure
      for (const claim of result.claims) {
        expect(claim.text).toBeTruthy();
        expect(claim.category).toMatch(
          /^(quantitative|comparative|causal|methodological|theoretical)$/,
        );
        expect(claim.confidence).toBeGreaterThan(0);
        expect(claim.confidence).toBeLessThanOrEqual(1);
        expect(claim.evidence).toBeTruthy();
      }

      // Should extract key quantitative claims from the paper
      const claimTexts = result.claims.map((c) => c.text.toLowerCase());
      const allText = claimTexts.join(" ");
      expect(allText).toContain("274");
    },
  );
});

// ─── Layer 3: Donto Ingestion ───────────────────────────────────────────────

describe("donto ingestion", () => {
  it("registers a document in donto", async () => {
    const testIri = `tp:test:doc:${Date.now()}`;
    const r = await fetchJson(`${DONTOSRV_URL}/documents/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        iri: testIri,
        media_type: "application/pdf",
        label: "Test Document",
      }),
    });

    expect(r.status).toBe(200);
    expect(r.body.document_id).toBeTruthy();
    expect(r.body.iri).toBe(testIri);
  });

  it("creates a context for paper claims", async () => {
    const { ensureContext } = await import(
      "../packages/donto-client/src/index"
    );

    const testCtx = `tp:test:ctx:${Date.now()}`;
    const result = await ensureContext(DONTOSRV_URL, {
      iri: testCtx,
      kind: "source",
      mode: "permissive",
    });

    expect(result.iri).toBe(testCtx);
    expect(result.ok).toBe(true);
  });

  it("asserts claims as quads and reads them back", async () => {
    const { ensureContext, assertBatch, donto } = await import(
      "../packages/donto-client/src/index"
    );

    const testCtx = `tp:test:claims:${Date.now()}`;
    await ensureContext(DONTOSRV_URL, {
      iri: testCtx,
      kind: "source",
      mode: "permissive",
    });

    const claimIri = `tp:test:claim:${Date.now()}`;
    const result = await assertBatch(DONTOSRV_URL, [
      {
        subject: claimIri,
        predicate: "rdf:type",
        object_iri: "tp:Claim",
        context: testCtx,
      },
      {
        subject: claimIri,
        predicate: "tp:claimText",
        object_lit: {
          v: "Thermal conductivity reached 274 W/(m·K)",
          dt: "xsd:string",
        },
        context: testCtx,
      },
      {
        subject: claimIri,
        predicate: "tp:category",
        object_lit: { v: "quantitative", dt: "xsd:string" },
        context: testCtx,
      },
    ]);

    expect(result.inserted).toBe(3);

    // Read back
    const client = donto(DONTOSRV_URL);
    const history = await client.history(claimIri);
    expect(history.count).toBeGreaterThanOrEqual(3);

    const predicates = history.rows.map((r) => r.predicate);
    expect(predicates).toContain("rdf:type");
    expect(predicates).toContain("tp:claimText");
    expect(predicates).toContain("tp:category");
  });

  it("registers an agent", async () => {
    const r = await fetchJson(`${DONTOSRV_URL}/agents/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        iri: `agent:test:${Date.now()}`,
        agent_type: "llm",
        label: "Test Agent",
        model_id: "test-model",
      }),
    });

    expect(r.status).toBe(200);
    expect(r.body.agent_id).toBeTruthy();
  });
});

// ─── Layer 4: Web API — Paper CRUD ──────────────────────────────────────────

describe("web api — paper crud", () => {
  let paperId: string;

  it("creates a paper via POST /api/papers", async () => {
    const { status, body } = await fetchJson(`${WEB_URL}/api/papers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title:
          "Thermal Conductivity Enhancement in Graphene-Reinforced Aluminum Composites",
        authors: [
          "Wei Zhang",
          "Maria Rodriguez-Lopez",
          "Kenji Tanaka",
          "Sarah O'Brien",
        ],
        abstract:
          "We report thermal conductivity of Al matrix composites reinforced with few-layer graphene nanoplatelets.",
      }),
    });

    expect(status).toBe(201);
    expect(body.id).toBeTruthy();
    expect(body.title).toContain("Thermal Conductivity");
    expect(body.authors).toHaveLength(4);
    expect(body.status).toBe("uploaded");
    paperId = body.id;
  });

  it("lists papers via GET /api/papers", async () => {
    const { status, body } = await fetchJson(`${WEB_URL}/api/papers`);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    const found = body.find((p: { id: string }) => p.id === paperId);
    expect(found).toBeTruthy();
    expect(found.title).toContain("Thermal Conductivity");
  });

  it("gets a single paper via GET /api/papers/:id", async () => {
    const { status, body } = await fetchJson(
      `${WEB_URL}/api/papers/${paperId}`,
    );
    expect(status).toBe(200);
    expect(body.id).toBe(paperId);
    expect(body.claims).toBeInstanceOf(Array);
  });

  it("updates a paper via PATCH /api/papers/:id", async () => {
    const { status, body } = await fetchJson(
      `${WEB_URL}/api/papers/${paperId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          abstract:
            "Updated abstract: Systematic study of graphene-Al thermal conductivity.",
        }),
      },
    );

    expect(status).toBe(200);
    expect(body.abstract).toContain("Updated abstract");
  });

  it("returns 404 for non-existent paper", async () => {
    const { status } = await fetchJson(
      `${WEB_URL}/api/papers/00000000-0000-0000-0000-000000000000`,
    );
    expect(status).toBe(404);
  });
});

// ─── Layer 5: Full Upload + Extraction Flow ─────────────────────────────────

describe("full upload + extraction flow", () => {
  let paperId: string;

  it("uploads a PDF via POST /api/upload", async () => {
    const pdfBuffer = readFileSync(FIXTURE_PDF);
    const form = new FormData();
    form.append(
      "file",
      new Blob([pdfBuffer], { type: "application/pdf" }),
      "graphene-aluminum-composites.pdf",
    );

    const r = await fetch(`${WEB_URL}/api/upload`, {
      method: "POST",
      body: form,
    });

    expect(r.status).toBe(201);
    const body = (await r.json()) as { id: string };
    expect(body.id).toBeTruthy();
    paperId = body.id;
  });

  it("paper exists in primary DB after upload", async () => {
    const { status, body } = await fetchJson(
      `${WEB_URL}/api/papers/${paperId}`,
    );
    expect(status).toBe(200);
    expect(body.title).toBeTruthy();
    expect(["uploaded", "extracting", "extracted"]).toContain(body.status);
    expect(body.pdfUrl).toContain(".pdf");
  });

  it.skipIf(!process.env.OPENAI_API_KEY)(
    "extracts claims via POST /api/claims/extract",
    { timeout: 90_000 },
    async () => {
      const { status, body } = await fetchJson(
        `${WEB_URL}/api/claims/extract`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ paper_id: paperId }),
        },
      );

      expect(status).toBe(200);
      expect(body.claims).toBeInstanceOf(Array);
      expect(body.claims.length).toBeGreaterThanOrEqual(3);

      // Verify claims have proper fields
      for (const claim of body.claims) {
        expect(claim.id).toBeTruthy();
        expect(claim.paperId).toBe(paperId);
        expect(claim.text).toBeTruthy();
        expect(claim.status).toBe("asserted");
        expect(claim.confidence).toBeGreaterThan(0);
      }

      // Verify donto integration happened
      if (body.donto) {
        expect(body.donto.documentId).toBeTruthy();
        expect(body.donto.statementCount).toBeGreaterThan(0);
        expect(body.donto.claimCount).toBeGreaterThanOrEqual(3);
      }
    },
  );

  it.skipIf(!process.env.OPENAI_API_KEY)(
    "paper status is 'extracted' after extraction",
    async () => {
      const { body } = await fetchJson(`${WEB_URL}/api/papers/${paperId}`);
      expect(body.status).toBe("extracted");
      expect(body.claims.length).toBeGreaterThanOrEqual(3);

      // At least some claims should have donto IRIs
      const withDonto = body.claims.filter(
        (c: { dontoSubjectIri: string | null }) => c.dontoSubjectIri,
      );
      expect(withDonto.length).toBeGreaterThan(0);
    },
  );

  it.skipIf(!process.env.OPENAI_API_KEY)(
    "claims are queryable in donto",
    async () => {
      const { body: paper } = await fetchJson(
        `${WEB_URL}/api/papers/${paperId}`,
      );

      const claimsWithIri = paper.claims.filter(
        (c: { dontoSubjectIri: string | null }) => c.dontoSubjectIri,
      );
      expect(claimsWithIri.length).toBeGreaterThan(0);

      // Query donto for the first claim
      const firstIri = claimsWithIri[0].dontoSubjectIri;
      const historyRes = await fetchJson(
        `${DONTOSRV_URL}/history/${encodeURIComponent(firstIri)}`,
      );
      expect(historyRes.status).toBe(200);
      expect(historyRes.body.count).toBeGreaterThanOrEqual(3);

      // Verify claim has expected predicates in donto
      const predicates = historyRes.body.rows.map(
        (r: { predicate: string }) => r.predicate,
      );
      expect(predicates).toContain("rdf:type");
      expect(predicates).toContain("tp:claimText");
      expect(predicates).toContain("tp:extractedFrom");
    },
  );
});

// ─── Layer 6: Donto evidence substrate ──────────────────────────────────────

describe("donto evidence substrate", () => {
  it("full document → revision → agent → assertion pipeline", async () => {
    const ts = Date.now();
    const docIri = `tp:test:fulldoc:${ts}`;
    const ctxIri = `tp:test:fullctx:${ts}`;

    // 1. Register document
    const docRes = await fetchJson(`${DONTOSRV_URL}/documents/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        iri: docIri,
        media_type: "application/pdf",
        label: "Integration Test Paper",
        source_url: "https://example.com/test.pdf",
        language: "en",
      }),
    });
    expect(docRes.status).toBe(200);
    const docId = docRes.body.document_id;

    // 2. Add revision
    const revRes = await fetchJson(`${DONTOSRV_URL}/documents/revision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        document_id: docId,
        body: "Thermal conductivity of graphene-aluminum composites was measured to be 274 W/(m·K).",
        parser_version: "test-parser-1.0",
      }),
    });
    expect(revRes.status).toBe(200);
    expect(revRes.body.revision_id).toBeTruthy();

    // 3. Register agent
    const agentRes = await fetchJson(`${DONTOSRV_URL}/agents/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        iri: `agent:test:full:${ts}`,
        agent_type: "extractor",
        label: "Test Extractor",
        model_id: "test-v1",
      }),
    });
    expect(agentRes.status).toBe(200);

    // 4. Create context and bind agent
    const { ensureContext } = await import(
      "../packages/donto-client/src/index"
    );
    await ensureContext(DONTOSRV_URL, {
      iri: ctxIri,
      kind: "source",
      mode: "permissive",
    });

    await fetchJson(`${DONTOSRV_URL}/agents/bind`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        agent_id: agentRes.body.agent_id,
        context: ctxIri,
        role: "contributor",
      }),
    });

    // 5. Assert quads
    const { assertBatch } = await import(
      "../packages/donto-client/src/index"
    );
    const claimIri = `tp:test:claim:full:${ts}`;
    const batchResult = await assertBatch(DONTOSRV_URL, [
      {
        subject: claimIri,
        predicate: "rdf:type",
        object_iri: "tp:Claim",
        context: ctxIri,
      },
      {
        subject: claimIri,
        predicate: "tp:claimText",
        object_lit: {
          v: "Thermal conductivity reached 274 ± 8 W/(m·K) at 2.0 vol% graphene",
          dt: "xsd:string",
        },
        context: ctxIri,
      },
      {
        subject: claimIri,
        predicate: "tp:extractedFrom",
        object_iri: docIri,
        context: ctxIri,
      },
      {
        subject: claimIri,
        predicate: "tp:category",
        object_lit: { v: "quantitative", dt: "xsd:string" },
        context: ctxIri,
      },
      {
        subject: claimIri,
        predicate: "tp:value",
        object_lit: { v: "274", dt: "xsd:decimal" },
        context: ctxIri,
      },
      {
        subject: claimIri,
        predicate: "tp:unit",
        object_lit: { v: "W/(m·K)", dt: "xsd:string" },
        context: ctxIri,
      },
    ]);
    expect(batchResult.inserted).toBe(6);

    // 6. Verify the full chain via history
    const { donto } = await import("../packages/donto-client/src/index");
    const client = donto(DONTOSRV_URL);
    const history = await client.history(claimIri);

    expect(history.subject).toBe(claimIri);
    expect(history.count).toBe(6);

    const valueStmt = history.rows.find((r) => r.predicate === "tp:value");
    expect(valueStmt).toBeTruthy();
    expect(valueStmt!.object_lit).toBeTruthy();

    const unitStmt = history.rows.find((r) => r.predicate === "tp:unit");
    expect(unitStmt).toBeTruthy();

    const fromStmt = history.rows.find(
      (r) => r.predicate === "tp:extractedFrom",
    );
    expect(fromStmt).toBeTruthy();
    expect(fromStmt!.object_iri).toBe(docIri);
  });

  it("contexts show up in context listing", async () => {
    const { body } = await fetchJson(`${DONTOSRV_URL}/contexts`);
    expect(body.contexts).toBeInstanceOf(Array);
    expect(body.contexts.length).toBeGreaterThan(0);

    const tpContexts = body.contexts.filter((c: { context: string }) =>
      c.context.startsWith("tp:"),
    );
    expect(tpContexts.length).toBeGreaterThan(0);
  });

  it("search finds test claims", async () => {
    const { body } = await fetchJson(
      `${DONTOSRV_URL}/search?q=thermal+conductivity&limit=5`,
    );
    expect(body.matches).toBeInstanceOf(Array);
  });
});

// ─── Layer 7: Web UI Pages ──────────────────────────────────────────────────

describe("web ui pages", () => {
  it("dashboard page renders", async () => {
    const r = await fetch(WEB_URL);
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain("toiletpaper");
    expect(html).toContain("Dashboard");
  });

  it("papers list page renders", async () => {
    const r = await fetch(`${WEB_URL}/papers`);
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain("Papers");
  });

  it("upload page renders", async () => {
    const r = await fetch(`${WEB_URL}/upload`);
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain("Upload");
  });

  it("paper detail page renders for existing paper", async () => {
    const { body: papers } = await fetchJson(`${WEB_URL}/api/papers`);
    if (papers.length === 0) return;

    const r = await fetch(`${WEB_URL}/papers/${papers[0].id}`);
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain(papers[0].title);
  });

  it("non-existent paper returns 404", async () => {
    const r = await fetch(
      `${WEB_URL}/papers/00000000-0000-0000-0000-000000000000`,
    );
    expect(r.status).toBe(404);
  });
});

// ─── Layer 8: Delete cleanup ────────────────────────────────────────────────

describe("cleanup", () => {
  it("can delete a paper and its claims cascade", async () => {
    // Create a paper to delete
    const { body: paper } = await fetchJson(`${WEB_URL}/api/papers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Paper To Delete" }),
    });

    const { status, body } = await fetchJson(
      `${WEB_URL}/api/papers/${paper.id}`,
      { method: "DELETE" },
    );
    expect(status).toBe(200);
    expect(body.deleted).toBe(true);

    // Verify it's gone
    const { status: getStatus } = await fetchJson(
      `${WEB_URL}/api/papers/${paper.id}`,
    );
    expect(getStatus).toBe(404);
  });
});
