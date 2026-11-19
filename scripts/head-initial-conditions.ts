/**
 * Sensitivity of the existing Head march to its initial shape factor.
 *
 * The production equations are not modified. H = 1.4 is the value in
 * lib/boundaryLayer.ts. The other values explore the closure's attached
 * range and the shape factor the laminar march actually has. They are not
 * candidate constants.
 *
 * Nothing here is a wind-tunnel result.
 */

import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { h1OfH, hOfH1, marchBoundaryLayer } from '../lib/boundaryLayer';
import { naca2412Nodes } from '../lib/naca';
import { solveNaca2412, solveNodes, type PanelSolution } from '../lib/panel';

const ANGLES = [5, 10, 13, 15];
const REYNOLDS = [100_000, 500_000, 1_000_000];
const PANEL_COUNTS = [40, 80, 160];
const PRESCRIBED_H = [1.2, 1.4, 1.8, 2.2];
const OUTPUT = join(process.cwd(), 'transition');
const TRIM_X = 0.99;
const LAMINAR_LAMBDA = -0.09;
const TURBULENT_H = 2.4;

type Station = { panelIndex: number; s: number; x: number; y: number; ue: number };
type SurfaceName = 'upper' | 'lower';

type Row = {
  alpha_deg: number;
  reynolds: number;
  panel_count: number;
  surface: SurfaceName;
  h_policy: string;
  switch_reason: string;
  switch_x: number | null;
  switch_s: number | null;
  ue_at_switch: number | null;
  theta0: number | null;
  re_theta0: number | null;
  lambda_at_switch: number | null;
  thwaites_h_at_switch: number | null;
  h0: number | null;
  h1_0: number | null;
  entrainment0: number | null;
  first_ds: number | null;
  first_due_ds: number | null;
  theta_after_first_substep: number | null;
  h_after_first_substep: number | null;
  h1_after_first_substep: number | null;
  theta_after_first_interval: number | null;
  h_after_first_interval: number | null;
  first_interval_stopped: boolean | null;
  first_stop_reason: string;
  final_stop_reason: string;
  separation_x: number | null;
  separated: boolean;
  attached_to_trim: boolean;
  non_finite: boolean;
  matches_production: boolean | null;
};

function main(): void {
  mkdirSync(OUTPUT, { recursive: true });
  const rows: Row[] = [];
  let mismatches = 0;
  for (const alpha of ANGLES) {
    for (const count of PANEL_COUNTS) {
      const solution = count === 80 ? solveNaca2412(alpha) : solveNodes(naca2412Nodes(count), alpha);
      for (const reynolds of REYNOLDS) {
        const production = marchBoundaryLayer(solution, reynolds);
        for (const surface of ['upper', 'lower'] as const) {
          const stations = branch(solution, surface);
          const laminar = laminarScan(stations, reynolds);
          for (const prescribed of PRESCRIBED_H) {
            const row = march(alpha, reynolds, count, surface, `prescribed_${prescribed.toFixed(1)}`, prescribed, stations, laminar);
            if (prescribed === 1.4) {
              const expected = production[surface].separated ? production[surface].separationX : null;
              row.matches_production = same(expected, row.separated ? row.separation_x : null);
              if (!row.matches_production) mismatches += 1;
            }
            rows.push(row);
          }
          rows.push(march(alpha, reynolds, count, surface, 'thwaites_h_at_switch', laminar.thwaitesH, stations, laminar));
        }
      }
    }
  }
  writeFileSync(join(OUTPUT, 'head-initial.csv'), toCsv(rows), 'utf8');
  writeFileSync(join(OUTPUT, 'separation-vs-initial-h.svg'), separationPlot(rows), 'utf8');
  const finiteFailures = rows.filter((row) => row.non_finite).length;
  const upper = rows.filter((row) => row.surface === 'upper' && row.alpha_deg === 13 && row.panel_count === 80);
  console.log(`rows ${rows.length}, production mismatches ${mismatches}, non-finite ${finiteFailures}`);
  for (const row of upper) {
    console.log(`${row.h_policy} Re${row.reynolds} reason=${row.switch_reason} x=${fmt(row.switch_x)} thH=${fmt(row.thwaites_h_at_switch)} ReTh=${fmt(row.re_theta0)} H0=${fmt(row.h0)} H1=${fmt(row.h1_0)} F=${fmt(row.entrainment0)} dH=${fmt(row.h_after_first_substep)} sep=${row.separated ? fmt(row.separation_x) : 'attached'} stop=${row.first_stop_reason}`);
  }
}

