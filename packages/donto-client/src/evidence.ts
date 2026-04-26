// ── Documents ───────────────────────────────────────────────────────

export interface RegisterDocumentInput {
  iri: string;
  media_type?: string;
  label?: string;
  source_url?: string;
  language?: string;
}

export interface RegisterDocumentResponse {
  document_id: string;
  iri: string;
}

export async function registerDocument(
  baseUrl: string,
  input: RegisterDocumentInput,
): Promise<RegisterDocumentResponse> {
  const r = await fetch(`${baseUrl}/documents/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok)
    throw new Error(
      `dontosrv /documents/register: ${r.status} ${r.statusText}`,
    );
  return (await r.json()) as RegisterDocumentResponse;
}

// ── Revisions ───────────────────────────────────────────────────────

export interface CreateRevisionInput {
  document_id: string;
  body?: string;
  parser_version?: string;
}

export interface CreateRevisionResponse {
  revision_id: string;
}

export async function createRevision(
  baseUrl: string,
  input: CreateRevisionInput,
): Promise<CreateRevisionResponse> {
  const r = await fetch(`${baseUrl}/documents/revision`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok)
    throw new Error(
      `dontosrv /documents/revision: ${r.status} ${r.statusText}`,
    );
  return (await r.json()) as CreateRevisionResponse;
}

// ── Agents ──────────────────────────────────────────────────────────

export interface RegisterAgentInput {
  iri: string;
  agent_type?: string;
  label?: string;
  model_id?: string;
}

export interface RegisterAgentResponse {
  agent_id: string;
  iri: string;
}

export async function registerAgent(
  baseUrl: string,
  input: RegisterAgentInput,
): Promise<RegisterAgentResponse> {
  const r = await fetch(`${baseUrl}/agents/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok)
    throw new Error(
      `dontosrv /agents/register: ${r.status} ${r.statusText}`,
    );
  return (await r.json()) as RegisterAgentResponse;
}

export interface BindAgentInput {
  agent_id: string;
  context: string;
  role?: string;
}

export interface BindAgentResponse {
  ok: boolean;
}

export async function bindAgent(
  baseUrl: string,
  input: BindAgentInput,
): Promise<BindAgentResponse> {
  const r = await fetch(`${baseUrl}/agents/bind`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok)
    throw new Error(`dontosrv /agents/bind: ${r.status} ${r.statusText}`);
  return (await r.json()) as BindAgentResponse;
}

// ── Evidence links ──────────────────────────────────────────────────

export interface LinkSpanInput {
  statement_id: string;
  span_id: string;
  link_type?: string;
  confidence?: number;
  context?: string;
}

export interface LinkSpanResponse {
  link_id: string;
}

export async function linkSpan(
  baseUrl: string,
  input: LinkSpanInput,
): Promise<LinkSpanResponse> {
  const r = await fetch(`${baseUrl}/evidence/link/span`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok)
    throw new Error(
      `dontosrv /evidence/link/span: ${r.status} ${r.statusText}`,
    );
  return (await r.json()) as LinkSpanResponse;
}

export interface EvidenceLink {
  link_id: string;
  link_type: string;
  target_document_id?: string;
  target_span_id?: string;
  target_run_id?: string;
  target_statement_id?: string;
  confidence?: number;
}

export interface EvidenceForStatementResponse {
  evidence: EvidenceLink[];
}

export async function evidenceForStatement(
  baseUrl: string,
  statementId: string,
): Promise<EvidenceForStatementResponse> {
  const r = await fetch(
    `${baseUrl}/evidence/${encodeURIComponent(statementId)}`,
  );
  if (!r.ok)
    throw new Error(
      `dontosrv /evidence/${statementId}: ${r.status} ${r.statusText}`,
    );
  return (await r.json()) as EvidenceForStatementResponse;
}

// ── Arguments ───────────────────────────────────────────────────────

export interface AssertArgumentInput {
  source: string;
  target: string;
  relation: string;
  context?: string;
  strength?: number;
  agent_id?: string;
  evidence?: unknown;
}

export interface AssertArgumentResponse {
  argument_id: string;
}

export async function assertArgument(
  baseUrl: string,
  input: AssertArgumentInput,
): Promise<AssertArgumentResponse> {
  const r = await fetch(`${baseUrl}/arguments/assert`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok)
    throw new Error(
      `dontosrv /arguments/assert: ${r.status} ${r.statusText}`,
    );
  return (await r.json()) as AssertArgumentResponse;
}

