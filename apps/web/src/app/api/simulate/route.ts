import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { papers, claims, simulations, routerDecisions, replicationUnits } from "@toiletpaper/db";
import { eq } from "drizzle-orm";
import { getHistory } from "@/lib/donto";
import { DONTOSRV_URL } from "@toiletpaper/donto-client";
import {
  assertArgument,
  emitObligation,
} from "@toiletpaper/donto-client/evidence";
import { ensurePaperDomain, isPhysicsDomain } from "@/lib/router/classify";
import {
  buildReplicationUnitsFromDonto,
  type DontoStatementInput,
} from "@toiletpaper/simulator";

/** Assert simulation verdict quads into donto for a claim. */
async function ingestVerdictToDonto(
  dontoSubjectIri: string,
  paperId: string,
  verdict: string,
  reason: string,
  confidence: number,
  measured?: number,
  expected?: number,
) {
  const srvUrl = DONTOSRV_URL;
  const context = `tp:paper:${paperId}:claims`;

  try {
    // 1. Assert verdict quad
    await fetch(`${srvUrl}/assert`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subject: dontoSubjectIri,
        predicate: "tp:simulationVerdict",
        object_lit: { v: verdict, dt: "xsd:string" },
        context,
      }),
    });

    // 2. Assert reason quad
    await fetch(`${srvUrl}/assert`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subject: dontoSubjectIri,
        predicate: "tp:verdictReason",
        object_lit: { v: reason, dt: "xsd:string" },
        context,
      }),
    });

    // 3. Assert measured/expected if available
    if (measured != null) {
      await fetch(`${srvUrl}/assert`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject: dontoSubjectIri,
          predicate: "tp:measuredValue",
          object_lit: { v: String(measured), dt: "xsd:string" },
          context,
        }),
      });
    }
    if (expected != null) {
      await fetch(`${srvUrl}/assert`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject: dontoSubjectIri,
          predicate: "tp:expectedValue",
          object_lit: { v: String(expected), dt: "xsd:string" },
          context,
        }),
      });
    }

    // 4. Wire argument (supports/rebuts) via dontosrv HTTP
    // Get the claim's claimText statement to use as argument target
    const historyRes = await fetch(
      `${srvUrl}/history/${encodeURIComponent(dontoSubjectIri)}`,
      { headers: { accept: "application/json" } },
    );
    if (historyRes.ok) {
      const history = (await historyRes.json()) as {
        rows: Array<{ statement_id: string; predicate: string; tx_hi?: string | null }>;
      };
      const claimStmt = history.rows.find(
        (r) => r.predicate === "tp:claimText" && !r.tx_hi,
      );
      const verdictStmt = history.rows.find(
        (r) => r.predicate === "tp:simulationVerdict" && !r.tx_hi,
      );

      if (claimStmt && verdictStmt) {
        const relation = verdict === "reproduced" ? "supports" : verdict === "contradicted" ? "rebuts" : null;
        if (relation) {
          const strength = verdict === "reproduced" ? Math.min(confidence, 1.0) : Math.min(confidence * 0.8, 1.0);
          await assertArgument(srvUrl, {
            source: verdictStmt.statement_id,
            target: claimStmt.statement_id,
            relation,
            context,
            strength,
          });
        }
      }

      // 7. Emit obligation for fragile claims
      const claimStmtForObl = claimStmt;
      if ((verdict === "fragile" || verdict === "numerically_fragile") && claimStmtForObl) {
        await emitObligation(srvUrl, {
          statement_id: claimStmtForObl.statement_id,
          obligation_type: "needs-replication",
          context,
        });
      }
    }
  } catch (_e) {
    // dontosrv may be down — do not block the simulation pipeline
  }
}

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

  await db.update(papers).set({ status: "simulating", updatedAt: new Date() }).where(eq(papers.id, paper.id));

  // ── Domain gate (PRD-001) ──────────────────────────────────────────
  // Classify the paper once and refuse to run physics simulators on
  // papers outside the physics-adjacent domains. Out-of-domain claims
  // are recorded as `not_applicable` in the simulations table so the
  // UI can be honest about what was and wasn't tested.
  const sampleClaims = paperClaims.slice(0, 12).map((c) => c.text);
  const domain = await ensurePaperDomain(
    paper.id,
    paper.title,
    paper.abstract ?? null,
    sampleClaims,
    apiKey,
  );

  if (!isPhysicsDomain(domain.domain)) {
    // Mark every claim not_applicable; record one router decision per claim.
    const naRows = paperClaims.map((c) => ({
      claimId: c.id,
      method: "router-not-applicable",
      simulatorId: "router-not-applicable",
      verdict: "not_applicable" as const,
      result: {
        reason: `paper domain '${domain.domain}' is not in scope for any registered simulator`,
        confidence: 0,
      },
      metadata: { paper_domain: domain.domain, classifier_reason: domain.reason },
    }));
    if (naRows.length > 0) {
      await db.insert(simulations).values(naRows);
    }
    await db.insert(routerDecisions).values(
      paperClaims.map((c) => ({
        paperId: paper.id,
        claimId: c.id,
        paperDomain: domain.domain,
        candidates: ["mhd-harris-sheet-reconnection", "mhd-mri-shearing-box", "mhd-dynamo-onset"],
        selected: [],
        reason: `paper domain '${domain.domain}' not in physics-adjacent set`,
      })),
    );
    // PRD-009 — build replication plans for non-physics papers
    const statements: DontoStatementInput[] = [];
    for (const claim of paperClaims) {
      if (!claim.dontoSubjectIri) continue;
      try {
        const h = await getHistory(claim.dontoSubjectIri);
        for (const r of h?.rows ?? []) {
          statements.push({
            statementId: r.statement_id,
            subject: r.subject,
            predicate: r.predicate,
            object_iri: r.object_iri,
            object_lit: r.object_lit
              ? { v: r.object_lit.v as string | number | boolean, dt: r.object_lit.dt }
              : null,
            context: r.context,
          });
        }
      } catch (_e) { /* dontosrv may be down */ }
    }

    const units = buildReplicationUnitsFromDonto({
      paperId: paper.id,
      claimIriPrefix: "tp:claim",
      statements,
    });

    if (units.length > 0) {
      await db.insert(replicationUnits).values(
        units.map((u) => ({
          id: u.id,
          paperId: u.paperId,
          claimIri: u.claimIri,
          sourceStatementIds: u.sourceStatementIds,
          domain: u.domain,
          unitType: u.unitType,
          claimText: u.claimText,
          evidenceQuotes: u.evidenceQuotes,
          hypothesis: u.hypothesis,
          expectedOutcome: u.expectedOutcome,
          falsificationCriteria: u.falsificationCriteria,
          requiredArtifacts: u.requiredArtifacts,
          datasets: u.datasets,
          methods: u.methods,
          metrics: u.metrics,
          baselines: u.baselines,
          parameters: u.parameters,
          computeBudget: u.computeBudget,
          verifierCandidates: u.verifierCandidates,
          planner: u.planner,
          state: u.state,
          blockers: u.blockers,
        })),
      ).onConflictDoNothing();
    }

    await db
      .update(papers)
      .set({ status: "done", updatedAt: new Date() })
      .where(eq(papers.id, paper.id));

    return NextResponse.json({
      summary: {
        total: paperClaims.length,
        not_applicable: paperClaims.length,
        reproduced: 0,
        contradicted: 0,
        fragile: 0,
        underdetermined: 0,
        mhdSimulations: 0,
        replicationUnitsPlanned: units.length,
      },
      verdicts: [],
      replicationUnits: units,
      domain,
    });
  }

  try {
    // Enrich claims with donto metadata
    const enriched = await Promise.all(
      paperClaims.map(async (c) => {
        const data: Record<string, string> = {};
        if (c.dontoSubjectIri) {
          try {
            const h = await getHistory(c.dontoSubjectIri);
            for (const r of h?.rows ?? []) {
              const v = String(r.object_lit?.v ?? r.object_iri ?? "");
              if (r.predicate.startsWith("tp:")) data[r.predicate.slice(3)] = v;
            }
          } catch (_e) { /* */ }
        }
        return { ...c, ...data };
      }),
    );

    const verdicts: Array<{
      claimId: string;
      claim: string;
      test: string;
      verdict: string;
      confidence: number;
      measured: number;
      expected: number;
      llmAnalysis: string;
    }> = [];

    // ── MHD Simulations ─────────────────────────────────────────────
    const {
      harrisSheet, mriShearingBox, dynamoOnset,
      integrate, totalEnergy, totalDivB,
      measureReconnection, measureViscosity, measureDynamo,
      judgeReconnection, judgeViscosity, judgeDynamo, addLlmAnalysis,
      shearingBoxSource, meanFieldAlpha,
    } = await import("@toiletpaper/simulator/mhd");

    // 1. Reconnection test
    // Word-boundary: "reconnect" / "reconnection", not e.g. "disreconnected".
    const reconnRe = /\b(?:reconnect|reconnection)\b/i;
    const reconnClaims = enriched.filter(
      (c) => reconnRe.test(c.text) && (c.text.includes("0.1") || c.text.includes("v_A")),
    );

    if (reconnClaims.length > 0) {
      const etas = [1e-2, 5e-3, 2e-3, 1e-3];
      const reconn: { S: number; rate: number }[] = [];
      const eDrifts: number[] = [];
      const divBs: number[] = [];

      for (const eta of etas) {
        const state = harrisSheet(128, 64, eta);
        const E0 = totalEnergy(state);
        const measurements: ReturnType<typeof measureReconnection>[] = [];

        const final = integrate(state, {
          cfl: 0.3, maxSteps: 2000, tMax: 5.0, boundaryCondition: "periodic",
          onStep: (s: any) => { if (s.step % 50 === 0) measurements.push(measureReconnection(s)); },
        });

        measurements.push(measureReconnection(final));
        const peak = Math.max(...measurements.map((m) => m.normalizedRate));
        const dE = Math.abs(totalEnergy(final) - E0) / Math.abs(E0);

        reconn.push({ S: 1 / eta, rate: peak });
        eDrifts.push(dE);
        divBs.push(totalDivB(final));
      }

      const rawData = reconn.map((r) => `S=${r.S} v_rec/v_A=${r.rate.toFixed(4)} SP=${(1/Math.sqrt(r.S)).toFixed(4)}`).join("\n");
      const v = await addLlmAnalysis(judgeReconnection(reconn, eDrifts, divBs), rawData, apiKey);

      for (const claim of reconnClaims) {
        await db.insert(simulations).values({
          claimId: claim.id,
          method: "mhd-harris-sheet-reconnection",
          result: { ...v.deterministic, llmAnalysis: v.llmAnalysis, rawData: reconn },
          verdict: v.verdict === "reproduced" ? "confirmed" : v.verdict === "contradicted" ? "refuted" : "inconclusive",
          metadata: { conservation: v.conservation, convergence: v.convergence },
        });

        verdicts.push({
          claimId: claim.id,
          claim: claim.text.slice(0, 100),
          test: v.test,
          verdict: v.verdict,
          confidence: v.confidence,
          measured: v.deterministic.measured,
          expected: v.deterministic.expected,
          llmAnalysis: v.llmAnalysis,
        });

        if (claim.dontoSubjectIri) {
          await ingestVerdictToDonto(claim.dontoSubjectIri, body.paper_id, v.verdict, v.llmAnalysis ?? "", v.confidence, v.deterministic.measured, v.deterministic.expected);
        }
      }
    }

    // 2. MRI viscosity test
    // Word-boundary on "viscosity"/"alpha"; the bare Greek α is fine.
    const viscRe = /\b(?:viscosity|alpha)\b/i;
    const mriClaims = enriched.filter(
      (c) => viscRe.test(c.text) || c.text.includes("α"),
    );

    if (mriClaims.length > 0) {
      const betas = [25, 50, 100, 200, 400];
      const mriData: { beta: number; alpha: number; stressRatio: number }[] = [];
      const eDrifts: number[] = [];
      const shearSrc = shearingBoxSource(1.0, 1.5);

      for (const beta of betas) {
        const state = mriShearingBox(64, 64, beta);
        const E0 = totalEnergy(state);
        const final = integrate(state, { cfl: 0.2, maxSteps: 2000, tMax: 20.0, boundaryCondition: "periodic", sources: shearSrc });
        const m = measureViscosity(final);
        mriData.push({ beta, alpha: m.alpha, stressRatio: m.stressRatio });
        eDrifts.push(Math.abs(totalEnergy(final) - E0) / Math.abs(E0));
      }

      const rawData = mriData.map((m) => `beta=${m.beta} alpha=${m.alpha.toFixed(6)} predicted=${(2/(Math.PI*m.beta)).toFixed(6)} ratio=${m.stressRatio.toFixed(2)}`).join("\n");
      const v = await addLlmAnalysis(judgeViscosity(mriData, eDrifts), rawData, apiKey);

      for (const claim of mriClaims) {
        await db.insert(simulations).values({
          claimId: claim.id,
          method: "mhd-mri-shearing-box",
          result: { ...v.deterministic, llmAnalysis: v.llmAnalysis, rawData: mriData },
          verdict: v.verdict === "reproduced" ? "confirmed" : v.verdict === "contradicted" ? "refuted" : "inconclusive",
          metadata: { conservation: v.conservation },
        });

        verdicts.push({
          claimId: claim.id, claim: claim.text.slice(0, 100), test: v.test,
          verdict: v.verdict, confidence: v.confidence,
          measured: v.deterministic.measured, expected: v.deterministic.expected,
          llmAnalysis: v.llmAnalysis,
        });

        if (claim.dontoSubjectIri) {
          await ingestVerdictToDonto(claim.dontoSubjectIri, body.paper_id, v.verdict, v.llmAnalysis ?? "", v.confidence, v.deterministic.measured, v.deterministic.expected);
        }
      }
    }

    // 3. Dynamo onset test
    // Word-boundary "dynamo" or magnetic Reynolds number "Rm" (not the
    // letter pair "rm" inside words like "metallurgy" / "reform").
    const dynamoRe = /\b(?:dynamo|Rm|Re_m|magnetic\s+Reynolds)\b/i;
    const dynamoClaims = enriched.filter((c) => dynamoRe.test(c.text));

    if (dynamoClaims.length > 0) {
      const Rms = [10, 20, 30, 50, 75, 100, 150];
      const dynamoData: { Rm: number; magE: number; maxB: number }[] = [];

      const alphaSrc = meanFieldAlpha(0.05);
      for (const Rm of Rms) {
        const state = dynamoOnset(64, 64, Rm);
        const final = integrate(state, { cfl: 0.2, maxSteps: 1000, tMax: 10.0, boundaryCondition: "periodic", sources: alphaSrc });
        const d = measureDynamo(final);
        dynamoData.push({ Rm, magE: d.magneticEnergy, maxB: d.maxB });
      }

      const rawData = dynamoData.map((d) => `Rm=${d.Rm} magE=${d.magE.toExponential(3)} maxB=${d.maxB.toExponential(3)}`).join("\n");
      const v = await addLlmAnalysis(judgeDynamo(dynamoData), rawData, apiKey);

      for (const claim of dynamoClaims) {
        await db.insert(simulations).values({
          claimId: claim.id,
          method: "mhd-dynamo-onset",
          result: { ...v.deterministic, llmAnalysis: v.llmAnalysis, rawData: dynamoData },
          verdict: v.verdict === "reproduced" ? "confirmed" : v.verdict === "contradicted" ? "refuted" : "inconclusive",
          metadata: {},
        });

        verdicts.push({
          claimId: claim.id, claim: claim.text.slice(0, 100), test: v.test,
          verdict: v.verdict, confidence: v.confidence,
          measured: v.deterministic.measured, expected: v.deterministic.expected,
          llmAnalysis: v.llmAnalysis,
        });

        if (claim.dontoSubjectIri) {
          await ingestVerdictToDonto(claim.dontoSubjectIri, body.paper_id, v.verdict, v.llmAnalysis ?? "", v.confidence, v.deterministic.measured, v.deterministic.expected);
        }
      }
    }

    // 4. LLM-based triage + simulation for remaining claims
    const testedClaimIds = new Set(verdicts.map((v) => v.claimId));
    const remaining = enriched.filter((c) => !testedClaimIds.has(c.id));

    if (remaining.length > 0) {
      const { runPipeline } = await import("@toiletpaper/simulator");
      const result = await runPipeline({
        claims: remaining.map((c) => ({
          text: c.text,
          category: (c as any).category ?? "quantitative",
          confidence: c.confidence ?? 0.5,
          evidence: (c as any).evidence ?? "",
          predicate: (c as any).predicate,
          value: (c as any).value,
          unit: (c as any).unit,
        })),
        paperAbstract: paper.abstract ?? "",
        apiKey,
      });

      for (const v of result.verdicts) {
        const match = remaining.find((c) => c.text.slice(0, 40) === v.statement?.slice(0, 40));
        if (match) {
          await db.insert(simulations).values({
            claimId: match.id,
            method: `tier-${v.tier}-${v.claimType}`,
            result: { reason: v.reason, confidence: v.confidence },
            verdict: v.verdict === "reproduced" ? "confirmed" : v.verdict === "contradicted" ? "refuted" : "inconclusive",
            metadata: { tier: v.tier },
          });

          verdicts.push({
            claimId: match.id, claim: v.statement?.slice(0, 100) ?? "",
            test: `tier-${v.tier}`, verdict: v.verdict, confidence: v.confidence,
            measured: v.fittedExponent ?? 0, expected: v.expectedExponent ?? 0,
            llmAnalysis: v.reason,
          });

          if (match.dontoSubjectIri) {
            await ingestVerdictToDonto(match.dontoSubjectIri, body.paper_id, v.verdict, v.reason, v.confidence, v.fittedExponent, v.expectedExponent);
          }
        }
      }
    }

    await db.update(papers).set({ status: "done", updatedAt: new Date() }).where(eq(papers.id, paper.id));

    const summary = {
      total: verdicts.length,
      reproduced: verdicts.filter((v) => v.verdict === "reproduced").length,
      contradicted: verdicts.filter((v) => v.verdict === "contradicted").length,
      fragile: verdicts.filter((v) => v.verdict === "fragile" || v.verdict === "numerically_fragile").length,
      underdetermined: verdicts.filter((v) => v.verdict === "underdetermined").length,
      mhdSimulations: verdicts.filter((v) => v.test.startsWith("Harris") || v.test.startsWith("MRI") || v.test.startsWith("Dynamo")).length,
    };

    return NextResponse.json({ summary, verdicts });
  } catch (e) {
    console.error("Simulation failed:", e);
    await db.update(papers).set({ status: "error", updatedAt: new Date() }).where(eq(papers.id, paper.id));
    return NextResponse.json({ error: e instanceof Error ? e.message : "Simulation failed" }, { status: 500 });
  }
}
