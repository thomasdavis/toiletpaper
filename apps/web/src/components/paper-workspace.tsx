"use client";

import { useState, useCallback, useMemo } from "react";
import { ClaimDrawer } from "./claim-drawer";
import type { SerializedClaim, SerializedSimulation } from "./claim-drawer";
import { FindingsPanel } from "./findings-panel";
import { ClaimsPanel } from "./claims-panel";
import { SimulationsPanel } from "./simulations-panel";
import { CodePanel } from "./code-panel";

interface DontoContextData {
  contextIri: string;
  kind: string;
  statementCount: number;
  dontoHistory: unknown;
}

interface Props {
  activeTab: string;
  paperId: string;
  claims: SerializedClaim[];
  simulations: SerializedSimulation[];
  dontoContext: DontoContextData | null;
}

export function PaperWorkspace({ activeTab, paperId, claims, simulations }: Props) {
  const [drawerClaim, setDrawerClaim] = useState<SerializedClaim | null>(null);

  const openDrawer = useCallback((claim: SerializedClaim) => setDrawerClaim(claim), []);
  const closeDrawer = useCallback(() => setDrawerClaim(null), []);

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
      </div>

      <ClaimDrawer
        claim={drawerClaim}
        open={drawerClaim !== null}
        onClose={closeDrawer}
        paperId={paperId}
      />
    </div>
  );
}
