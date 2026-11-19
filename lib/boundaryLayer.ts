/**
 * Integral boundary layer on the inviscid panel velocity.
 *
 * Laminar: Thwaites' quadrature, separation at λ = −0.09.
 *   θ² u_e⁶ = 0.45 ν ∫ u_e⁵ ds, with θ² = 0.075 ν / u_e' at a stagnation point.
 * Transition: Michel's criterion
 *   Re_θ ≥ 1.174 (1 + 22400 / Re_x) Re_x^0.46, Re_x = u_e s / ν from stagnation.
 *   If the laminar layer separates first, the march is restarted as turbulent
 *   at that station with an imposed shape factor H = 1.4. That is an assumed
 *   short bubble: bubble length, shear-layer transition and reattachment are
 *   not calculated. The restart station is not a Michel transition location.
 * Turbulent: Head's entrainment method with the Cebeci–Bradshaw H₁(H) fits
 *   and the Ludwieg–Tillmann skin friction. Separation is taken at H = 2.4.
 * The march stops at x/c = 0.99. The inviscid trailing-edge deceleration over
 * the last percent of chord is a sharp-edge artefact.
 *
 * One-way coupling: u_e is the panel speed. Displacement thickness is not fed
 * back, and the separated wake does not change the panel solution.
 */

import type { PanelSolution } from './panel';

const TRIM_X = 0.99;
const LAMINAR_SEPARATION_LAMBDA = -0.09;
const TURBULENT_SEPARATION_H = 2.4;

export type SurfaceName = 'upper' | 'lower';

export type SurfaceMarch = {
  surface: SurfaceName;
  separated: boolean;
  laminarSeparation: boolean;
  /** Chordwise station of the finite Head separation criterion. 1 means that criterion was not met. */
  separationX: number;
  separationY: number;
  /**
   * Station where the turbulent march starts.
   * This is a Michel station only when naturalTransition is true.
   * When shortBubbleRestart is true it is the assumed restart, not natural transition.
   */
  transitionX: number;
  /** Michel's criterion met before, or on the same station as, laminar separation. */
  naturalTransition: boolean;
  naturalTransitionX: number | null;
  /** Thwaites λ = −0.09. Null when the laminar march stopped for another reason first. */
  laminarSeparationX: number | null;
  /** Laminar separation strictly before Michel's criterion. Head still restarts at H = 1.4. */
  shortBubbleRestart: boolean;
  shortBubbleRestartX: number | null;
  /** Finite stop at H = 2.4 or H₁ = 3.43. A non-finite stop does not set this. */
  turbulentSeparation: boolean;
  integrationFailed: boolean;
  thetaEnd: number;
  hEnd: number;
  ueEnd: number;
  panelSeparated: boolean[];
};

export type BoundaryLayerResult = {
  upper: SurfaceMarch;
  lower: SurfaceMarch;
  /** Squire–Young profile drag summed over both surfaces. Invalid once a surface has separated; see cdAttachedOnly. */
  cdSquireYoung: number;
  separated: boolean;
};

type Station = {
  panelIndex: number;
  s: number;
  x: number;
  y: number;
  ue: number;
};

export function marchBoundaryLayer(solution: PanelSolution, reynolds: number): BoundaryLayerResult {
  const re = Math.max(reynolds, 1);
  const branches = splitBranches(solution);
  const upper = marchBranch(branches.upper, 'upper', re);
  const lower = marchBranch(branches.lower, 'lower', re);
  const cdSquireYoung = squireYoung(upper) + squireYoung(lower);
  return {
    upper,
    lower,
    cdSquireYoung,
    separated: upper.separated || lower.separated,
  };
}

/**
 * Squire–Young (1938): c_d = 2 (θ/c) (u_e/V)^((H+5)/2) per surface.
 * Applied at the last attached station at or before x/c = 0.99.
 */
function squireYoung(surface: SurfaceMarch): number {
  const ue = Math.max(surface.ueEnd, 1e-3);
  return 2 * Math.max(surface.thetaEnd, 0) * Math.pow(ue, (surface.hEnd + 5) / 2);
}

