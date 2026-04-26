import {
  Card,
  CardContent,
  Heading,
  StatCard,
  Stack,
  Text,
} from "@toiletpaper/ui";
import type { simulations } from "@toiletpaper/db";

type Simulation = typeof simulations.$inferSelect;

interface VerdictSummaryProps {
  simulations: Simulation[];
  totalClaims: number;
}

function mapVerdict(verdict: string | null) {
  if (verdict === "confirmed") return "reproduced";
  if (verdict === "refuted") return "contradicted";
  return "undetermined";
}

export function VerdictSummary({ simulations: sims, totalClaims }: VerdictSummaryProps) {
  if (sims.length === 0) return null;

  // Count unique claims with simulations
  const claimIds = new Set(sims.map((s) => s.claimId));
  const testedCount = claimIds.size;

  // Count by verdict (use the best verdict per claim)
  const claimVerdicts = new Map<string, string>();
  for (const sim of sims) {
    const existing = claimVerdicts.get(sim.claimId);
    const mapped = mapVerdict(sim.verdict);
    // Priority: reproduced > contradicted > undetermined
    if (!existing) {
      claimVerdicts.set(sim.claimId, mapped);
    } else if (mapped === "reproduced" && existing !== "reproduced") {
      claimVerdicts.set(sim.claimId, mapped);
    } else if (mapped === "contradicted" && existing === "undetermined") {
      claimVerdicts.set(sim.claimId, mapped);
    }
  }

  const reproduced = Array.from(claimVerdicts.values()).filter((v) => v === "reproduced").length;
  const contradicted = Array.from(claimVerdicts.values()).filter((v) => v === "contradicted").length;
  const undetermined = Array.from(claimVerdicts.values()).filter((v) => v === "undetermined").length;
  const untested = totalClaims - testedCount;

  const total = reproduced + contradicted + undetermined;
  const reproducedPct = total > 0 ? (reproduced / total) * 100 : 0;
  const contradictedPct = total > 0 ? (contradicted / total) * 100 : 0;
  const undeterminedPct = total > 0 ? (undetermined / total) * 100 : 0;

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
              className="border-l-2 border-l-[var(--color-reproduced)]"
            />
            <StatCard
              label="Contradicted"
              value={contradicted}
              className="border-l-2 border-l-[var(--color-contradicted)]"
            />
            <StatCard
              label="Inconclusive"
              value={undetermined + untested}
              className="border-l-2 border-l-[var(--color-undetermined)]"
            />
          </div>

          {/* Horizontal stacked bar */}
          <div>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-[var(--color-rule-faint)]">
              {reproducedPct > 0 && (
                <div
                  className="bg-[var(--color-reproduced)] transition-all"
                  style={{ width: `${reproducedPct}%` }}
                  title={`Reproduced: ${reproduced}`}
                />
              )}
              {contradictedPct > 0 && (
                <div
                  className="bg-[var(--color-contradicted)] transition-all"
                  style={{ width: `${contradictedPct}%` }}
                  title={`Contradicted: ${contradicted}`}
                />
              )}
              {undeterminedPct > 0 && (
                <div
                  className="bg-[var(--color-undetermined)] transition-all"
                  style={{ width: `${undeterminedPct}%` }}
                  title={`Inconclusive: ${undetermined}`}
                />
              )}
            </div>
            <Stack direction="horizontal" gap={4} className="mt-2">
              <Stack direction="horizontal" align="center" gap={1}>
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--color-reproduced)]" />
                <Text size="xs" color="muted">Reproduced ({reproduced})</Text>
              </Stack>
              <Stack direction="horizontal" align="center" gap={1}>
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--color-contradicted)]" />
                <Text size="xs" color="muted">Contradicted ({contradicted})</Text>
              </Stack>
              <Stack direction="horizontal" align="center" gap={1}>
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--color-undetermined)]" />
                <Text size="xs" color="muted">Inconclusive ({undetermined})</Text>
              </Stack>
            </Stack>
          </div>
        </Stack>
      </CardContent>
    </Card>
  );
}
