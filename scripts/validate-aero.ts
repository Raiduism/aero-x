/**
 * Numerical checks for the existing NACA 2412 model.
 *
 * This script only calls the current solvers. It does not change them and it
 * does not compare them with wind-tunnel measurements.
 *
 * Section lift and drag come from sectionAt, which always solves the
 * production 80-panel aerofoil. Panel counts 40 and 160 are run through
 * naca2412Nodes, solveNodes and marchBoundaryLayer, which is as far as the
 * public implementation goes. Their section-coefficient cells are left empty.
 */

import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ATTACHED_STATION, STALL_STATION, sectionAt, type FlowRegime } from '../lib/aero';
import { marchBoundaryLayer, type SurfaceMarch } from '../lib/boundaryLayer';
import { naca2412Nodes } from '../lib/naca';
import { solveNaca2412, solveNodes, type PanelSolution } from '../lib/panel';

const ANGLES = Array.from({ length: 26 }, (_, index) => index - 5);
const REYNOLDS = [100_000, 500_000, 1_000_000];
const PANEL_COUNTS = [40, 80, 160];
const OUTPUT_DIR = join(process.cwd(), 'validation');

type SeparationKind = 'boundary_layer_criterion' | 'trailing_edge_trim' | 'not_reported' | 'integration_failure';

type Row = {
  alpha_deg: number;
  reynolds: number;
  panel_count: number;
  panel_count_solved: number | null;
  solver: string;
  status: 'ok' | 'solver_failure' | 'march_failure';
  error_message: string;
  cl_section: number | null;
  cd_section: number | null;
  cl_joukowski: number | null;
  cl_pressure: number | null;
  cd_pressure: number | null;
  cl_pressure_minus_joukowski: number | null;
  upper_transition_x: number | null;
  lower_transition_x: number | null;
  upper_separation_x: number | null;
  lower_separation_x: number | null;
  upper_separated: boolean | null;
  lower_separated: boolean | null;
  upper_laminar_separation: boolean | null;
  lower_laminar_separation: boolean | null;
  upper_separation_kind: SeparationKind | '';
  lower_separation_kind: SeparationKind | '';
  regime: FlowRegime | '';
  regime_source: string;
  regime_matches_section_model: boolean | '';
  issues: string;
};

const COLUMNS: (keyof Row)[] = [
  'alpha_deg',
  'reynolds',
  'panel_count',
  'panel_count_solved',
  'solver',
  'status',
  'error_message',
  'cl_section',
  'cd_section',
  'cl_joukowski',
  'cl_pressure',
  'cd_pressure',
  'cl_pressure_minus_joukowski',
  'upper_transition_x',
  'lower_transition_x',
  'upper_separation_x',
  'lower_separation_x',
  'upper_separated',
  'lower_separated',
  'upper_laminar_separation',
  'lower_laminar_separation',
  'upper_separation_kind',
  'lower_separation_kind',
  'regime',
  'regime_source',
  'regime_matches_section_model',
  'issues',
];

