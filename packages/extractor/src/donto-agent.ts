import { access, appendFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execFile, type ExecFileException } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface DontoAgentChunkResult {
  index: number;
  ordinal: number;
  chars: number;
  chunkPath: string | null;
  attempts: number;
  elapsedMs: number;
  statementCount: number;
  anchoredCount: number;
  skippedCount: number;
  factCount: number | null;
  passes: number | null;
  provider: string | null;
  model: string | null;
  qualityWarnings?: string[];
  qualityRetryCount?: number;
  stdout: string;
  stderr: string;
}

export interface DontoAgentExtractionResult {
  enabled: boolean;
  context: string;
  logDir: string | null;
  chunksDir: string | null;
  chunksPath: string | null;
  summaryPath: string | null;
  maxChars: number;
  overlapChars: number;
  maxPasses: number;
  maxTokens: number;
  chunkCount: number;
  statementCount: number;
  anchoredCount: number;
  evidenceLinkCount: number;
  skippedCount: number;
  factCount: number;
  chunks: DontoAgentChunkResult[];
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function floatEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

async function canExecute(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractionLogRoot() {
  if (process.env.DONTO_AGENT_LOG_DIR) return process.env.DONTO_AGENT_LOG_DIR;
  const simulatorDir = process.env.SIMULATOR_WORKDIR;
  if (simulatorDir) return join(dirname(simulatorDir), "extractions");
  return join("/mnt/donto-data/toiletpaper", "extractions");
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ error: "unserializable" });
  }
}

async function appendJsonl(path: string | null, value: unknown) {
  if (!path) return;
  try {
    await appendFile(path, `${safeJson(value)}\n`, "utf8");
  } catch {
    // Extraction logs are observability only; never fail ingestion for logging.
  }
}

function retryableAgentError(error: unknown): boolean {
  const e = error as ExecFileException & { stdout?: string; stderr?: string };
  const text = [
    e.message,
    typeof e.stdout === "string" ? e.stdout : "",
    typeof e.stderr === "string" ? e.stderr : "",
  ].join("\n");
  return /429|rate limit|temporarily unavailable|timeout/i.test(text);
}

export function splitDontoAgentText(
  text: string,
  maxChars: number,
  overlapChars: number,
): string[] {
  const chunks: string[] = [];
  const overlap = Math.min(Math.max(0, overlapChars), Math.max(0, maxChars - 1));
  let start = 0;

  while (start < text.length) {
    const hardEnd = Math.min(start + maxChars, text.length);
    let end = hardEnd;

    if (hardEnd < text.length) {
      const window = text.slice(start, hardEnd);
      const paragraphBreak = window.lastIndexOf("\n\n");
      const sentenceBreak = Math.max(
        window.lastIndexOf(". "),
        window.lastIndexOf("? "),
        window.lastIndexOf("! "),
      );
      const softBreak = Math.max(paragraphBreak, sentenceBreak);
      if (softBreak > Math.floor(maxChars * 0.55)) {
        end = start + softBreak + (paragraphBreak === softBreak ? 2 : 1);
      }
    }

    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= text.length) break;
    start = Math.max(0, end - overlap);
  }

  return chunks;
}

function parseChunkResult(
  index: number,
  chars: number,
  attempts: number,
  elapsedMs: number,
  chunkPath: string | null,
  stdout: string,
  stderr: string,
): DontoAgentChunkResult {
  const combined = `${stderr}\n${stdout}`;
  const ingested = combined.match(
    /ingested\s+(\d+)\s+statements\s+\((\d+)\s+anchored,\s+(\d+)\s+skipped\)/i,
  );
  const extracted = combined.match(
    /(\d+)\s+facts\s+in\s+(\d+)\s+pass(?:es|\(es\))?\s+via\s+([^/\s]+)\/([^\s]+)/i,
  );

  return {
    index,
    ordinal: index + 1,
    chars,
    chunkPath,
    attempts,
    elapsedMs,
    statementCount: ingested ? Number.parseInt(ingested[1], 10) : 0,
    anchoredCount: ingested ? Number.parseInt(ingested[2], 10) : 0,
    skippedCount: ingested ? Number.parseInt(ingested[3], 10) : 0,
    factCount: extracted ? Number.parseInt(extracted[1], 10) : null,
    passes: extracted ? Number.parseInt(extracted[2], 10) : null,
    provider: extracted?.[3] ?? null,
    model: extracted?.[4] ?? null,
    stdout,
    stderr,
  };
}

