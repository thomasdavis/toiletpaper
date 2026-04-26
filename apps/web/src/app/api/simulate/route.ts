import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { papers, claims, simulations } from "@toiletpaper/db";
import { eq } from "drizzle-orm";
import { getHistory } from "@/lib/donto";

export async function POST(req: Request) {
  const body = (await req.json()) as { paper_id: string };

  if (!body.paper_id) {
    return NextResponse.json({ error: "paper_id is required" }, { status: 400 });
  }

  const [paper] = await db.select().from(papers).where(eq(papers.id, body.paper_id));
  if (!paper) {
    return NextResponse.json({ error: "paper not found" }, { status: 404 });
  }

  const paperClaims = await db.select().from(claims).where(eq(claims.paperId, body.paper_id));
  if (paperClaims.length === 0) {
    return NextResponse.json({ error: "no claims extracted" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY not set" }, { status: 500 });
  }

  await db.update(papers)
    .set({ status: "simulating", updatedAt: new Date() })
    .where(eq(papers.id, paper.id));

  try {
    const enrichedClaims = await Promise.all(
      paperClaims.map(async (claim) => {
        let category = "quantitative";
        let evidence = "";
        let predicate: string | undefined;
        let value: string | undefined;
        let unit: string | undefined;

        if (claim.dontoSubjectIri) {
          try {
            const history = await getHistory(claim.dontoSubjectIri);
            if (history?.rows) {
              for (const row of history.rows) {
                const v = String(row.object_lit?.v ?? row.object_iri ?? "");
                switch (row.predicate) {
                  case "tp:category": category = v; break;
                  case "tp:evidence": evidence = v; break;
                  case "tp:predicate": predicate = v; break;
                  case "tp:value": value = v; break;
                  case "tp:unit": unit = v; break;
                }
              }
            }
          } catch (_e) { /* donto may be down */ }
        }

        return {
          id: claim.id,
          text: claim.text,
          category,
          confidence: claim.confidence ?? 0.5,
          evidence,
          predicate,
          value,
          unit,
        };
      }),
    );

    const { runPipeline } = await import("@toiletpaper/simulator");

    const result = await runPipeline({
      claims: enrichedClaims,
      paperAbstract: paper.abstract ?? "",
      apiKey,
    });

    for (const verdict of result.verdicts) {
      const matchingClaim = enrichedClaims.find((c) =>
        c.text.slice(0, 40) === verdict.statement?.slice(0, 40),
      );

      await db.insert(simulations).values({
        claimId: matchingClaim?.id ?? paperClaims[0].id,
        method: `tier-${verdict.tier}-${verdict.claimType}`,
        result: {
          fittedExponent: verdict.fittedExponent,
          expectedExponent: verdict.expectedExponent,
          dimensionalPass: verdict.dimensionalPass,
          convergencePass: verdict.convergencePass,
          conservationPass: verdict.conservationPass,
          baselineReproduced: verdict.baselineReproduced,
          proposedMatchesClaim: verdict.proposedMatchesClaim,
          confidence: verdict.confidence,
          reason: verdict.reason,
        },
        verdict: verdict.verdict === "reproduced"
          ? "confirmed"
          : verdict.verdict === "contradicted"
            ? "refuted"
            : "inconclusive",
        metadata: {
          plots: verdict.plots,
          tier: verdict.tier,
          claimType: verdict.claimType,
        },
      });
    }

    await db.update(papers)
      .set({ status: "done", updatedAt: new Date() })
      .where(eq(papers.id, paper.id));

    return NextResponse.json({
      summary: result.summary,
      verdicts: result.verdicts.map((v) => ({
        claim: v.statement?.slice(0, 100),
        verdict: v.verdict,
        reason: v.reason,
        tier: v.tier,
        confidence: v.confidence,
      })),
    });
  } catch (e) {
    console.error("Simulation failed:", e);
    await db.update(papers)
      .set({ status: "error", updatedAt: new Date() })
      .where(eq(papers.id, paper.id));

    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Simulation failed" },
      { status: 500 },
    );
  }
}
