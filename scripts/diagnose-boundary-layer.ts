/**
 * Read-only diagnostics for the existing panel and boundary-layer march.
 *
 * The station loop is a transcription of lib/boundaryLayer.ts so the recorded
 * lambda, theta and Head factor are the ones that march uses. Each case is
 * checked against marchBoundaryLayer. A mismatch is written as a failure, not
 * replaced with a plausible station.
 *
 * Nothing here is a wind-tunnel result or a corrected model.
 */

import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { marchBoundaryLayer, type SurfaceMarch } from '../lib/boundaryLayer';
import { naca2412Nodes } from '../lib/naca';
import { solveNaca2412, solveNodes, type Panel, type PanelSolution } from '../lib/panel';

const ANGLES = [5, 10, 13, 15];
const REYNOLDS = [100_000, 500_000];
const PANEL_COUNTS = [40, 80, 160];
const OUTPUT = join(process.cwd(), 'diagnostics');
const TRIM_X = 0.99;
const LAMINAR_SEPARATION_LAMBDA = -0.09;
const TURBULENT_SEPARATION_H = 2.4;

type Station = { panelIndex: number; s: number; x: number; y: number; ueRaw: number };

type StationRow = {
  alpha_deg: number;
  reynolds: number;
  panel_count: number;
  surface: 'upper' | 'lower';
  station_index: number;
  panel_index: number;
  s: number;
  x: number;
  y: number;
  ue_raw: number;
  ue_smoothed: number;
  due_ds: number | null;
  lambda: number | null;
  theta: number | null;
  re_theta: number | null;
  re_x: number | null;
  thwaites_h: number | null;
  head_h: number | null;
  production_thwaites_active: boolean;
  laminar_separation_here: boolean;
  transition_here: boolean;
  turbulent_separation_here: boolean;
  head_stop_reason: string;
};

type PanelRow = {
  alpha_deg: number;
  panel_count: number;
  panel_index: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  xm: number;
  ym: number;
  length: number;
  tx: number;
  ty: number;
  nx: number;
  ny: number;
  vt: number;
  speed: number;
  speed_minus_abs_vt: number;
  cp: number;
  dcl: number;
  dcd: number;
};

type SummaryRow = {
  alpha_deg: number;
  reynolds: number;
  panel_count: number;
  solver: string;
  stagnation_index: number;
  stagnation_x: number;
  stagnation_y: number;
  vt_sign_changes: number;
  panels_forward_of_0_05c: number;
  min_panel_length_forward_of_0_05c: number | null;
  min_midpoint_gap_upper: number | null;
  min_midpoint_gap_over_panel_length: number | null;
  max_ue_upper: number | null;
  x_at_max_ue_upper: number | null;
  min_lambda_upper: number | null;
  x_at_min_lambda_upper: number | null;
  laminar_separation_x_upper: number | null;
  transition_x_upper: number | null;
  turbulent_separation_x_upper: number | null;
  head_h_at_upper_stop: number | null;
  head_stop_reason_upper: string;
  march_separation_x_upper: number | null;
  diagnostic_matches_march: boolean;
  cl_joukowski: number;
  cl_pressure: number;
  cd_pressure: number;
  cl_pressure_minus_joukowski: number;
  cl_from_x_below_0_10: number;
  cl_from_x_at_or_above_0_10: number;
  cd_from_x_below_0_10: number;
  cd_from_x_at_or_above_0_10: number;
  max_normal_residual: number;
};

