import { type Grid, totalX, totalY } from "./grid";
import {
  type MhdState,
  getVar,
  RHO,
  MX,
  MY,
  MZ,
  BX,
  BY,
  BZ,
  EN,
  pressure,
  alfvenSpeed,
  totalDivB,
} from "./state";

export interface ReconnectionMeasurement {
  time: number;
  reconnectionRate: number;
  inflowSpeed: number;
  alfvenSpeedAtSheet: number;
  normalizedRate: number; // v_in / v_A
  maxCurrentDensity: number;
  magneticEnergy: number;
}

export interface DynamoDiagnostic {
  time: number;
  magneticEnergy: number;
  kineticEnergy: number;
  magneticEnergyGrowthRate: number;
  maxB: number;
}

export interface ViscosityMeasurement {
  beta: number;
  maxwellStress: number;
  reynoldsStress: number;
  totalStress: number;
  alpha: number;
  stressRatio: number;
}

export function measureReconnection(state: MhdState): ReconnectionMeasurement {
  const g = state.grid;
  const midJ = Math.floor(g.ny / 2) + g.nghost;

  // Find X-point: location of minimum |Bx| near the midplane
  let minBx = Infinity;
  let xPointI = g.nghost;
  for (let i = g.nghost; i < g.nx + g.nghost; i++) {
    const bx = Math.abs(getVar(state, BX, i, midJ));
    if (bx < minBx) {
      minBx = bx;
      xPointI = i;
    }
  }

  // Inflow speed: vy at a few cells above the current sheet
  const inflowOffset = Math.max(3, Math.floor(g.ny / 20));
  const rhoAbove = getVar(state, RHO, xPointI, midJ + inflowOffset);
  const vyAbove = getVar(state, MY, xPointI, midJ + inflowOffset) / rhoAbove;
  const inflowSpeed = Math.abs(vyAbove);

  // Alfven speed at the inflow region
  const vA = alfvenSpeed(state, xPointI, midJ + inflowOffset);

  // Current density: Jz = ∂By/∂x - ∂Bx/∂y
  let maxJ = 0;
  for (let j = g.nghost; j < g.ny + g.nghost; j++) {
    for (let i = g.nghost; i < g.nx + g.nghost; i++) {
      const dBydx = (getVar(state, BY, i + 1, j) - getVar(state, BY, i - 1, j)) / (2 * g.dx);
      const dBxdy = (getVar(state, BX, i, j + 1) - getVar(state, BX, i, j - 1)) / (2 * g.dy);
      const jz = Math.abs(dBydx - dBxdy);
      if (jz > maxJ) maxJ = jz;
    }
  }

  // Magnetic energy
  let magE = 0;
  for (let j = g.nghost; j < g.ny + g.nghost; j++) {
    for (let i = g.nghost; i < g.nx + g.nghost; i++) {
      const bx = getVar(state, BX, i, j);
      const by = getVar(state, BY, i, j);
      const bz = getVar(state, BZ, i, j);
      magE += 0.5 * (bx * bx + by * by + bz * bz) * g.dx * g.dy;
    }
  }

  return {
    time: state.time,
    reconnectionRate: inflowSpeed,
    inflowSpeed,
    alfvenSpeedAtSheet: vA > 0 ? vA : 1,
    normalizedRate: vA > 0 ? inflowSpeed / vA : 0,
    maxCurrentDensity: maxJ,
    magneticEnergy: magE,
  };
}

export function measureDynamo(
  state: MhdState,
  prevMagE?: number,
  dt?: number,
): DynamoDiagnostic {
  const g = state.grid;
  let magE = 0;
  let kinE = 0;
  let maxB = 0;

  for (let j = g.nghost; j < g.ny + g.nghost; j++) {
    for (let i = g.nghost; i < g.nx + g.nghost; i++) {
      const rho = getVar(state, RHO, i, j);
      const vx = getVar(state, MX, i, j) / rho;
      const vy = getVar(state, MY, i, j) / rho;
      const vz = getVar(state, MZ, i, j) / rho;
      const bx = getVar(state, BX, i, j);
      const by = getVar(state, BY, i, j);
      const bz = getVar(state, BZ, i, j);

      kinE += 0.5 * rho * (vx * vx + vy * vy + vz * vz) * g.dx * g.dy;
      const b2 = bx * bx + by * by + bz * bz;
      magE += 0.5 * b2 * g.dx * g.dy;
      const bMag = Math.sqrt(b2);
      if (bMag > maxB) maxB = bMag;
    }
  }

  let growthRate = 0;
  if (prevMagE != null && dt != null && prevMagE > 0 && dt > 0) {
    growthRate = Math.log(magE / prevMagE) / dt;
  }

  return {
    time: state.time,
    magneticEnergy: magE,
    kineticEnergy: kinE,
    magneticEnergyGrowthRate: growthRate,
    maxB,
  };
}