export function assessDontoAgentChunkQuality(
  result: Pick<
    DontoAgentChunkResult,
    "chars" | "statementCount" | "anchoredCount" | "factCount" | "stdout" | "stderr"
  >,
  opts: {
    minAnchoredRatio?: number;
    minFactsPerThousandChars?: number;
    minStatementsForAnchorCheck?: number;
  } = {},
) {
  const factCount = result.factCount ?? result.statementCount;
  const anchorRatio =
    result.statementCount > 0 ? result.anchoredCount / result.statementCount : 0;
  const factDensityPerKChars =
    result.chars > 0 ? factCount / (result.chars / 1_000) : factCount;
  const minAnchoredRatio =
    opts.minAnchoredRatio ?? floatEnv("DONTO_AGENT_MIN_ANCHORED_RATIO", 0.2);
  const minFactsPerThousandChars =
    opts.minFactsPerThousandChars ??
    floatEnv("DONTO_AGENT_MIN_FACTS_PER_1K_CHARS", 18);
  const minStatementsForAnchorCheck =
    opts.minStatementsForAnchorCheck ??
    intEnv("DONTO_AGENT_MIN_STATEMENTS_FOR_ANCHOR_CHECK", 20);
  const combined = `${result.stderr}\n${result.stdout}`;
  const warnings: string[] = [];

  if (/stream dropped|partial accepted|error decoding response body/i.test(combined)) {
    warnings.push("provider stream dropped or returned partial output");
  }
  if (result.statementCount <= 0 || factCount <= 0) {
    warnings.push("no facts were ingested for this chunk");
  }
  if (factDensityPerKChars < minFactsPerThousandChars) {
    warnings.push(
      `fact density ${factDensityPerKChars.toFixed(1)}/1k chars below ${minFactsPerThousandChars}`,
    );
  }
  if (
    result.statementCount >= minStatementsForAnchorCheck &&
    anchorRatio < minAnchoredRatio
  ) {
    warnings.push(
      `anchor ratio ${(anchorRatio * 100).toFixed(1)}% below ${(minAnchoredRatio * 100).toFixed(0)}%`,
    );
  }

  return {
    acceptable: warnings.length === 0,
    warnings,
    anchorRatio,
    factDensityPerKChars,
  };
}

function mergeChunkResults(
  previous: DontoAgentChunkResult,
  next: DontoAgentChunkResult,
): DontoAgentChunkResult {
  const previousFacts = previous.factCount ?? previous.statementCount;
  const nextFacts = next.factCount ?? next.statementCount;
  const passes =
    previous.passes == null && next.passes == null
      ? null
      : (previous.passes ?? 0) + (next.passes ?? 0);
  return {
    ...next,
    elapsedMs: previous.elapsedMs + next.elapsedMs,
    statementCount: previous.statementCount + next.statementCount,
    anchoredCount: previous.anchoredCount + next.anchoredCount,
    skippedCount: previous.skippedCount + next.skippedCount,
    factCount: previousFacts + nextFacts,
    passes,
    provider: next.provider ?? previous.provider,
    model: next.model ?? previous.model,
    qualityWarnings: [
      ...new Set([
        ...(previous.qualityWarnings ?? []),
        ...(next.qualityWarnings ?? []),
      ]),
    ],
    stdout: `${previous.stdout}\n${next.stdout}`.slice(-20_000),
    stderr: `${previous.stderr}\n${next.stderr}`.slice(-20_000),
  };
}

