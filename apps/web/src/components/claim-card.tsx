import {
  Badge,
  Card,
  CardContent,
  Label,
  Text,
  Code,
  ProgressBar,
  VerdictBadge,
  Stack,
  Divider,
} from "@toiletpaper/ui";
import type { simulations } from "@toiletpaper/db";
import { getHistory } from "@/lib/donto";

interface Claim {
  id: string;
  text: string;
  status: string;
  confidence: number | null;
  dontoSubjectIri: string | null;
  simulations: (typeof simulations.$inferSelect)[];
}

export async function ClaimCard({ claim }: { claim: Claim }) {
  let dontoData: {
    category?: string;
    evidence?: string;
    predicate?: string;
    value?: string;
    unit?: string;
    confidence?: string;
  } = {};

  if (claim.dontoSubjectIri) {
    try {
      const history = await getHistory(claim.dontoSubjectIri);
      if (history?.rows) {
        for (const row of history.rows) {
          const val = String(row.object_lit?.v ?? row.object_iri ?? "");
          switch (row.predicate) {
            case "tp:category":
              dontoData.category = val;
              break;
            case "tp:evidence":
              dontoData.evidence = val;
              break;
            case "tp:predicate":
              dontoData.predicate = val;
              break;
            case "tp:value":
              dontoData.value = val;
              break;
            case "tp:unit":
              dontoData.unit = val;
              break;
            case "tp:confidence":
              dontoData.confidence = val;
              break;
          }
        }
      }
    } catch { /* dontosrv may be down */ }
  }

  const conf = claim.confidence ?? (dontoData.confidence ? parseFloat(dontoData.confidence) : null);
  const category = dontoData.category;

  const categoryVariant: Record<string, "default" | "success" | "warning" | "danger" | "muted"> = {
    quantitative: "default",
    comparative: "default",
    causal: "warning",
    methodological: "muted",
    theoretical: "default",
  };

  return (
    <Card>
      <CardContent className="p-5">
        <Stack direction="horizontal" align="start" gap={3}>
          <Text size="sm" leading="relaxed" className="flex-1">{claim.text}</Text>
          <Stack align="end" gap={1} className="shrink-0">
            <Badge
              variant={
                claim.status === "asserted"
                  ? "success"
                  : claim.status === "error"
                    ? "danger"
                    : "muted"
              }
            >
              {claim.status}
            </Badge>
            {category && (
              <Badge variant={categoryVariant[category] ?? "muted"}>
                {category}
              </Badge>
            )}
          </Stack>
        </Stack>

        {conf != null && (
          <div className="mt-3">
            <Stack direction="horizontal" align="center" gap={2}>
              <Label size="xs">Confidence</Label>
              <ProgressBar
                value={conf * 100}
                color={conf >= 0.9 ? "success" : conf >= 0.7 ? "warning" : "error"}
                className="flex-1"
              />
              <Text size="xs" weight="medium" as="span">
                {(conf * 100).toFixed(0)}%
              </Text>
            </Stack>
          </div>
        )}

        {(dontoData.value || dontoData.predicate || dontoData.evidence) && (
          <>
            <Divider />
            <div className="grid gap-2 sm:grid-cols-2">
              {dontoData.predicate && (
                <div>
                  <Label size="xs">Predicate</Label>
                  <Code>{dontoData.predicate}</Code>
                </div>
              )}
              {dontoData.value && (
                <div>
                  <Label size="xs">Value</Label>
                  <Text size="sm" weight="semibold">
                    {dontoData.value}
                    {dontoData.unit && (
                      <Text as="span" color="muted" weight="normal" className="ml-1">
                        {dontoData.unit}
                      </Text>
                    )}
                  </Text>
                </div>
              )}
              {dontoData.evidence && (
                <div className="sm:col-span-2">
                  <Label size="xs">Evidence</Label>
                  <Text size="xs" color="light">{dontoData.evidence}</Text>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>

      {claim.dontoSubjectIri && (
        <div className="border-t border-stone-100 px-5 py-2">
          <Code>{claim.dontoSubjectIri}</Code>
        </div>
      )}

      {claim.simulations.length > 0 && (
        <div className="border-t border-stone-100 px-5 py-3">
          <Label size="xs" className="mb-2 block">Simulations</Label>
          <Stack gap={2}>
            {claim.simulations.map((sim) => (
              <Stack key={sim.id} direction="horizontal" align="center" gap={2}>
                <VerdictBadge
                  verdict={
                    sim.verdict === "confirmed"
                      ? "reproduced"
                      : sim.verdict === "refuted"
                        ? "contradicted"
                        : "undetermined"
                  }
                />
                <Text size="xs" color="muted">{sim.method}</Text>
              </Stack>
            ))}
          </Stack>
        </div>
      )}
    </Card>
  );
}