function main(): void {
  const stations: StationRow[] = [];
  const panels: PanelRow[] = [];
  const summaries: SummaryRow[] = [];
  const seenGeometry = new Set<string>();

  for (const alpha of ANGLES) {
    for (const panelCount of PANEL_COUNTS) {
      const solution = panelCount === 80 ? solveNaca2412(alpha) : solveNodes(naca2412Nodes(panelCount), alpha);
      const geometryKey = `${alpha}:${panelCount}`;
      if (!seenGeometry.has(geometryKey)) {
        seenGeometry.add(geometryKey);
        panels.push(...panelRows(alpha, panelCount, solution));
      }
      for (const reynolds of REYNOLDS) {
        summaries.push(diagnose(alpha, reynolds, panelCount, solution, stations));
      }
    }
  }

  mkdirSync(OUTPUT, { recursive: true });
  writeFileSync(join(OUTPUT, 'panels.csv'), toCsv(panels), 'utf8');
  writeFileSync(join(OUTPUT, 'boundary-layer-stations.csv'), toCsv(stations), 'utf8');
  writeFileSync(join(OUTPUT, 'case-summary.csv'), toCsv(summaries), 'utf8');
  writeFileSync(join(OUTPUT, 'ue-alpha13-re100000.svg'), uePlot(stations), 'utf8');
  writeFileSync(join(OUTPUT, 'lambda-alpha13-re100000.svg'), lambdaPlot(stations), 'utf8');
  writeFileSync(join(OUTPUT, 'separation-vs-panels.svg'), separationPlot(summaries), 'utf8');
  writeFileSync(join(OUTPUT, 'pressure-forces.svg'), forcePlot(summaries), 'utf8');
  const notes = notesText(summaries);
  writeFileSync(join(OUTPUT, 'observations.txt'), notes, 'utf8');
  console.log(notes);
}

function diagnose(alpha: number, reynolds: number, panelCount: number, solution: PanelSolution, sink: StationRow[]): SummaryRow {
  const march = marchBoundaryLayer(solution, reynolds);
  const stag = findStagnation(solution);
  const upper = walkBranch(solution, stag.index, 1, solution.panels.length - 1);
  const lower = walkBranch(solution, stag.index, -1, 0);
  const upperDiag = marchSurface(upper, 'upper', reynolds, alpha, panelCount);
  const lowerDiag = marchSurface(lower, 'lower', reynolds, alpha, panelCount);
  sink.push(...upperDiag.rows, ...lowerDiag.rows);
  const mismatch = Math.abs(upperDiag.separationX - march.upper.separationX) > 1e-9 || Math.abs(lowerDiag.separationX - march.lower.separationX) > 1e-9;
  if (mismatch) {
    console.error(`Diagnostic march disagrees with marchBoundaryLayer at α=${alpha}, Re=${reynolds}, N=${panelCount}`);
  }
  const forces = forceSplit(solution);
  const forward = solution.panels.filter((panel) => panel.xm < 0.05);
  const gaps = midpointGaps(upper, solution.panels);
  return {
    alpha_deg: alpha,
    reynolds,
    panel_count: panelCount,
    solver: panelCount === 80 ? 'solveNaca2412' : 'solveNodes',
    stagnation_index: stag.index,
    stagnation_x: solution.panels[stag.index].xm,
    stagnation_y: solution.panels[stag.index].ym,
    vt_sign_changes: stag.signChanges,
    panels_forward_of_0_05c: forward.length,
    min_panel_length_forward_of_0_05c: forward.length ? Math.min(...forward.map((panel) => panel.s)) : null,
    min_midpoint_gap_upper: gaps.min,
    min_midpoint_gap_over_panel_length: gaps.minRatio,
    max_ue_upper: upperDiag.maxUe,
    x_at_max_ue_upper: upperDiag.xAtMaxUe,
    min_lambda_upper: upperDiag.minLambda,
    x_at_min_lambda_upper: upperDiag.xAtMinLambda,
    laminar_separation_x_upper: upperDiag.laminarSeparationX,
    transition_x_upper: upperDiag.transitionX,
    turbulent_separation_x_upper: upperDiag.turbulentSeparationX,
    head_h_at_upper_stop: upperDiag.headHAtStop,
    head_stop_reason_upper: upperDiag.headStopReason,
    march_separation_x_upper: march.upper.separationX,
    diagnostic_matches_march: !mismatch,
    cl_joukowski: solution.cl,
    cl_pressure: solution.clPressure,
    cd_pressure: solution.cdPressure,
    cl_pressure_minus_joukowski: solution.clPressure - solution.cl,
    cl_from_x_below_0_10: forces.clNose,
    cl_from_x_at_or_above_0_10: forces.clAft,
    cd_from_x_below_0_10: forces.cdNose,
    cd_from_x_at_or_above_0_10: forces.cdAft,
    max_normal_residual: Math.max(...solution.panels.map((panel, index) => solution.speed[index] - Math.abs(solution.vt[index]))),
  };
}

