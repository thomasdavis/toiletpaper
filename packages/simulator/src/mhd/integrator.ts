import { type Grid, totalX, totalY } from "./grid";
import {
  type MhdState,
  NVAR,
  RHO,
  MX,
  MY,
  MZ,
  BX,
  BY,
  BZ,
  EN,
  getVar,
  setVar,
  cloneState,
  fastMagnetosonicSpeed,
} from "./state";
import { hllFluxX, hllFluxY } from "./riemann";
import type { SourceTerms } from "./sources";

export interface IntegratorOptions {
  cfl: number;
  maxSteps: number;
  tMax: number;
  boundaryCondition: "periodic" | "outflow";
  sources?: SourceTerms;
  onStep?: (state: MhdState) => void;
}

export function integrate(state: MhdState, opts: IntegratorOptions): MhdState {
  let s = cloneState(state);
  applyBoundary(s, opts.boundaryCondition);

  for (let n = 0; n < opts.maxSteps; n++) {
    if (s.time >= opts.tMax) break;

    const dt = computeTimestep(s, opts.cfl);
    const dtActual = Math.min(dt, opts.tMax - s.time);

    // Forward Euler step: s1 = s + dt * L(s)
    const dU1 = computeRHS(s);
    if (opts.sources) opts.sources.apply(s, dU1);
    const s1 = cloneState(s);
    const ntot = s.U.length;
    for (let k = 0; k < ntot; k++) {
      s1.U[k] += dtActual * dU1[k];
    }
    applyBoundary(s1, opts.boundaryCondition);

    // Second stage: s2 = s + dt * L(s1)
    const dU2 = computeRHS(s1);
    if (opts.sources) opts.sources.apply(s1, dU2);
    for (let k = 0; k < ntot; k++) {
      s.U[k] = 0.5 * (s.U[k] + s1.U[k] + dtActual * dU2[k]);
    }
    applyBoundary(s, opts.boundaryCondition);

    s.time += dtActual;
    s.step = n + 1;

    if (opts.onStep) opts.onStep(s);

    if (!isFinite(s.U[0])) {
      console.error(`NaN detected at step ${n + 1}, t=${s.time}`);
      break;
    }
  }

  return s;
}

function computeTimestep(state: MhdState, cfl: number): number {
  const g = state.grid;
  let maxSpeed = 1e-10;

  for (let j = g.nghost; j < g.ny + g.nghost; j++) {
    for (let i = g.nghost; i < g.nx + g.nghost; i++) {
      const rho = getVar(state, RHO, i, j);
      if (rho <= 0) continue;

      const vx = getVar(state, MX, i, j) / rho;
      const vy = getVar(state, MY, i, j) / rho;

      const cfx = fastMagnetosonicSpeed(state, i, j, "x");
      const cfy = fastMagnetosonicSpeed(state, i, j, "y");

      const sx = (Math.abs(vx) + cfx) / g.dx;
      const sy = (Math.abs(vy) + cfy) / g.dy;

      const speed = sx + sy;
      if (speed > maxSpeed) maxSpeed = speed;
    }
  }

  return cfl / maxSpeed;
}

