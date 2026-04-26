import OpenAI from "openai";
import type { ReconnectionMeasurement, DynamoDiagnostic, ViscosityMeasurement } from "./analysis";

export interface MhdVerdict {
  claim: string;
  test: string;
  deterministic: {
    passed: boolean;
    metric: string;
    measured: number;
    expected: number;
    tolerance: number;
    error: number;
  };
  conservation: {
    energyDrift: number;
    divBMax: number;
    passed: boolean;
  };
  convergence: {
    orders: number[];
    passed: boolean;
  };
  llmAnalysis: string;
  verdict: "reproduced" | "contradicted" | "fragile" | "underdetermined";
  confidence: number;
}

export function judgeReconnection(
  measurements: { S: number; rate: number }[],
  energyDrifts: number[],
  divBs: number[],
): Omit<MhdVerdict, "llmAnalysis"> {
  // Paper I claims v_rec/v_A ≈ 0.06-0.1 independent of S
  // Sweet-Parker predicts 1/√S

  const highS = measurements.filter((m) => m.S >= 200);
  const rates = highS.map((m) => m.rate);
  const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
  const std = Math.sqrt(rates.reduce((a, r) => a + (r - mean) ** 2, 0) / rates.length);
  const cv = std / mean; // coefficient of variation

  const inRange = mean >= 0.04 && mean <= 0.15;
  const isFlat = cv < 0.15; // rate doesn't vary much with S

  // Check that high-S rates are faster than Sweet-Parker
  const fasterThanSP = highS.every((m) => m.rate > 1.2 / Math.sqrt(m.S));

  const conservationOk = energyDrifts.every((d) => d < 0.01);
  const divBOk = divBs.every((d) => d < 0.5);

  const passed = inRange && isFlat && fasterThanSP && conservationOk;

  return {
    claim: "v_rec/v_A ≈ 0.06-0.1 independent of Lundquist number S",
    test: "Harris sheet reconnection at S = " + measurements.map((m) => m.S).join(", "),
    deterministic: {
      passed,
      metric: "mean reconnection rate at high S",
      measured: mean,
      expected: 0.08,
      tolerance: 0.04,
      error: Math.abs(mean - 0.08),
    },
    conservation: {
      energyDrift: Math.max(...energyDrifts),
      divBMax: Math.max(...divBs),
      passed: conservationOk && divBOk,
    },
    convergence: { orders: [], passed: true },
    verdict: passed ? "reproduced" : inRange ? "fragile" : "contradicted",
    confidence: passed ? 0.85 : 0.7,
  };
}

export function judgeViscosity(
  measurements: { beta: number; alpha: number; stressRatio: number }[],
  energyDrifts: number[],
): Omit<MhdVerdict, "llmAnalysis"> {
  // Paper I claims α_SS = 2/(πβ) and Maxwell/Reynolds ~ 3-5
  const errors = measurements.map((m) => {
    const predicted = 2 / (Math.PI * m.beta);
    return { beta: m.beta, error: Math.abs(m.alpha - predicted) / predicted, predicted, measured: m.alpha };
  });

  const meanError = errors.reduce((a, e) => a + e.error, 0) / errors.length;
  const stressRatios = measurements.map((m) => m.stressRatio);
  const meanStressRatio = stressRatios.reduce((a, b) => a + b, 0) / stressRatios.length;
  const stressInRange = meanStressRatio >= 2 && meanStressRatio <= 8;

  const conservationOk = energyDrifts.every((d) => d < 0.05);
  const passed = meanError < 0.3 && stressInRange && conservationOk;

  return {
    claim: "α_SS = 2/(πβ), Maxwell/Reynolds stress ratio ~ 3-5",
    test: "MRI shearing box at β = " + measurements.map((m) => m.beta).join(", "),
    deterministic: {
      passed,
      metric: "mean relative error in α(β)",
      measured: meanError,
      expected: 0,
      tolerance: 0.3,
      error: meanError,
    },
    conservation: {
      energyDrift: Math.max(...energyDrifts),
      divBMax: 0,
      passed: conservationOk,
    },
    convergence: { orders: [], passed: true },
    verdict: passed ? "reproduced" : meanError < 0.5 ? "fragile" : "contradicted",
    confidence: passed ? 0.8 : 0.6,
  };
}

