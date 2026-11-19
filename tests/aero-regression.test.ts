import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ATTACHED_STATION, STALL_STATION, boundaryState, sectionAt, sectionFromSolution, type FlowRegime } from '../lib/aero';
import { classifyHeadStop, marchBoundaryLayer, type SurfaceMarch } from '../lib/boundaryLayer';
import { describeBoundary, formatSeparationFactor, regimeCopy } from '../lib/modelReport';
import { naca2412Nodes } from '../lib/naca';
import { solveNaca2412, solveNodes, type PanelSolution } from '../lib/panel';

const ANGLES = Array.from({ length: 26 }, (_, index) => index - 5);
const REYNOLDS = [100_000, 500_000, 1_000_000];
const PANELS = [40, 80, 160];
const BASELINE = join(dirname(fileURLToPath(import.meta.url)), '..', 'validation', 'aero-validation.csv');

type Kind = 'boundary_layer_criterion' | 'trailing_edge_trim' | 'not_reported' | 'integration_failure';

test('validation matrix matches the baseline CSV', { timeout: 300_000 }, () => {
  const baseline = parseCsv(readFileSync(BASELINE, 'utf8'));
  assert.equal(baseline.length, ANGLES.length * REYNOLDS.length * PANELS.length);
  const diffs: string[] = [];
  let maxAbs = 0;
  const classes = { michelBefore: 0, laminarBefore: 0, sameStation: 0, neither: 0, headSeparation: 0, integrationFailure: 0 };
  let finiteForces = 0;

  for (const alpha of ANGLES) {
    const production = solveNaca2412(alpha);
    for (const panelCount of PANELS) {
      const solution = panelCount === 80 ? production : solveNodes(naca2412Nodes(panelCount), alpha);
      for (const reynolds of REYNOLDS) {
        const row = baseline.find((item) => Number(item.alpha_deg) === alpha && Number(item.reynolds) === reynolds && Number(item.panel_count) === panelCount);
        assert.ok(row, `missing baseline row ${alpha} ${reynolds} ${panelCount}`);
        const march = marchBoundaryLayer(solution, reynolds);
        const section = panelCount === 80 ? sectionAt(alpha, reynolds) : null;
        const fromThresholds = regimeFromMarch(march.upper, march.lower);
        const current: Record<string, string> = {
          panel_count_solved: String(solution.panels.length),
          solver: panelCount === 80 ? 'solveNaca2412' : 'solveNodes',
          status: 'ok',
          cl_joukowski: numText(solution.cl),
          cl_pressure: numText(solution.clPressure),
          cd_pressure: numText(solution.cdPressure),
          cl_pressure_minus_joukowski: numText(solution.clPressure - solution.cl),
          upper_transition_x: numText(march.upper.transitionX),
          lower_transition_x: numText(march.lower.transitionX),
          upper_separation_x: numText(march.upper.separationX),
          lower_separation_x: numText(march.lower.separationX),
          upper_separated: boolText(march.upper.separated),
          lower_separated: boolText(march.lower.separated),
          upper_laminar_separation: boolText(march.upper.laminarSeparation),
          lower_laminar_separation: boolText(march.lower.laminarSeparation),
          upper_separation_kind: separationKind(march.upper),
          lower_separation_kind: separationKind(march.lower),
          cl_section: section ? numText(section.cl) : '',
          cd_section: section ? numText(section.cd) : '',
          regime: section ? section.regime : (fromThresholds ?? ''),
          regime_source: section ? 'sectionAt' : (fromThresholds === null ? 'not_classified_non_finite_march' : 'exported_station_thresholds'),
          regime_matches_section_model: section ? (fromThresholds === null ? '' : boolText(fromThresholds === section.regime)) : '',
        };
        for (const field of Object.keys(current)) {
          const gap = fieldGap(row[field] ?? '', current[field]);
          if (gap > 0) {
            maxAbs = Math.max(maxAbs, gap);
            if (diffs.length < 12) diffs.push(`${alpha}deg Re=${reynolds} N=${panelCount} ${field}: baseline ${row[field]} current ${current[field]}`);
          }
        }
        if (section) {
          finiteForces += 1;
          assert.equal(section.reynolds, reynolds);
          assert.equal(section.forcesFinite, true, `non-finite force at ${alpha} ${reynolds}`);
          assert.equal(Number.isFinite(section.cl) && Number.isFinite(section.cd), true);
          const upperFactor = stationFactor(march.upper);
          const lowerFactor = stationFactor(march.lower);
          assert.notEqual(upperFactor, null);
          assert.notEqual(lowerFactor, null);
          const factor = Math.min(upperFactor as number, lowerFactor as number);
          assert.equal(section.separationFactor, factor);
          if (factor < 1) {
            const chosen = (lowerFactor as number) < (upperFactor as number) ? march.lower : march.upper;
            assert.equal(section.separationX, chosen.separationX);
            assert.equal(section.separationFactor, chosen.separationX);
            assert.equal(section.transitionX, chosen.transitionX);
          }
          assert.equal(boundaryState(march.upper).headStartX, march.upper.transitionX);
          assert.equal(boundaryState(march.lower).headStartX, march.lower.transitionX);
        }
        for (const surface of [march.upper, march.lower]) {
          const state = boundaryState(surface);
          const text = describeBoundary(state);
          const same = state.naturalTransitionX !== null && state.laminarSeparationX !== null && Math.abs(state.naturalTransitionX - state.laminarSeparationX) < 1e-6;
          if (state.integrationFailed) {
            classes.integrationFailure += 1;
            assert.match(text, /integration failed/);
            assert.doesNotMatch(text, /meets its separation criterion|Michel transition|short bubble/);
          } else if (same) {
            classes.sameStation += 1;
            assert.match(text, /same station/);
            assert.doesNotMatch(text, /short bubble/);
          } else if (state.naturalTransitionX !== null && state.laminarSeparationX === null) {
            classes.michelBefore += 1;
            assert.match(text, /Michel transition/);
            assert.doesNotMatch(text, /short bubble/);
          } else if (state.shortBubbleRestartX !== null) {
            classes.laminarBefore += 1;
            assert.match(text, /before Michel's criterion/);
            assert.match(text, /H = 1\.4/);
            assert.doesNotMatch(text, /Michel transition/);
          } else if (state.naturalTransitionX === null && state.laminarSeparationX === null) {
            classes.neither += 1;
            assert.match(text, /neither Michel's criterion nor laminar separation/);
          }
          if (state.turbulentSeparationX !== null && !state.integrationFailed) {
            classes.headSeparation += 1;
            assert.match(text, /meets its separation criterion/);
          }
        }
      }
    }
  }

  console.log(`regression cases ${baseline.length}; max abs coefficient or station difference ${maxAbs}; finite 80-panel force rows ${finiteForces}`);
  console.log(`state counts ${JSON.stringify(classes)}`);
  assert.deepEqual(diffs, [], `baseline mismatch\n${diffs.join('\n')}`);
  assert.equal(maxAbs, 0);
  assert.equal(classes.integrationFailure, 0);
  assert.ok(classes.michelBefore > 0);
  assert.ok(classes.laminarBefore > 0);
  assert.ok(classes.sameStation > 0);
  assert.equal(classes.neither, 0);
  assert.ok(classes.headSeparation > 0);
});

test('a march that reaches neither criterion stays unlabelled', () => {
  const base = solveNaca2412(0);
  const panel = base.panels[0];
  const solution: PanelSolution = {
    ...base,
    panels: [panel],
    sigma: [0],
    cp: [0],
    vt: [0],
    speed: [0],
    cl: 0.2,
    clPressure: 0.2,
    cdPressure: 0,
  };
  const section = sectionFromSolution(solution, 1_000_000, 0);
  assert.equal(section.upperBoundary.integrationFailed, false);
  assert.equal(section.upperBoundary.naturalTransitionX, null);
  assert.equal(section.upperBoundary.laminarSeparationX, null);
  assert.equal(section.upperBoundary.shortBubbleRestartX, null);
  assert.equal(section.upperBoundary.turbulentSeparationX, null);
  assert.equal(section.forcesFinite, true);
  assert.match(describeBoundary(section.upperBoundary), /neither Michel's criterion nor laminar separation/);
  assert.match(regimeCopy(section).title, /Attached in this model/);
});

test('Head stop labels keep a non-finite step off the separation criterion', () => {
  assert.deepEqual(classifyHeadStop(2.4, 1e-3, 4), { separated: true, integrationFailed: false });
  assert.deepEqual(classifyHeadStop(1.5, 1e-3, 3.43), { separated: true, integrationFailed: false });
  assert.deepEqual(classifyHeadStop(1.4, 1e-3, 7.178), { separated: false, integrationFailed: false });
  assert.deepEqual(classifyHeadStop(Number.NaN, 1e-3, 5), { separated: false, integrationFailed: true });
  assert.deepEqual(classifyHeadStop(3, 1e-3, Number.NaN), { separated: false, integrationFailed: true });
  assert.deepEqual(classifyHeadStop(1.4, Number.NaN, 7), { separated: false, integrationFailed: true });
});

test('a non-finite panel speed is an invalid force, not an attached wake', () => {
  const base = solveNaca2412(0);
  const poisoned: PanelSolution = { ...base, speed: base.speed.map(() => Number.NaN) };
  const section = sectionFromSolution(poisoned, 100_000, 0);
  assert.equal(section.upperBoundary.integrationFailed, true);
  assert.equal(section.lowerBoundary.integrationFailed, true);
  assert.equal(section.upperBoundary.turbulentSeparationX, null);
  assert.equal(section.lowerBoundary.turbulentSeparationX, null);
  assert.equal(section.regime, 'attached');
  assert.equal(section.separationFactor, 1);
  assert.equal(section.squireYoungValid, false);
  assert.equal(section.forcesFinite, false);
  assert.equal(section.cl, section.clInviscid);
  assert.equal(Number.isFinite(section.cd), false);
  assert.equal(Number.isFinite(section.cdSquireYoung), false);
  const copy = regimeCopy(section);
  assert.equal(copy.title, 'Boundary-layer integration failed');
  assert.match(copy.detail, /invalid/);
  assert.doesNotMatch(copy.title, /Attached/);
  assert.doesNotMatch(copy.detail, /meets Head's separation criterion/);
  for (const state of [section.upperBoundary, section.lowerBoundary]) {
    const text = describeBoundary(state);
    assert.match(text, /integration failed/);
    assert.doesNotMatch(text, /meets its separation criterion|Michel transition|short bubble|Attached/);
  }
  assert.equal(formatSeparationFactor(section.separationFactor, section.forcesFinite, true), 'invalid');
});

test('wording for each transition state stays on that state', () => {
  const base = {
    surface: 'upper' as const,
    naturalTransitionX: null,
    laminarSeparationX: null,
    shortBubbleRestartX: null,
    turbulentSeparationX: null,
    integrationFailed: false,
    headStartX: 1,
  };
  const michel = describeBoundary({ ...base, naturalTransitionX: 0.2, headStartX: 0.2 });
  assert.match(michel, /Michel transition at x\/c = 0\.20/);
  assert.doesNotMatch(michel, /short bubble/);

  const bubble = describeBoundary({ ...base, laminarSeparationX: 0.02, shortBubbleRestartX: 0.02, turbulentSeparationX: 0.36, headStartX: 0.02 });
  assert.match(bubble, /before Michel's criterion/);
  assert.match(bubble, /H = 1\.4/);
  assert.match(bubble, /x\/c = 0\.36/);
  assert.doesNotMatch(bubble, /Michel transition/);

  const same = describeBoundary({ ...base, naturalTransitionX: 0.4, laminarSeparationX: 0.4, headStartX: 0.4 });
  assert.match(same, /same station/);
  assert.doesNotMatch(same, /short bubble/);

  const neither = describeBoundary(base);
  assert.match(neither, /neither Michel's criterion nor laminar separation/);

  const failed = describeBoundary({ ...base, integrationFailed: true, turbulentSeparationX: 0.2, headStartX: 0.1 });
  assert.match(failed, /integration failed/);
  assert.doesNotMatch(failed, /meets its separation criterion/);

  const mixed = regimeCopy({
    regime: 'stalled',
    separationX: 0.44,
    separationSurface: 'upper',
    upperBoundary: { ...base, turbulentSeparationX: 0.44, headStartX: 0.02 },
    lowerBoundary: { ...base, surface: 'lower', integrationFailed: true },
  });
  assert.match(mixed.title, /Separation forward of 0\.80c/);
  assert.match(mixed.detail, /not a separation station/);
  assert.match(mixed.detail, /force values are invalid/);
});

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

function separationKind(surface: SurfaceMarch): Kind {
  if (!Number.isFinite(surface.separationX) || !Number.isFinite(surface.separationY)) return 'integration_failure';
  if (!surface.separated) return 'not_reported';
  if (surface.separationX >= ATTACHED_STATION) return 'trailing_edge_trim';
  return 'boundary_layer_criterion';
}

function fieldGap(baseline: string, current: string): number {
  if (baseline === current) return 0;
  const left = Number(baseline);
  const right = Number(current);
  if (baseline !== '' && current !== '' && Number.isFinite(left) && Number.isFinite(right)) return Math.abs(left - right);
  return Number.POSITIVE_INFINITY;
}

function numText(value: number): string {
  if (Number.isNaN(value)) return 'NaN';
  if (value === Infinity) return 'Infinity';
  if (value === -Infinity) return '-Infinity';
  return String(value);
}

function boolText(value: boolean): string {
  return value ? 'true' : 'false';
}

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 1; }
        else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row); }
  const header = rows[0];
  return rows.slice(1).filter((item) => item.some((value) => value !== '')).map((item) => Object.fromEntries(header.map((name, index) => [name, item[index] ?? ''])));
}
