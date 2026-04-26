import { createGrid, cellCenterX, cellCenterY } from "./grid";
import { createState, setVar, RHO, MX, MY, MZ, BX, BY, BZ, EN, type MhdState } from "./state";

// Orszag-Tang vortex: standard 2D MHD test problem
// Tests shock interactions, current sheet formation, and ∇·B control
export function orszagTang(nx: number = 128, gamma: number = 5 / 3): MhdState {
  const g = createGrid(nx, nx, 0, 2 * Math.PI, 0, 2 * Math.PI);
  const s = createState(g, gamma);

  for (let j = 0; j < g.ny + 2 * g.nghost; j++) {
    for (let i = 0; i < g.nx + 2 * g.nghost; i++) {
      const x = cellCenterX(g, i);
      const y = cellCenterY(g, j);

      const rho = 25 / (36 * Math.PI);
      const vx = -Math.sin(y);
      const vy = Math.sin(x);
      const bx = -Math.sin(y) / Math.sqrt(4 * Math.PI);
      const by = Math.sin(2 * x) / Math.sqrt(4 * Math.PI);
      const p = 5 / (12 * Math.PI);

      const ke = 0.5 * rho * (vx * vx + vy * vy);
      const be = 0.5 * (bx * bx + by * by);
      const e = p / (gamma - 1) + ke + be;

      setVar(s, RHO, i, j, rho);
      setVar(s, MX, i, j, rho * vx);
      setVar(s, MY, i, j, rho * vy);
      setVar(s, MZ, i, j, 0);
      setVar(s, BX, i, j, bx);
      setVar(s, BY, i, j, by);
      setVar(s, BZ, i, j, 0);
      setVar(s, EN, i, j, e);
    }
  }

  return s;
}

// Harris current sheet: standard reconnection test
// Anti-parallel B field with a thin current sheet at y=0
// With perturbation to trigger reconnection
export function harrisSheet(
  nx: number = 256,
  ny: number = 128,
  eta: number = 1e-3,
  gamma: number = 5 / 3,
): MhdState {
  const Lx = 4 * Math.PI;
  const Ly = 2 * Math.PI;
  const g = createGrid(nx, ny, -Lx / 2, Lx / 2, -Ly / 2, Ly / 2);
  const s = createState(g, gamma, eta);

  const B0 = 1.0;
  const lambda = 0.5; // current sheet half-width
  const rho0 = 1.0;
  const beta = 0.2; // plasma beta at sheet center
  const p0 = beta * B0 * B0 / 2;
  const pertAmp = 0.1;

  for (let j = 0; j < g.ny + 2 * g.nghost; j++) {
    for (let i = 0; i < g.nx + 2 * g.nghost; i++) {
      const x = cellCenterX(g, i);
      const y = cellCenterY(g, j);

      const bx = B0 * Math.tanh(y / lambda);
      const rho = rho0 * (1 + 1 / (Math.cosh(y / lambda) * Math.cosh(y / lambda)));
      const p = p0 + 0.5 * B0 * B0 * (1 - Math.tanh(y / lambda) * Math.tanh(y / lambda));

      // Perturbation: localized magnetic island
      const psi = pertAmp * Math.cos(2 * Math.PI * x / Lx) * Math.exp(-y * y / (4 * lambda * lambda));
      const dbx = -(2 * y / (4 * lambda * lambda)) * psi;
      const dby = (2 * Math.PI / Lx) * pertAmp * Math.sin(2 * Math.PI * x / Lx) * Math.exp(-y * y / (4 * lambda * lambda));

      const bxTotal = bx + dbx;
      const byTotal = dby;

      const ke = 0;
      const be = 0.5 * (bxTotal * bxTotal + byTotal * byTotal);
      const e = p / (gamma - 1) + ke + be;

      setVar(s, RHO, i, j, rho);
      setVar(s, MX, i, j, 0);
      setVar(s, MY, i, j, 0);
      setVar(s, MZ, i, j, 0);
      setVar(s, BX, i, j, bxTotal);
      setVar(s, BY, i, j, byTotal);
      setVar(s, BZ, i, j, 0);
      setVar(s, EN, i, j, e);
    }
  }

  return s;
}

// MRI-unstable shearing box (local approximation)
// Vertical field threaded through differentially rotating disk
export function mriShearingBox(
  nx: number = 64,
  ny: number = 64,
  beta: number = 100,
  gamma: number = 5 / 3,
): MhdState {
  const Lx = 1.0;
  const Ly = 1.0;
  const g = createGrid(nx, ny, 0, Lx, 0, Ly);

  const Omega = 1.0; // angular velocity
  const q = 1.5; // shear parameter (Keplerian)
  const rho0 = 1.0;
  const cs = 1.0;
  const p0 = rho0 * cs * cs / gamma;
  const Bz0 = Math.sqrt(2 * p0 / beta);

  const s = createState(g, gamma, 0);

  for (let j = 0; j < g.ny + 2 * g.nghost; j++) {
    for (let i = 0; i < g.nx + 2 * g.nghost; i++) {
      const x = cellCenterX(g, i);
      const y = cellCenterY(g, j);

      // White noise velocity perturbation
      const dvx = 1e-4 * cs * (Math.random() - 0.5);
      const dvy = 1e-4 * cs * (Math.random() - 0.5);

      const be = 0.5 * Bz0 * Bz0;
      const ke = 0.5 * rho0 * (dvx * dvx + dvy * dvy);
      const e = p0 / (gamma - 1) + ke + be;

      setVar(s, RHO, i, j, rho0);
      setVar(s, MX, i, j, rho0 * dvx);
      setVar(s, MY, i, j, rho0 * dvy);
      setVar(s, MZ, i, j, 0);
      setVar(s, BX, i, j, 0);
      setVar(s, BY, i, j, 0);
      setVar(s, BZ, i, j, Bz0);
      setVar(s, EN, i, j, e);
    }
  }

  return s;
}

// Simple dynamo: rotating conducting fluid with seed field
export function dynamoOnset(
  nx: number = 64,
  ny: number = 64,
  Rm: number = 50,
  gamma: number = 5 / 3,
): MhdState {
  const g = createGrid(nx, ny, 0, 2 * Math.PI, 0, 2 * Math.PI);
  const eta = 1.0 / Rm;
  const s = createState(g, gamma, eta);

  const rho0 = 1.0;
  const v0 = 1.0;
  const B0seed = 1e-4;
  const p0 = 1.0;

  for (let j = 0; j < g.ny + 2 * g.nghost; j++) {
    for (let i = 0; i < g.nx + 2 * g.nghost; i++) {
      const x = cellCenterX(g, i);
      const y = cellCenterY(g, j);

      // ABC-like flow
      const vx = v0 * Math.sin(y);
      const vy = v0 * Math.sin(x);

      // Seed magnetic field
      const bx = B0seed * Math.sin(y);
      const by = B0seed * Math.cos(x);

      const ke = 0.5 * rho0 * (vx * vx + vy * vy);
      const be = 0.5 * (bx * bx + by * by);
      const e = p0 / (gamma - 1) + ke + be;

      setVar(s, RHO, i, j, rho0);
      setVar(s, MX, i, j, rho0 * vx);
      setVar(s, MY, i, j, rho0 * vy);
      setVar(s, MZ, i, j, 0);
      setVar(s, BX, i, j, bx);
      setVar(s, BY, i, j, by);
      setVar(s, BZ, i, j, 0);
      setVar(s, EN, i, j, e);
    }
  }

  return s;
}
