#!/usr/bin/env npx tsx
/**
 * Run Donto ingest for a paper outside the Next.js web process.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import postgres from "postgres";
import {
  extractClaimsFromText,
  extractTextFromPdf,
  ingestPaperIntoDonto,
  extractorModel,
  extractorVersion,
  type ExtractionResult,
} from "@toiletpaper/extractor";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://toiletpaper:toiletpaper@127.0.0.1:5434/toiletpaper";
const UPLOADS_DIR =
  process.env.UPLOADS_DIR ?? join(process.cwd(), "uploads");

interface PaperRow {
  id: string;
  title: string;
  authors: string[] | null;
  abstract: string | null;
  pdf_url: string | null;
}

function arg(name: string) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

function hasExtractorProvider() {
  if (process.env.LLM_API_KEY || process.env.OPENROUTER_API_KEY) return true;
  const keyFile = process.env.LLM_API_KEY_FILE;
  return Boolean(keyFile && existsSync(keyFile));
}

async function sourceForPaper(paper: PaperRow) {
  if (!paper.pdf_url) throw new Error("paper has no source attached");
  if (paper.pdf_url.startsWith("/uploads/")) {
    const sourceName = basename(paper.pdf_url);
    return {
      sourceName,
      buffer: await readFile(join(UPLOADS_DIR, sourceName)),
    };
  }
  throw new Error(`unsupported source location: ${paper.pdf_url}`);
}

async function main() {
  const paperId = arg("--paper-id") ?? process.argv[2];
  if (!paperId) {
    console.error("Usage: run-donto-ingest-job.ts --paper-id <id>");
    process.exit(1);
  }
  if (!hasExtractorProvider()) {
    throw new Error("extractor provider not configured");
  }

  const sql = postgres(DATABASE_URL, { max: 4 });
  try {
    const [paper] = await sql<PaperRow[]>`
      SELECT id, title, authors, abstract, pdf_url
      FROM papers
      WHERE id = ${paperId}
    `;
    if (!paper) throw new Error(`paper ${paperId} not found`);

    await sql`
      INSERT INTO paper_donto_ingest (paper_id, state, attempts, last_attempt_at)
      VALUES (${paperId}, 'running', 1, NOW())
      ON CONFLICT (paper_id) DO UPDATE
      SET state = 'running',
          attempts = paper_donto_ingest.attempts + 1,
          last_attempt_at = NOW(),
          updated_at = NOW()
    `;
    await sql`UPDATE papers SET status = 'extracting', updated_at = NOW() WHERE id = ${paperId}`;

    const { sourceName, buffer } = await sourceForPaper(paper);
    const isPdf = sourceName.toLowerCase().endsWith(".pdf");
    const textForExtraction = isPdf
      ? (await extractTextFromPdf(buffer)).text
      : buffer.toString("utf-8");

    let extraction: ExtractionResult;
    try {
      extraction = await extractClaimsFromText(
        textForExtraction,
        process.env.LLM_API_KEY ?? process.env.OPENROUTER_API_KEY ?? "",
      );
    } catch (e) {
      console.warn(
        "Compact claim extraction failed; continuing with rich Donto-agent extraction:",
        e instanceof Error ? e.message : String(e),
      );
      extraction = {
        title: paper.title,
        authors: paper.authors ?? [],
        abstract: paper.abstract ?? "",
        claims: [],
        relations: [],
      };
    }

    const result = await ingestPaperIntoDonto(
      paperId,
      textForExtraction,
      "",
      extraction,
      isPdf ? "application/pdf" : "text/markdown",
    );

    await sql`
      UPDATE paper_donto_ingest
      SET state = 'succeeded',
          document_id = ${result.documentId || null},
          revision_id = ${result.revisionId || null},
          agent_id = ${result.agentId || null},
          run_id = ${result.runId || null},
          statement_count = ${result.statementCount ?? 0},
          span_count = ${result.spanCount ?? 0},
          evidence_link_count = ${result.evidenceLinkCount ?? 0},
          argument_count = ${result.argumentCount ?? 0},
          certified_count = ${result.certifiedCount ?? 0},
          shape_check_count = ${result.shapeChecks ?? 0},
          obligation_ids = ${result.obligationIds ?? []},
          last_error_code = NULL,
          last_error_message = NULL,
          updated_at = NOW()
      WHERE paper_id = ${paperId}
    `;

    await sql`
      UPDATE papers
      SET title = ${extraction.title || paper.title},
          authors = ${extraction.authors?.length ? extraction.authors : (paper.authors ?? [])},
          abstract = ${extraction.abstract || paper.abstract},
          extractor_model = ${extractorModel()},
          extractor_version = ${extractorVersion()},
          parser_version = ${isPdf ? "pdf-parse-1.1.1" : "markdown-raw"},
          body_char_count = ${textForExtraction.length},
          status = 'extracted',
          updated_at = NOW()
      WHERE id = ${paperId}
    `;

    const [{ count }] = await sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count
      FROM claims
      WHERE paper_id = ${paperId}
    `;
    const existingCount = Number.parseInt(count, 10) || 0;
    if (existingCount === 0 && extraction.claims.length > 0) {
      for (const [index, claim] of extraction.claims.entries()) {
        await sql`
          INSERT INTO claims (
            paper_id, text, donto_subject_iri, status, confidence,
            category, predicate, value, unit, evidence
          )
          VALUES (
            ${paperId},
            ${claim.text ?? ""},
            ${result.claimIris[index] ?? null},
            'asserted',
            ${claim.confidence ?? null},
            ${claim.category ?? "unknown"},
            ${claim.predicate ?? null},
            ${claim.value ?? null},
            ${claim.unit ?? null},
            ${claim.evidence ?? null}
          )
        `;
      }
    } else if (result.claimIris.length > 0) {
      const rows = await sql<{ id: string }[]>`
        SELECT id
        FROM claims
        WHERE paper_id = ${paperId}
        ORDER BY created_at
      `;
      for (const [index, row] of rows.entries()) {
        const iri = result.claimIris[index];
        if (!iri) continue;
        await sql`
          UPDATE claims
          SET donto_subject_iri = ${iri},
              status = 'asserted'
          WHERE id = ${row.id}
        `;
      }
    }

    console.log(
      JSON.stringify({
        paperId,
        state: "succeeded",
        statements: result.statementCount,
        spans: result.spanCount,
        evidenceLinks: result.evidenceLinkCount,
      }),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const codeMatch = msg.match(/(\/[a-z]+\/[a-z]+):? (\d{3})/i);
    const code = codeMatch
      ? `${codeMatch[1].replace(/^\//, "").replace(/\//g, "-")}-${codeMatch[2]}`
      : "ingest-failed";
    await sql`
      UPDATE paper_donto_ingest
      SET state = 'failed',
          last_error_code = ${code},
          last_error_message = ${msg.slice(0, 1000)},
          updated_at = NOW()
      WHERE paper_id = ${paperId}
    `;
    await sql`UPDATE papers SET status = 'error', updated_at = NOW() WHERE id = ${paperId}`;
    throw e;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