function marchSurface(stations: Station[], surface: 'upper' | 'lower', reynolds: number, alpha: number, panelCount: number): {
  rows: StationRow[];
  separationX: number;
  maxUe: number | null;
  xAtMaxUe: number | null;
  minLambda: number | null;
  xAtMinLambda: number | null;
  laminarSeparationX: number | null;
  transitionX: number | null;
  turbulentSeparationX: number | null;
  headHAtStop: number | null;
  headStopReason: string;
} {
  const rows: StationRow[] = [];
  if (stations.length < 3) {
    return { rows, separationX: 1, maxUe: null, xAtMaxUe: null, minLambda: null, xAtMinLambda: null, laminarSeparationX: null, transitionX: null, turbulentSeparationX: null, headHAtStop: null, headStopReason: 'too_few_stations' };
  }
  const nu = 1 / reynolds;
  const ue = smooth(stations.map((station) => station.ueRaw));
  ue[0] = 0;
  let integral = 0;
  let theta = stagnationTheta(ue, stations, nu);
  let transitionAt = -1;
  let laminarSepAt = -1;
  let maxUe = 0;
  let xAtMaxUe = stations[0].x;
  let minLambda = Infinity;
  let xAtMinLambda = stations[0].x;

  const base = (index: number, extra: Partial<StationRow>): StationRow => ({
    alpha_deg: alpha,
    reynolds,
    panel_count: panelCount,
    surface,
    station_index: index,
    panel_index: stations[index].panelIndex,
    s: stations[index].s,
    x: stations[index].x,
    y: stations[index].y,
    ue_raw: stations[index].ueRaw,
    ue_smoothed: ue[index],
    due_ds: null,
    lambda: null,
    theta: null,
    re_theta: null,
    re_x: null,
    thwaites_h: null,
    head_h: null,
    production_thwaites_active: false,
    laminar_separation_here: false,
    transition_here: false,
    turbulent_separation_here: false,
    head_stop_reason: '',
    ...extra,
  });
  rows.push(base(0, { theta: stagnationTheta(ue, stations, nu), production_thwaites_active: true }));

  let productionOpen = true;
  for (let i = 1; i < stations.length; i++) {
    const trimmed = stations[i].x > TRIM_X && passedLeadingEdge(stations, i);
    const ds = stations[i].s - stations[i - 1].s;
    if (!trimmed && ds > 0) {
      integral += 0.5 * (Math.pow(ue[i - 1], 5) + Math.pow(ue[i], 5)) * ds;
      const uei = Math.max(ue[i], 1e-4);
      const theta2 = (0.45 * nu * integral) / Math.pow(uei, 6);
      theta = Math.sqrt(Math.max(theta2, 0));
      const due = (ue[i] - ue[i - 1]) / ds;
      const lambda = (theta2 * due) / nu;
      const reTheta = uei * theta * reynolds;
      const reX = uei * stations[i].s * reynolds;
      if (productionOpen && lambda <= LAMINAR_SEPARATION_LAMBDA && laminarSepAt < 0) laminarSepAt = i;
      if (productionOpen && reX > 50 && reTheta >= michel(reX) && transitionAt < 0) transitionAt = i;
      if (ue[i] > maxUe) {
        maxUe = ue[i];
        xAtMaxUe = stations[i].x;
      }
      if (lambda < minLambda) {
        minLambda = lambda;
        xAtMinLambda = stations[i].x;
      }
      const active = productionOpen;
      if (productionOpen && (transitionAt >= 0 || laminarSepAt >= 0)) productionOpen = false;
      rows.push(base(i, {
        due_ds: due,
        lambda,
        theta,
        re_theta: reTheta,
        re_x: reX,
        thwaites_h: thwaitesH(lambda),
        production_thwaites_active: active,
        laminar_separation_here: laminarSepAt === i,
        transition_here: transitionAt === i,
      }));
    } else {
      rows.push(base(i, {}));
    }
  }

  const startTurbulent = transitionAt >= 0 ? transitionAt : laminarSepAt;
  let separationX = 1;
  let turbulentSeparationX: number | null = null;
  let headHAtStop: number | null = null;
  let headStopReason = startTurbulent < 0 ? 'remained_laminar' : '';
  if (startTurbulent >= 0) {
    const turbulent = integrateHead(stations, ue, startTurbulent, thetaAt(ue, stations, startTurbulent, nu), reynolds, (index, h, reason) => {
      const row = rows.find((item) => item.station_index === index);
      if (!row) return;
      row.head_h = h;
      row.turbulent_separation_here = reason !== '';
      row.head_stop_reason = reason;
    });
    headHAtStop = turbulent.h;
    headStopReason = turbulent.reason || 'reached_trim_attached';
    if (turbulent.separated) {
      separationX = stations[turbulent.index].x;
      turbulentSeparationX = separationX;
    }
  }
  return {
    rows,
    separationX,
    maxUe,
    xAtMaxUe,
    minLambda: Number.isFinite(minLambda) ? minLambda : null,
    xAtMinLambda: Number.isFinite(minLambda) ? xAtMinLambda : null,
    laminarSeparationX: laminarSepAt >= 0 ? stations[laminarSepAt].x : null,
    transitionX: transitionAt >= 0 ? stations[transitionAt].x : null,
    turbulentSeparationX,
    headHAtStop,
    headStopReason,
  };
}

