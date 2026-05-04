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

  // 3b. Fetch all Donto statements for this paper's context
  let dontoStatements: Array<{ subject: string; predicate: string; object: string }> = [];
  try {
    const ctxResp = await fetch(`${DONTOSRV_URL}/history/tp:paper:${paperId}`);
    if (ctxResp.ok) {
      const ctxData = await ctxResp.json() as { rows: Array<{ subject: string; predicate: string; object_lit?: { v: unknown }; object_iri?: string }> };
      dontoStatements = (ctxData.rows ?? []).map(r => ({
        subject: r.subject,
        predicate: r.predicate,
        object: String(r.object_lit?.v ?? r.object_iri ?? ""),
      }));
    }
  } catch (_e) { /* dontosrv may be down */ }

  // 3c. Fetch original paper source text
  let paperSource = "";
  if (paper.pdf_url) {
    try {
      if (paper.pdf_url.startsWith("gs://")) {
        // GCS — fetch via signed URL or just note the path
        paperSource = `[Paper stored at ${paper.pdf_url} — not fetched in this run]`;
      } else {
        // Local file
        const localPath = join(process.cwd(), paper.pdf_url.replace(/^\//, ""));
        if (existsSync(localPath)) {
          paperSource = readFileSync(localPath, "utf-8");
        }
      }
    } catch (_e) { /* */ }
  }

  // 3d. Generate replication blueprint via LLM
  console.log("Generating replication blueprint...");
  interface BlueprintCluster {
    claim_ids: string[];
    test_strategy: "independent_implementation" | "proxy_simulation" | "static_check" | "algebraic";
    compute_tier: "cpu" | "gpu";
    required_data: string[];
    required_packages: string[];
    expected_outputs: string[];
    invalid_shortcuts: string[];
    minimum_valid_test: string;
  }
  interface Blueprint {
    clusters: BlueprintCluster[];
  }

  let blueprint: Blueprint | null = null;
  const XAI_API_KEY = process.env.XAI_API_KEY;
  if (XAI_API_KEY && enriched.length > 0) {
    const blueprintPrompt = `Given these ${enriched.length} claims from the paper "${paper.title}", create a replication blueprint.

For each claim or group of related claims, produce:
- claim_ids: which claim IDs to test together
- test_strategy: "independent_implementation" | "proxy_simulation" | "static_check" | "algebraic"
- compute_tier: "cpu" | "gpu"
- required_data: what datasets/inputs are needed
- required_packages: Python packages needed
- expected_outputs: what metrics to measure
- invalid_shortcuts: things the simulation must NOT do
- minimum_valid_test: the simplest test that would still be meaningful

Return JSON: { "clusters": [...] }

Claims:
${enriched.map((c) => `[${c.id}] ${c.text}`).join("\n")}`;

    try {
      const resp = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${XAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "grok-3-mini-fast",
          messages: [
            { role: "system", content: "You are a scientific replication planner. Return ONLY valid JSON, no markdown fences." },
            { role: "user", content: blueprintPrompt },
          ],
          temperature: 0.3,
        }),
      });
      if (resp.ok) {
        const data = (await resp.json()) as {
          choices: Array<{ message: { content: string } }>;
        };
        const raw = data.choices?.[0]?.message?.content ?? "";
        // Strip markdown fences if present
        const cleaned = raw.replace(/^```(?:json)?\s*\n?/gm, "").replace(/\n?```\s*$/gm, "").trim();
        blueprint = JSON.parse(cleaned) as Blueprint;
        console.log(`Blueprint generated: ${blueprint.clusters.length} cluster(s)`);

        // Store in DB
        await sql`
          INSERT INTO replication_blueprints (paper_id, blueprint, model_used)
          VALUES (${paperId}, ${JSON.stringify(blueprint)}::jsonb, 'grok-3-mini-fast')
        `;
        console.log("Blueprint saved to database.");
      } else {
        console.warn(`Blueprint LLM call failed: ${resp.status} ${resp.statusText}`);
      }
    } catch (e) {
      console.warn("Blueprint generation failed:", e instanceof Error ? e.message : e);
    }
  } else if (!XAI_API_KEY) {
    console.log("Skipping blueprint generation (XAI_API_KEY not set).");
  }

  // 4. Write simulation spec
  const simRoot = join(process.cwd(), ".simulations");
  const libDir = join(simRoot, "lib");
  const workDir = join(simRoot, paperId);
  mkdirSync(workDir, { recursive: true });
  mkdirSync(libDir, { recursive: true });

  const specPath = join(workDir, "spec.md");
  const resultsPath = join(workDir, "results.json");

  // Write paper source to work dir so Claude Code can read it
  if (paperSource && paperSource.length > 100) {
    writeFileSync(join(workDir, "paper.md"), paperSource);
  }

  // Scan shared lib for existing modules + load MANIFEST
  const libModules: string[] = [];
  let manifest: { modules: Record<string, { state: string; functions: string[] }> } | null = null;
  if (existsSync(libDir)) {
    const { readdirSync } = await import("node:fs");
    for (const f of readdirSync(libDir)) {
      if (f.endsWith(".py")) libModules.push(f);
    }
    const manifestPath = join(libDir, "MANIFEST.json");
    if (existsSync(manifestPath)) {
      try {
        manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
      } catch (_e) { /* malformed manifest */ }
    }
  }

  let spec = `# Simulation Spec: ${paper.title}\n\n`;
  spec += `**Paper ID:** ${paperId}\n`;
  spec += `**Authors:** ${(paper.authors ?? []).join(", ")}\n`;
  spec += `**Abstract:** ${(paper.abstract ?? "").slice(0, 500)}\n\n`;

  // Include original paper source reference
  if (existsSync(join(workDir, "paper.md"))) {
    spec += `## Original Paper\n\n`;
    spec += `The full paper source is at \`${join(workDir, "paper.md")}\`. Read it for full context on methodology, experimental setup, and results tables.\n\n`;
  }

  // Include Donto knowledge graph statements
  if (dontoStatements.length > 0) {
    spec += `## Donto Evidence Substrate (${dontoStatements.length} statements)\n\n`;
    spec += `These are the structured knowledge graph assertions extracted from this paper:\n\n`;
    spec += `\`\`\`\n`;
    for (const s of dontoStatements.slice(0, 200)) {
      spec += `${s.subject} → ${s.predicate} → ${s.object}\n`;
    }
    if (dontoStatements.length > 200) {
      spec += `... (${dontoStatements.length - 200} more statements)\n`;
    }
    spec += `\`\`\`\n\n`;
    spec += `Use these structured facts to inform your simulation design — they contain precise values, predicates, and relationships extracted from the paper.\n\n`;
  }

  spec += `## Claims to Test\n\n`;

  for (const [i, claim] of enriched.entries()) {
    spec += `### Claim ${i + 1} [id: ${claim.id}] (${claim.category ?? "unknown"})\n\n`;
    spec += `**Text:** ${claim.text}\n\n`;
    if (claim.value) spec += `**Value:** ${claim.value} ${claim.unit ?? ""}\n`;
    if (claim.evidence) spec += `**Evidence:** ${claim.evidence}\n`;
    if (claim.predicate) spec += `**Predicate:** ${claim.predicate}\n`;
    spec += `**Confidence:** ${claim.confidence ?? "?"}\n`;
    spec += `**Donto IRI:** ${claim.dontoIri ?? "none"}\n\n`;
  }

  // Include replication blueprint if generated
  if (blueprint) {
    spec += `## Replication Blueprint\n\n`;
    spec += `A replication plan was generated before this simulation run. **Follow this blueprint** — it specifies test strategies, required packages, and constraints for each claim cluster.\n\n`;
    for (const [ci, cluster] of blueprint.clusters.entries()) {
      spec += `### Cluster ${ci + 1}\n\n`;
      spec += `- **Claim IDs:** ${cluster.claim_ids.join(", ")}\n`;
      spec += `- **Test Strategy:** ${cluster.test_strategy}\n`;
      spec += `- **Compute Tier:** ${cluster.compute_tier}\n`;
      spec += `- **Required Data:** ${cluster.required_data.join(", ") || "none"}\n`;
      spec += `- **Required Packages:** ${cluster.required_packages.join(", ") || "none"}\n`;
      spec += `- **Expected Outputs:** ${cluster.expected_outputs.join(", ") || "none"}\n`;
      spec += `- **Minimum Valid Test:** ${cluster.minimum_valid_test}\n`;
      if (cluster.invalid_shortcuts.length > 0) {
        spec += `- **INVALID SHORTCUTS (do NOT do these):**\n`;
        for (const shortcut of cluster.invalid_shortcuts) {
          spec += `  - ${shortcut}\n`;
        }
      }
      spec += `\n`;
    }
  }

  spec += `## Shared Simulation Library\n\n`;
  spec += `**Library path:** \`${libDir}/\`\n\n`;
  if (libModules.length > 0) {
    spec += `The following reusable modules already exist from previous paper simulations:\n\n`;
    if (manifest) {
      for (const m of libModules) {
        const entry = manifest.modules[m];
        if (entry) {
          spec += `- \`${libDir}/${m}\` [**${entry.state}**] — ${entry.functions.join(", ")}\n`;
        } else {
          spec += `- \`${libDir}/${m}\` [unregistered]\n`;
        }
      }
      spec += `\n### Library Governance Rules\n\n`;
      spec += `Modules have states: \`generated\` → \`tested\` → \`reviewed\` → \`blessed\`\n\n`;
      spec += `- **\`blessed\` or \`tested\` modules:** import freely.\n`;
      spec += `- **\`generated\` modules:** only import with explicit justification in your simulation comments explaining why you trust this module for your use case.\n`;
      spec += `- When extracting new library code, **register it in MANIFEST.json** at \`${join(libDir, "MANIFEST.json")}\`:\n`;
      spec += `  - Set \`state\` to \`"generated"\`\n`;
      spec += `  - Set \`added_by_paper\` to \`"${paperId}"\`\n`;
      spec += `  - Set \`added_at\` to today's date\n`;
      spec += `  - Set \`has_tests\` to \`false\`\n`;
      spec += `  - List all exported functions in \`functions\`\n\n`;
    } else {
      for (const m of libModules) {
        spec += `- \`${libDir}/${m}\`\n`;
      }
    }
    spec += `\n**Read these modules first.** Import and reuse them instead of rewriting.\n`;
    spec += `Add \`sys.path.insert(0, "${libDir}")\` at the top of your simulation scripts.\n\n`;
  } else {
    spec += `No shared modules exist yet. You are the first run — any reusable code you write\n`;
    spec += `will be available to all future paper simulations.\n\n`;
  }

  spec += `## Simulation Templates\n\n`;
  spec += `Pre-built templates are available for common claim types at \`${libDir}/templates/\`:\n\n`;
  spec += `- **metric_recomputation.py**: for "achieves X% accuracy" claims — recomputes the metric and compares\n`;
  spec += `- **baseline_comparison.py**: for "outperforms Y by Z%" claims — runs both methods and compares\n`;
  spec += `- **scaling_law.py**: for "scales as O(n^k)" claims — fits power law on log-log scale\n`;
  spec += `- **seed_sensitivity.py**: for robustness claims — runs across multiple random seeds\n`;
  spec += `- **statistical_significance.py**: for "p < X, effect size d = Y" claims — recomputes statistics\n\n`;
  spec += `Import and call these instead of writing from scratch when the claim fits a template:\n`;
  spec += `\`\`\`python\n`;
  spec += `sys.path.insert(0, "${libDir}")\n`;
  spec += `from templates.metric_recomputation import test_metric_claim\n`;
  spec += `from templates.scaling_law import test_scaling_law\n`;
  spec += `\`\`\`\n\n`;
  spec += `Each template returns a result dict matching the toiletpaper results.json schema.\n`;
  spec += `You still need to write the \`compute_fn\` / \`run_fn\` that does the actual computation —\n`;
  spec += `the template handles verdict logic, tolerance checking, and output formatting.\n\n`;

  spec += `## Compute Environment\n\n`;
  spec += `You are running on **CPU only** (no GPU/TPU). This affects how you handle ML-heavy claims.\n\n`;
  spec += `For claims that can run on CPU (algebraic, scaling laws, small numerical sims): run them normally.\n\n`;
  spec += `For claims that **require GPU** (training neural networks, large matrix ops, CUDA kernels):\n`;
  spec += `- Mark them as \`not_evaluated\` with \`not_evaluated_reason: "compute_unavailable"\`\n`;
  spec += `- Write a **self-contained GPU script** named \`gpu_claim_<CLAIM_INDEX>.py\` in the work directory\n`;
  spec += `- The GPU script must:\n`;
  spec += `  - Be completely self-contained (all imports, all code, no external file deps)\n`;
  spec += `  - Install its own deps at the top: \`subprocess.check_call([sys.executable, "-m", "pip", "install", "torch", ...])\`\n`;
  spec += `  - Print a JSON result to stdout as its last output line, matching the results.json schema\n`;
  spec += `  - Complete within 15 minutes on an NVIDIA L4 GPU (24GB VRAM)\n`;
  spec += `  - Include a shebang line: \`#!/usr/bin/env python3\`\n`;
  spec += `- In the results.json entry for that claim, set:\n`;
  spec += `  - \`"compute_tier": "gpu"\`\n`;
  spec += `  - \`"gpu_script": "gpu_claim_<N>.py"\` (the filename you wrote)\n`;
  spec += `  - \`"verdict": "not_evaluated"\`\n`;
  spec += `  - \`"not_evaluated_reason": "compute_unavailable"\`\n\n`;
  spec += `These GPU scripts will be run separately on Cloud Run Jobs with an NVIDIA L4 GPU.\n`;
  spec += `Write them to be production-quality — they will execute unattended.\n\n`;

  spec += `## Instructions for Claude Code\n\n`;
  spec += `You are simulating claims from a scientific paper. For each testable claim:\n\n`;
  spec += `1. **Determine testability:** Is this claim testable with computation? Categories:\n`;
  spec += `   - "scaling_law": test with parameter sweep + log-log regression\n`;
  spec += `   - "numerical_prediction": test by computing the predicted value\n`;
  spec += `   - "comparative": test by implementing both models and comparing\n`;
  spec += `   - "algebraic": test with symbolic math / dimensional analysis\n`;
  spec += `   - "ml_benchmark": test by training models and comparing metrics (may need GPU — see Compute Environment)\n`;
  spec += `   - "not_testable": skip\n\n`;
  spec += `2. **Check the shared library** at \`${libDir}/\` for existing utilities before writing new code.\n`;
  spec += `   Import reusable modules with: \`sys.path.insert(0, "${libDir}")\`\n\n`;
  spec += `3. **Write the simulation.** Use Python with numpy/scipy. For ML claims, use PyTorch if available.\n`;
  spec += `   - Always implement BOTH the baseline model and the proposed model\n`;
  spec += `   - Include convergence tests (run at 2+ resolutions)\n`;
  spec += `   - Include conservation/sanity checks\n`;
  spec += `   - Include parameter sweeps where applicable\n`;
  spec += `   - If a claim needs GPU training, write a gpu_claim_*.py script instead (see Compute Environment)\n\n`;
  spec += `4. **Run the simulation** and collect results.\n\n`;
  spec += `5. **Judge the results** deterministically:\n`;
  spec += `   - "reproduced": simulation confirms claim within 5% tolerance\n`;
  spec += `   - "contradicted": simulation produces inconsistent results\n`;
  spec += `   - "fragile": result depends on parameters/resolution\n`;
  spec += `   - "underdetermined": not enough info to decide\n`;
  spec += `   - "not_evaluated": can't test computationally. MUST include a \`not_evaluated_reason\`:\n`;
  spec += `     - "no_data": required dataset is unavailable\n`;
  spec += `     - "compute_unavailable": needs GPU/TPU not available in this environment\n`;
  spec += `     - "theoretical_claim": requires formal mathematical proof, not simulation\n`;
  spec += `     - "insufficient_detail": paper doesn't specify enough methodology to implement\n`;
  spec += `     - "observational_claim": requires real-world data collection\n`;
  spec += `     - "out_of_scope": modality not supported (wet lab, clinical trial, etc.)\n\n`;
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
  spec += `7. **Classify evidence mode.** For each result, honestly assess how the verdict was produced:\n`;
  spec += `   - "exact_artifact": you used the paper's original code/data to reproduce\n`;
  spec += `   - "independent_implementation": you wrote new code implementing the paper's method with real data\n`;
  spec += `   - "proxy_simulation": simplified/synthetic experiment testing plausibility (e.g. reduced epochs, synthetic data, toy scale)\n`;
  spec += `   - "static_check": algebraic, dimensional analysis, or unit consistency check\n`;
  spec += `   - "formal_proof": symbolic/formal verification\n`;
  spec += `   - "insufficient": couldn't produce meaningful evidence\n\n`;
  spec += `   Also list concrete limitations of your evidence. Be honest — a 2-epoch run on synthetic data is NOT the same as a full reproduction.\n\n`;
  spec += `8. **Write results** to ${resultsPath} as JSON array:\n`;
  spec += `\`\`\`json\n`;
  spec += `[\n`;
  spec += `  {\n`;
  spec += `    "claim_id": "7a3f2b01-...",\n`;
  spec += `    "claim_index": 0,\n`;
  spec += `    "claim_text": "...",\n`;
  spec += `    "test_type": "scaling_law",\n`;
  spec += `    "verdict": "reproduced",\n`;
  spec += `    "evidence_mode": "proxy_simulation",\n`;
  spec += `    "limitations": ["synthetic data", "3 epochs instead of 100", "cpu-scale only"],\n`;
  spec += `    "confidence": 0.9,\n`;
  spec += `    "reason": "Fitted exponent 2.98 matches expected 3.0 within 1%",\n`;
  spec += `    "measured_value": 2.98,\n`;
  spec += `    "expected_value": 3.0,\n`;
  spec += `    "simulation_file": "sim_001.py",\n`;
  spec += `    "baseline_result": "...",\n`;
  spec += `    "proposed_result": "...",\n`;
  spec += `    "not_evaluated_reason": "no_data | compute_unavailable | theoretical_claim | insufficient_detail | observational_claim | out_of_scope (only when verdict is not_evaluated)",\n`;
  spec += `    "compute_tier": "cpu | gpu (omit or set to 'cpu' for normal claims; set to 'gpu' for claims that need GPU)",\n`;
  spec += `    "gpu_script": "gpu_claim_0.py (only when compute_tier is 'gpu' — the self-contained script to run on GPU)"\n`;
  spec += `  }\n`;
  spec += `]\n`;
  spec += `\`\`\`\n\n`;
  spec += `**IMPORTANT:** The \`claim_id\` field must be the exact UUID from the \`[id: ...]\` tag in the claim heading above. This is how results are matched back to the database.\n\n`;
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
  spec += `3. **Code report (IMPORTANT):** Dedicate 1-3 messages to describing the simulation code you wrote:\n`;
  spec += `   - List each simulation script file name and what it does (1 line each)\n`;
  spec += `   - For the most interesting scripts, show the core algorithm (10-20 lines of the key logic, not boilerplate)\n`;
  spec += `   - Explain what approach you took (e.g. "trained a 3-layer MLP on Split-MNIST with 5 epochs per task" or "swept coupling K from 0-5 and measured order parameter")\n`;
  spec += `   - Mention any shared library modules you reused or created\n`;
  spec += `   - Include key numerical outputs that drove the verdicts (e.g. "measured α=0.48, expected 0.5, within 4%")\n`;
  spec += `4. **Final message:** Link to the paper page: https://toiletpaper-web-587706120371.us-central1.run.app/papers/${paperId}\n\n`;
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
  // Claude encodes paths as: /foo/bar → -foo-bar (leading dash kept, dots become literal)
  const encodedCwd = resolve(workDir).replace(/\//g, "-");
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

  let claudeTimedOut = false;
  try {
    execSync(
      `claude --print -p "${claudePrompt.replace(/"/g, '\\"')}" --dangerously-skip-permissions`,
      {
        cwd: workDir,
        stdio: "inherit",
        timeout: 60 * 60 * 1000, // 60 minutes
        env: {
          ...process.env,
          DATABASE_URL,
          DONTOSRV_URL,
        },
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Claude Code exited:", msg);
    claudeTimedOut = msg.includes("ETIMEDOUT") || msg.includes("timed out");
    // On timeout, try to collect partial results
    if (msg.includes("ETIMEDOUT") || msg.includes("timed out")) {
      console.log("Attempting to collect partial results...");
      try {
        const collectScript = join(workDir, "collect_results.py");
        if (existsSync(collectScript)) {
          execSync(`python3 ${collectScript}`, { cwd: workDir, stdio: "inherit", timeout: 30_000 });
        } else {
          // Try to find and merge any *_output.json or results_*.json files
          const partials = readdirSync(workDir).filter(f =>
            (f.startsWith("results_") || f.endsWith("_output.json")) && f !== "results.json"
          );
          if (partials.length > 0) {
            let merged: unknown[] = [];
            for (const p of partials) {
              try {
                const data = JSON.parse(readFileSync(join(workDir, p), "utf-8"));
                merged = merged.concat(Array.isArray(data) ? data : [data]);
              } catch (_e) { /* skip */ }
            }
            if (merged.length > 0) {
              writeFileSync(resultsPath, JSON.stringify(merged, null, 2));
              console.log(`Merged ${merged.length} results from ${partials.length} partial files`);
            }
          }
        }
      } catch (_e) { /* best effort */ }
    }
  }

  if (tailInterval) clearInterval(tailInterval);

  // 6. Read results and store in DB via ingest-results.ts (uses fuzzy matching)
  if (existsSync(resultsPath)) {
    console.log(`\nIngesting results via ingest-results.ts...`);
    try {
      execSync(`npx tsx scripts/ingest-results.ts ${paperId}`, {
        cwd: join(workDir, "../.."),
        stdio: "inherit",
        timeout: 120_000,
        env: { ...process.env, DATABASE_URL, DONTOSRV_URL },
      });
    } catch (e) {
      console.error("Ingest failed:", e instanceof Error ? e.message : e);
    }

    // 6a. Run adversarial review (skip with --skip-review)
    if (!process.argv.includes("--skip-review")) {
      console.log("\nRunning adversarial review...\n");
      try {
        execSync(`npx tsx scripts/review-simulations.ts ${paperId}`, {
          cwd: join(workDir, "../.."),
          stdio: "inherit",
          timeout: 15 * 60 * 1000,
          env: { ...process.env, DATABASE_URL, DONTOSRV_URL },
        });
      } catch (e) {
        console.warn(
          "Review failed (non-fatal):",
          e instanceof Error ? e.message : e,
        );
      }
    } else {
      console.log("\nSkipping adversarial review (--skip-review flag set).");
    }
  } else {
    console.log("\nNo results file found — Claude Code may not have completed.");
  }

  // 6b. Upload simulation artifacts to GCS so they're accessible from Cloud Run
  const UPLOADS_BUCKET = process.env.UPLOADS_BUCKET;
  if (UPLOADS_BUCKET && existsSync(resultsPath)) {
    console.log("Uploading simulation artifacts to GCS...");
    const artifacts = readdirSync(workDir).filter(f =>
      f.endsWith('.py') || f.endsWith('.json') || f === 'spec.md' || f === 'paper.md'
    );
    let uploaded = 0;
    for (const f of artifacts) {
      const filePath = join(workDir, f);
      const gcsKey = `simulations/${paperId}/${f}`;
      try {
        execSync(
          `gcloud storage cp "${filePath}" "gs://${UPLOADS_BUCKET}/${gcsKey}" --quiet`,
          { timeout: 30_000 },
        );
        uploaded++;
      } catch (e) {
        console.warn(`  Failed to upload ${f}: ${e instanceof Error ? e.message : e}`);
      }
    }
    console.log(`  Uploaded ${uploaded}/${artifacts.length} artifacts to gs://${UPLOADS_BUCKET}/simulations/${paperId}/`);
  }

  // 7. Fallback Discord report — only if Claude Code didn't send one (timeout case)
  //    Claude Code sends its own AI-written report during normal runs (see spec.md).
  //    This fallback fires only when the process timed out.
  const DISCORD_WEBHOOK = "https://discord.com/api/webhooks/1500500494471397467/v3uYy70jnidcnrBWqviVSfAQKhtoNnHZDlpm3X3unAZOFEEaB-ppFLqN7HeOgTODPIbH";
  const timedOut = claudeTimedOut;
  if (existsSync(resultsPath) && timedOut) {
    console.log("Claude Code timed out — sending fallback Discord report...");
    try {
      const results = JSON.parse(readFileSync(resultsPath, "utf-8")) as Array<{
        claim_index: number; claim_text: string; test_type: string;
        verdict: string; confidence: number; reason: string;
        measured_value?: number; expected_value?: number; simulation_file?: string;
      }>;

      const verdicts: Record<string, number> = {};
      for (const r of results) verdicts[r.verdict] = (verdicts[r.verdict] ?? 0) + 1;

      let msg = `📄 **${paper.title}** _(fallback report — agent timed out)_\n\n`;
      msg += `🔗 ${WEB_URL}/papers/${paperId}\n\n`;
      msg += `**Summary:** ${results.length} claims tested`;
      for (const [v, c] of Object.entries(verdicts)) msg += ` | ${c} ${v}`;
      await sendDiscord(DISCORD_WEBHOOK, msg);
    } catch (e) {
      console.error("Fallback Discord report failed:", e instanceof Error ? e.message : e);
    }
  }

  await sql.end();
}

async function sendDiscord(webhook: string, content: string) {
  await fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: content.slice(0, 2000) }),
  });
  await new Promise(r => setTimeout(r, 1200));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
