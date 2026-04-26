export interface Grid {
  nx: number;
  ny: number;
  dx: number;
  dy: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  nghost: number;
}

export function createGrid(
  nx: number,
  ny: number,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  nghost: number = 2,
): Grid {
  return {
    nx,
    ny,
    dx: (xMax - xMin) / nx,
    dy: (yMax - yMin) / ny,
    xMin,
    xMax,
    yMin,
    yMax,
    nghost,
  };
}

export function totalX(g: Grid): number {
  return g.nx + 2 * g.nghost;
}

export function totalY(g: Grid): number {
  return g.ny + 2 * g.nghost;
}

export function cellCenterX(g: Grid, i: number): number {
  return g.xMin + (i - g.nghost + 0.5) * g.dx;
}

export function cellCenterY(g: Grid, j: number): number {
  return g.yMin + (j - g.nghost + 0.5) * g.dy;
}

export function idx(g: Grid, i: number, j: number): number {
  return j * totalX(g) + i;
}

export function allocField(g: Grid): Float64Array {
  return new Float64Array(totalX(g) * totalY(g));
}