function integrateHead(
  stations: Station[],
  ue: number[],
  start: number,
  theta0: number,
  reynolds: number,
  observe: (index: number, h: number, reason: string) => void,
): { separated: boolean; index: number; h: number; reason: string } {
  let theta = Math.max(theta0, 1e-8);
  let h = 1.4;
  let h1 = h1OfH(h);
  let endIndex = start;
  const substeps = 4;
  observe(start, h, '');
  for (let i = start + 1; i < stations.length; i++) {
    if (stations[i].x > TRIM_X && passedLeadingEdge(stations, i)) break;
    const dsTotal = stations[i].s - stations[i - 1].s;
    if (dsTotal <= 0) continue;
    const due = (ue[i] - ue[i - 1]) / dsTotal;
    const ds = dsTotal / substeps;
    let stopped = false;
    let reason = '';
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
      if (!Number.isFinite(h) || !Number.isFinite(theta)) {
        stopped = true;
        reason = 'non_finite_head_state';
        break;
      }
      if (h >= TURBULENT_SEPARATION_H || h1 <= 3.43) {
        stopped = true;
        reason = h >= TURBULENT_SEPARATION_H ? 'H_reached_2.4' : 'H1_reached_inverse_branch';
        if (h >= TURBULENT_SEPARATION_H && h1 <= 3.43) reason = 'H_reached_2.4_and_H1_branch';
        break;
      }
    }
    endIndex = i;
    observe(i, h, reason);
    if (stopped) return { separated: true, index: i, h: Math.min(h, 3), reason };
  }
  return { separated: false, index: endIndex, h, reason: '' };
}

