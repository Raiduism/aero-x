/**
 * Controlled numerical experiments. Does not modify the production solver.
 *
 * Experiment 1 changes only the edge-velocity filter and, for the polynomial
 * method, the velocity derivative. Geometry stays on the production midpoint
 * spacing with Ue = 0 at the upstream panel midpoint.
 *
 * Experiment 2 changes only the surface coordinate and the stagnation
 * placement. The filter stays on the production three-point stencil.
 *
 * along each flat panel. A fourth samples the same nodes displaced 0.002c
 * along the outward normal, because a flat panel near the curved leading
 * edge lies inside the aerofoil. That offset is an experiment parameter,
 * not a fitted correction.
 *
 * The fixed-chord half-width is 0.02c. It was chosen as the experiment
 * parameter before the runs. It is not a correction fitted to a separation
 * station.
 *
 * None of these outputs is a wind-tunnel measurement.
 */

import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { h1OfH, hOfH1, marchBoundaryLayer } from '../lib/boundaryLayer';
import { naca2412Nodes } from '../lib/naca';
import { solveNaca2412, solveNodes, velocityAt, type Panel, type PanelSolution } from '../lib/panel';

const ANGLES = [5, 10, 13, 15];
const REYNOLDS = [100_000, 500_000];
const PANEL_COUNTS = [40, 80, 160, 320];
const OUTPUT = join(process.cwd(), 'convergence');
const TRIM_X = 0.99;
const LAMINAR_SEPARATION_LAMBDA = -0.09;
const TURBULENT_SEPARATION_H = 2.4;
/** Half-width of the fixed-chord filter, in chord lengths. Set before the runs. */
const FIXED_HALF_WIDTH = 0.02;

type SurfaceName = 'upper' | 'lower';
type SmoothKind = 'none' | 'three_panel' | 'fixed_chord' | 'quadratic';
type SpacingKind = 'midpoint' | 'arc';
type StagnationKind = 'forced_midpoint' | 'interpolated';

type Station = {
  panelIndex: number;
  s: number;
  x: number;
  y: number;
  ue: number;
};

type Prepared = {
  ue: number[];
  dueAt: (index: number) => number;
  windowAtPeak: number | null;
};

type SurfaceResult = {
  maxUe: number | null;
  xAtMaxUe: number | null;
  maxAdverseDue: number | null;
  xAtMaxAdverseDue: number | null;
  maxAdverseDueForward: number | null;
  xAtMaxAdverseDueForward: number | null;
  laminarSeparationX: number | null;
  transitionX: number | null;
  headSeparationX: number | null;
  headStartX: number | null;
  headStartReason: string;
  headSeparated: boolean;
  headH: number | null;
  attached: boolean;
  nonFinite: boolean;
};

type LambdaRow = {
  experiment: string;
  method: string;
  alpha_deg: number;
  reynolds: number;
  panel_count: number;
  surface: SurfaceName;
  station_index: number;
  s: number;
  x: number;
  ue: number;
  due_ds: number | null;
  lambda: number | null;
  past_head_start: boolean;
};

type BoundarySummary = {
  experiment: string;
  method: string;
  spacing: SpacingKind;
  stagnation: StagnationKind;
  smoothing: SmoothKind;
  alpha_deg: number;
  reynolds: number;
  panel_count: number;
  surface: SurfaceName;
  stagnation_x: number | null;
  station_count: number;
  window_points_at_peak: number | null;
  matches_production_march: boolean | null;
  max_ue: number | null;
  x_at_max_ue: number | null;
  max_adverse_due_ds: number | null;
  x_at_max_adverse_due_ds: number | null;
  max_adverse_due_ds_x_below_0_20: number | null;
  x_at_forward_adverse_due_ds: number | null;
  laminar_separation_x: number | null;
  transition_x: number | null;
  head_start_x: number | null;
  head_start_reason: string;
  head_separation_x: number | null;
  head_separated: boolean;
  head_h: number | null;
  attached_to_trim: boolean;
  non_finite: boolean;
};

type PressureRow = {
  alpha_deg: number;
  panel_count: number;
  method: string;
  cl_pressure: number | null;
  cl_joukowski: number;
  cl_pressure_minus_joukowski: number | null;
  cd_pressure: number | null;
  cd_from_x_below_0_10: number | null;
  cd_from_x_at_or_above_0_10: number | null;
  max_abs_normal_speed: number | null;
  rectangle_matches_solver: boolean | null;
};

