#!/usr/bin/env npx tsx
/**
 * manage-lib.ts — Manage the shared simulation library (.simulations/lib/)
 *
 * Usage:
 *   npx tsx scripts/manage-lib.ts list                   — show all modules with states
 *   npx tsx scripts/manage-lib.ts promote <module> <state> — change a module's state
 *   npx tsx scripts/manage-lib.ts test                   — run pytest on modules with test files
 *
 * States: generated → tested → reviewed → blessed
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const LIB_DIR = join(process.cwd(), ".simulations", "lib");
const MANIFEST_PATH = join(LIB_DIR, "MANIFEST.json");

const VALID_STATES = ["generated", "tested", "reviewed", "blessed"] as const;
type ModuleState = (typeof VALID_STATES)[number];

interface ModuleEntry {
  state: ModuleState;
  added_by_paper: string;
  added_at: string;
  has_tests: boolean;
  functions: string[];
}

interface Manifest {
  modules: Record<string, ModuleEntry>;
}

function loadManifest(): Manifest {
  if (!existsSync(MANIFEST_PATH)) {
    console.error(`MANIFEST.json not found at ${MANIFEST_PATH}`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf-8")) as Manifest;
}

function saveManifest(manifest: Manifest): void {
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
}

function listModules(): void {
  const manifest = loadManifest();
  const modules = Object.entries(manifest.modules);

  if (modules.length === 0) {
    console.log("No modules registered in MANIFEST.json");
    return;
  }

  // State colors for terminal output
  const stateLabel: Record<string, string> = {
    generated: "\x1b[33mgenerated\x1b[0m",
    tested: "\x1b[36mtested\x1b[0m",
    reviewed: "\x1b[34mreviewed\x1b[0m",
    blessed: "\x1b[32mblessed\x1b[0m",
  };

  console.log(`\nShared Library Modules (${modules.length} total)\n`);
  console.log("%-30s %-12s %-12s %-40s %s".replace(/%(-?\d+)s/g, (_, w) => {
    const width = parseInt(w);
    return width > 0 ? "".padEnd(width) : "";
  }));

  // Header
  const header = `${"Module".padEnd(30)} ${"State".padEnd(14)} ${"Tests".padEnd(8)} ${"Paper".padEnd(40)} Functions`;
  console.log(header);
  console.log("-".repeat(header.length + 10));

  for (const [name, entry] of modules) {
    const fileExists = existsSync(join(LIB_DIR, name));
    const existsMark = fileExists ? "" : " (MISSING)";
    const state = stateLabel[entry.state] ?? entry.state;
    const tests = entry.has_tests ? "yes" : "no";
    const paper = entry.added_by_paper.slice(0, 36);
    const fns = entry.functions.slice(0, 3).join(", ") +
      (entry.functions.length > 3 ? ` (+${entry.functions.length - 3})` : "");

    console.log(
      `${(name + existsMark).padEnd(30)} ${state.padEnd(14 + 9)} ${tests.padEnd(8)} ${paper.padEnd(40)} ${fns}`
    );
  }

  // Check for unregistered .py files
  const registered = new Set(Object.keys(manifest.modules));
  const onDisk = readdirSync(LIB_DIR).filter(
    (f) => f.endsWith(".py") && !f.startsWith("__")
  );
  const unregistered = onDisk.filter((f) => !registered.has(f));
  if (unregistered.length > 0) {
    console.log(`\nUnregistered modules on disk: ${unregistered.join(", ")}`);
    console.log("Add them to MANIFEST.json to track their state.");
  }

  console.log();
}

function promoteModule(moduleName: string, newState: string): void {
  if (!VALID_STATES.includes(newState as ModuleState)) {
    console.error(
      `Invalid state "${newState}". Valid states: ${VALID_STATES.join(" → ")}`
    );
    process.exit(1);
  }

  const manifest = loadManifest();

  if (!manifest.modules[moduleName]) {
    console.error(`Module "${moduleName}" not found in MANIFEST.json`);
    console.error(`Registered modules: ${Object.keys(manifest.modules).join(", ")}`);
    process.exit(1);
  }

  const entry = manifest.modules[moduleName];
  const oldState = entry.state;
  const oldIdx = VALID_STATES.indexOf(oldState);
  const newIdx = VALID_STATES.indexOf(newState as ModuleState);

  if (newIdx < oldIdx) {
    console.warn(
      `Warning: demoting "${moduleName}" from ${oldState} to ${newState}`
    );
  }

  entry.state = newState as ModuleState;
  saveManifest(manifest);
  console.log(`${moduleName}: ${oldState} → ${newState}`);
}

function runTests(): void {
  const manifest = loadManifest();
  const testDir = join(LIB_DIR, "tests");

  if (!existsSync(testDir)) {
    console.log("No tests/ directory found at .simulations/lib/tests/");
    console.log("Create test files as test_<module>.py in that directory.");
    return;
  }

  const testFiles = readdirSync(testDir).filter(
    (f) => f.startsWith("test_") && f.endsWith(".py")
  );

  if (testFiles.length === 0) {
    console.log("No test files (test_*.py) found in .simulations/lib/tests/");
    return;
  }

  console.log(`Found ${testFiles.length} test file(s): ${testFiles.join(", ")}`);
  console.log();

  try {
    execSync(`python3 -m pytest ${testDir} -v --tb=short`, {
      cwd: LIB_DIR,
      stdio: "inherit",
      timeout: 120_000,
    });
    console.log("\nAll tests passed.");

    // Update has_tests for modules that have test files
    for (const tf of testFiles) {
      const moduleName = tf.replace("test_", "").replace(".py", "") + ".py";
      if (manifest.modules[moduleName]) {
        manifest.modules[moduleName].has_tests = true;
      }
    }
    saveManifest(manifest);
  } catch (e) {
    console.error("\nSome tests failed.");
    process.exit(1);
  }
}

// --- Main ---
const [subcommand, ...args] = process.argv.slice(2);

switch (subcommand) {
  case "list":
    listModules();
    break;
  case "promote":
    if (args.length < 2) {
      console.error("Usage: manage-lib.ts promote <module.py> <state>");
      console.error(`States: ${VALID_STATES.join(" → ")}`);
      process.exit(1);
    }
    promoteModule(args[0], args[1]);
    break;
  case "test":
    runTests();
    break;
  default:
    console.error("Usage: npx tsx scripts/manage-lib.ts <list|promote|test>");
    console.error("");
    console.error("Subcommands:");
    console.error("  list                       Show all modules with their states");
    console.error("  promote <module> <state>   Change a module's state");
    console.error("  test                       Run pytest on all test files");
    console.error("");
    console.error(`States: ${VALID_STATES.join(" → ")}`);
    process.exit(1);
}
