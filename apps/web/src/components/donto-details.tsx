"use client";

import { useState, useCallback, type ReactNode } from "react";
import { HelpTip } from "@/components/help-tip";

// ── Types ───────────────────────────────────────────────────────────

interface EvidenceData {
  tripleCount: number;
  extractionModel: string | null;
  extractionVersion: string | null;
  parserVersion: string | null;
  bodyCharCount: string | null;
  agent: string | null;
  title: string | null;
  docType: string | null;
  predicates: string[];
}

interface LifecycleStage {
  key: string;
  label: string;
  description: string;
  complete: boolean;
}

interface LifecycleData {
  stages: LifecycleStage[];
  completedCount: number;
  totalStages: number;
  openObligationCount: number;
  argumentCount: number;
  statementCount: number;
}

interface ArgumentEntry {
  statementId: string;
  attackCount: number;
  supportCount: number;
  netPressure: number;
}

interface ObligationEntry {
  id: string;
  statementId?: string;
  type: string;
  priority: number;
  context: string;
}

// ── Collapsible section ─────────────────────────────────────────────

function DontoSection({
  title,
  icon,
  count,
  children,
  onExpand,
  loading,
  helpTip,
}: {
  title: string;
  icon: string;
  count?: number;
  children: ReactNode;
  onExpand?: () => void;
  loading?: boolean;
  helpTip?: string;
}) {
  const [open, setOpen] = useState(false);

  const handleToggle = useCallback(() => {
    const next = !open;
    setOpen(next);
    if (next && onExpand) onExpand();
  }, [open, onExpand]);

  return (
    <div className="rounded-lg border border-[#E8E5DE] bg-white">
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-[#FAFAF8] cursor-pointer"
      >
        <span className="text-base">{icon}</span>
        <span className="flex-1 text-sm font-semibold text-[#3D3D3D]">
          {title}
        </span>
        {helpTip && (
          <span onClick={(e) => e.stopPropagation()}>
            <HelpTip text={helpTip} />
          </span>
        )}
        {count != null && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#4A6FA5] px-1.5 text-[11px] font-medium text-white">
            {count}
          </span>
        )}
        <span
          className="text-xs text-[#6B6B6B] transition-transform"
          style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          &#9656;
        </span>
      </button>
      {open && (
        <div className="border-t border-[#E8E5DE] px-5 py-4">
          {loading ? (
            <div className="flex items-center gap-2 py-4">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#4A6FA5] border-t-transparent" />
              <span className="text-sm text-[#6B6B6B]">Loading...</span>
            </div>
          ) : (
            children
          )}
        </div>
      )}
    </div>
  );
}

// ── Evidence Chain section ──────────────────────────────────────────

