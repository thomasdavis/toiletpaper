import { NVAR, RHO, MX, MY, MZ, BX, BY, BZ, EN } from "./state";

// HLL Riemann solver for ideal MHD
// Returns the intercell flux given left and right states

export function hllFluxX(
  uL: Float64Array,
  uR: Float64Array,
  gamma: number,
): Float64Array {
  const flux = new Float64Array(NVAR);

  const rhoL = uL[RHO], rhoR = uR[RHO];
  const vxL = uL[MX] / rhoL, vxR = uR[MX] / rhoR;
  const vyL = uL[MY] / rhoL, vyR = uR[MY] / rhoR;
  const vzL = uL[MZ] / rhoL, vzR = uR[MZ] / rhoR;
  const bxL = uL[BX], bxR = uR[BX];
  const byL = uL[BY], byR = uR[BY];
  const bzL = uL[BZ], bzR = uR[BZ];

  const keL = 0.5 * rhoL * (vxL * vxL + vyL * vyL + vzL * vzL);
  const keR = 0.5 * rhoR * (vxR * vxR + vyR * vyR + vzR * vzR);
  const b2L = bxL * bxL + byL * byL + bzL * bzL;
  const b2R = bxR * bxR + byR * byR + bzR * bzR;
  const beL = 0.5 * b2L;
  const beR = 0.5 * b2R;

  const pL = (gamma - 1) * (uL[EN] - keL - beL);
  const pR = (gamma - 1) * (uR[EN] - keR - beR);
  const ptL = pL + beL;
  const ptR = pR + beR;

  // Wave speeds
  const cfL = fastSpeed(rhoL, pL, bxL, b2L, gamma);
  const cfR = fastSpeed(rhoR, pR, bxR, b2R, gamma);

  const sL = Math.min(vxL - cfL, vxR - cfR);
  const sR = Math.max(vxL + cfL, vxR + cfR);

  if (sL >= 0) {
    computeFluxX(uL, pL, ptL, vxL, vyL, vzL, bxL, byL, bzL, flux);
    return flux;
  }
  if (sR <= 0) {
    computeFluxX(uR, pR, ptR, vxR, vyR, vzR, bxR, byR, bzR, flux);
    return flux;
  }

  const fL = new Float64Array(NVAR);
  const fR = new Float64Array(NVAR);
  computeFluxX(uL, pL, ptL, vxL, vyL, vzL, bxL, byL, bzL, fL);
  computeFluxX(uR, pR, ptR, vxR, vyR, vzR, bxR, byR, bzR, fR);

  const inv = 1 / (sR - sL);
  for (let v = 0; v < NVAR; v++) {
    flux[v] = (sR * fL[v] - sL * fR[v] + sL * sR * (uR[v] - uL[v])) * inv;
  }

  return flux;
}

export function hllFluxY(
  uL: Float64Array,
  uR: Float64Array,
  gamma: number,
): Float64Array {
  const flux = new Float64Array(NVAR);

  const rhoL = uL[RHO], rhoR = uR[RHO];
  const vxL = uL[MX] / rhoL, vxR = uR[MX] / rhoR;
  const vyL = uL[MY] / rhoL, vyR = uR[MY] / rhoR;
  const vzL = uL[MZ] / rhoL, vzR = uR[MZ] / rhoR;
  const bxL = uL[BX], bxR = uR[BX];
  const byL = uL[BY], byR = uR[BY];
  const bzL = uL[BZ], bzR = uR[BZ];

  const keL = 0.5 * rhoL * (vxL * vxL + vyL * vyL + vzL * vzL);
  const keR = 0.5 * rhoR * (vxR * vxR + vyR * vyR + vzR * vzR);
  const b2L = bxL * bxL + byL * byL + bzL * bzL;
  const b2R = bxR * bxR + byR * byR + bzR * bzR;
  const beL = 0.5 * b2L;
  const beR = 0.5 * b2R;

  const pL = (gamma - 1) * (uL[EN] - keL - beL);
  const pR = (gamma - 1) * (uR[EN] - keR - beR);
  const ptL = pL + beL;
  const ptR = pR + beR;

  const cfL = fastSpeed(rhoL, pL, byL, b2L, gamma);
  const cfR = fastSpeed(rhoR, pR, byR, b2R, gamma);

  const sL = Math.min(vyL - cfL, vyR - cfR);
  const sR = Math.max(vyL + cfL, vyR + cfR);

  if (sL >= 0) {
    computeFluxY(uL, pL, ptL, vxL, vyL, vzL, bxL, byL, bzL, flux);
    return flux;
  }
  if (sR <= 0) {
    computeFluxY(uR, pR, ptR, vxR, vyR, vzR, bxR, byR, bzR, flux);
    return flux;
  }

  const fL = new Float64Array(NVAR);
  const fR = new Float64Array(NVAR);
  computeFluxY(uL, pL, ptL, vxL, vyL, vzL, bxL, byL, bzL, fL);
  computeFluxY(uR, pR, ptR, vxR, vyR, vzR, bxR, byR, bzR, fR);

  const inv = 1 / (sR - sL);
  for (let v = 0; v < NVAR; v++) {
    flux[v] = (sR * fL[v] - sL * fR[v] + sL * sR * (uR[v] - uL[v])) * inv;
  }

  return flux;
}

function fastSpeed(rho: number, p: number, bn: number, b2: number, gamma: number): number {
  const cs2 = gamma * Math.abs(p) / rho;
  const va2 = b2 / rho;
  const van2 = bn * bn / rho;
  const sum = cs2 + va2;
  const disc = Math.sqrt(Math.max(0, sum * sum - 4 * cs2 * van2));
  return Math.sqrt(0.5 * (sum + disc));
}

function computeFluxX(
  u: Float64Array,
  p: number,
  pt: number,
  vx: number,
  vy: number,
  vz: number,
  bx: number,
  by: number,
  bz: number,
  f: Float64Array,
): void {
  f[RHO] = u[RHO] * vx;
  f[MX] = u[MX] * vx + pt - bx * bx;
  f[MY] = u[MY] * vx - bx * by;
  f[MZ] = u[MZ] * vx - bx * bz;
  f[BX] = 0;
  f[BY] = by * vx - bx * vy;
  f[BZ] = bz * vx - bx * vz;
  f[EN] = (u[EN] + pt) * vx - bx * (vx * bx + vy * by + vz * bz);
}

function computeFluxY(
  u: Float64Array,
  p: number,
  pt: number,
  vx: number,
  vy: number,
  vz: number,
  bx: number,
  by: number,
  bz: number,
  f: Float64Array,
): void {
  f[RHO] = u[RHO] * vy;
  f[MX] = u[MX] * vy - by * bx;
  f[MY] = u[MY] * vy + pt - by * by;
  f[MZ] = u[MZ] * vy - by * bz;
  f[BX] = bx * vy - by * vx;
  f[BY] = 0;
  f[BZ] = bz * vy - by * vz;
  f[EN] = (u[EN] + pt) * vy - by * (vx * bx + vy * by + vz * bz);
}