function main(): void {
  const rows: Row[] = [];
  const entryDelta: number[] = [];

  for (const alpha of ANGLES) {
    let production: PanelSolution | null = null;
    try {
      production = solveNaca2412(alpha);
      const discretised = solveNodes(naca2412Nodes(80), alpha);
      entryDelta.push(Math.abs(production.cl - discretised.cl));
    } catch (error) {
      entryDelta.push(Number.NaN);
      console.error(`80-panel entry check failed at ${alpha}°: ${messageOf(error)}`);
    }

    for (const panelCount of PANEL_COUNTS) {
      for (const reynolds of REYNOLDS) {
        rows.push(evaluateCase(alpha, reynolds, panelCount, production));
      }
    }
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(join(OUTPUT_DIR, 'aero-validation.csv'), toCsv(rows), 'utf8');
  const sensitivity = panelSensitivity(rows);
  writeFileSync(join(OUTPUT_DIR, 'panel-sensitivity.csv'), sensitivity.csv, 'utf8');
  writeFileSync(join(OUTPUT_DIR, 'cl-alpha.svg'), liftPlot(rows), 'utf8');
  writeFileSync(join(OUTPUT_DIR, 'cd-alpha.svg'), dragPlot(rows), 'utf8');
  const limitations = limitationsText(rows, sensitivity, entryDelta);
  writeFileSync(join(OUTPUT_DIR, 'limitations.txt'), limitations, 'utf8');
  console.log(limitations);
}

function evaluateCase(alpha: number, reynolds: number, panelCount: number, production: PanelSolution | null): Row {
  const row = emptyRow(alpha, reynolds, panelCount);
  let solution: PanelSolution;
  try {
    if (panelCount === 80) {
      solution = production ?? solveNaca2412(alpha);
      row.solver = 'solveNaca2412';
    } else {
      solution = solveNodes(naca2412Nodes(panelCount), alpha);
      row.solver = 'solveNodes';
    }
  } catch (error) {
    row.status = 'solver_failure';
    row.error_message = messageOf(error);
    row.issues = 'solver_failure';
    return row;
  }

  row.panel_count_solved = solution.panels.length;
  row.cl_joukowski = solution.cl;
  row.cl_pressure = solution.clPressure;
  row.cd_pressure = solution.cdPressure;
  row.cl_pressure_minus_joukowski = solution.clPressure - solution.cl;

  let march;
  try {
    march = marchBoundaryLayer(solution, reynolds);
  } catch (error) {
    row.status = 'march_failure';
    row.error_message = messageOf(error);
    row.issues = issueList(row, null, null);
    return row;
  }

  row.upper_transition_x = march.upper.transitionX;
  row.lower_transition_x = march.lower.transitionX;
  row.upper_separation_x = march.upper.separationX;
  row.lower_separation_x = march.lower.separationX;
  row.upper_separated = march.upper.separated;
  row.lower_separated = march.lower.separated;
  row.upper_laminar_separation = march.upper.laminarSeparation;
  row.lower_laminar_separation = march.lower.laminarSeparation;
  row.upper_separation_kind = separationKind(march.upper);
  row.lower_separation_kind = separationKind(march.lower);

  const fromThresholds = regimeFromMarch(march.upper, march.lower);
  if (panelCount === 80) {
    try {
      const section = sectionAt(alpha, reynolds);
      row.cl_section = section.cl;
      row.cd_section = section.cd;
      row.regime = section.regime;
      row.regime_source = 'sectionAt';
      row.regime_matches_section_model = fromThresholds === null ? '' : fromThresholds === section.regime;
    } catch (error) {
      row.error_message = messageOf(error);
      row.regime_source = 'sectionAt_failed';
    }
  } else {
    row.regime = fromThresholds ?? '';
    row.regime_source = fromThresholds === null ? 'not_classified_non_finite_march' : 'exported_station_thresholds';
  }

  row.issues = issueList(row, march.upper, march.lower);
  return row;
}

function emptyRow(alpha: number, reynolds: number, panelCount: number): Row {
  return {
    alpha_deg: alpha,
    reynolds,
    panel_count: panelCount,
    panel_count_solved: null,
    solver: '',
    status: 'ok',
    error_message: '',
    cl_section: null,
    cd_section: null,
    cl_joukowski: null,
    cl_pressure: null,
    cd_pressure: null,
    cl_pressure_minus_joukowski: null,
    upper_transition_x: null,
    lower_transition_x: null,
    upper_separation_x: null,
    lower_separation_x: null,
    upper_separated: null,
    lower_separated: null,
    upper_laminar_separation: null,
    lower_laminar_separation: null,
    upper_separation_kind: '',
    lower_separation_kind: '',
    regime: '',
    regime_source: '',
    regime_matches_section_model: '',
    issues: '',
  };
}

function separationKind(surface: SurfaceMarch): SeparationKind {
  if (!Number.isFinite(surface.separationX) || !Number.isFinite(surface.separationY)) return 'integration_failure';
  if (!surface.separated) return 'not_reported';
  if (surface.separationX >= ATTACHED_STATION) return 'trailing_edge_trim';
  return 'boundary_layer_criterion';
}

/** Same station rules sectionAt uses. Null if the march itself is non-finite. */
function regimeFromMarch(upper: SurfaceMarch, lower: SurfaceMarch): FlowRegime | null {
  const upperFactor = stationFactor(upper);
  const lowerFactor = stationFactor(lower);
  if (upperFactor === null || lowerFactor === null) return null;
  const factor = Math.min(upperFactor, lowerFactor);
  if (factor >= ATTACHED_STATION) return 'attached';
  if (factor >= STALL_STATION) return 'separating';
  return 'stalled';
}

function stationFactor(surface: SurfaceMarch): number | null {
  if (!Number.isFinite(surface.separationX)) return null;
  if (!surface.separated || surface.separationX >= ATTACHED_STATION) return 1;
  return Math.max(0, Math.min(1, surface.separationX));
}

function issueList(row: Row, upper: SurfaceMarch | null, lower: SurfaceMarch | null): string {
  const issues: string[] = [];
  if (row.status !== 'ok') issues.push(row.status);
  const numbers: [string, number | null][] = [
    ['cl_section', row.cl_section],
    ['cd_section', row.cd_section],
    ['cl_joukowski', row.cl_joukowski],
    ['cl_pressure', row.cl_pressure],
    ['cd_pressure', row.cd_pressure],
    ['upper_transition_x', row.upper_transition_x],
    ['lower_transition_x', row.lower_transition_x],
    ['upper_separation_x', row.upper_separation_x],
    ['lower_separation_x', row.lower_separation_x],
  ];
  for (const [name, value] of numbers) {
    if (value === null) continue;
    if (Number.isNaN(value)) issues.push(`NaN:${name}`);
    else if (!Number.isFinite(value)) issues.push(`Infinity:${name}`);
  }
  if (upper && (!Number.isFinite(upper.thetaEnd) || !Number.isFinite(upper.hEnd))) issues.push('non_finite_upper_march_state');
  if (lower && (!Number.isFinite(lower.thetaEnd) || !Number.isFinite(lower.hEnd))) issues.push('non_finite_lower_march_state');
  if (row.cd_section !== null && row.cd_section < 0) issues.push('negative_cd_section');
  if (row.cd_pressure !== null && row.cd_pressure < 0) issues.push('negative_cd_pressure');
  if (row.panel_count_solved !== null && row.panel_count_solved !== row.panel_count) issues.push('panel_count_mismatch');
  if (row.regime_matches_section_model === false) issues.push('regime_mismatch');
  return issues.join('|');
}

function panelSensitivity(rows: Row[]): { csv: string; maxSpread: number; disagreements: number; failures: number } {
  const header = [
    'alpha_deg',
    'reynolds',
    'surface',
    'separation_x_40',
    'separation_x_80',
    'separation_x_160',
    'kind_40',
    'kind_80',
    'kind_160',
    'finite_spread',
    'kind_disagreement',
  ];
  const lines = [header.join(',')];
  let maxSpread = 0;
  let disagreements = 0;
  let failures = 0;
  for (const alpha of ANGLES) {
    for (const reynolds of REYNOLDS) {
      for (const surface of ['upper', 'lower'] as const) {
        const byCount = new Map(PANEL_COUNTS.map((count) => [count, rows.find((row) => row.alpha_deg === alpha && row.reynolds === reynolds && row.panel_count === count)]));
        const xKey = surface === 'upper' ? 'upper_separation_x' : 'lower_separation_x';
        const kindKey = surface === 'upper' ? 'upper_separation_kind' : 'lower_separation_kind';
        const values = PANEL_COUNTS.map((count) => byCount.get(count)?.[xKey] ?? null);
        const kinds = PANEL_COUNTS.map((count) => byCount.get(count)?.[kindKey] || '');
        const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
        const spread = finite.length >= 2 ? Math.max(...finite) - Math.min(...finite) : null;
        if (spread !== null) maxSpread = Math.max(maxSpread, spread);
        const comparable = kinds.filter((kind) => kind !== '' && kind !== 'integration_failure');
        const disagreement = new Set(comparable).size > 1;
        if (disagreement) disagreements += 1;
        if (kinds.some((kind) => kind === '' || kind === 'integration_failure') || PANEL_COUNTS.some((count) => byCount.get(count)?.status !== 'ok')) failures += 1;
        lines.push(
          [
            alpha,
            reynolds,
            surface,
            ...values.map(formatCell),
            ...kinds.map(formatCell),
            formatCell(spread),
            disagreement ? 'yes' : 'no',
          ].join(','),
        );
      }
    }
  }
  return { csv: `${lines.join('\n')}\n`, maxSpread, disagreements, failures };
}

function liftPlot(rows: Row[]): string {
  const production = rows.filter((row) => row.panel_count === 80 && row.status === 'ok');
  const series = REYNOLDS.map((reynolds, index) => ({
    name: `Section cl, Re = ${formatRe(reynolds)}, 80 panels`,
    color: SERIES_COLORS[index],
    dash: '',
    points: production
      .filter((row) => row.reynolds === reynolds && row.cl_section !== null && Number.isFinite(row.cl_section))
      .map((row) => ({ x: row.alpha_deg, y: row.cl_section as number })),
  }));
  const joukowski = production
    .filter((row) => row.reynolds === REYNOLDS[0] && row.cl_joukowski !== null && Number.isFinite(row.cl_joukowski))
    .map((row) => ({ x: row.alpha_deg, y: row.cl_joukowski as number }));
  series.push({ name: 'Kutta–Joukowski cl, 80 panels (inviscid, no Re)', color: '#9aa8b4', dash: '5 4', points: joukowski });
  return renderPlot(series, 'Section lift coefficient', 'Model output. Not wind-tunnel data.');
}

function dragPlot(rows: Row[]): string {
  const production = rows.filter((row) => row.panel_count === 80 && row.status === 'ok');
  const series = REYNOLDS.map((reynolds, index) => ({
    name: `Section cd, Re = ${formatRe(reynolds)}, 80 panels`,
    color: SERIES_COLORS[index],
    dash: '',
    points: production
      .filter((row) => row.reynolds === reynolds && row.cd_section !== null && Number.isFinite(row.cd_section))
      .map((row) => ({ x: row.alpha_deg, y: row.cd_section as number })),
  }));
  return renderPlot(series, 'Section drag coefficient', 'Model output from sectionAt. Not wind-tunnel data. Inviscid pressure drag is not plotted.');
}

const SERIES_COLORS = ['#1f77b4', '#2ca02c', '#d6610a'];

function renderPlot(series: { name: string; color: string; dash: string; points: { x: number; y: number }[] }[], yLabel: string, caption: string): string {
  const width = 920;
  const height = 560;
  const left = 74;
  const right = 28;
  const top = 28;
  const bottom = 128;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const xs = series.flatMap((item) => item.points.map((point) => point.x));
  const ys = series.flatMap((item) => item.points.map((point) => point.y));
  const xMin = Math.min(...xs, -5);
  const xMax = Math.max(...xs, 20);
  const yDataMin = Math.min(...ys, 0);
  const yDataMax = Math.max(...ys, 0);
  const yPad = Math.max(0.05, 0.08 * (yDataMax - yDataMin || 1));
  const yMin = yDataMin - yPad;
  const yMax = yDataMax + yPad;
  const xOf = (x: number) => left + ((x - xMin) / (xMax - xMin)) * plotWidth;
  const yOf = (y: number) => top + ((yMax - y) / (yMax - yMin)) * plotHeight;
  const xTicks = ANGLES.filter((alpha) => alpha % 5 === 0);
  const yTicks = tickValues(yMin, yMax, 6);
  const lines = series.map((item) => {
    const path = item.points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${xOf(point.x).toFixed(2)} ${yOf(point.y).toFixed(2)}`).join(' ');
    return `<path d="${path}" fill="none" stroke="${item.color}" stroke-width="1.8" stroke-dasharray="${item.dash}"/>`;
  });
  const legend = series.map((item, index) => {
    const y = height - 96 + index * 16;
    return `<line x1="74" y1="${y}" x2="98" y2="${y}" stroke="${item.color}" stroke-width="1.8" stroke-dasharray="${item.dash}"/><text x="106" y="${y + 4}" font-size="12" fill="#24323c">${escapeXml(item.name)}</text>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="${left}" y="18" font-size="14" font-family="sans-serif" fill="#14202a">${escapeXml(yLabel)} versus angle of attack</text>
  ${yTicks.map((tick) => `<line x1="${left}" y1="${yOf(tick).toFixed(2)}" x2="${width - right}" y2="${yOf(tick).toFixed(2)}" stroke="#e2e8ee"/><text x="${left - 8}" y="${(yOf(tick) + 4).toFixed(2)}" text-anchor="end" font-size="11" fill="#4d5d6b">${formatTick(tick)}</text>`).join('\n  ')}
  <line x1="${left}" y1="${yOf(0).toFixed(2)}" x2="${width - right}" y2="${yOf(0).toFixed(2)}" stroke="#8ea0ae"/>
  <line x1="${left}" y1="${top}" x2="${left}" y2="${top + plotHeight}" stroke="#24323c"/>
  <line x1="${left}" y1="${top + plotHeight}" x2="${width - right}" y2="${top + plotHeight}" stroke="#24323c"/>
  ${xTicks.map((tick) => `<text x="${xOf(tick).toFixed(2)}" y="${top + plotHeight + 16}" text-anchor="middle" font-size="11" fill="#4d5d6b">${tick}</text>`).join('\n  ')}
  <text x="${left + plotWidth / 2}" y="${top + plotHeight + 34}" text-anchor="middle" font-size="12" fill="#24323c">Angle of attack (deg)</text>
  <text x="18" y="${top + plotHeight / 2}" text-anchor="middle" font-size="12" fill="#24323c" transform="rotate(-90 18 ${top + plotHeight / 2})">${escapeXml(yLabel)}</text>
  ${lines.join('\n  ')}
  ${legend.join('\n  ')}
  <text x="${left}" y="${height - 16}" font-size="12" fill="#4d5d6b">${escapeXml(caption)}</text>
</svg>
`;
}

function limitationsText(rows: Row[], sensitivity: { maxSpread: number; disagreements: number; failures: number }, entryDelta: number[]): string {
  const finiteDelta = entryDelta.filter((value) => Number.isFinite(value));
  const pressureDelta = rows
    .map((row) => row.cl_pressure_minus_joukowski)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const negativePressure = rows.filter((row) => row.cd_pressure !== null && row.cd_pressure < 0).length;
  const negativeSection = rows.filter((row) => row.cd_section !== null && row.cd_section < 0).length;
  const failures = rows.filter((row) => row.status !== 'ok');
  const nonFinite = rows.filter((row) => row.issues.includes('NaN') || row.issues.includes('Infinity') || row.issues.includes('non_finite'));
  const criterion = rows.filter((row) => row.upper_separation_kind === 'boundary_layer_criterion' || row.lower_separation_kind === 'boundary_layer_criterion').length;
  const trim = rows.filter((row) => row.upper_separation_kind === 'trailing_edge_trim' || row.lower_separation_kind === 'trailing_edge_trim').length;
  return [
    'AERO-X numerical validation',
    'These files record the current model. They are not a comparison with experiment or CFD.',
    '',
    `Cases: ${rows.length}. Solver or march failures: ${failures.length}.`,
    `Rows with NaN, Infinity, or a non-finite march state: ${nonFinite.length}.`,
    `Negative section drag values: ${negativeSection}.`,
    `Negative inviscid pressure-drag values: ${negativePressure}.`,
    `Pressure-integrated cl minus Kutta–Joukowski cl: min ${extremum(pressureDelta, Math.min)}, max ${extremum(pressureDelta, Math.max)}.`,
    `Largest finite separation-station spread across panel counts 40, 80 and 160: ${sensitivity.maxSpread.toFixed(4)} chord.`,
    `Angle/Reynolds/surface groups whose separation classification disagrees across those panel counts: ${sensitivity.disagreements}.`,
    `Groups with a failed or non-finite panel count: ${sensitivity.failures}.`,
    `Maximum |cl| difference between solveNaca2412 and solveNodes at 80 panels, over the angle sweep: ${finiteDelta.length ? Math.max(...finiteDelta).toExponential(3) : 'unavailable'}.`,
    '',
    `Rows where a surface met the boundary-layer separation criterion forward of x/c = ${ATTACHED_STATION}: ${criterion}.`,
    `Rows where a surface was flagged separated only inside that trailing-edge threshold: ${trim}.`,
    '',
    'Limitations of the implementation this script was able to reach:',
    '- sectionAt, which supplies section cl, section cd and the website regime, always calls solveNaca2412. That solver is built with 80 panels. Counts 40 and 160 therefore have empty section cl and cd cells.',
    '- solveNaca2412 rounds the stored angle to 0.001 degree. Integer angles in this sweep are unchanged.',
    '- A separation station of 1 means the march reached its x/c = 0.99 trim still attached. It is not a measured separation point.',
    `- A reported separation at or behind x/c = ${ATTACHED_STATION} is classified by sectionAt as attached. The raw station is still written in the separation columns. The kind column calls this trailing_edge_trim rather than a boundary-layer separation forward of the trim.`,
    '- boundary_layer_criterion means Thwaites or Head reported separation inside the existing march. It does not mean a wind-tunnel stall location.',
    '- Transition x/c = 1 means the turbulent march was not started. naturalTransitionX is Michel\'s station. When laminar separation occurs first, transitionX is the assumed short-bubble restart and is not a natural-transition location.',
    '- The panel solution is incompressible and independent of Reynolds number. Reynolds number affects only the boundary-layer march and the section coefficients built from it.',
    '- Displacement thickness is not fed back. Separation movement with panel count is a discretisation sensitivity of this one-way coupling, not a grid-converged viscous solution.',
    '- Inviscid pressure drag is the panel integral. A small negative value is a numerical residual of that integral, and it is preserved in the CSV. It is not the section drag used by the website.',
    '- No experimental polar is stored in the project, and none was added here.',
    '',
  ].join('\n');
}

function extremum(values: number[], pick: (...items: number[]) => number): string {
  if (values.length === 0) return 'unavailable';
  return pick(...values).toExponential(3);
}

function toCsv(rows: Row[]): string {
  const lines = [COLUMNS.join(',')];
  for (const row of rows) lines.push(COLUMNS.map((column) => formatCell(row[column])).join(','));
  return `${lines.join('\n')}\n`;
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
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function tickValues(min: number, max: number, count: number): number[] {
  const step = (max - min) / Math.max(count - 1, 1);
  return Array.from({ length: count }, (_, index) => min + step * index);
}

function formatTick(value: number): string {
  return Math.abs(value) >= 10 ? value.toFixed(1) : value.toFixed(2);
}

function formatRe(reynolds: number): string {
  if (reynolds >= 1_000_000) return `${reynolds / 1_000_000}e6`;
  return `${reynolds / 100_000}e5`;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

main();