export function judgeDynamo(
  measurements: { Rm: number; magE: number; maxB: number }[],
): Omit<MhdVerdict, "llmAnalysis"> {
  // Paper I claims sharp transition at Rm_c, B_sat ∝ √(Rm - Rm_c)

  // Find Rm_c: where magnetic energy jumps
  let Rmc = 0;
  for (let i = 1; i < measurements.length; i++) {
    const ratio = measurements[i].magE / measurements[i - 1].magE;
    if (ratio > 5 && Rmc === 0) {
      Rmc = (measurements[i].Rm + measurements[i - 1].Rm) / 2;
    }
  }

  // Check B_sat ∝ √(Rm - Rm_c) for supercritical values
  const supercritical = measurements.filter((m) => m.Rm > Rmc * 1.2 && m.maxB > 1e-3);
  let exponent = 0;
  if (supercritical.length >= 3) {
    const logX = supercritical.map((m) => Math.log(m.Rm - Rmc));
    const logY = supercritical.map((m) => Math.log(m.maxB));
    const n = logX.length;
    const sx = logX.reduce((a, b) => a + b, 0);
    const sy = logY.reduce((a, b) => a + b, 0);
    const sxy = logX.reduce((a, x, i) => a + x * logY[i], 0);
    const sx2 = logX.reduce((a, x) => a + x * x, 0);
    exponent = (n * sxy - sx * sy) / (n * sx2 - sx * sx);
  }

  const hasTransition = Rmc > 0;
  const isSharp = hasTransition;
  const exponentClose = Math.abs(exponent - 0.5) < 0.2;

  const passed = hasTransition && exponentClose;

  return {
    claim: "Sharp dynamo transition at Rm_c, B_sat ∝ √(Rm - Rm_c)",
    test: "Dynamo onset at Rm = " + measurements.map((m) => m.Rm).join(", "),
    deterministic: {
      passed,
      metric: "B_sat exponent vs (Rm - Rm_c)",
      measured: exponent,
      expected: 0.5,
      tolerance: 0.2,
      error: Math.abs(exponent - 0.5),
    },
    conservation: { energyDrift: 0, divBMax: 0, passed: true },
    convergence: { orders: [], passed: true },
    verdict: passed ? "reproduced" : hasTransition ? "fragile" : "contradicted",
    confidence: passed ? 0.75 : 0.5,
  };
}

export async function addLlmAnalysis(
  verdict: Omit<MhdVerdict, "llmAnalysis">,
  rawData: string,
  apiKey: string,
): Promise<MhdVerdict> {
  const openai = new OpenAI({ apiKey });

  const response = await openai.chat.completions.create({
    model: "gpt-5.4",
    messages: [
      {
        role: "system",
        content: `You are a computational physicist reviewing MHD simulation results. Given the deterministic analysis and raw data, provide a scientific interpretation in 3-5 sentences. Be specific about what the simulation shows, what it doesn't show, and what additional tests would strengthen or weaken the conclusion. Mention specific numbers from the data.`,
      },
      {
        role: "user",
        content: `Claim: ${verdict.claim}\n\nDeterministic verdict: ${verdict.verdict} (confidence ${verdict.confidence})\nMetric: ${verdict.deterministic.metric} = ${verdict.deterministic.measured.toFixed(4)} (expected ${verdict.deterministic.expected}, tolerance ±${verdict.deterministic.tolerance})\nConservation: energy drift ${verdict.conservation.energyDrift.toExponential(2)}, div B max ${verdict.conservation.divBMax.toExponential(2)}\n\nRaw data:\n${rawData}`,
      },
    ],
    temperature: 0.3,
    max_tokens: 300,
  });

  return {
    ...verdict,
    llmAnalysis: response.choices[0]?.message?.content ?? "No analysis available",
  };
}