function main(): void {
  mkdirSync(OUTPUT, { recursive: true });
  const solutions = new Map<string, PanelSolution>();
  for (const alpha of ANGLES) {
    for (const count of PANEL_COUNTS) {
      solutions.set(key(alpha, count), count === 80 ? solveNaca2412(alpha) : solveNodes(naca2412Nodes(count), alpha));
    }
  }

  const boundary: BoundarySummary[] = [];
  const lambdas: LambdaRow[] = [];
  let productionMismatches = 0;

  const smoothingCases: { method: string; smoothing: SmoothKind }[] = [
    { method: 'none', smoothing: 'none' },
    { method: 'three_panel', smoothing: 'three_panel' },
    { method: 'fixed_chord_0_02', smoothing: 'fixed_chord' },
    { method: 'quadratic_0_02', smoothing: 'quadratic' },
  ];
  for (const alpha of ANGLES) {
    for (const count of PANEL_COUNTS) {
      const solution = solutions.get(key(alpha, count))!;
      for (const item of smoothingCases) {
        for (const reynolds of REYNOLDS) {
          const outcome = runBoundary(solution, reynolds, 'midpoint', 'forced_midpoint', item.smoothing);
          const check = item.smoothing === 'three_panel' ? matchesProduction(solution, reynolds, outcome) : null;
          if (check === false) productionMismatches += 1;
          pushBoundary(boundary, lambdas, 'smoothing', item.method, 'midpoint', 'forced_midpoint', item.smoothing, alpha, reynolds, count, outcome, check);
        }
      }
    }
  }

  const arcCases: { method: string; spacing: SpacingKind; stagnation: StagnationKind }[] = [
    { method: 'midpoint_forced', spacing: 'midpoint', stagnation: 'forced_midpoint' },
    { method: 'arc_forced', spacing: 'arc', stagnation: 'forced_midpoint' },
    { method: 'midpoint_interpolated', spacing: 'midpoint', stagnation: 'interpolated' },
    { method: 'arc_interpolated', spacing: 'arc', stagnation: 'interpolated' },
  ];
  for (const alpha of ANGLES) {
    for (const count of PANEL_COUNTS) {
      const solution = solutions.get(key(alpha, count))!;
      for (const item of arcCases) {
        for (const reynolds of REYNOLDS) {
          const outcome = runBoundary(solution, reynolds, item.spacing, item.stagnation, 'three_panel');
          const check = item.method === 'midpoint_forced' ? matchesProduction(solution, reynolds, outcome) : null;
          if (check === false) productionMismatches += 1;
          pushBoundary(boundary, lambdas, 'arc_length', item.method, item.spacing, item.stagnation, 'three_panel', alpha, reynolds, count, outcome, check);
        }
      }
    }
  }

  const pressure: PressureRow[] = [];
  for (const alpha of ANGLES) {
    for (const count of PANEL_COUNTS) {
      const solution = solutions.get(key(alpha, count))!;
      pressure.push(pressureRow(solution, alpha, count, 'rectangle_midpoint'));
      pressure.push(pressureRow(solution, alpha, count, 'gauss3_speed'));
      pressure.push(pressureRow(solution, alpha, count, 'gauss3_tangential'));
      pressure.push(pressureRow(solution, alpha, count, 'gauss3_offset'));
    }
  }

  const smoothingRows = boundary.filter((row) => row.experiment === 'smoothing');
  const arcRows = boundary.filter((row) => row.experiment === 'arc_length');
  writeFileSync(join(OUTPUT, 'smoothing.csv'), toCsv(smoothingRows), 'utf8');
  writeFileSync(join(OUTPUT, 'arc-length.csv'), toCsv(arcRows), 'utf8');
  writeFileSync(join(OUTPUT, 'lambda-stations.csv'), toCsv(lambdas), 'utf8');
  writeFileSync(join(OUTPUT, 'pressure.csv'), toCsv(pressure), 'utf8');
  writeFileSync(join(OUTPUT, 'convergence-metrics.csv'), toCsv(convergenceMetrics(boundary)), 'utf8');

  writeFileSync(join(OUTPUT, 'head-smoothing-re100000.svg'), separationChart(smoothingRows, 100_000, 'head_separation_x', 'Head separation, smoothing experiment, Re = 100,000'), 'utf8');
  writeFileSync(join(OUTPUT, 'head-smoothing-re500000.svg'), separationChart(smoothingRows, 500_000, 'head_separation_x', 'Head separation, smoothing experiment, Re = 500,000'), 'utf8');
  writeFileSync(join(OUTPUT, 'laminar-smoothing-re100000.svg'), separationChart(smoothingRows, 100_000, 'laminar_separation_x', 'Laminar Thwaites crossing, smoothing experiment, Re = 100,000'), 'utf8');
  writeFileSync(join(OUTPUT, 'laminar-smoothing-re500000.svg'), separationChart(smoothingRows, 500_000, 'laminar_separation_x', 'Laminar Thwaites crossing, smoothing experiment, Re = 500,000'), 'utf8');
  writeFileSync(join(OUTPUT, 'head-arc-re100000.svg'), separationChart(arcRows, 100_000, 'head_separation_x', 'Head separation, arc-length experiment, Re = 100,000'), 'utf8');
  writeFileSync(join(OUTPUT, 'head-arc-re500000.svg'), separationChart(arcRows, 500_000, 'head_separation_x', 'Head separation, arc-length experiment, Re = 500,000'), 'utf8');
  writeFileSync(join(OUTPUT, 'laminar-arc-re100000.svg'), separationChart(arcRows, 100_000, 'laminar_separation_x', 'Laminar Thwaites crossing, arc-length experiment, Re = 100,000'), 'utf8');
  writeFileSync(join(OUTPUT, 'laminar-arc-re500000.svg'), separationChart(arcRows, 500_000, 'laminar_separation_x', 'Laminar Thwaites crossing, arc-length experiment, Re = 500,000'), 'utf8');
  writeFileSync(join(OUTPUT, 'ue-alpha13-re100000.svg'), profileChart(lambdas, 'ue', 'Smoothed edge velocity, α = 13°, Re = 100,000, upper, x/c ≤ 0.2'), 'utf8');
  writeFileSync(join(OUTPUT, 'lambda-alpha13-re100000.svg'), profileChart(lambdas, 'lambda', 'Thwaites λ, α = 13°, Re = 100,000, upper, x/c ≤ 0.2. Axis clipped; CSV keeps every value.'), 'utf8');
  writeFileSync(join(OUTPUT, 'pressure-lift.svg'), pressureChart(pressure, 'difference', 'cl pressure − cl Kutta–Joukowski'), 'utf8');
  writeFileSync(join(OUTPUT, 'pressure-drag.svg'), pressureChart(pressure, 'drag', 'Inviscid pressure drag'), 'utf8');

  const rectangleDrift = pressure.filter((row) => row.method === 'rectangle_midpoint' && row.rectangle_matches_solver === false).length;
  console.log(`boundary rows ${boundary.length}, lambda rows ${lambdas.length}, pressure rows ${pressure.length}`);
  console.log(`production mismatches ${productionMismatches}, rectangle drifts ${rectangleDrift}`);
}

type Outcome = {
  stagX: number | null;
  upper: SurfaceResult;
  lower: SurfaceResult;
  upperStations: number;
  lowerStations: number;
  upperWindow: number | null;
  lowerWindow: number | null;
  lambda: LambdaRow[];
};