type Laminar = {
  reason: string;
  index: number;
  theta: number;
  lambda: number | null;
  thwaitesH: number | null;
  reTheta: number | null;
  ue: number | null;
};

function march(alpha: number, reynolds: number, count: number, surface: SurfaceName, policy: string, h0Input: number | null, stations: Station[], laminar: Laminar): Row {
  const blank = emptyRow(alpha, reynolds, count, surface, policy);
  if (laminar.index < 0 || h0Input === null || !Number.isFinite(h0Input)) {
    return { ...blank, switch_reason: laminar.reason };
  }
  const ue = smooth(stations.map((station) => station.ue));
  ue[0] = 0;
  const start = laminar.index;
  const h0 = h0Input;
  const h1 = h1OfH(h0);
  const entrainment = 0.0306 * Math.pow(Math.max(h1 - 3, 1e-3), -0.6169);
  const edge = Math.max(ue[start], 1e-4);
  const outcome = integrate(stations, ue, start, laminar.theta, h0, reynolds);
  return {
    ...blank,
    switch_reason: laminar.reason,
    switch_x: stations[start].x,
    switch_s: stations[start].s,
    ue_at_switch: edge,
    theta0: laminar.theta,
    re_theta0: edge * laminar.theta * reynolds,
    lambda_at_switch: laminar.lambda,
    thwaites_h_at_switch: laminar.thwaitesH,
    h0,
    h1_0: h1,
    entrainment0: Number.isFinite(entrainment) ? entrainment : null,
    first_ds: outcome.firstDs,
    first_due_ds: outcome.firstDue,
    theta_after_first_substep: outcome.thetaSub,
    h_after_first_substep: outcome.hSub,
    h1_after_first_substep: outcome.h1Sub,
    theta_after_first_interval: outcome.thetaInterval,
    h_after_first_interval: outcome.hInterval,
    first_interval_stopped: outcome.firstStopped,
    first_stop_reason: outcome.firstReason,
    final_stop_reason: outcome.finalReason,
    separation_x: outcome.separated ? stations[outcome.index].x : null,
    separated: outcome.separated,
    attached_to_trim: !outcome.separated && !outcome.nonFinite,
    non_finite: outcome.nonFinite,
  };
}

function laminarScan(stations: Station[], reynolds: number): Laminar {
  const none: Laminar = { reason: 'no_switch', index: -1, theta: 0, lambda: null, thwaitesH: null, reTheta: null, ue: null };
  if (stations.length < 3) return none;
  const nu = 1 / reynolds;
  const ue = smooth(stations.map((station) => station.ue));
  ue[0] = 0;
  let integral = 0;
  let theta = Math.sqrt((0.075 * nu) / Math.max((ue[1] - ue[0]) / Math.max(stations[1].s - stations[0].s, 1e-6), 1e-4));
  for (let i = 1; i < stations.length; i++) {
    if (stations[i].x > TRIM_X && passed(stations, i)) break;
    const ds = stations[i].s - stations[i - 1].s;
    if (ds <= 0) continue;
    integral += 0.5 * (Math.pow(ue[i - 1], 5) + Math.pow(ue[i], 5)) * ds;
    const edge = Math.max(ue[i], 1e-4);
    const theta2 = (0.45 * nu * integral) / Math.pow(edge, 6);
    theta = Math.sqrt(Math.max(theta2, 0));
    const due = (ue[i] - ue[i - 1]) / ds;
    const lambda = (theta2 * due) / nu;
    const reTheta = edge * theta * reynolds;
    const reX = edge * stations[i].s * reynolds;
    const laminarHit = lambda <= LAMINAR_LAMBDA;
    const michelHit = reX > 50 && reTheta >= michel(reX);
    if (laminarHit || michelHit) {
      return {
        reason: michelHit && !laminarHit ? 'michel' : laminarHit && michelHit ? 'both_same_station' : 'laminar_separation',
        index: i,
        theta,
        lambda,
        thwaitesH: thwaitesH(lambda),
        reTheta,
        ue: edge,
      };
    }
  }
  return none;
}

