/**
 * Shared mapping from a raw `replication_units` row to a typed
 * ReplicationUnit. Used by both the live Codex job path
 * (run-codex-replication-job.ts) and the recovery path
 * (ingest-codex-results.ts) so unit hydration cannot drift between them.
 */

import type {
  ReplicationUnit,
  ReplicationUnitType,
} from "@toiletpaper/simulator";

export interface ReplicationUnitRow {
  id: string;
  paper_id: string;
  claim_iri: string;
  source_statement_ids: string[];
  domain: ReplicationUnit["domain"];
  unit_type: ReplicationUnitType;
  claim_text: string;
  evidence_quotes: string[];
  hypothesis: string;
  expected_outcome: string;
  falsification_criteria: string[];
  required_artifacts: ReplicationUnit["requiredArtifacts"];
  datasets: ReplicationUnit["datasets"];
  methods: ReplicationUnit["methods"];
  metrics: ReplicationUnit["metrics"];
  baselines: ReplicationUnit["baselines"];
  parameters: ReplicationUnit["parameters"];
  compute_budget: ReplicationUnit["computeBudget"];
  verifier_candidates: string[];
  planner: ReplicationUnit["planner"];
  state: ReplicationUnit["state"];
  blockers: ReplicationUnit["blockers"];
}

export function rowToUnit(row: ReplicationUnitRow): ReplicationUnit {
  return {
    id: row.id,
    paperId: row.paper_id,
    claimIri: row.claim_iri,
    sourceStatementIds: row.source_statement_ids ?? [],
    domain: row.domain,
    unitType: row.unit_type,
    claimText: row.claim_text,
    evidenceQuotes: row.evidence_quotes ?? [],
    hypothesis: row.hypothesis,
    expectedOutcome: row.expected_outcome,
    falsificationCriteria: row.falsification_criteria ?? [],
    requiredArtifacts: row.required_artifacts ?? [],
    datasets: row.datasets ?? [],
    methods: row.methods ?? [],
    metrics: row.metrics ?? [],
    baselines: row.baselines ?? [],
    parameters: row.parameters ?? [],
    computeBudget: row.compute_budget ?? { tier: "human" },
    verifierCandidates: row.verifier_candidates ?? [],
    planner: row.planner ?? {
      plannerId: "unknown",
      version: "0.0.0",
      source: "deterministic",
    },
    state: row.state,
    blockers: row.blockers ?? [],
  };
}