export function measureViscosity(state: MhdState, Omega: number = 1.0, q: number = 1.5): ViscosityMeasurement {
  const g = state.grid;
  let maxwellSum = 0;
  let reynoldsSum = 0;
  let pressureSum = 0;
  let count = 0;

  for (let j = g.nghost; j < g.ny + g.nghost; j++) {
    for (let i = g.nghost; i < g.nx + g.nghost; i++) {
      const rho = getVar(state, RHO, i, j);
      const vx = getVar(state, MX, i, j) / rho;
      const vy = getVar(state, MY, i, j) / rho;
      const bx = getVar(state, BX, i, j);
      const by = getVar(state, BY, i, j);

      // Maxwell stress: -Bx*By (magnetic tension)
      maxwellSum += -bx * by;

      // Reynolds stress: ρ*δvx*δvy
      reynoldsSum += rho * vx * vy;

      pressureSum += pressure(state, i, j);
      count++;
    }
  }

  const avgMaxwell = maxwellSum / count;
  const avgReynolds = reynoldsSum / count;
  const avgPressure = pressureSum / count;
  const totalStress = avgMaxwell + avgReynolds;

  const bx2 = (() => {
    let s = 0;
    for (let j = g.nghost; j < g.ny + g.nghost; j++)
      for (let i = g.nghost; i < g.nx + g.nghost; i++)
        s += getVar(state, BX, i, j) ** 2;
    return s / count;
  })();
  const by2 = (() => {
    let s = 0;
    for (let j = g.nghost; j < g.ny + g.nghost; j++)
      for (let i = g.nghost; i < g.nx + g.nghost; i++)
        s += getVar(state, BY, i, j) ** 2;
    return s / count;
  })();

  const avgB2 = bx2 + by2;
  const beta = avgPressure > 0 ? 2 * avgPressure / avgB2 : Infinity;

  const alpha = avgPressure > 0 ? totalStress / avgPressure : 0;
  const stressRatio = Math.abs(avgReynolds) > 0 ? Math.abs(avgMaxwell / avgReynolds) : Infinity;

  return {
    beta,
    maxwellStress: avgMaxwell,
    reynoldsStress: avgReynolds,
    totalStress,
    alpha,
    stressRatio,
  };
}

export function convergenceStudy(
  setupFn: (nx: number) => MhdState,
  tMax: number,
  resolutions: number[],
): { resolutions: number[]; errors: number[]; order: number } {
  const results: { nx: number; magE: number }[] = [];

  for (const nx of resolutions) {
    const { integrate } = require("./integrator");
    const state = setupFn(nx);
    const final = integrate(state, {
      cfl: 0.4,
      maxSteps: 100000,
      tMax,
      boundaryCondition: "periodic",
    });

    let magE = 0;
    const g = final.grid;
    for (let j = g.nghost; j < g.ny + g.nghost; j++) {
      for (let i = g.nghost; i < g.nx + g.nghost; i++) {
        const bx = getVar(final, BX, i, j);
        const by = getVar(final, BY, i, j);
        magE += 0.5 * (bx * bx + by * by) * g.dx * g.dy;
      }
    }
    results.push({ nx, magE });
  }

  const errors = results.map((r, i) =>
    i > 0 ? Math.abs(r.magE - results[results.length - 1].magE) : 1,
  );
  errors[errors.length - 1] = errors[errors.length - 2] * 0.1;

  let order = 0;
  if (errors.length >= 2 && errors[0] > 0 && errors[1] > 0) {
    order = Math.log(errors[0] / errors[1]) / Math.log(resolutions[1] / resolutions[0]);
  }

  return { resolutions, errors, order };
}