function integrate(stations: Station[], ue: number[], start: number, theta0: number, h0: number, reynolds: number): {
  separated: boolean;
  index: number;
  nonFinite: boolean;
  firstDs: number | null;
  firstDue: number | null;
  thetaSub: number | null;
  hSub: number | null;
  h1Sub: number | null;
  thetaInterval: number | null;
  hInterval: number | null;
  firstStopped: boolean | null;
  firstReason: string;
  finalReason: string;
} {
  let theta = Math.max(theta0, 1e-8);
  let h = h0;
  let h1 = h1OfH(h);
  let endIndex = start;
  let nonFinite = !Number.isFinite(h) || !Number.isFinite(theta);
  let firstDs: number | null = null;
  let firstDue: number | null = null;
  let thetaSub: number | null = null;
  let hSub: number | null = null;
  let h1Sub: number | null = null;
  let thetaInterval: number | null = null;
  let hInterval: number | null = null;
  let firstStopped: boolean | null = null;
  let firstReason = '';
  let finalReason = 'attached';
  const substeps = 4;
  let intervalCount = 0;
  for (let i = start + 1; i < stations.length; i++) {
    if (stations[i].x > TRIM_X && passed(stations, i)) break;
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
      const finite = Number.isFinite(h) && Number.isFinite(theta);
      if (!finite) nonFinite = true;
      const hFail = finite && h >= TURBULENT_H;
      const h1Fail = finite && h1 <= 3.43;
      if (intervalCount === 0 && sub === 0) {
        thetaSub = theta;
        hSub = Number.isFinite(h) ? h : null;
        h1Sub = Number.isFinite(h1) ? h1 : null;
      }
      if (!finite || hFail || h1Fail) {
        stopped = true;
        reason = [!finite ? 'non_finite' : '', hFail ? 'H_reached_2.4' : '', h1Fail ? 'H1_reached_inverse_branch' : ''].filter(Boolean).join('+');
        break;
      }
    }
    endIndex = i;
    if (intervalCount === 0) {
      firstDs = dsTotal;
      firstDue = due;
      firstStopped = stopped;
      firstReason = reason;
      if (!stopped) {
        thetaInterval = theta;
        hInterval = h;
      }
    }
    intervalCount += 1;
    if (stopped) return { separated: !nonFinite, index: i, nonFinite, firstDs, firstDue, thetaSub, hSub, h1Sub, thetaInterval, hInterval, firstStopped, firstReason, finalReason: reason };
  }
  return { separated: false, index: endIndex, nonFinite, firstDs, firstDue, thetaSub, hSub, h1Sub, thetaInterval, hInterval, firstStopped, firstReason, finalReason };
}

function branch(solution: PanelSolution, surface: SurfaceName): Station[] {
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
  if (!found) {
    let best = Infinity;
    for (let i = 0; i < n; i++) if (speed[i] < best) {
      best = speed[i];
      stag = i;
    }
  }
  const step = surface === 'upper' ? 1 : -1;
  const stop = surface === 'upper' ? n - 1 : 0;
  const stations: Station[] = [{ panelIndex: stag, s: 0, x: panels[stag].xm, y: panels[stag].ym, ue: 0 }];
  let s = 0;
  for (let k = 1; k < n; k++) {
    const index = mod(stag + step * k, n);
    const previous = mod(stag + step * (k - 1), n);
    s += Math.hypot(panels[index].xm - panels[previous].xm, panels[index].ym - panels[previous].ym);
    stations.push({ panelIndex: index, s, x: panels[index].xm, y: panels[index].ym, ue: Math.max(speed[index], 0) });
    if (index === stop) break;
  }
  return stations;
}

function smooth(values: number[]): number[] {
  if (values.length < 3) return values.slice();
  const out = values.slice();
  for (let i = 1; i < values.length - 1; i++) out[i] = 0.25 * values[i - 1] + 0.5 * values[i] + 0.25 * values[i + 1];
  return out;
}

