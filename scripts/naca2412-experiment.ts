/**
 * Compare the existing section model with NACA Report 586, Table I.
 * Does not modify the solver. Does not digitize the report's graphs.
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { sectionAt } from '../lib/aero';

const OUT = join(process.cwd(), 'experiment', 'naca2412');

/** Transcribed from the scanned Table I, NACA Report 586, NACA 2412 rows. R is the effective Reynolds number. */
const TABLE: { reEff: number; reTest: number; alpha0: number; slope: number | null; clMax: number; cdMin: number }[] = [
  { reEff: 8.24e6, reTest: 3_120_000, alpha0: -2.0, slope: 0.098, clMax: 1.72, cdMin: 0.0071 },
  { reEff: 6.1e6, reTest: 2_310_000, alpha0: -2.1, slope: 0.097, clMax: 1.68, cdMin: 0.008 },
  { reEff: 3.42e6, reTest: 1_295_000, alpha0: -2.0, slope: 0.098, clMax: 1.53, cdMin: 0.0079 },
  { reEff: 1.73e6, reTest: 656_000, alpha0: -2.1, slope: 0.096, clMax: 1.33, cdMin: 0.0089 },
  { reEff: 0.879e6, reTest: 333_000, alpha0: -2.1, slope: 0.096, clMax: 1.16, cdMin: 0.0085 },
  { reEff: 0.438e6, reTest: 166_000, alpha0: -2.0, slope: 0.098, clMax: 1.08, cdMin: 0.0067 },
  { reEff: 0.218e6, reTest: 82_800, alpha0: -2.2, slope: 0.102, clMax: 1.08, cdMin: 0.0159 },
  { reEff: 0.11e6, reTest: 41_500, alpha0: -1.3, slope: null, clMax: 1.03, cdMin: 0.0227 },
];

const ALPHAS: number[] = [];
for (let alpha = -8; alpha <= 22; alpha += 0.5) ALPHAS.push(alpha);

type Sample = ReturnType<typeof sectionAt> & { alpha: number };

function samplesAt(re: number): Sample[] {
  return ALPHAS.map((alpha) => Object.assign(sectionAt(alpha, re), { alpha }));
}

function zeroLift(rows: Sample[]): number {
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1];
    const b = rows[i];
    if (a.cl === 0) return a.alpha;
    if ((a.cl < 0 && b.cl > 0) || (a.cl > 0 && b.cl < 0)) {
      const t = a.cl / (a.cl - b.cl);
      return a.alpha + t * (b.alpha - a.alpha);
    }
  }
  return Number.NaN;
}

function slopePerDeg(rows: Sample[]): number {
  const fit = rows.filter((row) => row.alpha >= -4 && row.alpha <= 6 && row.regime === 'attached' && row.forcesFinite);
  const used = fit.length >= 4 ? fit : rows.filter((row) => row.alpha >= -2 && row.alpha <= 4 && row.forcesFinite);
  const n = used.length;
  const mx = used.reduce((sum, row) => sum + row.alpha, 0) / n;
  const my = used.reduce((sum, row) => sum + row.cl, 0) / n;
  let xx = 0;
  let xy = 0;
  for (const row of used) {
    xx += (row.alpha - mx) ** 2;
    xy += (row.alpha - mx) * (row.cl - my);
  }
  return xy / xx;
}

function metrics(errors: number[]): { mae: number; rmse: number; max: number; n: number } {
  const n = errors.length;
  const mae = errors.reduce((sum, value) => sum + Math.abs(value), 0) / n;
  const rmse = Math.sqrt(errors.reduce((sum, value) => sum + value * value, 0) / n);
  const max = Math.max(...errors.map((value) => Math.abs(value)));
  return { mae, rmse, max, n };
}