function panelRows(alpha: number, panelCount: number, solution: PanelSolution): PanelRow[] {
  const ca = Math.cos(solution.alphaRad);
  const sa = Math.sin(solution.alphaRad);
  return solution.panels.map((panel, index) => {
    const dcx = -solution.cp[index] * panel.nx * panel.s;
    const dcy = -solution.cp[index] * panel.ny * panel.s;
    return {
      alpha_deg: alpha,
      panel_count: panelCount,
      panel_index: index,
      x1: panel.x1,
      y1: panel.y1,
      x2: panel.x2,
      y2: panel.y2,
      xm: panel.xm,
      ym: panel.ym,
      length: panel.s,
      tx: panel.tx,
      ty: panel.ty,
      nx: panel.nx,
      ny: panel.ny,
      vt: solution.vt[index],
      speed: solution.speed[index],
      speed_minus_abs_vt: solution.speed[index] - Math.abs(solution.vt[index]),
      cp: solution.cp[index],
      dcl: dcy * ca - dcx * sa,
      dcd: dcx * ca + dcy * sa,
    };
  });
}

function forceSplit(solution: PanelSolution): { clNose: number; clAft: number; cdNose: number; cdAft: number } {
  const ca = Math.cos(solution.alphaRad);
  const sa = Math.sin(solution.alphaRad);
  let clNose = 0;
  let clAft = 0;
  let cdNose = 0;
  let cdAft = 0;
  solution.panels.forEach((panel, index) => {
    const dcx = -solution.cp[index] * panel.nx * panel.s;
    const dcy = -solution.cp[index] * panel.ny * panel.s;
    const dcl = dcy * ca - dcx * sa;
    const dcd = dcx * ca + dcy * sa;
    if (panel.xm < 0.1) {
      clNose += dcl;
      cdNose += dcd;
    } else {
      clAft += dcl;
      cdAft += dcd;
    }
  });
  return { clNose, clAft, cdNose, cdAft };
}

function findStagnation(solution: PanelSolution): { index: number; signChanges: number } {
  const { panels, vt, speed } = solution;
  const n = panels.length;
  let stag = 0;
  let nearest = Infinity;
  let found = false;
  let signChanges = 0;
  for (let i = 0; i < n; i++) {
    const next = vt[(i + 1) % n];
    if (vt[i] <= 0 && next > 0) {
      signChanges += 1;
      if (panels[i].xm < nearest) {
        nearest = panels[i].xm;
        stag = i;
        found = true;
      }
    }
  }
  if (found) return { index: stag, signChanges };
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    if (speed[i] < best) {
      best = speed[i];
      stag = i;
    }
  }
  return { index: stag, signChanges };
}

function walkBranch(solution: PanelSolution, stag: number, step: 1 | -1, stopIndex: number): Station[] {
  const { panels, speed } = solution;
  const n = panels.length;
  const stations: Station[] = [{ panelIndex: stag, s: 0, x: panels[stag].xm, y: panels[stag].ym, ueRaw: 0 }];
  let s = 0;
  for (let k = 1; k < n; k++) {
    const i = mod(stag + step * k, n);
    const prev = mod(stag + step * (k - 1), n);
    s += Math.hypot(panels[i].xm - panels[prev].xm, panels[i].ym - panels[prev].ym);
    stations.push({ panelIndex: i, s, x: panels[i].xm, y: panels[i].ym, ueRaw: Math.max(speed[i], 0) });
    if (i === stopIndex) break;
  }
  return stations;
}

function midpointGaps(stations: Station[], panels: Panel[]): { min: number | null; minRatio: number | null } {
  if (stations.length < 2) return { min: null, minRatio: null };
  let min = Infinity;
  let minRatio = Infinity;
  for (let i = 1; i < stations.length; i++) {
    const gap = stations[i].s - stations[i - 1].s;
    const length = panels[stations[i].panelIndex].s;
    min = Math.min(min, gap);
    if (length > 0) minRatio = Math.min(minRatio, gap / length);
  }
  return {
    min: Number.isFinite(min) ? min : null,
    minRatio: Number.isFinite(minRatio) ? minRatio : null,
  };
}