function runBoundary(solution: PanelSolution, reynolds: number, spacing: SpacingKind, stagnation: StagnationKind, smoothing: SmoothKind): Outcome {
  const branches = buildBranches(solution, spacing, stagnation);
  const upperPrepared = prepare(branches.upper, smoothing);
  const lowerPrepared = prepare(branches.lower, smoothing);
  const upper = marchSurface(branches.upper, upperPrepared, 'upper', reynolds);
  const lower = marchSurface(branches.lower, lowerPrepared, 'lower', reynolds);
  return {
    stagX: branches.stagnationX,
    upper: upper.result,
    lower: lower.result,
    upperStations: branches.upper.length,
    lowerStations: branches.lower.length,
    upperWindow: upperPrepared.windowAtPeak,
    lowerWindow: lowerPrepared.windowAtPeak,
    lambda: [...upper.lambda, ...lower.lambda],
  };
}

function pushBoundary(
  boundary: BoundarySummary[],
  lambdas: LambdaRow[],
  experiment: string,
  method: string,
  spacing: SpacingKind,
  stagnation: StagnationKind,
  smoothing: SmoothKind,
  alpha: number,
  reynolds: number,
  count: number,
  outcome: Outcome,
  matches: boolean | null,
): void {
  boundary.push(summaryRow(experiment, method, spacing, stagnation, smoothing, alpha, reynolds, count, 'upper', outcome.stagX, outcome.upperStations, outcome.upperWindow, matches, outcome.upper));
  boundary.push(summaryRow(experiment, method, spacing, stagnation, smoothing, alpha, reynolds, count, 'lower', outcome.stagX, outcome.lowerStations, outcome.lowerWindow, matches, outcome.lower));
  for (const row of outcome.lambda) {
    lambdas.push({ ...row, experiment, method, alpha_deg: alpha, reynolds, panel_count: count });
  }
}

function matchesProduction(solution: PanelSolution, reynolds: number, outcome: Outcome): boolean {
  const production = marchBoundaryLayer(solution, reynolds);
  return sameStation(production.upper.separated ? production.upper.separationX : null, outcome.upper.headSeparated ? outcome.upper.headSeparationX : null)
    && sameStation(production.lower.separated ? production.lower.separationX : null, outcome.lower.headSeparated ? outcome.lower.headSeparationX : null)
    && sameStation(production.upper.laminarSeparation ? production.upper.transitionX : null, outcome.upper.headStartReason === 'laminar_separation' ? outcome.upper.headStartX : null);
}

function sameStation(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) <= 1e-9;
}

function buildBranches(solution: PanelSolution, spacing: SpacingKind, stagnation: StagnationKind): { upper: Station[]; lower: Station[]; stagnationX: number | null } {
  const { panels, vt, speed } = solution;
  const n = panels.length;
  const stag = findStagnation(solution);
  const next = mod(stag + 1, n);
  if (stagnation === 'forced_midpoint') {
    return {
      stagnationX: panels[stag].xm,
      upper: walk(panels, speed, stag, 1, n - 1, spacing, null),
      lower: walk(panels, speed, stag, -1, 0, spacing, null),
    };
  }
  const gap = stationGap(panels, stag, next, spacing);
  const fraction = vt[stag] === vt[next] ? 0 : vt[stag] / (vt[stag] - vt[next]);
  const clamped = Math.min(1, Math.max(0, fraction));
  const origin = pointBetween(panels, stag, next, clamped, spacing);
  return {
    stagnationX: origin.x,
    upper: walk(panels, speed, stag, 1, n - 1, spacing, { gap, fraction: clamped, origin }),
    lower: walk(panels, speed, stag, -1, 0, spacing, { gap, fraction: clamped, origin }),
  };
}

function walk(
  panels: Panel[],
  speed: number[],
  stag: number,
  step: 1 | -1,
  stopIndex: number,
  spacing: SpacingKind,
  interpolated: { gap: number; fraction: number; origin: { x: number; y: number } } | null,
): Station[] {
  const n = panels.length;
  if (!interpolated) {
    const stations: Station[] = [{ panelIndex: stag, s: 0, x: panels[stag].xm, y: panels[stag].ym, ue: 0 }];
    let s = 0;
    for (let k = 1; k < n; k++) {
      const index = mod(stag + step * k, n);
      const previous = mod(stag + step * (k - 1), n);
      s += stationGap(panels, previous, index, spacing);
      stations.push({ panelIndex: index, s, x: panels[index].xm, y: panels[index].ym, ue: Math.max(speed[index], 0) });
      if (index === stopIndex) break;
    }
    return stations;
  }
  const stations: Station[] = [{ panelIndex: stag, s: 0, x: interpolated.origin.x, y: interpolated.origin.y, ue: 0 }];
  let s = 0;
  // The zero lies between panel `stag` and the next clockwise panel.
  // The upper walk's first collocation point is that next panel.
  // The lower walk's first collocation point is panel `stag` itself.
  const firstOffset = step === 1 ? 1 : 0;
  if (step === -1 && interpolated.fraction > 1e-12) {
    s = interpolated.gap * interpolated.fraction;
    stations.push({ panelIndex: stag, s, x: panels[stag].xm, y: panels[stag].ym, ue: Math.max(speed[stag], 0) });
  }
  for (let k = Math.max(firstOffset, 1); k < n; k++) {
    const index = mod(stag + step * k, n);
    const previous = mod(stag + step * (k - 1), n);
    const span = k === 1 && step === 1 ? interpolated.gap * (1 - interpolated.fraction) : stationGap(panels, previous, index, spacing);
    if (k === 1 && step === 1 && span <= 1e-12) continue;
    s += span;
    stations.push({ panelIndex: index, s, x: panels[index].xm, y: panels[index].ym, ue: Math.max(speed[index], 0) });
    if (index === stopIndex) break;
  }
  return stations;
}

function stationGap(panels: Panel[], from: number, to: number, spacing: SpacingKind): number {
  if (spacing === 'arc') return 0.5 * (panels[from].s + panels[to].s);
  return Math.hypot(panels[to].xm - panels[from].xm, panels[to].ym - panels[from].ym);
}