export async function extractRichFactsWithDontoAgent(opts: {
  paperId: string;
  context: string;
  text: string;
}): Promise<DontoAgentExtractionResult> {
  if (process.env.DONTO_AGENT_ENABLED === "0") {
    return {
      enabled: false,
      context: opts.context,
      chunkCount: 0,
      statementCount: 0,
      anchoredCount: 0,
      evidenceLinkCount: 0,
      skippedCount: 0,
      factCount: 0,
      logDir: null,
      chunksDir: null,
      chunksPath: null,
      summaryPath: null,
      maxChars: 0,
      overlapChars: 0,
      maxPasses: 0,
      maxTokens: 0,
      chunks: [],
    };
  }

  const bin = process.env.DONTO_AGENT_BIN || "/home/ajax/bin/donto-agent";
  if (!(await canExecute(bin))) {
    if (process.env.DONTO_AGENT_REQUIRED === "1") {
      throw new Error(`donto-agent is not executable at ${bin}`);
    }
    return {
      enabled: false,
      context: opts.context,
      chunkCount: 0,
      statementCount: 0,
      anchoredCount: 0,
      evidenceLinkCount: 0,
      skippedCount: 0,
      factCount: 0,
      logDir: null,
      chunksDir: null,
      chunksPath: null,
      summaryPath: null,
      maxChars: 0,
      overlapChars: 0,
      maxPasses: 0,
      maxTokens: 0,
      chunks: [],
    };
  }

  const dsn = process.env.DONTO_DSN;
  if (!dsn) throw new Error("DONTO_DSN is required for donto-agent rich extraction");

  const maxChars = intEnv("DONTO_AGENT_CHUNK_CHARS", 3_500);
  const overlapChars = intEnv("DONTO_AGENT_CHUNK_OVERLAP_CHARS", 700);
  const maxPasses = intEnv("DONTO_AGENT_MAX_PASSES", 8);
  const maxTokens = intEnv("DONTO_AGENT_MAX_TOKENS", 12_000);
  const timeout = intEnv("DONTO_AGENT_TIMEOUT_MS", 900_000);
  const retryAttempts = intEnv("DONTO_AGENT_RETRY_ATTEMPTS", 4);
  const retryBaseMs = intEnv("DONTO_AGENT_RETRY_BASE_MS", 60_000);
  const provider = process.env.DONTO_AGENT_PROVIDER || "glm";
  const model = process.env.DONTO_AGENT_MODEL || process.env.LLM_MODEL || "";
  const keyFile =
    process.env.DONTO_AGENT_KEY_FILE ||
    process.env.LLM_API_KEY_FILE ||
    "/etc/donto/glm.key";

  const chunks = splitDontoAgentText(opts.text, maxChars, overlapChars);
  const dir = await mkdtemp(join(tmpdir(), `toiletpaper-donto-agent-${opts.paperId}-`));
  const logDir = join(extractionLogRoot(), opts.paperId);
  const chunksDir = join(logDir, "chunks");
  const chunksPath = join(logDir, "donto-agent-chunks.jsonl");
  const summaryPath = join(logDir, "donto-agent-summary.json");
  const results: DontoAgentChunkResult[] = [];

  try {
    await mkdir(chunksDir, { recursive: true });
    await writeFile(
      summaryPath,
      `${JSON.stringify(
        {
          status: "running",
          paperId: opts.paperId,
          context: opts.context,
          chunksDir,
          chunkCount: chunks.length,
          maxChars,
          overlapChars,
          maxPasses,
          maxTokens,
          provider,
          model,
          startedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    for (const [index, chunk] of chunks.entries()) {
      const file = join(dir, `chunk-${String(index + 1).padStart(3, "0")}.txt`);
      const persistedChunkPath = join(
        chunksDir,
        `chunk-${String(index + 1).padStart(3, "0")}.txt`,
      );
      await writeFile(file, chunk, "utf8");
      await writeFile(persistedChunkPath, chunk, "utf8");
      await appendJsonl(chunksPath, {
        event: "chunk_started",
        index,
        ordinal: index + 1,
        chunkCount: chunks.length,
        chars: chunk.length,
        chunkPath: persistedChunkPath,
        createdAt: new Date().toISOString(),
      });

      const args = ["--provider", provider];
      if (model) args.push("--model", model);
      if (keyFile) args.push("--key-file", keyFile);
      args.push(
        "extract",
        file,
        "--context",
        opts.context,
        "--max-passes",
        String(maxPasses),
        "--max-tokens",
        String(maxTokens),
      );

      let aggregateResult: DontoAgentChunkResult | null = null;
      for (let attempt = 1; attempt <= retryAttempts; attempt++) {
        const started = Date.now();
        try {
          const { stdout, stderr } = await execFileAsync(bin, args, {
            env: { ...process.env, DONTO_DSN: dsn },
            timeout,
            maxBuffer: 20 * 1024 * 1024,
          });
          const result = parseChunkResult(
            index,
            chunk.length,
            attempt,
            Date.now() - started,
            persistedChunkPath,
            stdout,
            stderr,
          );
          const quality = assessDontoAgentChunkQuality(result);
          result.qualityWarnings = quality.warnings;
          aggregateResult = aggregateResult
            ? mergeChunkResults(aggregateResult, result)
            : result;

          if (!quality.acceptable && attempt < retryAttempts) {
            await appendJsonl(chunksPath, {
              event: "chunk_quality_retry",
              createdAt: new Date().toISOString(),
              ...result,
              quality,
              qualityRetryCount: attempt,
              stdoutTail: stdout.slice(-2_000),
              stderrTail: stderr.slice(-2_000),
            });
            const delay = retryBaseMs * attempt;
            console.warn(
              `donto-agent chunk ${index + 1}/${chunks.length} produced weak partial output; retrying in ${Math.round(delay / 1000)}s (${attempt}/${retryAttempts})`,
              quality.warnings.join("; "),
            );
            await sleep(delay);
            continue;
          }

          aggregateResult.attempts = attempt;
          aggregateResult.qualityRetryCount = attempt - 1;
          results.push(aggregateResult);
          await appendJsonl(chunksPath, {
            event: quality.acceptable ? "chunk_succeeded" : "chunk_degraded",
            createdAt: new Date().toISOString(),
            ...aggregateResult,
            quality,
            stdoutTail: stdout.slice(-2_000),
            stderrTail: stderr.slice(-2_000),
          });
          break;
        } catch (error) {
          if (aggregateResult) {
            aggregateResult.attempts = attempt;
            aggregateResult.qualityRetryCount = Math.max(0, attempt - 1);
            aggregateResult.qualityWarnings = [
              ...new Set([
                ...(aggregateResult.qualityWarnings ?? []),
                `retry failed: ${error instanceof Error ? error.message : String(error)}`,
              ]),
            ];
            results.push(aggregateResult);
            await appendJsonl(chunksPath, {
              event: "chunk_degraded_after_retry_error",
              createdAt: new Date().toISOString(),
              ...aggregateResult,
              error: error instanceof Error ? error.message : String(error),
            });
            break;
          }
          await appendJsonl(chunksPath, {
            event: "chunk_failed_attempt",
            index,
            ordinal: index + 1,
            attempt,
            retryable: retryableAgentError(error),
            elapsedMs: Date.now() - started,
            error: error instanceof Error ? error.message : String(error),
            createdAt: new Date().toISOString(),
          });
          if (attempt >= retryAttempts || !retryableAgentError(error)) throw error;
          const delay = retryBaseMs * attempt;
          console.warn(
            `donto-agent chunk ${index + 1}/${chunks.length} failed; retrying in ${Math.round(delay / 1000)}s (${attempt}/${retryAttempts})`,
            error instanceof Error ? error.message : String(error),
          );
          await sleep(delay);
        }
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  const result = {
    enabled: true,
    context: opts.context,
    logDir,
    chunksDir,
    chunksPath,
    summaryPath,
    maxChars,
    overlapChars,
    maxPasses,
    maxTokens,
    chunkCount: chunks.length,
    statementCount: results.reduce((sum, r) => sum + r.statementCount, 0),
    anchoredCount: results.reduce((sum, r) => sum + r.anchoredCount, 0),
    evidenceLinkCount: results.reduce(
      (sum, r) => sum + r.statementCount + r.anchoredCount,
      0,
    ),
    skippedCount: results.reduce((sum, r) => sum + r.skippedCount, 0),
    factCount: results.reduce((sum, r) => sum + (r.factCount ?? r.statementCount), 0),
    chunks: results,
  };
  await writeFile(
    summaryPath,
    `${JSON.stringify(
      {
        status: "succeeded",
        paperId: opts.paperId,
        completedAt: new Date().toISOString(),
        ...result,
        chunks: results.map((chunk) => ({
          index: chunk.index,
          ordinal: chunk.ordinal,
          chars: chunk.chars,
          chunkPath: chunk.chunkPath,
          attempts: chunk.attempts,
          elapsedMs: chunk.elapsedMs,
          statementCount: chunk.statementCount,
          anchoredCount: chunk.anchoredCount,
          skippedCount: chunk.skippedCount,
          factCount: chunk.factCount,
          passes: chunk.passes,
          provider: chunk.provider,
          model: chunk.model,
          qualityWarnings: chunk.qualityWarnings ?? [],
          qualityRetryCount: chunk.qualityRetryCount ?? 0,
        })),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return result;
}
