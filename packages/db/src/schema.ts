import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  doublePrecision,
  integer,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ────────────────────────────────────────────────────────────────────────────
// Enums
// ────────────────────────────────────────────────────────────────────────────

export const paperStatusEnum = pgEnum("paper_status", [
  "uploaded",
  "extracting",
  "extracted",
  "simulating",
  "done",
  "error",
]);

export const claimStatusEnum = pgEnum("claim_status", [
  "pending",
  "asserted",
  "validated",
  "simulated",
  "error",
]);

/**
 * The eight-state verdict vocabulary from PRD-002. Existing
 * `confirmed`/`refuted` rows are migrated to `reproduced`/`contradicted`
 * by the data-migration step, so the enum carries the new values plus
 * the legacy ones for the transition window.
 */
export const verdictEnum = pgEnum("verdict", [
  // Signal — actual analyses
  "reproduced",
  "contradicted",
  "fragile",
  "inconclusive",
  // Meta — distinguishing kinds of "no useful answer"
  "not_applicable",
  "vacuous",
  "system_error",
  "untested",
  // Legacy values, retained for backfill window only
  "confirmed",
  "refuted",
]);

export const ingestStateEnum = pgEnum("ingest_state", [
  "queued",
  "running",
  "succeeded",
  "failed",
  "skipped",
]);