function pointBetween(panels: Panel[], from: number, to: number, fraction: number, spacing: SpacingKind): { x: number; y: number } {
  if (spacing === 'midpoint') {
    return {
      x: panels[from].xm + fraction * (panels[to].xm - panels[from].xm),
      y: panels[from].ym + fraction * (panels[to].ym - panels[from].ym),
    };
  }
  const distance = fraction * stationGap(panels, from, to, 'arc');
  const half = panels[from].s / 2;
  if (distance <= half) {
    const xi = half + distance;
    return { x: panels[from].x1 + panels[from].tx * xi, y: panels[from].y1 + panels[from].ty * xi };
  }
  const xi = distance - half;
  return { x: panels[to].x1 + panels[to].tx * xi, y: panels[to].y1 + panels[to].ty * xi };
}

function findStagnation(solution: PanelSolution): number {
  const { panels, vt, speed } = solution;
  let stag = 0;
  let nearest = Infinity;
  let found = false;
  for (let i = 0; i < panels.length; i++) {
    const next = vt[(i + 1) % panels.length];
    if (vt[i] <= 0 && next > 0 && panels[i].xm < nearest) {
      nearest = panels[i].xm;
      stag = i;
      found = true;
    }
  }
  if (found) return stag;
  let best = Infinity;
  for (let i = 0; i < panels.length; i++) {
    if (speed[i] < best) {
      best = speed[i];
      stag = i;
    }
  }
  return stag;
}

function prepare(stations: Station[], smoothing: SmoothKind): Prepared {
  const raw = stations.map((station) => station.ue);
  if (smoothing === 'quadratic') {
    const fit = quadraticField(stations, raw);
    fit.ue[0] = 0;
    return {
      ue: fit.ue,
      dueAt: (index) => fit.due[index],
      windowAtPeak: windowAtMax(stations, raw),
    };
  }
  const ue = smoothing === 'none' ? raw.slice() : smoothing === 'three_panel' ? smoothThree(raw) : smoothFixed(stations, raw, FIXED_HALF_WIDTH);
  ue[0] = 0;
  return {
    ue,
    dueAt: (index) => oneSided(ue, stations, index),
    windowAtPeak: smoothing === 'fixed_chord' ? windowAtMax(stations, raw) : null,
  };
}

function smoothThree(values: number[]): number[] {
  if (values.length < 3) return values.slice();
  const out = values.slice();
  for (let i = 1; i < values.length - 1; i++) out[i] = 0.25 * values[i - 1] + 0.5 * values[i] + 0.25 * values[i + 1];
  return out;
}

function smoothFixed(stations: Station[], values: number[], halfWidth: number): number[] {
  const out = values.slice();
  for (let i = 0; i < values.length; i++) {
    let weight = 0;
    let sum = 0;
    for (let j = 0; j < values.length; j++) {
      const distance = Math.abs(stations[j].s - stations[i].s);
      if (distance > halfWidth) continue;
      const tent = 1 - distance / halfWidth;
      weight += tent;
      sum += tent * values[j];
    }
    out[i] = weight > 0 ? sum / weight : values[i];
  }
  return out;
}

function quadraticField(stations: Station[], values: number[]): { ue: number[]; due: number[] } {
  const ue = values.slice();
  const due = values.map((_, index) => oneSided(values, stations, index));
  for (let i = 1; i < values.length; i++) {
    const fit = fitQuadratic(stations, values, i);
    if (!fit) continue;
    ue[i] = fit.value;
    due[i] = fit.slope;
  }
  return { ue, due };
}

function fitQuadratic(stations: Station[], values: number[], index: number): { value: number; slope: number } | null {
  const selected = stations.map((station, point) => ({ t: station.s - stations[index].s, y: values[point], distance: Math.abs(station.s - stations[index].s) }))
    .filter((point) => point.distance <= FIXED_HALF_WIDTH);
  const sample = selected.length >= 4 ? selected : nearest(stations, values, index, 4);
  if (sample.length < 3) return null;
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  let s3 = 0;
  let s4 = 0;
  let r0 = 0;
  let r1 = 0;
  let r2 = 0;
  for (const point of sample) {
    const t = point.t;
    const t2 = t * t;
    s0 += 1;
    s1 += t;
    s2 += t2;
    s3 += t2 * t;
    s4 += t2 * t2;
    r0 += point.y;
    r1 += point.y * t;
    r2 += point.y * t2;
  }
  const solved = solve3(s0, s1, s2, s1, s2, s3, s2, s3, s4, r0, r1, r2);
  if (!solved) return linearFit(sample);
  return { value: solved[0], slope: solved[1] };
}

function nearest(stations: Station[], values: number[], index: number, count: number): { t: number; y: number; distance: number }[] {
  return stations
    .map((station, point) => ({ t: station.s - stations[index].s, y: values[point], distance: Math.abs(station.s - stations[index].s) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, Math.min(count, stations.length));
}

function linearFit(sample: { t: number; y: number }[]): { value: number; slope: number } | null {
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  let r0 = 0;
  let r1 = 0;
  for (const point of sample) {
    s0 += 1;
    s1 += point.t;
    s2 += point.t * point.t;
    r0 += point.y;
    r1 += point.y * point.t;
  }
  const det = s0 * s2 - s1 * s1;
  if (Math.abs(det) < 1e-18) return null;
  const slope = (s0 * r1 - s1 * r0) / det;
  const value = (r0 * s2 - s1 * r1) / det;
  return { value, slope };
}

function solve3(a00: number, a01: number, a02: number, a10: number, a11: number, a12: number, a20: number, a21: number, a22: number, b0: number, b1: number, b2: number): [number, number, number] | null {
  const m = [
    [a00, a01, a02, b0],
    [a10, a11, a12, b1],
    [a20, a21, a22, b2],
  ];
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let row = col + 1; row < 3; row++) if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    if (Math.abs(m[pivot][col]) < 1e-14) return null;
    const swap = m[col];
    m[col] = m[pivot];
    m[pivot] = swap;
    const scale = m[col][col];
    for (let k = col; k < 4; k++) m[col][k] /= scale;
    for (let row = 0; row < 3; row++) {
      if (row === col) continue;
      const factor = m[row][col];
      for (let k = col; k < 4; k++) m[row][k] -= factor * m[col][k];
    }
  }
  return [m[0][3], m[1][3], m[2][3]];
}