export interface ArgumentEntry {
  argument_id: string;
  source: string;
  target: string;
  relation: string;
  strength?: number;
  context: string;
}

export interface ArgumentsForStatementResponse {
  arguments: ArgumentEntry[];
}

export async function argumentsForStatement(
  baseUrl: string,
  statementId: string,
): Promise<ArgumentsForStatementResponse> {
  const r = await fetch(
    `${baseUrl}/arguments/${encodeURIComponent(statementId)}`,
  );
  if (!r.ok)
    throw new Error(
      `dontosrv /arguments/${statementId}: ${r.status} ${r.statusText}`,
    );
  return (await r.json()) as ArgumentsForStatementResponse;
}

export interface FrontierEntry {
  statement_id: string;
  attack_count: number;
  support_count: number;
  net_pressure: number;
}

export interface ArgumentsFrontierResponse {
  frontier: FrontierEntry[];
}

export async function argumentsFrontier(
  baseUrl: string,
): Promise<ArgumentsFrontierResponse> {
  const r = await fetch(`${baseUrl}/arguments/frontier`);
  if (!r.ok)
    throw new Error(
      `dontosrv /arguments/frontier: ${r.status} ${r.statusText}`,
    );
  return (await r.json()) as ArgumentsFrontierResponse;
}

// ── Obligations ─────────────────────────────────────────────────────

export interface EmitObligationInput {
  statement_id: string;
  obligation_type: string;
  context?: string;
  priority?: number;
  detail?: unknown;
  assigned_agent?: string;
}

export interface EmitObligationResponse {
  obligation_id: string;
}

export async function emitObligation(
  baseUrl: string,
  input: EmitObligationInput,
): Promise<EmitObligationResponse> {
  const r = await fetch(`${baseUrl}/obligations/emit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok)
    throw new Error(
      `dontosrv /obligations/emit: ${r.status} ${r.statusText}`,
    );
  return (await r.json()) as EmitObligationResponse;
}

export interface ResolveObligationInput {
  obligation_id: string;
  resolved_by?: string;
  status?: string;
}

export interface ResolveObligationResponse {
  resolved: boolean;
}

export async function resolveObligation(
  baseUrl: string,
  input: ResolveObligationInput,
): Promise<ResolveObligationResponse> {
  const r = await fetch(`${baseUrl}/obligations/resolve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok)
    throw new Error(
      `dontosrv /obligations/resolve: ${r.status} ${r.statusText}`,
    );
  return (await r.json()) as ResolveObligationResponse;
}

export interface OpenObligationsInput {
  obligation_type?: string;
  context?: string;
  limit?: number;
}

export interface ObligationEntry {
  obligation_id: string;
  statement_id?: string;
  obligation_type: string;
  priority: number;
  context: string;
  assigned_agent?: string;
}

export interface OpenObligationsResponse {
  obligations: ObligationEntry[];
}

export async function openObligations(
  baseUrl: string,
  input: OpenObligationsInput = {},
): Promise<OpenObligationsResponse> {
  const r = await fetch(`${baseUrl}/obligations/open`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok)
    throw new Error(
      `dontosrv /obligations/open: ${r.status} ${r.statusText}`,
    );
  return (await r.json()) as OpenObligationsResponse;
}

export interface ObligationSummaryEntry {
  obligation_type: string;
  status: string;
  count: number;
}

export interface ObligationSummaryResponse {
  summary: ObligationSummaryEntry[];
}

export async function obligationSummary(
  baseUrl: string,
): Promise<ObligationSummaryResponse> {
  const r = await fetch(`${baseUrl}/obligations/summary`);
  if (!r.ok)
    throw new Error(
      `dontosrv /obligations/summary: ${r.status} ${r.statusText}`,
    );
  return (await r.json()) as ObligationSummaryResponse;
}

// ── Claim cards ─────────────────────────────────────────────────────

export interface ClaimCard {
  [key: string]: unknown;
}

export async function getClaimCard(
  baseUrl: string,
  claimId: string,
): Promise<ClaimCard> {
  const r = await fetch(
    `${baseUrl}/claim/${encodeURIComponent(claimId)}`,
  );
  if (!r.ok)
    throw new Error(
      `dontosrv /claim/${claimId}: ${r.status} ${r.statusText}`,
    );
  return (await r.json()) as ClaimCard;
}
