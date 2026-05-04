"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { TabGroup } from "@toiletpaper/ui";
import { ClaimDrawer, getClaimVerdict } from "./claim-drawer";
import type { SerializedClaim, SerializedSimulation } from "./claim-drawer";
import { FindingsPanel } from "./findings-panel";
import { ClaimsPanel } from "./claims-panel";
import { SimulationsPanel } from "./simulations-panel";
import { CodePanel } from "./code-panel";
import { DontoDetails } from "./donto-details";
import { DontoContextInfo } from "./donto-context-info";

// ── Types ──────────────────────────────────────────────────────────

interface DontoContextData {
  contextIri: string;
  kind: string;
  statementCount: number;
  dontoHistory: {
    subject: string;
    count: number;
    rows: Array<{
      predicate: string;
      object_iri?: string | null;
      object_lit?: { v: unknown; dt: string } | null;
    }>;
  } | null;
}

interface Props {
  paperId: string;
  claims: SerializedClaim[];
  simulations: SerializedSimulation[];
  dontoContext: DontoContextData | null;
}

// ── Tab definitions ────────────────────────────────────────────────

const TAB_IDS = ["findings", "claims", "simulations", "code", "evidence"] as const;
type TabId = (typeof TAB_IDS)[number];

const TABS = [
  { id: "findings" as const, label: "Findings" },
  { id: "claims" as const, label: "Claims" },
  { id: "simulations" as const, label: "Simulations" },
  { id: "code" as const, label: "Code" },
  { id: "evidence" as const, label: "Evidence" },
];

function getHashTab(): TabId {
  if (typeof window === "undefined") return "findings";
  const hash = window.location.hash.replace("#", "");
  return TAB_IDS.includes(hash as TabId) ? (hash as TabId) : "findings";
}

// ── Component ──────────────────────────────────────────────────────

export function PaperWorkspace({ paperId, claims, simulations, dontoContext }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("findings");
  const [drawerClaim, setDrawerClaim] = useState<SerializedClaim | null>(null);

  // Sync tab from URL hash on mount
  useEffect(() => {
    setActiveTab(getHashTab());
    const onHash = () => setActiveTab(getHashTab());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const handleTabChange = useCallback((id: string) => {
    const tabId = id as TabId;
    setActiveTab(tabId);
    window.history.replaceState(null, "", `#${tabId}`);
  }, []);

  const openDrawer = useCallback((claim: SerializedClaim) => {
    setDrawerClaim(claim);
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerClaim(null);
  }, []);

  // Build sim files list from simulation metadata for code tab
  const simFiles = useMemo(() => {
    const files: { simId: string; filename: string; method: string; verdict: string | null }[] = [];
    for (const sim of simulations) {
      const meta = sim.metadata as Record<string, unknown> | null;
      const filename = meta?.simulation_file as string | undefined;
      if (filename) {
        files.push({ simId: sim.id, filename, method: sim.method, verdict: sim.verdict });
      }
    }
    return files;
  }, [simulations]);

  return (
    <div>
      {/* Tab bar */}
      <TabGroup
        tabs={TABS}
        value={activeTab}
        onChange={handleTabChange}
        className="mb-6"
      />

      {/* Tab panels */}
      <div className="min-h-[400px]">
        {activeTab === "findings" && (
          <FindingsPanel claims={claims} onClaimClick={openDrawer} />
        )}

        {activeTab === "claims" && (
          <ClaimsPanel claims={claims} onClaimClick={openDrawer} />
        )}

        {activeTab === "simulations" && (
          <SimulationsPanel claims={claims} simulations={simulations} />
        )}

        {activeTab === "code" && (
          <CodePanel paperId={paperId} simFiles={simFiles} />
        )}

        {activeTab === "evidence" && (
          <div className="space-y-4">
            {dontoContext && (
              <DontoContextInfo
                contextIri={dontoContext.contextIri}
                kind={dontoContext.kind}
                statementCount={dontoContext.statementCount}
                dontoHistory={dontoContext.dontoHistory}
              />
            )}
            <DontoDetails paperId={paperId} />
          </div>
        )}
      </div>

      {/* Claim drawer */}
      <ClaimDrawer
        claim={drawerClaim}
        open={drawerClaim !== null}
        onClose={closeDrawer}
        paperId={paperId}
      />
    </div>
  );
}