function windowAtMax(stations: Station[], values: number[]): number | null {
  let peak = 1;
  for (let i = 1; i < values.length; i++) if (values[i] > values[peak]) peak = i;
  if (stations.length < 2) return null;
  return stations.filter((station) => Math.abs(station.s - stations[peak].s) <= FIXED_HALF_WIDTH).length;
}

function oneSided(ue: number[], stations: Station[], index: number): number {
  if (index < 1) return 0;
  const ds = stations[index].s - stations[index - 1].s;
  return ds > 0 ? (ue[index] - ue[index - 1]) / ds : 0;
}

function marchSurface(stations: Station[], prepared: Prepared, surface: SurfaceName, reynolds: number): { result: SurfaceResult; lambda: LambdaRow[] } {
  const nu = 1 / reynolds;
  const ue = prepared.ue;
  const empty = blankSurface();
  const lambdaRows: LambdaRow[] = [];
  if (stations.length < 3) return { result: empty, lambda: lambdaRows };

  let integral = 0;
  let theta = stagnationTheta(prepared, stations, nu);
  let thetaForHead = theta;
  let transitionAt = -1;
  let laminarAt = -1;
  let started = false;
  let nonFinite = false;
  const scanEnd = lastTrimmedIndex(stations);

  for (let i = 1; i <= scanEnd; i++) {
    const ds = stations[i].s - stations[i - 1].s;
    if (ds <= 0) continue;
    integral += 0.5 * (Math.pow(ue[i - 1], 5) + Math.pow(ue[i], 5)) * ds;
    const edge = Math.max(ue[i], 1e-4);
    const theta2 = (0.45 * nu * integral) / Math.pow(edge, 6);
    theta = Math.sqrt(Math.max(theta2, 0));
    const due = prepared.dueAt(i);
    const lambda = (theta2 * due) / nu;
    if (!Number.isFinite(lambda) || !Number.isFinite(theta)) nonFinite = true;
    const reTheta = edge * theta * reynolds;
    const reX = edge * stations[i].s * reynolds;
    const headStarted = started;
    if (!started) {
      if (laminarAt < 0 && lambda <= LAMINAR_SEPARATION_LAMBDA) laminarAt = i;
      if (transitionAt < 0 && reX > 50 && reTheta >= michel(reX)) transitionAt = i;
      if (transitionAt >= 0 || laminarAt >= 0) {
        started = true;
        thetaForHead = theta;
      }
    }
    lambdaRows.push({
      experiment: '',
      method: '',
      alpha_deg: 0,
      reynolds: 0,
      panel_count: 0,
      surface,
      station_index: i,
      s: stations[i].s,
      x: stations[i].x,
      ue: ue[i],
      due_ds: Number.isFinite(due) ? due : null,
      lambda: Number.isFinite(lambda) ? lambda : null,
      past_head_start: headStarted,
    });
  }

  const adverse = adverseGradient(stations, prepared, scanEnd);
  const peak = maxEdge(stations, ue, scanEnd);
  const laminarX = firstLambdaCrossing(lambdaRows);
  const startTurbulent = transitionAt >= 0 ? transitionAt : laminarAt;
  if (startTurbulent < 0) {
    return {
      result: {
        ...empty,
        ...peak,
        ...adverse,
        laminarSeparationX: laminarX,
        attached: true,
        nonFinite,
      },
      lambda: lambdaRows,
    };
  }

  const turbulent = integrateHead(stations, ue, prepared, startTurbulent, thetaForHead, reynolds);
  const reason = transitionAt >= 0 && (laminarAt < 0 || transitionAt < laminarAt) ? 'michel' : 'laminar_separation';
  return {
    result: {
      ...peak,
      ...adverse,
      laminarSeparationX: laminarX,
      transitionX: reason === 'michel' ? stations[transitionAt].x : null,
      headSeparationX: turbulent.separated ? stations[turbulent.index].x : null,
      headStartX: stations[startTurbulent].x,
      headStartReason: reason,
      headSeparated: turbulent.separated,
      headH: Number.isFinite(turbulent.h) ? turbulent.h : null,
      attached: !turbulent.separated,
      nonFinite: nonFinite || turbulent.nonFinite,
    },
    lambda: lambdaRows,
  };
}

function firstLambdaCrossing(rows: LambdaRow[]): number | null {
  const hit = rows.find((row) => row.lambda !== null && row.lambda <= LAMINAR_SEPARATION_LAMBDA);
  return hit ? hit.x : null;
}

function blankSurface(): SurfaceResult {
  return {
    maxUe: null,
    xAtMaxUe: null,
    maxAdverseDue: null,
    xAtMaxAdverseDue: null,
    maxAdverseDueForward: null,
    xAtMaxAdverseDueForward: null,
    laminarSeparationX: null,
    transitionX: null,
    headSeparationX: null,
    headStartX: null,
    headStartReason: 'attached',
    headSeparated: false,
    headH: null,
    attached: true,
    nonFinite: false,
  };
}

function maxEdge(stations: Station[], ue: number[], end: number): { maxUe: number | null; xAtMaxUe: number | null } {
  let best = -Infinity;
  let x = null as number | null;
  for (let i = 0; i <= end && i < ue.length; i++) {
    if (ue[i] > best) {
      best = ue[i];
      x = stations[i].x;
    }
  }
  return { maxUe: Number.isFinite(best) ? best : null, xAtMaxUe: x };
}

function adverseGradient(stations: Station[], prepared: Prepared, end: number): Pick<SurfaceResult, 'maxAdverseDue' | 'xAtMaxAdverseDue' | 'maxAdverseDueForward' | 'xAtMaxAdverseDueForward'> {
  let worst = 0;
  let worstX: number | null = null;
  let forward = 0;
  let forwardX: number | null = null;
  for (let i = 1; i <= end; i++) {
    if (!passedLeadingEdge(stations, i)) continue;
    const due = prepared.dueAt(i);
    if (!Number.isFinite(due)) continue;
    if (due < worst) {
      worst = due;
      worstX = stations[i].x;
    }
    if (stations[i].x < 0.2 && due < forward) {
      forward = due;
      forwardX = stations[i].x;
    }
  }
  return {
    maxAdverseDue: worstX === null ? null : worst,
    xAtMaxAdverseDue: worstX,
    maxAdverseDueForward: forwardX === null ? null : forward,
    xAtMaxAdverseDueForward: forwardX,
  };
}