function smooth(values: number[]): number[] {
  if (values.length < 3) return values.slice();
  const out = values.slice();
  for (let i = 1; i < values.length - 1; i++) out[i] = 0.25 * values[i - 1] + 0.5 * values[i] + 0.25 * values[i + 1];
  return out;
}

function stagnationTheta(ue: number[], stations: Station[], nu: number): number {
  const ds = Math.max(stations[1].s - stations[0].s, 1e-6);
  const due = Math.max((ue[1] - ue[0]) / ds, 1e-4);
  return Math.sqrt((0.075 * nu) / due);
}

function thetaAt(ue: number[], stations: Station[], end: number, nu: number): number {
  let integral = 0;
  for (let i = 1; i <= end; i++) {
    const ds = stations[i].s - stations[i - 1].s;
    if (ds <= 0) continue;
    integral += 0.5 * (Math.pow(ue[i - 1], 5) + Math.pow(ue[i], 5)) * ds;
  }
  const uei = Math.max(ue[end], 1e-4);
  return Math.sqrt(Math.max((0.45 * nu * integral) / Math.pow(uei, 6), 0));
}

function passedLeadingEdge(stations: Station[], index: number): boolean {
  let minX = stations[0].x;
  for (let i = 0; i <= index; i++) minX = Math.min(minX, stations[i].x);
  return minX < 0.05 && stations[index].x > minX + 0.02;
}

function thwaitesH(lambda: number): number {
  const l = Math.max(-0.1, Math.min(0.1, lambda));
  return 2.61 - 3.75 * l + 5.24 * l * l;
}

function michel(reX: number): number {
  const rx = Math.max(reX, 1);
  return 1.174 * (1 + 22400 / rx) * Math.pow(rx, 0.46);
}

function h1OfH(h: number): number {
  if (h <= 1.6) return 3.3 + 0.8234 * Math.pow(Math.max(h - 1.1, 1e-3), -1.287);
  return 3.3 + 1.5501 * Math.pow(Math.max(h - 0.6778, 1e-3), -3.064);
}

function hOfH1(h1: number): number {
  if (h1 >= 5.3) return 1.1 + 0.86 * Math.pow(h1 - 3.3, -0.777);
  if (h1 > 3.427) return 0.6778 + 1.1538 * Math.pow(h1 - 3.3, -0.326);
  return 3;
}

function uePlot(rows: StationRow[]): string {
  const selected = rows.filter((row) => row.alpha_deg === 13 && row.reynolds === 100_000 && row.surface === 'upper' && row.x <= 0.5);
  return chart(PANEL_COUNTS.flatMap((count) => [
    series(`Raw Ue, ${count} panels`, COLOR[count], '', selected.filter((row) => row.panel_count === count).map((row) => ({ x: row.x, y: row.ue_raw }))),
    series(`Smoothed Ue, ${count} panels`, COLOR[count], '4 3', selected.filter((row) => row.panel_count === count).map((row) => ({ x: row.x, y: row.ue_smoothed }))),
  ]), 'Edge velocity Ue/V', 'x/c', 'α = 13°, Re = 100,000, upper surface, x/c ≤ 0.5. Numerical velocities, not measurements.');
}

function lambdaPlot(rows: StationRow[]): string {
  const selected = rows.filter((row) => row.alpha_deg === 13 && row.reynolds === 100_000 && row.surface === 'upper' && row.lambda !== null && row.x <= 0.5);
  return chart(PANEL_COUNTS.map((count) => series(`λ, ${count} panels`, COLOR[count], '', selected.filter((row) => row.panel_count === count).map((row) => ({ x: row.x, y: row.lambda as number })))), 'Thwaites λ', 'x/c', 'Same case. The horizontal mark is the existing separation threshold λ = −0.09. Values below the axis limit are clipped on the plot only.');
}