function computeRHS(state: MhdState): Float64Array {
  const g = state.grid;
  const nxT = totalX(g);
  const nyT = totalY(g);
  const dU = new Float64Array(NVAR * nxT * nyT);

  const uL = new Float64Array(NVAR);
  const uR = new Float64Array(NVAR);

  // X-direction fluxes
  for (let j = g.nghost; j < g.ny + g.nghost; j++) {
    for (let iface = g.nghost; iface <= g.nx + g.nghost; iface++) {
      const iL = iface - 1;
      const iR = iface;

      for (let v = 0; v < NVAR; v++) {
        const um1 = getVar(state, v, iL - 1, j);
        const u0 = getVar(state, v, iL, j);
        const up1 = getVar(state, v, iR, j);
        const up2 = getVar(state, v, iR + 1, j);

        const slopeL = minmod(u0 - um1, up1 - u0);
        const slopeR = minmod(up1 - u0, up2 - up1);

        uL[v] = u0 + 0.5 * slopeL;
        uR[v] = up1 - 0.5 * slopeR;
      }

      // Ensure positive density at interface
      if (uL[RHO] <= 0) uL[RHO] = getVar(state, RHO, iL, j);
      if (uR[RHO] <= 0) uR[RHO] = getVar(state, RHO, iR, j);

      const flux = hllFluxX(uL, uR, state.gamma);

      for (let v = 0; v < NVAR; v++) {
        const stride = v * nxT * nyT;
        dU[stride + j * nxT + iL] -= flux[v] / g.dx;
        dU[stride + j * nxT + iR] += flux[v] / g.dx;
      }
    }
  }

  // Y-direction fluxes
  for (let j = g.nghost; j <= g.ny + g.nghost; j++) {
    const jL = j - 1;
    const jR = j;
    for (let i = g.nghost; i < g.nx + g.nghost; i++) {
      for (let v = 0; v < NVAR; v++) {
        const um1 = getVar(state, v, i, jL - 1);
        const u0 = getVar(state, v, i, jL);
        const up1 = getVar(state, v, i, jR);
        const up2 = getVar(state, v, i, jR + 1);

        const slopeL = minmod(u0 - um1, up1 - u0);
        const slopeR = minmod(up1 - u0, up2 - up1);

        uL[v] = u0 + 0.5 * slopeL;
        uR[v] = up1 - 0.5 * slopeR;
      }

      if (uL[RHO] <= 0) uL[RHO] = getVar(state, RHO, i, jL);
      if (uR[RHO] <= 0) uR[RHO] = getVar(state, RHO, i, jR);

      const flux = hllFluxY(uL, uR, state.gamma);

      for (let v = 0; v < NVAR; v++) {
        const stride = v * nxT * nyT;
        dU[stride + jL * nxT + i] -= flux[v] / g.dy;
        dU[stride + jR * nxT + i] += flux[v] / g.dy;
      }
    }
  }

  // Resistive source terms
  if (state.eta > 0) {
    for (const bVar of [BX, BY, BZ]) {
      for (let j = g.nghost; j < g.ny + g.nghost; j++) {
        for (let i = g.nghost; i < g.nx + g.nghost; i++) {
          const b0 = getVar(state, bVar, i, j);
          const bxm = getVar(state, bVar, i - 1, j);
          const bxp = getVar(state, bVar, i + 1, j);
          const bym = getVar(state, bVar, i, j - 1);
          const byp = getVar(state, bVar, i, j + 1);

          const laplacian =
            (bxp - 2 * b0 + bxm) / (g.dx * g.dx) +
            (byp - 2 * b0 + bym) / (g.dy * g.dy);

          dU[bVar * nxT * nyT + j * nxT + i] += state.eta * laplacian;
        }
      }
    }
  }

  return dU;
}

function applyBoundary(state: MhdState, bc: "periodic" | "outflow"): void {
  const g = state.grid;
  const nxT = totalX(g);
  const nyT = totalY(g);
  const ng = g.nghost;

  for (let v = 0; v < NVAR; v++) {
    const s = v * nxT * nyT;

    if (bc === "periodic") {
      for (let j = 0; j < nyT; j++) {
        for (let k = 0; k < ng; k++) {
          state.U[s + j * nxT + k] = state.U[s + j * nxT + (g.nx + k)];
          state.U[s + j * nxT + (g.nx + ng + k)] = state.U[s + j * nxT + (ng + k)];
        }
      }
      for (let i = 0; i < nxT; i++) {
        for (let k = 0; k < ng; k++) {
          state.U[s + k * nxT + i] = state.U[s + (g.ny + k) * nxT + i];
          state.U[s + (g.ny + ng + k) * nxT + i] = state.U[s + (ng + k) * nxT + i];
        }
      }
    } else {
      for (let j = 0; j < nyT; j++) {
        for (let k = 0; k < ng; k++) {
          state.U[s + j * nxT + k] = state.U[s + j * nxT + ng];
          state.U[s + j * nxT + (g.nx + ng + k)] = state.U[s + j * nxT + (g.nx + ng - 1)];
        }
      }
      for (let i = 0; i < nxT; i++) {
        for (let k = 0; k < ng; k++) {
          state.U[s + k * nxT + i] = state.U[s + ng * nxT + i];
          state.U[s + (g.ny + ng + k) * nxT + i] = state.U[s + (g.ny + ng - 1) * nxT + i];
        }
      }
    }
  }
}

function minmod(a: number, b: number): number {
  if (a * b <= 0) return 0;
  return Math.abs(a) < Math.abs(b) ? a : b;
}