function stagnationTheta(prepared: Prepared, stations: Station[], nu: number): number {
  const due = Math.max(prepared.dueAt(1), 1e-4);
  return Math.sqrt((0.075 * nu) / due);
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

function michel(reX: number): number {
  const rx = Math.max(reX, 1);
  return 1.174 * (1 + 22400 / rx) * Math.pow(rx, 0.46);
}

function integrateHead(
  stations: Station[],
  ue: number[],
  prepared: Prepared,
  start: number,
  theta0: number,
  reynolds: number,
): { separated: boolean; index: number; h: number; nonFinite: boolean } {
  let theta = Math.max(theta0, 1e-8);
  let h = 1.4;
  let h1 = h1OfH(h);
  let endIndex = start;
  let nonFinite = false;
  const substeps = 4;
  for (let i = start + 1; i < stations.length; i++) {
    if (stations[i].x > TRIM_X && passedLeadingEdge(stations, i)) break;
    const dsTotal = stations[i].s - stations[i - 1].s;
    if (dsTotal <= 0) continue;
    const due = prepared.dueAt(i);
    const ds = dsTotal / substeps;
    let stopped = false;
    for (let sub = 0; sub < substeps; sub++) {
      const ueLocal = ue[i - 1] + due * ds * (sub + 0.5);
      const safeUe = Math.max(Math.abs(ueLocal), 1e-3);
      const reTheta = safeUe * theta * reynolds;
      const cf = 0.246 * Math.pow(10, -0.678 * h) * Math.pow(Math.max(reTheta, 20), -0.268);
      const dTheta = cf / 2 - ((h + 2) * theta * due) / safeUe;
      const entrainment = 0.0306 * Math.pow(Math.max(h1 - 3, 1e-3), -0.6169);
      const q = safeUe * theta * h1;
      const dQ = safeUe * entrainment;
      theta = Math.max(theta + dTheta * ds, 1e-8);
      const qNext = Math.max(q + dQ * ds, 1e-10);
      h1 = qNext / (safeUe * theta);
      h = hOfH1(h1);
      if (!Number.isFinite(h) || !Number.isFinite(theta) || h >= TURBULENT_SEPARATION_H || h1 <= 3.43) {
        stopped = true;
        nonFinite = !Number.isFinite(h) || !Number.isFinite(theta);
        break;
      }
    }
    endIndex = i;
    if (stopped) return { separated: !nonFinite, index: i, h: Number.isFinite(h) ? Math.min(h, 3) : Number.NaN, nonFinite };
  }
  return { separated: false, index: endIndex, h, nonFinite };
}

function pressureRow(solution: PanelSolution, alpha: number, count: number, method: 'rectangle_midpoint' | 'gauss3_speed' | 'gauss3_tangential' | 'gauss3_offset'): PressureRow {
  const integrated = method === 'rectangle_midpoint'
    ? rectangle(solution)
    : gauss3(solution, method === 'gauss3_tangential', method === 'gauss3_offset');
  const difference = integrated.cl - solution.cl;
  return {
    alpha_deg: alpha,
    panel_count: count,
    method,
    cl_pressure: integrated.cl,
    cl_joukowski: solution.cl,
    cl_pressure_minus_joukowski: difference,
    cd_pressure: integrated.cd,
    cd_from_x_below_0_10: integrated.cdNose,
    cd_from_x_at_or_above_0_10: integrated.cdAft,
    max_abs_normal_speed: integrated.maxNormal,
    rectangle_matches_solver: method === 'rectangle_midpoint' ? Math.abs(integrated.cl - solution.clPressure) <= 1e-9 && Math.abs(integrated.cd - solution.cdPressure) <= 1e-9 : null,
  };
}

function rectangle(solution: PanelSolution): { cl: number; cd: number; cdNose: number; cdAft: number; maxNormal: number } {
  const ca = Math.cos(solution.alphaRad);
  const sa = Math.sin(solution.alphaRad);
  let cx = 0;
  let cy = 0;
  let cdNose = 0;
  let cdAft = 0;
  let maxNormal = 0;
  solution.panels.forEach((panel, index) => {
    const normalSpeed = Math.abs(solution.speed[index] ** 2 - solution.vt[index] ** 2);
    maxNormal = Math.max(maxNormal, normalSpeed);
    const dcx = -solution.cp[index] * panel.nx * panel.s;
    const dcy = -solution.cp[index] * panel.ny * panel.s;
    cx += dcx;
    cy += dcy;
    const dcd = dcx * ca + dcy * sa;
    if (panel.xm < 0.1) cdNose += dcd;
    else cdAft += dcd;
  });
  return { cl: cy * ca - cx * sa, cd: cx * ca + cy * sa, cdNose, cdAft, maxNormal: Math.sqrt(maxNormal) };
}

function gauss3(solution: PanelSolution, tangential: boolean, offset: boolean): { cl: number; cd: number; cdNose: number; cdAft: number; maxNormal: number } {
  const ca = Math.cos(solution.alphaRad);
  const sa = Math.sin(solution.alphaRad);
  const nodes = [-Math.sqrt(0.6), 0, Math.sqrt(0.6)];
  const weights = [5 / 9, 8 / 9, 5 / 9];
  let cx = 0;
  let cy = 0;
  let cdNose = 0;
  let cdAft = 0;
  let maxNormal = 0;
  for (const panel of solution.panels) {
    for (let k = 0; k < nodes.length; k++) {
      const xi = 0.5 * panel.s * (1 + nodes[k]);
      const lift = offset ? 0.002 : 0;
      const x = panel.x1 + panel.tx * xi + panel.nx * lift;
      const y = panel.y1 + panel.ty * xi + panel.ny * lift;
      const velocity = velocityAt(solution, x, y);
      const tangentialSpeed = velocity.u * panel.tx + velocity.v * panel.ty;
      const normalSpeed = velocity.u * panel.nx + velocity.v * panel.ny;
      maxNormal = Math.max(maxNormal, Math.abs(normalSpeed));
      const q = tangential ? tangentialSpeed : Math.hypot(velocity.u, velocity.v);
      const cp = 1 - q * q;
      const weight = weights[k] * panel.s * 0.5;
      const dcx = -cp * panel.nx * weight;
      const dcy = -cp * panel.ny * weight;
      cx += dcx;
      cy += dcy;
      const dcd = dcx * ca + dcy * sa;
      if (x < 0.1) cdNose += dcd;
      else cdAft += dcd;
    }
  }
  return { cl: cy * ca - cx * sa, cd: cx * ca + cy * sa, cdNose, cdAft, maxNormal };
}

function summaryRow(
  experiment: string,
  method: string,
  spacing: SpacingKind,
  stagnation: StagnationKind,
  smoothing: SmoothKind,
  alpha: number,
  reynolds: number,
  count: number,
  surface: SurfaceName,
  stagX: number | null,
  stations: number,
  windowAtPeak: number | null,
  matches: boolean | null,
  result: SurfaceResult,
): BoundarySummary {
  return {
    experiment,
    method,
    spacing,
    stagnation,
    smoothing,
    alpha_deg: alpha,
    reynolds,
    panel_count: count,
    surface,
    stagnation_x: stagX,
    station_count: stations,
    window_points_at_peak: windowAtPeak,
    matches_production_march: matches,
    max_ue: result.maxUe,
    x_at_max_ue: result.xAtMaxUe,
    max_adverse_due_ds: result.maxAdverseDue,
    x_at_max_adverse_due_ds: result.xAtMaxAdverseDue,
    max_adverse_due_ds_x_below_0_20: result.maxAdverseDueForward,
    x_at_forward_adverse_due_ds: result.xAtMaxAdverseDueForward,
    laminar_separation_x: result.laminarSeparationX,
    transition_x: result.transitionX,
    head_start_x: result.headStartX,
    head_start_reason: result.headStartReason,
    head_separation_x: result.headSeparationX,
    head_separated: result.headSeparated,
    head_h: result.headH,
    attached_to_trim: result.attached,
    non_finite: result.nonFinite,
  };
}

type Metric = {
  experiment: string;
  method: string;
  alpha_deg: number;
  reynolds: number;
  surface: SurfaceName;
  quantity: string;
  x_40: number | null;
  x_80: number | null;
  x_160: number | null;
  x_320: number | null;
  span_40_to_320: number | null;
  change_80_to_160: number | null;
  change_160_to_320: number | null;
  change_shrinks: boolean | null;
};

function convergenceMetrics(rows: BoundarySummary[]): Metric[] {
  const quantities = ['laminar_separation_x', 'transition_x', 'head_separation_x'] as const;
  const groups = new Map<string, BoundarySummary[]>();
  for (const row of rows) {
    const id = [row.experiment, row.method, row.alpha_deg, row.reynolds, row.surface].join('|');
    const list = groups.get(id) ?? [];
    list.push(row);
    groups.set(id, list);
  }
  const metrics: Metric[] = [];
  for (const list of groups.values()) {
    for (const quantity of quantities) {
      const at = (count: number) => list.find((row) => row.panel_count === count)?.[quantity] ?? null;
      const x40 = at(40);
      const x80 = at(80);
      const x160 = at(160);
      const x320 = at(320);
      const present = [x40, x80, x160, x320].filter((value): value is number => value !== null);
      const changeA = x80 !== null && x160 !== null ? x160 - x80 : null;
      const changeB = x160 !== null && x320 !== null ? x320 - x160 : null;
      metrics.push({
        experiment: list[0].experiment,
        method: list[0].method,
        alpha_deg: list[0].alpha_deg,
        reynolds: list[0].reynolds,
        surface: list[0].surface,
        quantity,
        x_40: x40,
        x_80: x80,
        x_160: x160,
        x_320: x320,
        span_40_to_320: present.length >= 2 ? Math.max(...present) - Math.min(...present) : null,
        change_80_to_160: changeA,
        change_160_to_320: changeB,
        change_shrinks: changeA !== null && changeB !== null && Math.abs(changeA) > 1e-4 ? Math.abs(changeB) < Math.abs(changeA) : null,
      });
    }
  }
  return metrics;
}

function separationChart(rows: BoundarySummary[], reynolds: number, field: 'head_separation_x' | 'laminar_separation_x', title: string): string {
  const methods = [...new Set(rows.map((row) => row.method))];
  const upper = rows.filter((row) => row.reynolds === reynolds && row.surface === 'upper');
  const panels = ANGLES.map((alpha) => {
    const lines = methods.map((method, index) => ({
      name: method,
      color: METHOD_COLOR[index % METHOD_COLOR.length],
      dash: '',
      points: PANEL_COUNTS.map((count) => {
        const row = upper.find((item) => item.alpha_deg === alpha && item.method === method && item.panel_count === count);
        const value = row ? row[field] : null;
        return { x: count, y: value === null ? (row?.attached_to_trim ? 1 : Number.NaN) : value };
      }),
    }));
    return { title: `α = ${alpha}°`, lines };
  });
  return multiples(panels, title, 'Panel count', 'Upper-surface x/c. A point at 1 is a march that stayed attached to the trim. Blank failures are omitted. Not a measured location.');
}

function profileChart(rows: LambdaRow[], field: 'ue' | 'lambda', title: string): string {
  const selected = rows.filter((row) => row.experiment === 'smoothing' && row.alpha_deg === 13 && row.reynolds === 100_000 && row.surface === 'upper' && row.x <= 0.2 && (row.panel_count === 40 || row.panel_count === 320));
  const methods = [...new Set(selected.map((row) => row.method))];
  const panels = [40, 320].map((count) => ({
    title: `${count} panels`,
    lines: methods.map((method, index) => ({
      name: method,
      color: METHOD_COLOR[index % METHOD_COLOR.length],
      dash: '',
      points: selected.filter((row) => row.method === method && row.panel_count === count).map((row) => ({ x: row.x, y: field === 'ue' ? row.ue : row.lambda ?? Number.NaN })),
    })),
  }));
  return multiples(panels, title, 'x/c', field === 'lambda' ? 'The red mark is λ = −0.09. Plot limits are display limits only.' : 'Velocity after the method’s filter, divided by freestream.');
}

function pressureChart(rows: PressureRow[], field: 'difference' | 'drag', title: string): string {
  const methods = ['rectangle_midpoint', 'gauss3_speed', 'gauss3_tangential', 'gauss3_offset'];
  const panels = ANGLES.map((alpha) => ({
    title: `α = ${alpha}°`,
    lines: methods.map((method, index) => ({
      name: method,
      color: METHOD_COLOR[index],
      dash: '',
      points: rows.filter((row) => row.alpha_deg === alpha && row.method === method).map((row) => ({
        x: row.panel_count,
        y: field === 'difference' ? row.cl_pressure_minus_joukowski ?? Number.NaN : row.cd_pressure ?? Number.NaN,
      })),
    })),
  }));
  return multiples(panels, title, 'Panel count', 'Inviscid integrals. Reynolds number does not enter. Kutta–Joukowski lift is the circulation value from the same panel solution.');
}

const METHOD_COLOR = ['#1f4e79', '#d6610a', '#2ca02c', '#6b3fa0'];

function multiples(panels: { title: string; lines: { name: string; color: string; dash: string; points: { x: number; y: number }[] }[] }[], title: string, xLabel: string, caption: string): string {
  const width = 1080;
  const height = 760;
  const columns = 2;
  const rows = Math.ceil(panels.length / columns);
  const gapX = 48;
  const gapY = 36;
  const left0 = 64;
  const top0 = 48;
  const panelWidth = (width - left0 - 24 - gapX) / columns;
  const panelHeight = (height - top0 - 150 - gapY * (rows - 1)) / rows;
  const parts: string[] = [];
  panels.forEach((panel, panelIndex) => {
    const column = panelIndex % columns;
    const row = Math.floor(panelIndex / columns);
    const originX = left0 + column * (panelWidth + gapX);
    const originY = top0 + row * (panelHeight + gapY);
    const finite = panel.lines.flatMap((line) => line.points).filter((point) => Number.isFinite(point.y));
    if (finite.length === 0) return;
    const xMin = Math.min(...finite.map((point) => point.x));
    const xMax = Math.max(...finite.map((point) => point.x));
    let yMin = Math.min(...finite.map((point) => point.y));
    let yMax = Math.max(...finite.map((point) => point.y));
    if (title.startsWith('Thwaites')) {
      yMin = Math.max(yMin, -0.6);
      yMax = Math.min(yMax, 0.4);
    }
    if (yMax - yMin < 1e-6) {
      yMin -= 0.05;
      yMax += 0.05;
    }
    const pad = 0.08 * (yMax - yMin);
    yMin -= pad;
    yMax += pad;
    const xOf = (x: number) => originX + ((x - xMin) / (xMax - xMin || 1)) * panelWidth;
    const yOf = (y: number) => originY + ((yMax - y) / (yMax - yMin)) * (panelHeight - 18);
    parts.push(`<text x="${originX}" y="${originY - 8}" font-size="13" fill="#14202a">${escapeXml(panel.title)}</text>`);
    parts.push(`<line x1="${originX}" y1="${originY}" x2="${originX}" y2="${originY + panelHeight - 18}" stroke="#24323c"/>`);
    parts.push(`<line x1="${originX}" y1="${originY + panelHeight - 18}" x2="${originX + panelWidth}" y2="${originY + panelHeight - 18}" stroke="#24323c"/>`);
    if (yMin < 0 && yMax > 0) parts.push(`<line x1="${originX}" y1="${yOf(0)}" x2="${originX + panelWidth}" y2="${yOf(0)}" stroke="#c5d0d8"/>`);
    if (title.startsWith('Thwaites') && yMin <= -0.09 && yMax >= -0.09) {
      parts.push(`<line x1="${originX}" y1="${yOf(-0.09)}" x2="${originX + panelWidth}" y2="${yOf(-0.09)}" stroke="#b33a3a" stroke-dasharray="2 3"/>`);
    }
    for (const line of panel.lines) {
      const path = line.points.filter((point) => Number.isFinite(point.y)).map((point, index) => `${index === 0 ? 'M' : 'L'} ${xOf(point.x).toFixed(2)} ${yOf(Math.min(yMax, Math.max(yMin, point.y))).toFixed(2)}`).join(' ');
      parts.push(`<path d="${path}" fill="none" stroke="${line.color}" stroke-width="1.7"/>`);
    }
  });
  const legend = panels[0]?.lines.map((line, index) => `<line x1="${left0 + index * 250}" y1="${height - 78}" x2="${left0 + 22 + index * 250}" y2="${height - 78}" stroke="${line.color}" stroke-width="1.7"/><text x="${left0 + 28 + index * 250}" y="${height - 74}" font-size="12" fill="#24323c">${escapeXml(line.name)}</text>`).join('') ?? '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="64" y="24" font-size="16" font-family="sans-serif" fill="#14202a">${escapeXml(title)}</text>
  ${parts.join('\n  ')}
  ${legend}
  <text x="64" y="${height - 36}" font-size="12" fill="#4d5d6b">${escapeXml(xLabel)}. ${escapeXml(caption)}</text>
</svg>
`;
}

function key(alpha: number, count: number): string {
  return `${alpha}:${count}`;
}

function mod(index: number, length: number): number {
  return ((index % length) + length) % length;
}

function toCsv<T extends Record<string, string | number | boolean | null>>(rows: T[]): string {
  if (rows.length === 0) return '';
  const columns = Object.keys(rows[0]);
  const body = rows.map((row) => columns.map((column) => formatCell(row[column])).join(','));
  return `${columns.join(',')}\n${body.join('\n')}\n`;
}

function formatCell(value: string | number | boolean | null): string {
  if (value === null) return '';
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'NaN';
    if (value === Infinity) return 'Infinity';
    if (value === -Infinity) return '-Infinity';
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

main();