function EvidenceChainContent({ data }: { data: EvidenceData }) {
  const items: { label: string; value: string }[] = [];

  if (data.extractionModel) items.push({ label: "Model", value: String(data.extractionModel) });
  if (data.extractionVersion) items.push({ label: "Version", value: String(data.extractionVersion) });
  if (data.parserVersion) items.push({ label: "Parser", value: String(data.parserVersion) });
  if (data.bodyCharCount) items.push({ label: "Body chars", value: Number(data.bodyCharCount).toLocaleString() });
  if (data.agent) items.push({ label: "Agent", value: String(data.agent) });
  if (data.docType) items.push({ label: "Type", value: data.docType.replace("tp:", "") });

  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-[#6B6B6B]">
        {data.tripleCount} triples in knowledge graph
      </div>
      {items.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {items.map((item) => (
            <div key={item.label}>
              <div className="text-[11px] font-medium uppercase tracking-wide text-[#999]">
                {item.label}
              </div>
              <div className="text-sm text-[#3D3D3D]">{item.value}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-[#6B6B6B]">
          Paper entity present in graph but no extraction metadata found.
        </div>
      )}
      {data.predicates.length > 0 && (
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-[#999]">
            Predicates
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {data.predicates.map((p) => (
              <span
                key={p}
                className="inline-block rounded bg-[#F5F3EF] px-1.5 py-0.5 font-mono text-[11px] text-[#6B6B6B]"
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Lifecycle Progress section ──────────────────────────────────────

function LifecycleContent({ data }: { data: LifecycleData }) {
  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-[#6B6B6B]">
        {data.completedCount} of {data.totalStages} stages complete
      </div>
      {/* Progress bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-[#E8E5DE]">
        <div
          className="h-full rounded-full bg-[#2D6A4F] transition-all"
          style={{ width: `${(data.completedCount / data.totalStages) * 100}%` }}
        />
      </div>
      {/* Stage list */}
      <div className="space-y-1.5">
        {data.stages.map((stage) => (
          <div key={stage.key} className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{
                backgroundColor: stage.complete ? "#2D6A4F" : "#D4D0C8",
              }}
            />
            <span
              className="text-sm"
              style={{
                color: stage.complete ? "#3D3D3D" : "#999",
              }}
            >
              {stage.label}
            </span>
            <span className="ml-auto text-[11px] text-[#999]">
              {stage.description}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Arguments section ───────────────────────────────────────────────

function ArgumentsContent({ data }: { data: ArgumentEntry[] }) {
  if (data.length === 0) {
    return (
      <div className="text-sm text-[#6B6B6B]">
        No argument connections found yet.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {data.map((arg) => (
        <div
          key={arg.statementId}
          className="flex items-center gap-3 rounded border border-[#E8E5DE] bg-[#FAFAF8] px-3 py-2"
        >
          <span className="font-mono text-xs text-[#6B6B6B]">
            {arg.statementId.slice(0, 8)}...
          </span>
          <div className="flex-1" />
          {arg.supportCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded bg-[#D4EDDA] px-1.5 py-0.5 text-[11px] font-medium text-[#2D6A4F]">
              {arg.supportCount} support{arg.supportCount !== 1 ? "s" : ""}
            </span>
          )}
          {arg.attackCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded bg-[#F8D7DA] px-1.5 py-0.5 text-[11px] font-medium text-[#9B2226]">
              {arg.attackCount} attack{arg.attackCount !== 1 ? "s" : ""}
            </span>
          )}
          <span
            className="text-xs font-medium"
            style={{
              color: arg.netPressure > 0 ? "#2D6A4F" : arg.netPressure < 0 ? "#9B2226" : "#6B6B6B",
            }}
          >
            net: {arg.netPressure > 0 ? "+" : ""}{arg.netPressure.toFixed(2)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Obligations section ─────────────────────────────────────────────

function ObligationsContent({ data }: { data: ObligationEntry[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-[#2D6A4F]">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#2D6A4F]" />
        All obligations resolved
      </div>
    );
  }

  const priorityColors: Record<number, string> = {
    1: "#9B2226",
    2: "#CA6702",
    3: "#6B6B6B",
  };

  return (
    <div className="space-y-2">
      {data.map((obl) => (
        <div
          key={obl.id}
          className="flex items-center gap-3 rounded border border-[#E8E5DE] bg-[#FAFAF8] px-3 py-2"
        >
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{
              backgroundColor: priorityColors[obl.priority] ?? "#6B6B6B",
            }}
          />
          <span className="text-sm font-medium text-[#3D3D3D]">
            {obl.type.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
          </span>
          <span className="flex-1" />
          <span className="rounded bg-[#FFF3CD] px-1.5 py-0.5 text-[11px] font-medium text-[#856404]">
            open
          </span>
          {obl.priority <= 2 && (
            <span className="text-[11px] text-[#999]">
              P{obl.priority}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────

export function DontoDetails({ paperId }: { paperId: string }) {
  const [evidenceData, setEvidenceData] = useState<EvidenceData | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceLoaded, setEvidenceLoaded] = useState(false);

  const [lifecycleData, setLifecycleData] = useState<LifecycleData | null>(null);
  const [lifecycleLoading, setLifecycleLoading] = useState(false);
  const [lifecycleLoaded, setLifecycleLoaded] = useState(false);

  const [argumentsData, setArgumentsData] = useState<ArgumentEntry[]>([]);
  const [argumentsLoading, setArgumentsLoading] = useState(false);
  const [argumentsLoaded, setArgumentsLoaded] = useState(false);

  const [obligationsData, setObligationsData] = useState<ObligationEntry[]>([]);
  const [obligationsLoading, setObligationsLoading] = useState(false);
  const [obligationsLoaded, setObligationsLoaded] = useState(false);

  const loadEvidence = useCallback(async () => {
    if (evidenceLoaded) return;
    setEvidenceLoading(true);
    try {
      const r = await fetch(`/api/papers/${paperId}/donto?section=evidence`);
      if (r.ok) {
        const json = await r.json();
        setEvidenceData(json.evidence);
      }
    } catch { /* ignore */ }
    setEvidenceLoading(false);
    setEvidenceLoaded(true);
  }, [paperId, evidenceLoaded]);

  const loadLifecycle = useCallback(async () => {
    if (lifecycleLoaded) return;
    setLifecycleLoading(true);
    try {
      const r = await fetch(`/api/papers/${paperId}/lifecycle`);
      if (r.ok) {
        setLifecycleData(await r.json());
      }
    } catch { /* ignore */ }
    setLifecycleLoading(false);
    setLifecycleLoaded(true);
  }, [paperId, lifecycleLoaded]);

  const loadArguments = useCallback(async () => {
    if (argumentsLoaded) return;
    setArgumentsLoading(true);
    try {
      const r = await fetch(`/api/papers/${paperId}/donto?section=arguments`);
      if (r.ok) {
        const json = await r.json();
        setArgumentsData(json.arguments ?? []);
      }
    } catch { /* ignore */ }
    setArgumentsLoading(false);
    setArgumentsLoaded(true);
  }, [paperId, argumentsLoaded]);

  const loadObligations = useCallback(async () => {
    if (obligationsLoaded) return;
    setObligationsLoading(true);
    try {
      const r = await fetch(`/api/papers/${paperId}/donto?section=obligations`);
      if (r.ok) {
        const json = await r.json();
        setObligationsData(json.obligations ?? []);
      }
    } catch { /* ignore */ }
    setObligationsLoading(false);
    setObligationsLoaded(true);
  }, [paperId, obligationsLoaded]);

  return (
    <div className="space-y-3">
      <h3 className="text-base font-semibold text-[#3D3D3D]">
        Donto Evidence Substrate
      </h3>

      <DontoSection
        title="Evidence Chain"
        helpTip="The provenance trail: which model extracted the claims, from what document revision, linked to which text spans."
        icon="&#128279;"
        count={evidenceData?.tripleCount}
        onExpand={loadEvidence}
        loading={evidenceLoading}
      >
        {evidenceData ? (
          <EvidenceChainContent data={evidenceData} />
        ) : (
          <div className="text-sm text-[#6B6B6B]">No evidence data available.</div>
        )}
      </DontoSection>

      <DontoSection
        title="Lifecycle Progress"
        helpTip="11 stages from raw observation to formal verification. Each stage requires specific evidence (extraction run, confidence score, shape validation, etc.)"
        icon="&#9679;"
        count={lifecycleData ? lifecycleData.completedCount : undefined}
        onExpand={loadLifecycle}
        loading={lifecycleLoading}
      >
        {lifecycleData ? (
          <LifecycleContent data={lifecycleData} />
        ) : (
          <div className="text-sm text-[#6B6B6B]">No lifecycle data available.</div>
        )}
      </DontoSection>

      <DontoSection
        title="Arguments"
        helpTip="Logical connections between claims and simulation results. 'Supports' means simulation evidence backs the claim. 'Rebuts' means simulation contradicts it."
        icon="&#9878;"
        count={argumentsLoaded ? argumentsData.length : undefined}
        onExpand={loadArguments}
        loading={argumentsLoading}
      >
        <ArgumentsContent data={argumentsData} />
      </DontoSection>

      <DontoSection
        title="Proof Obligations"
        helpTip="Outstanding verification tasks. 'needs-source-support' means the claim needs stronger evidence. 'needs-replication' means the simulation result was fragile."
        icon="&#9888;"
        count={obligationsLoaded ? obligationsData.length : undefined}
        onExpand={loadObligations}
        loading={obligationsLoading}
      >
        <ObligationsContent data={obligationsData} />
      </DontoSection>
    </div>
  );
}
