import {
  pgTable,
  uuid,
  text,
  timestamp,
  doublePrecision,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";

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

export const verdictEnum = pgEnum("verdict", [
  "confirmed",
  "refuted",
  "inconclusive",
]);

export const papers = pgTable("papers", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  authors: text("authors").array(),
  abstract: text("abstract"),
  pdfUrl: text("pdf_url"),
  status: paperStatusEnum("status").default("uploaded").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const claims = pgTable("claims", {
  id: uuid("id").primaryKey().defaultRandom(),
  paperId: uuid("paper_id")
    .references(() => papers.id, { onDelete: "cascade" })
    .notNull(),
  text: text("text").notNull(),
  dontoSubjectIri: text("donto_subject_iri"),
  status: claimStatusEnum("status").default("pending").notNull(),
  confidence: doublePrecision("confidence"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const simulations = pgTable("simulations", {
  id: uuid("id").primaryKey().defaultRandom(),
  claimId: uuid("claim_id")
    .references(() => claims.id, { onDelete: "cascade" })
    .notNull(),
  method: text("method").notNull(),
  result: jsonb("result"),
  verdict: verdictEnum("verdict"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