function separationPlot(rows: SummaryRow[]): string {
  const lines = ANGLES.flatMap((alpha) => REYNOLDS.map((reynolds) => series(
    `α ${alpha}°, Re ${reynolds / 1000}k`,
    alpha === 13 && reynolds === 100_000 ? '#b33a3a' : '#60707c',
    reynolds === 500_000 ? '5 3' : '',
    rows.filter((row) => row.alpha_deg === alpha && row.reynolds === reynolds).map((row) => ({ x: row.panel_count, y: row.march_separation_x_upper ?? Number.NaN })).filter((point) => Number.isFinite(point.y)),
  )));
  return chart(lines, 'Upper separation x/c', 'Panel count', 'marchBoundaryLayer separation station. x/c = 1 means the march stayed attached to its trim. Not a measured stall location.');
}

function forcePlot(rows: SummaryRow[]): string {
  const once = rows.filter((row) => row.reynolds === REYNOLDS[0]);
  const lines = ANGLES.flatMap((alpha) => [
    series(`KJ cl, α ${alpha}°`, '#1f4e79', '', once.filter((row) => row.alpha_deg === alpha).map((row) => ({ x: row.panel_count, y: row.cl_joukowski }))),
    series(`Pressure cl, α ${alpha}°`, '#d6610a', '4 3', once.filter((row) => row.alpha_deg === alpha).map((row) => ({ x: row.panel_count, y: row.cl_pressure }))),
    series(`Pressure cd, α ${alpha}°`, '#2ca02c', '2 2', once.filter((row) => row.alpha_deg === alpha).map((row) => ({ x: row.panel_count, y: row.cd_pressure }))),
  ]);
  return chart(lines, 'Force coefficient', 'Panel count', 'Inviscid coefficients. Reynolds number does not enter this solution. Negative cd is the recorded pressure integral.');
}

const COLOR: Record<number, string> = { 40: '#1f77b4', 80: '#2ca02c', 160: '#d6610a' };

function series(name: string, color: string, dash: string, points: { x: number; y: number }[]): { name: string; color: string; dash: string; points: { x: number; y: number }[] } {
  return { name, color, dash, points };
}

function chart(lines: { name: string; color: string; dash: string; points: { x: number; y: number }[] }[], yLabel: string, xLabel: string, caption: string): string {
  const width = 960;
  const height = 640;
  const left = 78;
  const right = 24;
  const top = 36;
  const bottom = 168;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const finite = lines.flatMap((line) => line.points).filter((point) => Number.isFinite(point.y));
  const xMin = Math.min(...finite.map((point) => point.x));
  const xMax = Math.max(...finite.map((point) => point.x));
  const yValues = finite.map((point) => point.y);
  const yLo = Math.max(Math.min(...yValues, 0), -1.5);
  const yHi = Math.min(Math.max(...yValues, 0), 4);
  const yPad = 0.08 * (yHi - yLo || 1);
  const yMin = yLo - yPad;
  const yMax = yHi + yPad;
  const xSpan = xMax - xMin || 1;
  const xOf = (x: number) => left + ((x - xMin) / xSpan) * plotWidth;
  const yOf = (y: number) => top + ((yMax - y) / (yMax - yMin)) * plotHeight;
  const paths = lines.map((line) => {
    const path = line.points.filter((point) => Number.isFinite(point.y)).map((point, index) => `${index === 0 ? 'M' : 'L'} ${xOf(point.x).toFixed(2)} ${yOf(Math.max(yMin, Math.min(yMax, point.y))).toFixed(2)}`).join(' ');
    return `<path d="${path}" fill="none" stroke="${line.color}" stroke-width="1.6" stroke-dasharray="${line.dash}"/>`;
  });
  const legend = lines.map((line, index) => `<line x1="${74 + (index % 3) * 300}" y1="${height - 128 + Math.floor(index / 3) * 16}" x2="${98 + (index % 3) * 300}" y2="${height - 128 + Math.floor(index / 3) * 16}" stroke="${line.color}" stroke-width="1.6" stroke-dasharray="${line.dash}"/><text x="${104 + (index % 3) * 300}" y="${height - 124 + Math.floor(index / 3) * 16}" font-size="11" fill="#24323c">${escapeXml(line.name)}</text>`);
  const zero = yMin < 0 && yMax > 0 ? `<line x1="${left}" y1="${yOf(0)}" x2="${width - right}" y2="${yOf(0)}" stroke="#8ea0ae"/>` : '';
  const lambdaLine = yLabel.startsWith('Thwaites') ? `<line x1="${left}" y1="${yOf(-0.09)}" x2="${width - right}" y2="${yOf(-0.09)}" stroke="#b33a3a" stroke-dasharray="2 3"/>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="${left}" y="22" font-size="15" font-family="sans-serif" fill="#14202a">${escapeXml(yLabel)} against ${escapeXml(xLabel)}</text>
  <line x1="${left}" y1="${top}" x2="${left}" y2="${top + plotHeight}" stroke="#24323c"/>
  <line x1="${left}" y1="${top + plotHeight}" x2="${width - right}" y2="${top + plotHeight}" stroke="#24323c"/>
  ${zero}
  ${lambdaLine}
  ${paths.join('\n  ')}
  <text x="${left + plotWidth / 2}" y="${top + plotHeight + 28}" text-anchor="middle" font-size="12" fill="#24323c">${escapeXml(xLabel)}</text>
  ${legend.join('\n  ')}
  <text x="${left}" y="${height - 18}" font-size="12" fill="#4d5d6b">${escapeXml(caption)}</text>
</svg>
`;
}