function marchBranch(stations: Station[], surface: SurfaceName, reynolds: number): SurfaceMarch {
  const nu = 1 / reynolds;
  const panelSeparated = new Array<boolean>(stations.length > 0 ? Math.max(...stations.map((st) => st.panelIndex)) + 1 : 0).fill(false);
  const empty: SurfaceMarch = {
    surface,
    separated: false,
    laminarSeparation: false,
    separationX: 1,
    separationY: surface === 'upper' ? 0 : 0,
    transitionX: 1,
    naturalTransition: false,
    naturalTransitionX: null,
    laminarSeparationX: null,
    shortBubbleRestart: false,
    shortBubbleRestartX: null,
    turbulentSeparation: false,
    integrationFailed: false,
    thetaEnd: 0,
    hEnd: 2.61,
    ueEnd: 1,
    panelSeparated,
  };
  if (stations.length < 3) return empty;

  const ue = smooth(stations.map((st) => st.ue));
  ue[0] = 0;
  const markFrom = (index: number) => {
    for (let k = index; k < stations.length; k++) panelSeparated[stations[k].panelIndex] = true;
  };

  let integral = 0;
  let theta = stagnationTheta(ue, stations, nu);
  let transitionAt = -1;
  let laminarSepAt = -1;

  for (let i = 1; i < stations.length; i++) {
    if (stations[i].x > TRIM_X && passedLeadingEdge(stations, i)) break;
    const ds = stations[i].s - stations[i - 1].s;
    if (ds <= 0) continue;
    integral += 0.5 * (Math.pow(ue[i - 1], 5) + Math.pow(ue[i], 5)) * ds;
    const uei = Math.max(ue[i], 1e-4);
    const theta2 = (0.45 * nu * integral) / Math.pow(uei, 6);
    theta = Math.sqrt(Math.max(theta2, 0));
    const due = (ue[i] - ue[i - 1]) / ds;
    const lambda = (theta2 * due) / nu;
    const reTheta = uei * theta * reynolds;
    const reX = uei * stations[i].s * reynolds;
    if (laminarSepAt < 0 && lambda <= LAMINAR_SEPARATION_LAMBDA) laminarSepAt = i;
    if (transitionAt < 0 && reX > 50 && reTheta >= michel(reX)) transitionAt = i;
    if (transitionAt >= 0 || laminarSepAt >= 0) break;
  }

  const startTurbulent = transitionAt >= 0 ? transitionAt : laminarSepAt;
  if (startTurbulent < 0) {
    const end = lastTrimmedIndex(stations);
    const lambdaEnd = endLambda(ue, stations, end, nu, integral);
    const thetaEnd = thetaAt(ue, stations, end, nu);
    const hEnd = thwaitesH(lambdaEnd);
    const ueEnd = Math.max(ue[end], 0);
    return {
      ...empty,
      separationX: 1,
      separationY: stations[end].y,
      transitionX: 1,
      naturalTransition: false,
      naturalTransitionX: null,
      laminarSeparationX: null,
      shortBubbleRestart: false,
      shortBubbleRestartX: null,
      turbulentSeparation: false,
      integrationFailed: !Number.isFinite(thetaEnd) || !Number.isFinite(hEnd) || !Number.isFinite(ueEnd),
      thetaEnd,
      hEnd,
      ueEnd,
      separated: false,
    };
  }

  const turbulent = integrateHead(stations, ue, startTurbulent, theta, reynolds);
  if (turbulent.separated) markFrom(turbulent.index);
  const laminarBeforeTransition = laminarSepAt >= 0 && (transitionAt < 0 || laminarSepAt < transitionAt);
  const michelAtOrBeforeLaminar = transitionAt >= 0 && (laminarSepAt < 0 || transitionAt <= laminarSepAt);
  return {
    surface,
    separated: turbulent.separated,
    laminarSeparation: laminarSepAt >= 0 && (transitionAt < 0 || laminarSepAt <= transitionAt),
    separationX: turbulent.separated ? stations[turbulent.index].x : 1,
    separationY: stations[turbulent.separated ? turbulent.index : turbulent.endIndex].y,
    transitionX: stations[startTurbulent].x,
    naturalTransition: michelAtOrBeforeLaminar,
    naturalTransitionX: michelAtOrBeforeLaminar ? stations[transitionAt].x : null,
    laminarSeparationX: laminarSepAt >= 0 ? stations[laminarSepAt].x : null,
    shortBubbleRestart: laminarBeforeTransition,
    shortBubbleRestartX: laminarBeforeTransition ? stations[laminarSepAt].x : null,
    turbulentSeparation: turbulent.separated,
    integrationFailed: turbulent.integrationFailed,
    thetaEnd: turbulent.theta,
    hEnd: turbulent.h,
    ueEnd: turbulent.ue,
    panelSeparated,
  };
}

