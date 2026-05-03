#!/usr/bin/env npx tsx
/**
 * simulate-paper.ts — Invoke Claude Code to build and run physics simulations
 * for every testable claim in a paper.
 *
 * Usage:
 *   npx tsx scripts/simulate-paper.ts <paper_id>
 *
 * What it does:
 *   1. Reads claims from the primary DB
 *   2. Enriches them with donto metadata (category, value, unit, evidence)
 *   3. Writes a simulation spec to .simulations/<paper_id>/spec.md
 *   4. Invokes `claude` CLI to build simulations from scratch
 *   5. Claude Code reads the spec, writes code, runs it, stores results
 */

import postgres from "postgres";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, watchFile, unwatchFile } from "node:fs";
import { join, resolve } from "node:path";
import { execSync, spawn } from "node:child_process";
import { homedir } from "node:os";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://toiletpaper:toiletpaper@127.0.0.1:5434/toiletpaper";
const DONTOSRV_URL = process.env.DONTOSRV_URL ?? "http://localhost:7879";

const paperId = process.argv[2];
if (!paperId) {
  console.error("Usage: npx tsx scripts/simulate-paper.ts <paper_id>");
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

async function main() {
  // 1. Get paper
  const [paper] = await sql`SELECT * FROM papers WHERE id = ${paperId}`;
  if (!paper) {
    console.error(`Paper ${paperId} not found`);
    process.exit(1);
  }
  console.log(`Paper: ${paper.title}`);
  console.log(`Authors: ${(paper.authors ?? []).join(", ")}`);

  // 2. Get claims
  const claims = await sql`SELECT * FROM claims WHERE paper_id = ${paperId} ORDER BY created_at`;
  console.log(`Claims: ${claims.length}`);

  // 3. Enrich from donto
  const enriched = [];
  for (const claim of claims) {
    const data: Record<string, string> = {};
    if (claim.donto_subject_iri) {
      try {
        const resp = await fetch(`${DONTOSRV_URL}/history/${encodeURIComponent(claim.donto_subject_iri)}`);
        if (resp.ok) {
          const history = await resp.json() as { rows: Array<{ predicate: string; object_lit?: { v: unknown }; object_iri?: string }> };
          for (const r of history.rows) {
            const v = String(r.object_lit?.v ?? r.object_iri ?? "");
            if (r.predicate.startsWith("tp:")) data[r.predicate.slice(3)] = v;
          }
        }
      } catch (_e) { /* donto may be down */ }
    }
    enriched.push({
      id: claim.id,
      text: claim.text,
      confidence: claim.confidence,
      dontoIri: claim.donto_subject_iri,
      ...data,
    });
  }

  // 4. Write simulation spec
  const simRoot = join(process.cwd(), ".simulations");
  const libDir = join(simRoot, "lib");
  const workDir = join(simRoot, paperId);
  mkdirSync(workDir, { recursive: true });
  mkdirSync(libDir, { recursive: true });

  const specPath = join(workDir, "spec.md");
  const resultsPath = join(workDir, "results.json");

  // Scan shared lib for existing modules
  const libModules: string[] = [];
  if (existsSync(libDir)) {
    const { readdirSync } = await import("node:fs");
    for (const f of readdirSync(libDir)) {
      if (f.endsWith(".py")) libModules.push(f);
    }
  }

  let spec = `# Simulation Spec: ${paper.title}\n\n`;
  spec += `**Paper ID:** ${paperId}\n`;
  spec += `**Authors:** ${(paper.authors ?? []).join(", ")}\n`;
  spec += `**Abstract:** ${(paper.abstract ?? "").slice(0, 500)}\n\n`;
  spec += `## Claims to Test\n\n`;

  for (const [i, claim] of enriched.entries()) {
    spec += `### Claim ${i + 1} (${claim.category ?? "unknown"})\n\n`;
    spec += `**Text:** ${claim.text}\n\n`;
    if (claim.value) spec += `**Value:** ${claim.value} ${claim.unit ?? ""}\n`;
    if (claim.evidence) spec += `**Evidence:** ${claim.evidence}\n`;
    if (claim.predicate) spec += `**Predicate:** ${claim.predicate}\n`;
    spec += `**Confidence:** ${claim.confidence ?? "?"}\n`;
    spec += `**Donto IRI:** ${claim.dontoIri ?? "none"}\n\n`;
  }

  spec += `## Shared Simulation Library\n\n`;
  spec += `**Library path:** \`${libDir}/\`\n\n`;
  if (libModules.length > 0) {
    spec += `The following reusable modules already exist from previous paper simulations:\n\n`;
    for (const m of libModules) {
      spec += `- \`${libDir}/${m}\`\n`;
    }
    spec += `\n**Read these modules first.** Import and reuse them instead of rewriting.\n`;
    spec += `Add \`sys.path.insert(0, "${libDir}")\` at the top of your simulation scripts.\n\n`;
  } else {
    spec += `No shared modules exist yet. You are the first run — any reusable code you write\n`;
    spec += `will be available to all future paper simulations.\n\n`;
  }

  spec += `## Instructions for Claude Code\n\n`;
  spec += `You are simulating claims from a scientific paper. For each testable claim:\n\n`;
  spec += `1. **Determine testability:** Is this claim testable with computation? Categories:\n`;
  spec += `   - "scaling_law": test with parameter sweep + log-log regression\n`;
  spec += `   - "numerical_prediction": test by computing the predicted value\n`;
  spec += `   - "comparative": test by implementing both models and comparing\n`;
  spec += `   - "algebraic": test with symbolic math / dimensional analysis\n`;
  spec += `   - "ml_benchmark": test by training models and comparing metrics\n`;
  spec += `   - "not_testable": skip\n\n`;
  spec += `2. **Check the shared library** at \`${libDir}/\` for existing utilities before writing new code.\n`;
  spec += `   Import reusable modules with: \`sys.path.insert(0, "${libDir}")\`\n\n`;
  spec += `3. **Write the simulation.** Use Python with numpy/scipy. For ML claims, use PyTorch if available.\n`;
  spec += `   - Always implement BOTH the baseline model and the proposed model\n`;
  spec += `   - Include convergence tests (run at 2+ resolutions)\n`;
  spec += `   - Include conservation/sanity checks\n`;
  spec += `   - Include parameter sweeps where applicable\n\n`;
  spec += `4. **Run the simulation** and collect results.\n\n`;
  spec += `5. **Judge the results** deterministically:\n`;
  spec += `   - "reproduced": simulation confirms claim within 5% tolerance\n`;
  spec += `   - "contradicted": simulation produces inconsistent results\n`;
  spec += `   - "fragile": result depends on parameters/resolution\n`;
  spec += `   - "underdetermined": not enough info to decide\n`;
  spec += `   - "not_simulable": can't test computationally\n\n`;
  spec += `6. **Extract reusable code into the shared library.** After finishing all simulations,\n`;
  spec += `   identify any functions or classes that would be useful for future papers and copy\n`;
  spec += `   them into \`${libDir}/\` as standalone modules. Good candidates:\n`;
  spec += `   - ODE/PDE solvers (Kuramoto, diffusion, wave equations, etc.)\n`;
  spec += `   - Parameter sweep runners with convergence testing\n`;
  spec += `   - Statistical comparison utilities (effect size, bootstrap CI, etc.)\n`;
  spec += `   - ML training loops with seed averaging\n`;
  spec += `   - Dimensional analysis checkers\n`;
  spec += `   - Result formatting / JSON output helpers\n`;
  spec += `   Each module should have a docstring explaining what it does and example usage.\n\n`;
  spec += `7. **Write results** to ${resultsPath} as JSON array:\n`;
  spec += `\`\`\`json\n`;
  spec += `[\n`;
  spec += `  {\n`;
  spec += `    "claim_index": 0,\n`;
  spec += `    "claim_text": "...",\n`;
  spec += `    "test_type": "scaling_law",\n`;
  spec += `    "verdict": "reproduced",\n`;
  spec += `    "confidence": 0.9,\n`;
  spec += `    "reason": "Fitted exponent 2.98 matches expected 3.0 within 1%",\n`;
  spec += `    "measured_value": 2.98,\n`;
  spec += `    "expected_value": 3.0,\n`;
  spec += `    "simulation_file": "sim_001.py",\n`;
  spec += `    "baseline_result": "...",\n`;
  spec += `    "proposed_result": "..."\n`;
  spec += `  }\n`;
  spec += `]\n`;
  spec += `\`\`\`\n\n`;
  spec += `Work in ${workDir}. Write simulation scripts there. Focus on the most testable claims first.\n`;
  spec += `Do not skip claims just because they're hard — build whatever physics/ML infrastructure you need.\n\n`;

  spec += `## Discord Reporting\n\n`;
  spec += `After writing results.json, send a full report to Discord via this webhook:\n\n`;
  spec += `\`\`\`\n`;
  spec += `https://discord.com/api/webhooks/1500500494471397467/v3uYy70jnidcnrBWqviVSfAQKhtoNnHZDlpm3X3unAZOFEEaB-ppFLqN7HeOgTODPIbH\n`;
  spec += `\`\`\`\n\n`;
  spec += `Send a POST with \`Content-Type: application/json\` and body \`{"content": "..."}\`.\n`;
  spec += `Discord has a 2000 character limit per message — split into multiple messages as needed.\n\n`;
  spec += `The report should include:\n`;
  spec += `1. **Header message:** Paper title, author, number of claims, overall verdict summary (reproduced/contradicted/fragile/underdetermined counts)\n`;
  spec += `2. **Per-claim messages:** For each claim, include the claim text (truncated), test type, verdict, confidence, key measurements, and a 1-2 sentence explanation of what the simulation found\n`;
  spec += `3. **Code highlights:** For the most interesting simulations (reproduced or contradicted), include a short code snippet or key numerical output showing the evidence\n`;
  spec += `4. **Final message:** Any reusable modules added to the shared library, and a link to the paper page: https://toiletpaper-web-587706120371.us-central1.run.app/papers/${paperId}\n\n`;
  spec += `Use markdown formatting (Discord supports it). Send messages sequentially — wait for each to succeed before sending the next.\n`;
  spec += `Use curl to send: \`curl -H "Content-Type: application/json" -d '{"content":"..."}' <webhook_url>\`\n`;

  writeFileSync(specPath, spec);
  console.log(`Spec written to ${specPath}`);
  console.log(`Work directory: ${workDir}`);

  // 5. Invoke Claude Code + stream JSONL to simulation_logs
  console.log(`\nInvoking Claude Code...\n`);

  const claudePrompt = `Read the simulation spec at ${specPath}. Build and run simulations for each testable claim in the paper "${paper.title}". Check the shared library at ${libDir}/ for reusable modules before writing new code. Write simulation scripts in ${workDir}. After all simulations are done, extract any reusable functions into ${libDir}/ as standalone Python modules with docstrings. Write final results to ${resultsPath}. Focus on the strongest testable claims first. Do not ask for confirmation — just build, run, and judge.`;

  const WEB_URL = process.env.WEB_URL ?? "https://toiletpaper-web-587706120371.us-central1.run.app";

  // Find the JSONL project dir for this workDir
  const encodedCwd = resolve(workDir).replace(/\//g, "-").replace(/^-/, "");
  const claudeProjectDir = join(homedir(), ".claude", "projects", encodedCwd);

  // Start tailing JSONL in background and POST events to the API
  let seq = 0;
  let tailInterval: ReturnType<typeof setInterval> | null = null;
  let lastSize = 0;

  function startJsonlTail() {
    tailInterval = setInterval(async () => {
      try {
        if (!existsSync(claudeProjectDir)) return;
        const files = readdirSync(claudeProjectDir).filter((f) => f.endsWith(".jsonl"));
        if (files.length === 0) return;
        const jsonlPath = join(claudeProjectDir, files[files.length - 1]);
        const { size } = await import("node:fs").then((fs) => fs.statSync(jsonlPath));
        if (size <= lastSize) return;

        const stream = createReadStream(jsonlPath, { start: lastSize });
        const rl = createInterface({ input: stream });
        const events: Array<{ seq: number; eventType: string; payload: unknown }> = [];

        for await (const line of rl) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            seq++;
            const eventType = parsed.type ?? "unknown";
            events.push({ seq, eventType, payload: parsed });
          } catch (_e) { /* skip malformed lines */ }
        }

        lastSize = size;

        if (events.length > 0) {
          await fetch(`${WEB_URL}/api/papers/${paperId}/simulation-log`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ events }),
          }).catch(() => { /* best effort */ });
        }
      } catch (_e) { /* non-fatal */ }
    }, 2000);
  }

  startJsonlTail();

  try {
    execSync(
      `claude --print -p "${claudePrompt.replace(/"/g, '\\"')}" --dangerously-skip-permissions`,
      {
        cwd: workDir,
        stdio: "inherit",
        timeout: 30 * 60 * 1000, // 30 minutes
        env: {
          ...process.env,
          DATABASE_URL,
          DONTOSRV_URL,
        },
      },
    );
  } catch (e) {
    console.error("Claude Code exited:", e instanceof Error ? e.message : e);
  }

  if (tailInterval) clearInterval(tailInterval);

  // 6. Read results and store in DB
  if (existsSync(resultsPath)) {
    console.log(`\nReading results from ${resultsPath}...`);
    const results = JSON.parse(readFileSync(resultsPath, "utf-8")) as Array<{
      claim_index: number;
      claim_text: string;
      test_type: string;
      verdict: string;
      confidence: number;
      reason: string;
      measured_value?: number;
      expected_value?: number;
      simulation_file?: string;
    }>;

    for (const r of results) {
      const claim = claims[r.claim_index];
      if (!claim) continue;

      await sql`
        INSERT INTO simulations (id, claim_id, method, result, verdict, metadata, created_at)
        VALUES (
          gen_random_uuid(),
          ${claim.id},
          ${`claude-code-${r.test_type}`},
          ${JSON.stringify({ reason: r.reason, measured: r.measured_value, expected: r.expected_value, confidence: r.confidence })}::jsonb,
          ${r.verdict === "reproduced" ? "confirmed" : r.verdict === "contradicted" ? "refuted" : "inconclusive"},
          ${JSON.stringify({ simulation_file: r.simulation_file, test_type: r.test_type })}::jsonb,
          NOW()
        )
      `;
    }

    // Update paper status
    await sql`UPDATE papers SET status = 'done', updated_at = NOW() WHERE id = ${paperId}`;

    console.log(`\nStored ${results.length} simulation results`);

    // Print summary
    const reproduced = results.filter((r) => r.verdict === "reproduced").length;
    const contradicted = results.filter((r) => r.verdict === "contradicted").length;
    const fragile = results.filter((r) => r.verdict === "fragile").length;
    console.log(`\n╔══════════════════════════════════════════╗`);
    console.log(`║  ${paper.title.slice(0, 38).padEnd(38)}  ║`);
    console.log(`╠══════════════════════════════════════════╣`);
    console.log(`║  Reproduced:    ${String(reproduced).padStart(4)}                    ║`);
    console.log(`║  Contradicted:  ${String(contradicted).padStart(4)}                    ║`);
    console.log(`║  Fragile:       ${String(fragile).padStart(4)}                    ║`);
    console.log(`║  Total tested:  ${String(results.length).padStart(4)}                    ║`);
    console.log(`╚══════════════════════════════════════════╝`);
  } else {
    console.log("\nNo results file found — Claude Code may not have completed.");
  }

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