function notesText(rows: SummaryRow[]): string {
  const focus = rows.filter((row) => row.alpha_deg === 13 && row.reynolds === 100_000);
  const mismatches = rows.filter((row) => !row.diagnostic_matches_march);
  const lines = [
    'Diagnostic observations from the existing march. Not physical measurements.',
    `Cases: ${rows.length}. Diagnostic/march mismatches: ${mismatches.length}.`,
    '',
    'α = 13°, Re = 100,000, upper surface:',
  ];
  for (const row of focus) {
    lines.push(
      `  ${row.panel_count} panels: stag x/c=${row.stagnation_x.toFixed(4)}, sign changes=${row.vt_sign_changes}, panels with x<0.05: ${row.panels_forward_of_0_05c}, min length there=${format(row.min_panel_length_forward_of_0_05c)}, max Ue=${format(row.max_ue_upper)} at x/c=${format(row.x_at_max_ue_upper)}, min λ=${format(row.min_lambda_upper)} at x/c=${format(row.x_at_min_lambda_upper)}, laminar sep=${format(row.laminar_separation_x_upper)}, transition=${format(row.transition_x_upper)}, reported sep=${format(row.march_separation_x_upper)}, Head stop=${row.head_stop_reason_upper}, H=${format(row.head_h_at_upper_stop)}`,
    );
  }
  lines.push('', 'Inviscid force residual at those panel counts, same angle (Re does not enter):');
  for (const row of focus) {
    lines.push(`  ${row.panel_count}: clKJ=${row.cl_joukowski.toFixed(4)}, clP=${row.cl_pressure.toFixed(4)}, difference=${row.cl_pressure_minus_joukowski.toExponential(3)}, cdP=${row.cd_pressure.toExponential(3)}, cd from x<0.1=${row.cd_from_x_below_0_10.toExponential(3)}, cd from x>=0.1=${row.cd_from_x_at_or_above_0_10.toExponential(3)}, max(|q|-|vt|)=${row.max_normal_residual.toExponential(3)}`);
  }
  return `${lines.join('\n')}\n`;
}

function format(value: number | null): string {
  if (value === null) return 'not_produced';
  if (Number.isNaN(value)) return 'NaN';
  if (!Number.isFinite(value)) return value > 0 ? 'Infinity' : '-Infinity';
  return value.toFixed(4);
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

function mod(index: number, length: number): number {
  return ((index % length) + length) % length;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

main();