function thetaAt(ue: number[], stations: Station[], end: number, nu: number): number {
  let integral = 0;
  for (let i = 1; i <= end; i++) {
    const ds = stations[i].s - stations[i - 1].s;
    integral += 0.5 * (Math.pow(ue[i - 1], 5) + Math.pow(ue[i], 5)) * ds;
  }
  const uei = Math.max(ue[end], 1e-4);
  return Math.sqrt(Math.max((0.45 * nu * integral) / Math.pow(uei, 6), 0));
}

function endLambda(ue: number[], stations: Station[], end: number, nu: number, _integral: number): number {
  if (end < 1) return 0;
  const theta = thetaAt(ue, stations, end, nu);
  const ds = stations[end].s - stations[end - 1].s;
  const due = ds > 0 ? (ue[end] - ue[end - 1]) / ds : 0;
  return (theta * theta * due) / nu;
}

function lastTrimmedIndex(stations: Station[]): number {
  let end = stations.length - 1;
  for (let i = 1; i < stations.length; i++) {
    if (stations[i].x > TRIM_X && passedLeadingEdge(stations, i)) {
      end = i - 1;
      break;
    }
  }
  return Math.max(1, end);
}

function passedLeadingEdge(stations: Station[], index: number): boolean {
  let minX = stations[0].x;
  for (let i = 0; i <= index; i++) minX = Math.min(minX, stations[i].x);
  return minX < 0.05 && stations[index].x > minX + 0.02;
}

function stagnationTheta(ue: number[], stations: Station[], nu: number): number {
  const ds = Math.max(stations[1].s - stations[0].s, 1e-6);
  const due = Math.max((ue[1] - ue[0]) / ds, 1e-4);
  return Math.sqrt((0.075 * nu) / due);
}

/** Polynomial fit to Thwaites' table, anchored at the flat-plate value H(0) = 2.61. */
function thwaitesH(lambda: number): number {
  const l = Math.max(-0.1, Math.min(0.1, lambda));
  return 2.61 - 3.75 * l + 5.24 * l * l;
}

function michel(reX: number): number {
  const rx = Math.max(reX, 1);
  return 1.174 * (1 + 22400 / rx) * Math.pow(rx, 0.46);
}

/**
 * Cebeci and Bradshaw's fit to Head's entrainment shape factor.
 * H₁ = 3.3 + 0.8234 (H − 1.1)^(−1.287) for H ≤ 1.6
 * H₁ = 3.3 + 1.5501 (H − 0.6778)^(−3.064) for H > 1.6
 */
export function h1OfH(h: number): number {
  if (h <= 1.6) return 3.3 + 0.8234 * Math.pow(Math.max(h - 1.1, 1e-3), -1.287);
  return 3.3 + 1.5501 * Math.pow(Math.max(h - 0.6778, 1e-3), -3.064);
}

/** Inverse of the Cebeci–Bradshaw fit. H = 3 once H₁ has fallen to the separation branch. */
export function hOfH1(h1: number): number {
  if (h1 >= 5.3) return 1.1 + 0.86 * Math.pow(h1 - 3.3, -0.777);
  if (h1 > 3.427) return 0.6778 + 1.1538 * Math.pow(h1 - 3.3, -0.326);
  return 3;
}

/**
 * Head stop labels. A non-finite H, θ or H₁ is an integration failure.
 * H = 2.4 and H₁ = 3.43 remain the separation criterion, and only when every value is finite.
 */
export function classifyHeadStop(h: number, theta: number, h1: number): { separated: boolean; integrationFailed: boolean } {
  const finite = Number.isFinite(h) && Number.isFinite(theta) && Number.isFinite(h1);
  return {
    separated: finite && (h >= TURBULENT_SEPARATION_H || h1 <= 3.43),
    integrationFailed: !finite,
  };
}

function ludwiegTillmann(h: number, reTheta: number): number {
  const re = Math.max(reTheta, 20);
  return 0.246 * Math.pow(10, -0.678 * h) * Math.pow(re, -0.268);
}