function main(): void {
  mkdirSync(OUT, { recursive: true });
  const summary: string[] = ['re_effective,re_test,alpha0_experiment_deg,alpha0_model_deg,slope_experiment_per_deg,slope_model_per_deg,clmax_experiment,clmax_model,clmax_model_alpha_deg,cdmin_experiment,cdmin_model,cdmin_model_alpha_deg,model_display_stall_alpha_deg,model_forces_finite'];
  const clMaxErr: number[] = [];
  const cdMinErr: number[] = [];
  const slopeErr: number[] = [];
  const alphaErr: number[] = [];
  const polars: { re: number; rows: Sample[] }[] = [];

  for (const row of TABLE) {
    const rows = samplesAt(row.reEff);
    polars.push({ re: row.reEff, rows });
    const alpha0 = zeroLift(rows);
    const slope = slopePerDeg(rows);
    const peak = rows.reduce((best, item) => (item.cl > best.cl ? item : best));
    const drag = rows.filter((item) => item.forcesFinite).reduce((best, item) => (item.cd < best.cd ? item : best));
    const stall = rows.find((item) => item.alpha >= 0 && item.regime === 'stalled');
    summary.push([
      row.reEff,
      row.reTest,
      row.alpha0,
      alpha0.toFixed(3),
      row.slope ?? '',
      slope.toFixed(4),
      row.clMax,
      peak.cl.toFixed(4),
      peak.alpha.toFixed(1),
      row.cdMin,
      drag.cd.toFixed(5),
      drag.alpha.toFixed(1),
      stall ? stall.alpha.toFixed(1) : '',
      String(rows.every((item) => item.forcesFinite)),
    ].join(','));
    clMaxErr.push(peak.cl - row.clMax);
    cdMinErr.push(drag.cd - row.cdMin);
    alphaErr.push(alpha0 - row.alpha0);
    if (row.slope !== null) slopeErr.push(slope - row.slope);
  }

  writeFileSync(join(OUT, 'table-i-comparison.csv'), `${summary.join('\n')}\n`, 'utf8');
  const lines = [
    'quantity,n,mae,rmse,max_abs',
    stat('clmax', metrics(clMaxErr)),
    stat('cdmin', metrics(cdMinErr)),
    stat('alpha0_deg', metrics(alphaErr)),
    stat('slope_per_deg', metrics(slopeErr)),
  ];
  writeFileSync(join(OUT, 'scalar-errors.csv'), `${lines.join('\n')}\n`, 'utf8');
  writeFileSync(join(OUT, 'clmax-cdmin.svg'), scalarPlot(), 'utf8');
  writeFileSync(join(OUT, 'model-polars.svg'), polarPlot(polars), 'utf8');
  console.log(lines.join('\n'));
  console.log(summary.slice(1).join('\n'));
}

function stat(name: string, value: { n: number; mae: number; rmse: number; max: number }): string {
  return `${name},${value.n},${value.mae.toFixed(5)},${value.rmse.toFixed(5)},${value.max.toFixed(5)}`;
}

