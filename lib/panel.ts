/**
 * Hess–Smith panel method for a single closed aerofoil.
 *
 * Each panel carries a constant source strength. One constant vortex strength
 * is shared by every panel and is fixed by the Kutta condition at the
 * trailing edge (Kuethe & Chow / Hess & Smith midpoint formulation):
 *   (V · t)_1 + (V · t)_N = 0.
 * The flow is incompressible potential flow. It has no viscosity, no
 * separation and no numerical viscosity of a Navier–Stokes solver.
 * Lift follows from the Kutta–Joukowski relation cl = 2 Γ / (V c).
 */

import { NACA_2412, naca2412Nodes, type XY } from './naca';

export type Panel = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  xm: number;
  ym: number;
  s: number;
  cos: number;
  sin: number;
  tx: number;
  ty: number;
  nx: number;
  ny: number;
};

export type PanelSolution = {
  alphaDeg: number;
  alphaRad: number;
  nodes: XY[];
  panels: Panel[];
  sigma: number[];
  gamma: number;
  /** Kutta–Joukowski lift, cl = 2Γ/(Vc). */
  cl: number;
  /** Pressure-integrated lift, kept so the Joukowski value can be checked. */
  clPressure: number;
  cdPressure: number;
  cp: number[];
  vt: number[];
  speed: number[];
};

const PANEL_COUNT = 80;
const solutionCache = new Map<number, PanelSolution>();

export function buildPanels(nodes: XY[]): Panel[] {
  const panels: Panel[] = [];
  const n = nodes.length;
  for (let i = 0; i < n; i++) {
    const p = nodes[i];
    const q = nodes[(i + 1) % n];
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const s = Math.hypot(dx, dy);
    if (s < 1e-10) throw new Error('Panel method received a zero-length panel.');
    const cos = dx / s;
    const sin = dy / s;
    panels.push({
      x1: p.x,
      y1: p.y,
      x2: q.x,
      y2: q.y,
      xm: (p.x + q.x) / 2,
      ym: (p.y + q.y) / 2,
      s,
      cos,
      sin,
      tx: cos,
      ty: sin,
      nx: -sin,
      ny: cos,
    });
  }
  return panels;
}

type Influence = { su: number; sv: number; vu: number; vv: number };

/** Unit-source and unit-vortex velocity in global axes at (x, y). */
export function panelInfluence(panel: Panel, x: number, y: number, self: boolean): Influence {
  if (self) {
    return {
      su: panel.nx * 0.5,
      sv: panel.ny * 0.5,
      vu: panel.tx * 0.5,
      vv: panel.ty * 0.5,
    };
  }
  const dx = x - panel.x1;
  const dy = y - panel.y1;
  const xi = dx * panel.cos + dy * panel.sin;
  const eta = -dx * panel.sin + dy * panel.cos;
  const r1 = Math.hypot(xi, eta);
  const r2 = Math.hypot(xi - panel.s, eta);
  const logTerm = Math.log(Math.max(r1, 1e-12) / Math.max(r2, 1e-12));
  let ang = Math.atan2(eta, xi - panel.s) - Math.atan2(eta, xi);
  if (ang > Math.PI) ang -= 2 * Math.PI;
  if (ang < -Math.PI) ang += 2 * Math.PI;
  const uStarS = logTerm / (2 * Math.PI);
  const vStarS = ang / (2 * Math.PI);
  const uStarV = vStarS;
  const vStarV = -uStarS;
  const c = panel.cos;
  const sn = panel.sin;
  return {
    su: uStarS * c - vStarS * sn,
    sv: uStarS * sn + vStarS * c,
    vu: uStarV * c - vStarV * sn,
    vv: uStarV * sn + vStarV * c,
  };
}

type Factored = {
  nodes: XY[];
  panels: Panel[];
  lu: number[][];
  piv: number[];
  sourceN: number[][];
  sourceT: number[][];
  vortexN: number[];
  vortexT: number[];
};

let factored2412: Factored | null = null;

function factorSystem(nodes: XY[]): Factored {
  const panels = buildPanels(nodes);
  const n = panels.length;
  const sourceN: number[][] = [];
  const sourceT: number[][] = [];
  const vortexN = new Array<number>(n).fill(0);
  const vortexT = new Array<number>(n).fill(0);
  const matrix: number[][] = [];
  for (let i = 0; i < n; i++) {
    sourceN[i] = [];
    sourceT[i] = [];
    const row = new Array<number>(n + 1).fill(0);
    for (let j = 0; j < n; j++) {
      const inf = panelInfluence(panels[j], panels[i].xm, panels[i].ym, i === j);
      const nCoeff = inf.su * panels[i].nx + inf.sv * panels[i].ny;
      const tCoeff = inf.su * panels[i].tx + inf.sv * panels[i].ty;
      const nVortex = inf.vu * panels[i].nx + inf.vv * panels[i].ny;
      const tVortex = inf.vu * panels[i].tx + inf.vv * panels[i].ty;
      sourceN[i][j] = nCoeff;
      sourceT[i][j] = tCoeff;
      vortexN[i] += nVortex;
      vortexT[i] += tVortex;
      row[j] = nCoeff;
    }
    row[n] = vortexN[i];
    matrix.push(row);
  }
  const kutta = new Array<number>(n + 1).fill(0);
  for (let j = 0; j < n; j++) kutta[j] = sourceT[0][j] + sourceT[n - 1][j];
  kutta[n] = vortexT[0] + vortexT[n - 1];
  matrix.push(kutta);
  const { lu, piv } = luFactor(matrix);
  return { nodes, panels, lu, piv, sourceN, sourceT, vortexN, vortexT };
}