function integrateHead(
  stations: Station[],
  ue: number[],
  start: number,
  theta0: number,
  reynolds: number,
): { separated: boolean; integrationFailed: boolean; index: number; endIndex: number; theta: number; h: number; ue: number } {
  let theta = Math.max(theta0, 1e-8);
  let h = 1.4;
  let h1 = h1OfH(h);
  let endIndex = start;
  const substeps = 4;
  for (let i = start + 1; i < stations.length; i++) {
    if (stations[i].x > TRIM_X && passedLeadingEdge(stations, i)) break;
    const dsTotal = stations[i].s - stations[i - 1].s;
    if (dsTotal <= 0) continue;
    const due = (ue[i] - ue[i - 1]) / dsTotal;
    const ds = dsTotal / substeps;
    let stopped = false;
    for (let sub = 0; sub < substeps; sub++) {
      const ueLocal = ue[i - 1] + due * ds * (sub + 0.5);
      const safeUe = Math.max(Math.abs(ueLocal), 1e-3);
      const reTheta = safeUe * theta * reynolds;
      const cf = ludwiegTillmann(h, reTheta);
      const dTheta = cf / 2 - ((h + 2) * theta * due) / safeUe;
      const entrainment = 0.0306 * Math.pow(Math.max(h1 - 3, 1e-3), -0.6169);
      const q = safeUe * theta * h1;
      const dQ = safeUe * entrainment;
      theta = Math.max(theta + dTheta * ds, 1e-8);
      const qNext = Math.max(q + dQ * ds, 1e-10);
      h1 = qNext / (safeUe * theta);
      h = hOfH1(h1);
      const stop = classifyHeadStop(h, theta, h1);
      if (stop.integrationFailed || stop.separated) {
        stopped = true;
        break;
      }
    }
    endIndex = i;
    if (stopped) {
      const stop = classifyHeadStop(h, theta, h1);
      return {
        separated: stop.separated,
        integrationFailed: stop.integrationFailed,
        index: i,
        endIndex: i,
        theta,
        h: stop.integrationFailed ? h : Math.min(h, 3),
        ue: Math.max(ue[i], 0),
      };
    }
  }
  return {
    separated: false,
    integrationFailed: false,
    index: endIndex,
    endIndex,
    theta,
    h,
    ue: Math.max(ue[endIndex], 0),
  };
}

function smooth(values: number[]): number[] {
  if (values.length < 3) return values.slice();
  const out = values.slice();
  for (let i = 1; i < values.length - 1; i++) {
    out[i] = 0.25 * values[i - 1] + 0.5 * values[i] + 0.25 * values[i + 1];
  }
  return out;
}

function splitBranches(solution: PanelSolution): { upper: Station[]; lower: Station[] } {
  const { panels } = solution;
  const n = panels.length;
  const stag = findStagnation(solution);
  // Clockwise panels end at the upper trailing edge; the opposite walk ends at the lower trailing edge.
  return {
    upper: walkBranch(solution, stag, 1, n - 1),
    lower: walkBranch(solution, stag, -1, 0),
  };
}

function findStagnation(solution: PanelSolution): number {
  const { panels, vt, speed } = solution;
  const n = panels.length;
  let stag = 0;
  let nearest = Infinity;
  let found = false;
  for (let i = 0; i < n; i++) {
    const next = vt[(i + 1) % n];
    if (vt[i] <= 0 && next > 0 && panels[i].xm < nearest) {
      nearest = panels[i].xm;
      stag = i;
      found = true;
    }
  }
  if (found) return stag;
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    if (speed[i] < best) {
      best = speed[i];
      stag = i;
    }
  }
  return stag;
}

function walkBranch(solution: PanelSolution, stag: number, step: 1 | -1, stopIndex: number): Station[] {
  const { panels, speed } = solution;
  const n = panels.length;
  const stations: Station[] = [{ panelIndex: stag, s: 0, x: panels[stag].xm, y: panels[stag].ym, ue: 0 }];
  let s = 0;
  for (let k = 1; k < n; k++) {
    const i = mod(stag + step * k, n);
    const prev = mod(stag + step * (k - 1), n);
    s += panelGap(panels[prev], panels[i]);
    stations.push({ panelIndex: i, s, x: panels[i].xm, y: panels[i].ym, ue: Math.max(speed[i], 0) });
    if (i === stopIndex) break;
  }
  return stations;
}

function panelGap(a: PanelSolution['panels'][number], b: PanelSolution['panels'][number]): number {
  return Math.hypot(b.xm - a.xm, b.ym - a.ym);
}

function mod(i: number, n: number): number {
  return ((i % n) + n) % n;
}