export const simJobStateEnum = pgEnum("sim_job_state", [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);

// ────────────────────────────────────────────────────────────────────────────
// papers
// ────────────────────────────────────────────────────────────────────────────

export const papers = pgTable(
  "papers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    authors: text("authors").array(),
    abstract: text("abstract"),
    pdfUrl: text("pdf_url"),
    status: paperStatusEnum("status").default("uploaded").notNull(),

    // PRD-001 — paper-level domain classification
    domain: text("domain").default("unknown").notNull(),
    domainConfidence: doublePrecision("domain_confidence"),
    domainClassifiedAt: timestamp("domain_classified_at", { withTimezone: true }),

    // PRD-004 — provenance about how we read the paper
    pageCount: integer("page_count"),
    bodyCharCount: integer("body_char_count"),
    extractorModel: text("extractor_model"),
    extractorVersion: text("extractor_version"),
    parserVersion: text("parser_version"),
    year: integer("year"),
    venue: text("venue"),
    arxivId: text("arxiv_id"),
    doi: text("doi"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    domainIdx: index("papers_domain_idx").on(t.domain),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// claims
// ────────────────────────────────────────────────────────────────────────────

export const claims = pgTable(
  "claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paperId: uuid("paper_id")
      .references(() => papers.id, { onDelete: "cascade" })
      .notNull(),
    text: text("text").notNull(),
    dontoSubjectIri: text("donto_subject_iri"),
    status: claimStatusEnum("status").default("pending").notNull(),
    confidence: doublePrecision("confidence"),

    // PRD-004 — structured fields mirrored from Donto so they survive
    // a Donto outage. All nullable; backfill is best-effort.
    canonicalText: text("canonical_text"),
    category: text("category").default("unknown").notNull(),
    testability: doublePrecision("testability"),
    testabilityReason: text("testability_reason"),
    predicate: text("predicate"),
    value: text("value"),
    unit: text("unit"),
    evidence: text("evidence"),
    page: integer("page"),
    sectionPath: text("section_path").array(),
    charStart: integer("char_start"),
    charEnd: integer("char_end"),
    extractorModel: text("extractor_model"),
    extractorVersion: text("extractor_version"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    categoryIdx: index("claims_category_idx").on(t.category),
    testableIdx: index("claims_paper_testable_idx").on(t.paperId, t.testability),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// simulations
// ────────────────────────────────────────────────────────────────────────────

export const simulations = pgTable(
  "simulations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    claimId: uuid("claim_id")
      .references(() => claims.id, { onDelete: "cascade" })
      .notNull(),
    /** legacy free-form method label; kept for backfill */
    method: text("method").notNull(),
    /** PRD-001 — registered simulator id; future writes should populate this */
    simulatorId: text("simulator_id"),
    /** PRD-006 — links a row to the run that produced it */
    runId: uuid("run_id"),
    /** PRD-006 — points at the previous "current" row this row replaces */
    replacesId: uuid("replaces_id"),
    result: jsonb("result"),
    verdict: verdictEnum("verdict"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    perRunUnique: uniqueIndex("simulations_unique_per_run")
      .on(t.claimId, t.simulatorId, t.runId)
      .where(sql`${t.runId} IS NOT NULL`),
    claimIdx: index("simulations_claim_idx").on(t.claimId),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// PRD-001 — router_decisions: an audit log of routing decisions
// ────────────────────────────────────────────────────────────────────────────

export const routerDecisions = pgTable(
  "router_decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paperId: uuid("paper_id")
      .references(() => papers.id, { onDelete: "cascade" })
      .notNull(),
    claimId: uuid("claim_id")
      .references(() => claims.id, { onDelete: "cascade" })
      .notNull(),
    paperDomain: text("paper_domain"),
    claimCategory: text("claim_category"),
    /** simulator ids the router considered */
    candidates: text("candidates").array().notNull(),
    /** simulator ids the router actually selected */
    selected: text("selected").array().notNull(),
    /** human-readable reason for the decision */
    reason: text("reason"),
    decidedAt: timestamp("decided_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    paperIdx: index("router_decisions_paper_idx").on(t.paperId),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// PRD-005 — paper_donto_ingest: per-paper Donto ingest state
// ────────────────────────────────────────────────────────────────────────────

export const paperDontoIngest = pgTable("paper_donto_ingest", {
  paperId: uuid("paper_id")
    .primaryKey()
    .references(() => papers.id, { onDelete: "cascade" }),
  state: ingestStateEnum("state").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  lastErrorCode: text("last_error_code"),
  lastErrorMessage: text("last_error_message"),
  documentId: text("document_id"),
  revisionId: text("revision_id"),
  agentId: text("agent_id"),
  runId: text("run_id"),
  statementCount: integer("statement_count").default(0).notNull(),
  spanCount: integer("span_count").default(0).notNull(),
  evidenceLinkCount: integer("evidence_link_count").default(0).notNull(),
  argumentCount: integer("argument_count").default(0).notNull(),
  certifiedCount: integer("certified_count").default(0).notNull(),
  shapeCheckCount: integer("shape_check_count").default(0).notNull(),
  obligationIds: text("obligation_ids").array().default([]).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ────────────────────────────────────────────────────────────────────────────
// PRD-006 — simulation_jobs: async work tracking
// ────────────────────────────────────────────────────────────────────────────

export const simulationJobs = pgTable(
  "simulation_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paperId: uuid("paper_id")
      .references(() => papers.id, { onDelete: "cascade" })
      .notNull(),
    /** "full" | "single_claim" | "single_simulator" | "missing_only" */
    scope: text("scope").notNull(),
    scopeArgs: jsonb("scope_args").default({}).notNull(),
    state: simJobStateEnum("state").notNull(),
    totalUnits: integer("total_units").default(0).notNull(),
    completedUnits: integer("completed_units").default(0).notNull(),
    failedUnits: integer("failed_units").default(0).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    triggeredBy: text("triggered_by"),
    errorSummary: text("error_summary"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    paperIdx: index("simulation_jobs_paper_idx").on(t.paperId, t.createdAt),
    activeIdx: index("simulation_jobs_active_idx")
      .on(t.state)
      .where(sql`${t.state} IN ('queued', 'running')`),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// PRD-009 — replication_units: Donto-native replication planning
// ────────────────────────────────────────────────────────────────────────────

export const replicationStateEnum = pgEnum("replication_state", [
  "planned",
  "blocked",
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);

export const replicationUnits = pgTable(
  "replication_units",
  {
    id: text("id").primaryKey(),
    paperId: uuid("paper_id")
      .references(() => papers.id, { onDelete: "cascade" })
      .notNull(),
    claimId: uuid("claim_id").references(() => claims.id, {
      onDelete: "set null",
    }),
    claimIri: text("claim_iri").notNull(),
    sourceStatementIds: text("source_statement_ids").array().default([]).notNull(),
    domain: text("domain").notNull(),
    unitType: text("unit_type").notNull(),
    claimText: text("claim_text").notNull(),
    evidenceQuotes: text("evidence_quotes").array().default([]).notNull(),
    hypothesis: text("hypothesis").notNull(),
    expectedOutcome: text("expected_outcome").notNull(),
    falsificationCriteria: text("falsification_criteria").array().default([]).notNull(),
    requiredArtifacts: jsonb("required_artifacts").default([]).notNull(),
    datasets: jsonb("datasets").default([]).notNull(),
    methods: jsonb("methods").default([]).notNull(),
    metrics: jsonb("metrics").default([]).notNull(),
    baselines: jsonb("baselines").default([]).notNull(),
    parameters: jsonb("parameters").default([]).notNull(),
    computeBudget: jsonb("compute_budget").notNull(),
    verifierCandidates: text("verifier_candidates").array().default([]).notNull(),
    planner: jsonb("planner").notNull(),
    state: replicationStateEnum("state").notNull(),
    blockers: jsonb("blockers").default([]).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    paperIdx: index("replication_units_paper_idx").on(t.paperId),
    stateIdx: index("replication_units_state_idx").on(t.state),
    domainIdx: index("replication_units_domain_idx").on(t.domain),
  }),
);
