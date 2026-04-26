interface Props {
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

export function DontoContextInfo({
  contextIri,
  kind,
  statementCount,
  dontoHistory,
}: Props) {
  const authors =
    dontoHistory?.rows
      .filter((r) => r.predicate === "schema:author")
      .map((r) => String(r.object_lit?.v ?? "")) ?? [];

  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 p-5">
      <h3 className="text-sm font-semibold text-stone-800">
        Donto Knowledge Graph
      </h3>
      <div className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
        <div>
          <span className="text-muted">Context</span>
          <p className="font-mono text-xs">{contextIri}</p>
        </div>
        <div>
          <span className="text-muted">Kind</span>
          <p>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                kind === "candidate"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-blue-100 text-blue-800"
              }`}
            >
              {kind}
            </span>
          </p>
        </div>
        <div>
          <span className="text-muted">Statements</span>
          <p className="font-semibold">{statementCount}</p>
        </div>
      </div>
      {dontoHistory && dontoHistory.count > 0 && (
        <div className="mt-3 border-t border-stone-200 pt-3">
          <p className="text-xs text-muted">
            Paper entity has {dontoHistory.count} triples
            {authors.length > 0 && (
              <> &middot; {authors.length} authors in graph</>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
