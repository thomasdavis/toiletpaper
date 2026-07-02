import {
  Card,
  CardContent,
  Heading,
  StatCard,
  Stack,
  Text,
} from "@toiletpaper/ui";
import type { simulations } from "@toiletpaper/db";
import { isSignal, normalizeVerdict } from "@/lib/verdict";

type Simulation = typeof simulations.$inferSelect;

interface VerdictSummaryProps {
  simulations: Simulation[];
  totalClaims: number;
}

function resultReason(result: unknown): string | null {
  return result && typeof result === "object" && result !== null
    ? ((result as Record<string, unknown>).reason as string | null | undefined) ?? null
    : null;
}

export function VerdictSummary({ simulations: sims, totalClaims }: VerdictSummaryProps) {
  if (sims.length === 0) return null;

  // Count by signal verdict only. Meta rows such as not_applicable and
  // untested are useful routing output, but they are not completed tests.
  const claimVerdicts = new Map<string, string>();
  for (const sim of sims) {
    const mapped = normalizeVerdict(sim.verdict, sim.metadata, resultReason(sim.result));
    if (!isSignal(mapped)) continue;
    const existing = claimVerdicts.get(sim.claimId);
    // Priority: reproduced > contradicted > inconclusive
    if (!existing) {
      claimVerdicts.set(sim.claimId, mapped);
    } else if (mapped === "reproduced" && existing !== "reproduced") {
      claimVerdicts.set(sim.claimId, mapped);
    } else if (mapped === "contradicted" && existing === "inconclusive") {
      claimVerdicts.set(sim.claimId, mapped);
    }
  }

  const reproduced = Array.from(claimVerdicts.values()).filter((v) => v === "reproduced").length;
  const contradicted = Array.from(claimVerdicts.values()).filter((v) => v === "contradicted").length;
  const inconclusive = Array.from(claimVerdicts.values()).filter((v) => v === "inconclusive").length;
  const testedCount = claimVerdicts.size;
  const noSignal = totalClaims - testedCount;

  const total = reproduced + contradicted + inconclusive;
  const reproducedPct = total > 0 ? (reproduced / total) * 100 : 0;
  const contradictedPct = total > 0 ? (contradicted / total) * 100 : 0;
  const inconclusivePct = total > 0 ? (inconclusive / total) * 100 : 0;

  return (
    <Card>
      <CardContent className="p-6">
        <Stack gap={5}>
          <Heading level={5}>Verdict Summary</Heading>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Tested" value={testedCount} unit={`of ${totalClaims}`} />
            <StatCard
              label="Reproduced"
              value={reproduced}
              className="border-l-2 border-l-[#2D6A4F]"
            />
            <StatCard
              label="Contradicted"
              value={contradicted}
              className="border-l-2 border-l-[#9B2226]"
            />
            <StatCard
              label="No Signal"
              value={noSignal}
              className="border-l-2 border-l-[#6B6B6B]"
            />
          </div>

          {/* Horizontal stacked bar */}
          <div>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-[#E8E5DE]">
              {reproducedPct > 0 && (
                <div
                  className="bg-[#2D6A4F] transition-all"
                  style={{ width: `${reproducedPct}%` }}
                  title={`Reproduced: ${reproduced}`}
                />
              )}
              {contradictedPct > 0 && (
                <div
                  className="bg-[#9B2226] transition-all"
                  style={{ width: `${contradictedPct}%` }}
                  title={`Contradicted: ${contradicted}`}
                />
              )}
              {inconclusivePct > 0 && (
                <div
                  className="bg-[#6B6B6B] transition-all"
                  style={{ width: `${inconclusivePct}%` }}
                  title={`Inconclusive: ${inconclusive}`}
                />
              )}
            </div>
            <div className="mt-2 flex items-center gap-4">
              <div className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#2D6A4F]" />
                <span className="text-xs text-[#6B6B6B]">Reproduced ({reproduced})</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#9B2226]" />
                <span className="text-xs text-[#6B6B6B]">Contradicted ({contradicted})</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#6B6B6B]" />
                <span className="text-xs text-[#6B6B6B]">Inconclusive ({inconclusive})</span>
              </div>
            </div>
          </div>
        </Stack>
      </CardContent>
    </Card>
  );
}
