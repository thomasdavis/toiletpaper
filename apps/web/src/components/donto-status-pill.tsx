import { db } from "@/lib/db";
import { paperDontoIngest } from "@toiletpaper/db";
import { eq } from "drizzle-orm";
import { Pill } from "@/components/brand";
import { DontoRetryButton } from "@/components/donto-retry-button";

interface Props {
  paperId: string;
}

/**
 * Per-paper Donto ingest status (PRD-005). Reads `paper_donto_ingest`
 * and renders a Pill that's color-coded by state.
 *
 * The retry button on `failed` is rendered as a separate client island
 * via <DontoRetryButton/>; this component stays a server component so
 * the dashboard / detail page can SSR it for free.
 */
export async function DontoStatusPill({ paperId }: Props) {
  let row;
  try {
    [row] = await db
      .select()
      .from(paperDontoIngest)
      .where(eq(paperDontoIngest.paperId, paperId));
  } catch {
    row = undefined;
  }

  if (!row) {
    return (
      <Pill tone="muted" dot>
        Donto · skipped
      </Pill>
    );
  }

  switch (row.state) {
    case "succeeded": {
      const stmts = row.statementCount ?? 0;
      const claims = stmts > 0 ? Math.max(1, Math.round(stmts / 7)) : 0;
      const perClaim = claims > 0 ? Math.round(stmts / claims) : 0;
      return (
        <Pill tone="green" dot>
          Donto · synced
          {perClaim > 0 ? ` · ${perClaim} quads/claim` : ""}
        </Pill>
      );
    }
    case "running":
    case "queued":
      return (
        <Pill tone="amber" dot>
          Donto · ingesting…
        </Pill>
      );
    case "failed":
      return (
        <span className="inline-flex items-center gap-1.5">
          <Pill tone="red" dot>
            Donto · {row.lastErrorCode ?? "ingest failed"}
          </Pill>
          <DontoRetryButton paperId={paperId} />
        </span>
      );
    case "skipped":
      return (
        <Pill tone="muted" dot>
          Donto · skipped
        </Pill>
      );
    default:
      return (
        <Pill tone="muted" dot>
          Donto · {row.state}
        </Pill>
      );
  }
}