function passed(stations: Station[], index: number): boolean {
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

function emptyRow(alpha: number, reynolds: number, count: number, surface: SurfaceName, policy: string): Row {
  return {
    alpha_deg: alpha,
    reynolds,
    panel_count: count,
    surface,
    h_policy: policy,
    switch_reason: 'no_switch',
    switch_x: null,
    switch_s: null,
    ue_at_switch: null,
    theta0: null,
    re_theta0: null,
    lambda_at_switch: null,
    thwaites_h_at_switch: null,
    h0: null,
    h1_0: null,
    entrainment0: null,
    first_ds: null,
    first_due_ds: null,
    theta_after_first_substep: null,
    h_after_first_substep: null,
    h1_after_first_substep: null,
    theta_after_first_interval: null,
    h_after_first_interval: null,
    first_interval_stopped: null,
    first_stop_reason: '',
    final_stop_reason: '',
    separation_x: null,
    separated: false,
    attached_to_trim: false,
    non_finite: false,
    matches_production: null,
  };
}

function separationPlot(rows: Row[]): string {
  const selected = rows.filter((row) => row.surface === 'upper' && row.h_policy.startsWith('prescribed_'));
  const panels = ANGLES.map((alpha) => ({
    title: `α = ${alpha}°`,
    lines: REYNOLDS.flatMap((reynolds, reynoldsIndex) => PANEL_COUNTS.map((count, countIndex) => ({
      name: `Re ${reynolds / 1000}k, ${count} panels`,
      color: ['#1f4e79', '#d6610a', '#2ca02c'][reynoldsIndex],
      dash: ['', '4 3', '1 2'][countIndex],
      points: PRESCRIBED_H.map((h) => {
        const row = selected.find((item) => item.alpha_deg === alpha && item.reynolds === reynolds && item.panel_count === count && item.h_policy === `prescribed_${h.toFixed(1)}`);
        return { x: h, y: row?.separated ? row.separation_x ?? Number.NaN : row ? 1 : Number.NaN };
      }),
    }))),
  }));
  return multiples(panels);
}

function multiples(panels: { title: string; lines: { name: string; color: string; dash: string; points: { x: number; y: number }[] }[] }[]): string {
  const width = 1080;
  const height = 820;
  const parts: string[] = [];
  panels.forEach((panel, panelIndex) => {
    const column = panelIndex % 2;
    const row = Math.floor(panelIndex / 2);
    const originX = 70 + column * 520;
    const originY = 56 + row * 330;
    const plotWidth = 430;
    const plotHeight = 230;
    const xOf = (x: number) => originX + ((x - 1.2) / 1.0) * plotWidth;
    const yOf = (y: number) => originY + ((1.05 - y) / 1.15) * plotHeight;
    parts.push(`<text x="${originX}" y="${originY - 10}" font-size="14" fill="#14202a">${panel.title}</text>`);
    parts.push(`<line x1="${originX}" y1="${originY}" x2="${originX}" y2="${originY + plotHeight}" stroke="#24323c"/>`);
    parts.push(`<line x1="${originX}" y1="${originY + plotHeight}" x2="${originX + plotWidth}" y2="${originY + plotHeight}" stroke="#24323c"/>`);
    for (const line of panel.lines) {
      const path = line.points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${xOf(point.x).toFixed(2)} ${yOf(point.y).toFixed(2)}`).join(' ');
      parts.push(`<path d="${path}" fill="none" stroke="${line.color}" stroke-width="1.5" stroke-dasharray="${line.dash}"/>`);
    }
  });
  const legend = REYNOLDS.flatMap((reynolds, reynoldsIndex) => PANEL_COUNTS.map((count, countIndex) => {
    const index = reynoldsIndex * 3 + countIndex;
    const dash = ['', '4 3', '1 2'][countIndex];
    const color = ['#1f4e79', '#d6610a', '#2ca02c'][reynoldsIndex];
    return `<line x1="${70 + (index % 3) * 330}" y1="${760 + Math.floor(index / 3) * 16}" x2="${94 + (index % 3) * 330}" y2="${760 + Math.floor(index / 3) * 16}" stroke="${color}" stroke-dasharray="${dash}"/><text x="${100 + (index % 3) * 330}" y="${764 + Math.floor(index / 3) * 16}" font-size="11" fill="#24323c">Re ${reynolds / 1000}k, ${count} panels</text>`;
  })).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="70" y="24" font-size="16" font-family="sans-serif" fill="#14202a">Upper-surface Head station against prescribed initial H</text>
  ${parts.join('\n  ')}
  ${legend}
  <text x="70" y="808" font-size="12" fill="#4d5d6b">A station of 1 stayed attached to the trim. Prescribed H values are a sensitivity set, not fitted constants. The laminar Thwaites value is in the CSV.</text>
</svg>`;
}

function same(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) <= 1e-9;
}

function fmt(value: number | null): string {
  return value === null || !Number.isFinite(value) ? 'blank' : value.toFixed(4);
}

function toCsv(rows: Row[]): string {
  const columns = Object.keys(rows[0]);
  const body = rows.map((row) => columns.map((column) => formatCell(row[column as keyof Row])).join(','));
  return `${columns.join(',')}\n${body.join('\n')}\n`;
}

function formatCell(value: string | number | boolean | null): string {
  if (value === null) return '';
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'NaN';
    if (!Number.isFinite(value)) return value > 0 ? 'Infinity' : '-Infinity';
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return value;
}

function mod(index: number, length: number): number {
  return ((index % length) + length) % length;
}

main();
