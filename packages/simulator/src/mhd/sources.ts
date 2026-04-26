import { type Grid, totalX, totalY, cellCenterX } from "./grid";
import { type MhdState, NVAR, RHO, MX, MY, MZ, BX, BY, BZ, EN, getVar } from "./state";

export interface SourceTerms {
  apply(state: MhdState, dU: Float64Array): void;
}

// Shearing box source terms for MRI:
//   Coriolis: ∂(ρvx)/∂t += 2Ω(ρvy),  ∂(ρvy)/∂t += -(2-q)Ω(ρvx)
//   Tidal:    ∂(ρvx)/∂t += 2qΩ²ρx
//   Shear advection on By: ∂By/∂t += -qΩ Bx
export function shearingBoxSource(Omega: number = 1.0, q: number = 1.5): SourceTerms {
  return {
    apply(state, dU) {
      const g = state.grid;
      const nxT = totalX(g);
      const nyT = totalY(g);

      for (let j = g.nghost; j < g.ny + g.nghost; j++) {
        for (let i = g.nghost; i < g.nx + g.nghost; i++) {
          const rho = getVar(state, RHO, i, j);
          const vx = getVar(state, MX, i, j) / rho;
          const vy = getVar(state, MY, i, j) / rho;
          const bx = getVar(state, BX, i, j);
          const x = cellCenterX(g, i) - (g.xMax + g.xMin) / 2;

          const k = j * nxT + i;

          // Coriolis force
          dU[MX * nxT * nyT + k] += 2 * Omega * rho * vy;
          dU[MY * nxT * nyT + k] -= (2 - q) * Omega * rho * vx;

          // Tidal force (radial gravity gradient)
          dU[MX * nxT * nyT + k] += 2 * q * Omega * Omega * rho * x;

          // Shear of By by differential rotation: ∂By/∂t = -qΩBx
          dU[BY * nxT * nyT + k] -= q * Omega * bx;

          // Energy source from tidal + Coriolis work
          dU[EN * nxT * nyT + k] += 2 * Omega * rho * vy * vx
            + 2 * q * Omega * Omega * rho * x * vx;
        }
      }
    },
  };
}

// Mean-field α-effect dynamo source:
//   ∂B/∂t += α∇×B  (helical turbulence regenerates field)
// This allows 2D dynamo action that would otherwise be forbidden
export function meanFieldAlpha(alpha0: number = 0.1): SourceTerms {
  return {
    apply(state, dU) {
      const g = state.grid;
      const nxT = totalX(g);
      const nyT = totalY(g);

      for (let j = g.nghost; j < g.ny + g.nghost; j++) {
        for (let i = g.nghost; i < g.nx + g.nghost; i++) {
          // curl B in 2D: (∂Bz/∂y, -∂Bz/∂x, ∂By/∂x - ∂Bx/∂y)
          const dBzdy = (getVar(state, BZ, i, j + 1) - getVar(state, BZ, i, j - 1)) / (2 * g.dy);
          const dBzdx = (getVar(state, BZ, i + 1, j) - getVar(state, BZ, i - 1, j)) / (2 * g.dx);
          const dBydx = (getVar(state, BY, i + 1, j) - getVar(state, BY, i - 1, j)) / (2 * g.dx);
          const dBxdy = (getVar(state, BX, i, j + 1) - getVar(state, BX, i, j - 1)) / (2 * g.dy);

          const curlBx = dBzdy;
          const curlBy = -dBzdx;
          const curlBz = dBydx - dBxdy;

          const k = j * nxT + i;
          dU[BX * nxT * nyT + k] += alpha0 * curlBx;
          dU[BY * nxT * nyT + k] += alpha0 * curlBy;
          dU[BZ * nxT * nyT + k] += alpha0 * curlBz;
        }
      }
    },
  };
}