function get2412System(): Factored {
  if (!factored2412) factored2412 = factorSystem(naca2412Nodes(PANEL_COUNT));
  return factored2412;
}

export function solveNaca2412(alphaDeg: number): PanelSolution {
  const key = Math.round(alphaDeg * 1000);
  const hit = solutionCache.get(key);
  if (hit) return hit;
  const sys = get2412System();
  const solution = evaluate(sys, key / 1000);
  solutionCache.set(key, solution);
  if (solutionCache.size > 500) solutionCache.clear();
  return solution;
}

export function solveNodes(nodes: XY[], alphaDeg: number): PanelSolution {
  return evaluate(factorSystem(nodes), alphaDeg);
}

function evaluate(sys: Factored, alphaDeg: number): PanelSolution {
  const { panels, lu, piv } = sys;
  const n = panels.length;
  const alphaRad = (alphaDeg * Math.PI) / 180;
  const ca = Math.cos(alphaRad);
  const sa = Math.sin(alphaRad);
  const rhs = new Array<number>(n + 1).fill(0);
  for (let i = 0; i < n; i++) {
    rhs[i] = -(ca * panels[i].nx + sa * panels[i].ny);
  }
  rhs[n] = -(ca * panels[0].tx + sa * panels[0].ty + ca * panels[n - 1].tx + sa * panels[n - 1].ty);
  const unknown = luSolve(lu, piv, rhs);
  const sigma = unknown.slice(0, n);
  const gamma = unknown[n];

  const cp = new Array<number>(n);
  const vt = new Array<number>(n);
  const speed = new Array<number>(n);
  let cx = 0;
  let cy = 0;
  let perimeter = 0;
  for (let i = 0; i < n; i++) {
    let u = ca;
    let v = sa;
    for (let j = 0; j < n; j++) {
      const inf = panelInfluence(panels[j], panels[i].xm, panels[i].ym, i === j);
      u += sigma[j] * inf.su + gamma * inf.vu;
      v += sigma[j] * inf.sv + gamma * inf.vv;
    }
    const tangential = u * panels[i].tx + v * panels[i].ty;
    const q = Math.hypot(u, v);
    vt[i] = tangential;
    speed[i] = q;
    cp[i] = 1 - q * q;
    cx += -cp[i] * panels[i].nx * panels[i].s;
    cy += -cp[i] * panels[i].ny * panels[i].s;
    perimeter += panels[i].s;
  }
  const clPressure = cy * ca - cx * sa;
  const cdPressure = cx * ca + cy * sa;
  const circulation = gamma * perimeter;
  const clJoukowski = 2 * circulation;
  return {
    alphaDeg,
    alphaRad,
    nodes: sys.nodes,
    panels,
    sigma,
    gamma,
    cl: clJoukowski,
    clPressure,
    cdPressure,
    cp,
    vt,
    speed,
  };
}

export function velocityAt(solution: PanelSolution, x: number, y: number): { u: number; v: number } {
  const ca = Math.cos(solution.alphaRad);
  const sa = Math.sin(solution.alphaRad);
  let u = ca;
  let v = sa;
  const { panels, sigma, gamma } = solution;
  for (let j = 0; j < panels.length; j++) {
    const inf = panelInfluence(panels[j], x, y, false);
    u += sigma[j] * inf.su + gamma * inf.vu;
    v += sigma[j] * inf.sv + gamma * inf.vv;
  }
  return { u, v };
}

export function pointInside(nodes: XY[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = nodes.length - 1; i < nodes.length; j = i++) {
    const yi = nodes[i].y;
    const yj = nodes[j].y;
    const xi = nodes[i].x;
    const xj = nodes[j].x;
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export const NACA_LABEL = `NACA ${NACA_2412.m * 100}${NACA_2412.p * 10}${NACA_2412.t * 100}`;

function luFactor(a: number[][]): { lu: number[][]; piv: number[] } {
  const n = a.length;
  const lu = a.map((row) => row.slice());
  const piv = Array.from({ length: n }, (_, i) => i);
  for (let k = 0; k < n; k++) {
    let max = k;
    for (let i = k + 1; i < n; i++) {
      if (Math.abs(lu[i][k]) > Math.abs(lu[max][k])) max = i;
    }
    if (Math.abs(lu[max][k]) < 1e-14) throw new Error('The panel matrix is singular.');
    if (max !== k) {
      const row = lu[k];
      lu[k] = lu[max];
      lu[max] = row;
      const p = piv[k];
      piv[k] = piv[max];
      piv[max] = p;
    }
    for (let i = k + 1; i < n; i++) {
      lu[i][k] /= lu[k][k];
      for (let j = k + 1; j < n; j++) lu[i][j] -= lu[i][k] * lu[k][j];
    }
  }
  return { lu, piv };
}

function luSolve(lu: number[][], piv: number[], b: number[]): number[] {
  const n = b.length;
  const y = piv.map((i) => b[i]);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < i; j++) y[i] -= lu[i][j] * y[j];
  }
  for (let i = n - 1; i >= 0; i--) {
    for (let j = i + 1; j < n; j++) y[i] -= lu[i][j] * y[j];
    y[i] /= lu[i][i];
  }
  return y;
}