function scalarPlot(): string {
  const width = 920;
  const height = 520;
  const left = 70;
  const top = 36;
  const plotW = 380;
  const plotH = 360;
  const re = TABLE.map((row) => row.reEff);
  const xOf = (value: number, origin: number) => origin + ((Math.log10(value) - 5) / (Math.log10(8.24e6) - 5)) * plotW;
  const clOf = (value: number) => top + ((1.9 - value) / 1.2) * plotH;
  const cdOf = (value: number) => top + ((0.03 - value) / 0.03) * plotH;
  const model = TABLE.map((row) => {
    const rows = samplesAt(row.reEff);
    const peak = rows.reduce((best, item) => (item.cl > best.cl ? item : best));
    const drag = rows.filter((item) => item.forcesFinite).reduce((best, item) => (item.cd < best.cd ? item : best));
    return { re: row.reEff, cl: peak.cl, cd: drag.cd };
  });
  const circles = (items: { re: number; y: number }[], yOf: (value: number) => number, origin: number, fill: string) =>
    items.map((item) => `<circle cx="${xOf(item.re, origin).toFixed(1)}" cy="${yOf(item.y).toFixed(1)}" r="4.5" fill="${fill}" stroke="#14202a" stroke-width="0.6"/>`).join('');
  const path = (items: { re: number; y: number }[], yOf: (value: number) => number, origin: number) =>
    items.map((item, index) => `${index === 0 ? 'M' : 'L'} ${xOf(item.re, origin).toFixed(1)} ${yOf(item.y).toFixed(1)}`).join(' ');
  const axis = (origin: number, yOf: (value: number) => number, ticks: number[], format: (value: number) => string) => {
    const xTicks = [1e5, 2e5, 5e5, 1e6, 2e6, 5e6, 8e6];
    return [
      `<line x1="${origin}" y1="${top}" x2="${origin}" y2="${top + plotH}" stroke="#24323c"/>`,
      `<line x1="${origin}" y1="${top + plotH}" x2="${origin + plotW}" y2="${top + plotH}" stroke="#24323c"/>`,
      ...ticks.map((tick) => `<line x1="${origin - 4}" y1="${yOf(tick).toFixed(1)}" x2="${origin}" y2="${yOf(tick).toFixed(1)}" stroke="#24323c"/><text x="${origin - 8}" y="${(yOf(tick) + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="#24323c">${format(tick)}</text>`),
      ...xTicks.map((tick) => `<text x="${xOf(tick, origin).toFixed(1)}" y="${top + plotH + 16}" text-anchor="middle" font-size="11" fill="#24323c">${tick >= 1e6 ? `${tick / 1e6}e6` : `${tick / 1e5}e5`}</text>`),
    ].join('');
  };
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="70" y="22" font-size="14" font-family="sans-serif" fill="#14202a">NACA 2412 section cl,max and cd,min versus effective Reynolds number</text>
  ${axis(left, clOf, [0.8, 1.0, 1.2, 1.4, 1.6, 1.8], (value) => value.toFixed(1))}
  ${axis(left + 460, cdOf, [0, 0.005, 0.01, 0.015, 0.02, 0.025], (value) => value.toFixed(3))}
  <path d="${path(model.map((item) => ({ re: item.re, y: item.cl })), clOf, left)}" fill="none" stroke="#1f77b4" stroke-width="1.6"/>
  ${circles(TABLE.map((row) => ({ re: row.reEff, y: row.clMax })), clOf, left, '#ffffff')}
  ${circles(model.map((item) => ({ re: item.re, y: item.cl })), clOf, left, '#1f77b4')}
  <path d="${path(model.map((item) => ({ re: item.re, y: item.cd })), cdOf, left + 460)}" fill="none" stroke="#d6610a" stroke-width="1.6"/>
  ${circles(TABLE.map((row) => ({ re: row.reEff, y: row.cdMin })), cdOf, left + 460, '#ffffff')}
  ${circles(model.map((item) => ({ re: item.re, y: item.cd })), cdOf, left + 460, '#d6610a')}
  <text x="${left + plotW / 2}" y="${height - 28}" text-anchor="middle" font-size="12" fill="#24323c">Effective Reynolds number</text>
  <text x="18" y="${top + plotH / 2}" text-anchor="middle" font-size="12" fill="#24323c" transform="rotate(-90 18 ${top + plotH / 2})">Section cl,max</text>
  <text x="${left + 448}" y="${top + plotH / 2}" text-anchor="middle" font-size="12" fill="#24323c" transform="rotate(-90 ${left + 448} ${top + plotH / 2})">Section cd,min</text>
  <circle cx="70" cy="${height - 8}" r="4" fill="#ffffff" stroke="#14202a"/><text x="80" y="${height - 4}" font-size="11" fill="#24323c">NACA Report 586, Table I, measured</text>
  <circle cx="330" cy="${height - 8}" r="4" fill="#1f77b4" stroke="#14202a"/><text x="340" y="${height - 4}" font-size="11" fill="#24323c">AERO-X section model, same effective Re</text>
</svg>
`;
}

function polarPlot(polars: { re: number; rows: Sample[] }[]): string {
  const chosen = [8.24e6, 0.879e6, 0.11e6];
  const colors = ['#1f77b4', '#2ca02c', '#d6610a'];
  const width = 920;
  const height = 560;
  const panel = (origin: number, title: string, yOf: (value: number) => number, key: 'cl' | 'cd', yTicks: number[]) => {
    const xOf = (alpha: number) => origin + ((alpha + 8) / 30) * 340;
    const series = chosen.map((re, index) => {
      const rows = polars.find((item) => item.re === re)!.rows;
      const d = rows.map((row, i) => `${i === 0 ? 'M' : 'L'} ${xOf(row.alpha).toFixed(1)} ${yOf(row[key]).toFixed(1)}`).join(' ');
      return `<path d="${d}" fill="none" stroke="${colors[index]}" stroke-width="1.7"/>`;
    });
    const marks = chosen.map((re, index) => {
      const experiment = TABLE.find((row) => row.reEff === re)!;
      const y = key === 'cl' ? experiment.clMax : experiment.cdMin;
      return `<line x1="${origin}" y1="${yOf(y).toFixed(1)}" x2="${origin + 340}" y2="${yOf(y).toFixed(1)}" stroke="${colors[index]}" stroke-dasharray="4 3" stroke-width="1"/>`;
    });
    return [
      `<text x="${origin}" y="22" font-size="13" fill="#14202a">${title}</text>`,
      ...yTicks.map((tick) => `<text x="${origin - 8}" y="${(yOf(tick) + 3).toFixed(1)}" text-anchor="end" font-size="10" fill="#4d5d6b">${key === 'cl' ? tick.toFixed(1) : tick.toFixed(3)}</text><line x1="${origin}" y1="${yOf(tick).toFixed(1)}" x2="${origin + 340}" y2="${yOf(tick).toFixed(1)}" stroke="#e2e8ee"/>`),
      `<line x1="${origin}" y1="40" x2="${origin}" y2="400" stroke="#24323c"/>`,
      `<line x1="${origin}" y1="400" x2="${origin + 340}" y2="400" stroke="#24323c"/>`,
      ...[-8, 0, 8, 16].map((tick) => `<text x="${(origin + ((tick + 8) / 30) * 340).toFixed(1)}" y="416" text-anchor="middle" font-size="10" fill="#4d5d6b">${tick}</text>`),
      ...marks,
      ...series,
    ].join('\n');
  };
  const cl = panel(70, 'Section cl versus angle. Dashed lines are measured cl,max, not a stall angle.', (value) => 40 + ((1.8 - value) / 2.2) * 360, 'cl', [-0.2, 0.2, 0.6, 1.0, 1.4, 1.8]);
  const cd = panel(520, 'Section cd versus angle. Dashed lines are measured cd,min.', (value) => 40 + ((0.08 - value) / 0.08) * 360, 'cd', [0, 0.02, 0.04, 0.06, 0.08]);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  ${cl}
  ${cd}
  <text x="460" y="500" text-anchor="middle" font-size="12" fill="#24323c">Angle of attack (deg). Curves are the AERO-X section model. Table I does not give the angle of cl,max or cd,min.</text>
  <path d="M70 530 h28" stroke="#1f77b4" stroke-width="1.7"/><text x="104" y="534" font-size="11">Re eff 8.24e6</text>
  <path d="M250 530 h28" stroke="#2ca02c" stroke-width="1.7"/><text x="284" y="534" font-size="11">Re eff 8.79e5</text>
  <path d="M430 530 h28" stroke="#d6610a" stroke-width="1.7"/><text x="464" y="534" font-size="11">Re eff 1.10e5</text>
</svg>
`;
}

main();
