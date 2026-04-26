import { type Grid, totalX, totalY } from "./grid";

// Conservative variables for 2D compressible MHD:
//   U = [ρ, ρvx, ρvy, ρvz, Bx, By, Bz, E]
// where E = p/(γ-1) + ρv²/2 + B²/(2μ₀)
export const NVAR = 8;
export const RHO = 0;
export const MX = 1;
export const MY = 2;
export const MZ = 3;
export const BX = 4;
export const BY = 5;
export const BZ = 6;
export const EN = 7;

export interface MhdState {
  U: Float64Array; // conservative variables [NVAR * nx_total * ny_total]
  grid: Grid;
  gamma: number;
  eta: number; // resistivity
  time: number;
  step: number;
}

export function createState(grid: Grid, gamma: number = 5 / 3, eta: number = 0): MhdState {
  const n = NVAR * totalX(grid) * totalY(grid);
  return {
    U: new Float64Array(n),
    grid,
    gamma,
    eta,
    time: 0,
    step: 0,
  };
}

export function getVar(state: MhdState, v: number, i: number, j: number): number {
  const nx = totalX(state.grid);
  return state.U[v * nx * totalY(state.grid) + j * nx + i];
}

export function setVar(state: MhdState, v: number, i: number, j: number, val: number): void {
  const nx = totalX(state.grid);
  state.U[v * nx * totalY(state.grid) + j * nx + i] = val;
}

export function pressure(state: MhdState, i: number, j: number): number {
  const rho = getVar(state, RHO, i, j);
  const mx = getVar(state, MX, i, j);
  const my = getVar(state, MY, i, j);
  const mz = getVar(state, MZ, i, j);
  const bx = getVar(state, BX, i, j);
  const by = getVar(state, BY, i, j);
  const bz = getVar(state, BZ, i, j);
  const e = getVar(state, EN, i, j);

  const ke = 0.5 * (mx * mx + my * my + mz * mz) / rho;
  const be = 0.5 * (bx * bx + by * by + bz * bz);

  return (state.gamma - 1) * (e - ke - be);
}

export function soundSpeed(state: MhdState, i: number, j: number): number {
  const rho = getVar(state, RHO, i, j);
  const p = pressure(state, i, j);
  return Math.sqrt(state.gamma * Math.abs(p) / rho);
}

export function alfvenSpeed(state: MhdState, i: number, j: number): number {
  const rho = getVar(state, RHO, i, j);
  const bx = getVar(state, BX, i, j);
  const by = getVar(state, BY, i, j);
  const bz = getVar(state, BZ, i, j);
  return Math.sqrt((bx * bx + by * by + bz * bz) / rho);
}

export function fastMagnetosonicSpeed(state: MhdState, i: number, j: number, dir: "x" | "y"): number {
  const rho = getVar(state, RHO, i, j);
  const bx = getVar(state, BX, i, j);
  const by = getVar(state, BY, i, j);
  const bz = getVar(state, BZ, i, j);
  const p = pressure(state, i, j);

  const b2 = bx * bx + by * by + bz * bz;
  const bn = dir === "x" ? bx : by;
  const cs2 = state.gamma * Math.abs(p) / rho;
  const va2 = b2 / rho;
  const van2 = bn * bn / rho;

  const sum = cs2 + va2;
  const disc = Math.sqrt(Math.max(0, sum * sum - 4 * cs2 * van2));

  return Math.sqrt(0.5 * (sum + disc));
}

export function totalEnergy(state: MhdState): number {
  const g = state.grid;
  const nx = totalX(g);
  let total = 0;
  for (let j = g.nghost; j < g.ny + g.nghost; j++) {
    for (let i = g.nghost; i < g.nx + g.nghost; i++) {
      total += getVar(state, EN, i, j) * g.dx * g.dy;
    }
  }
  return total;
}

export function totalDivB(state: MhdState): number {
  const g = state.grid;
  let maxDiv = 0;
  for (let j = g.nghost; j < g.ny + g.nghost; j++) {
    for (let i = g.nghost; i < g.nx + g.nghost; i++) {
      const dbxdx = (getVar(state, BX, i + 1, j) - getVar(state, BX, i - 1, j)) / (2 * g.dx);
      const dbydy = (getVar(state, BY, i, j + 1) - getVar(state, BY, i, j - 1)) / (2 * g.dy);
      const divB = Math.abs(dbxdx + dbydy);
      if (divB > maxDiv) maxDiv = divB;
    }
  }
  return maxDiv;
}

export function cloneState(state: MhdState): MhdState {
  return {
    U: new Float64Array(state.U),
    grid: state.grid,
    gamma: state.gamma,
    eta: state.eta,
    time: state.time,
    step: state.step,
  };
}
