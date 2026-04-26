import { Badge } from "@toiletpaper/ui";
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

  const categoryColor: Record<string, string> = {
    quantitative: "bg-blue-100 text-blue-800",
    comparative: "bg-purple-100 text-purple-800",
    causal: "bg-orange-100 text-orange-800",
    methodological: "bg-teal-100 text-teal-800",
    theoretical: "bg-indigo-100 text-indigo-800",
  };

  return (
    <div className="rounded-xl border border-stone-200 bg-white shadow-sm">
      <div className="p-5">
        <div className="flex items-start gap-3">
          <p className="flex-1 text-sm leading-relaxed">{claim.text}</p>
          <div className="flex shrink-0 flex-col items-end gap-1">
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
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${categoryColor[category] ?? "bg-stone-100 text-stone-600"}`}
              >
                {category}
              </span>
            )}
          </div>
        </div>

        {conf != null && (
          <div className="mt-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">Confidence</span>
              <div className="h-2 flex-1 rounded-full bg-stone-100">
                <div
                  className={`h-2 rounded-full ${conf >= 0.9 ? "bg-green-500" : conf >= 0.7 ? "bg-amber-500" : "bg-red-500"}`}
                  style={{ width: `${conf * 100}%` }}
                />
              </div>
              <span className="text-xs font-medium">
                {(conf * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        )}

        {(dontoData.value || dontoData.predicate || dontoData.evidence) && (
          <div className="mt-3 grid gap-2 border-t border-stone-100 pt-3 sm:grid-cols-2">
            {dontoData.predicate && (
              <div>
                <span className="text-xs text-muted">Predicate</span>
                <p className="font-mono text-xs">{dontoData.predicate}</p>
              </div>
            )}
            {dontoData.value && (
              <div>
                <span className="text-xs text-muted">Value</span>
                <p className="text-sm font-semibold">
                  {dontoData.value}
                  {dontoData.unit && (
                    <span className="ml-1 font-normal text-muted">
                      {dontoData.unit}
                    </span>
                  )}
                </p>
              </div>
            )}
            {dontoData.evidence && (
              <div className="sm:col-span-2">
                <span className="text-xs text-muted">Evidence</span>
                <p className="text-xs text-stone-600">{dontoData.evidence}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {claim.dontoSubjectIri && (
        <div className="border-t border-stone-100 px-5 py-2">
          <p className="font-mono text-xs text-muted">
            {claim.dontoSubjectIri}
          </p>
        </div>
      )}

      {claim.simulations.length > 0 && (
        <div className="border-t border-stone-100 px-5 py-3">
          <p className="mb-2 text-xs font-medium text-muted">Simulations</p>
          {claim.simulations.map((sim) => (
            <div key={sim.id} className="flex items-center gap-2 text-xs">
              <Badge
                variant={
                  sim.verdict === "confirmed"
                    ? "success"
                    : sim.verdict === "refuted"
                      ? "danger"
                      : "warning"
                }
              >
                {sim.verdict ?? "pending"}
              </Badge>
              <span className="text-muted">{sim.method}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
