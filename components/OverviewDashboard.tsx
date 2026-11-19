'use client';

import { useMemo } from 'react';
import { calculateAero, type AeroResult } from '@/lib/aero';
import { type SavedCase, type WingDesign } from '@/lib/design';
import { materialById } from '@/lib/materials';
import { formatModelNumber } from '@/lib/modelReport';
import { assessSafety, limitsFromFields, type SafetyFields } from '@/lib/safety';
import { analyzeWing, type WingStructureInput } from '@/lib/structures';

type Props = {
  speed: number;
  alpha: number;
  density: number;
  span: number;
  chord: number;
  design: WingDesign;
  baseline: { span: number; chord: number; design: WingDesign };
  saved: SavedCase[];
  result: AeroResult;
  fields: SafetyFields;
  open: (tab: string) => void;
};

function digits(value: number, places: number): string {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('en-GB', { minimumFractionDigits: places, maximumFractionDigits: places });
}

function signed(value: number | null, places: number, unit: string): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${digits(value, places)} ${unit}`;
}

function wingInput(span: number, chord: number, design: WingDesign): WingStructureInput {
  return { span, chord, ...design };
}

export default function OverviewDashboard({ speed, alpha, density, span, chord, design, baseline, saved, result, fields, open }: Props) {
  const structure = useMemo(() => analyzeWing(wingInput(span, chord, design)), [span, chord, design]);
  const baselineStructure = useMemo(
    () => analyzeWing(wingInput(baseline.span, baseline.chord, baseline.design)),
    [baseline],
  );
  const assessment = useMemo(
    () => assessSafety(wingInput(span, chord, design), limitsFromFields(fields)),
    [span, chord, design, fields],
  );
  const baselineAero = useMemo(() => (
    baseline.span === span && baseline.chord === chord
      ? result
      : calculateAero({ speed, alpha, density, span: baseline.span, chord: baseline.chord })
  ), [baseline.span, baseline.chord, span, chord, speed, alpha, density, result]);
  const latest = saved[saved.length - 1];
  const latestStructure = useMemo(
    () => (latest ? analyzeWing(wingInput(latest.span, latest.chord, latest.design)) : null),
    [latest],
  );
  const material = materialById(design.materialId);
  const passed = assessment.checks.filter((check) => check.status === 'pass').length;
  const failed = assessment.checks.filter((check) => check.status === 'fail').length;
  const unevaluated = assessment.checks.filter((check) => check.status === 'not-evaluated').length;
  const massChange = structure.ok && baselineStructure.ok ? structure.sparMassBothWings - baselineStructure.sparMassBothWings : null;
  const stressChange = structure.ok && baselineStructure.ok ? structure.bendingStress - baselineStructure.bendingStress : null;
  const deflectionChange = structure.ok && baselineStructure.ok ? structure.tipDeflection - baselineStructure.tipDeflection : null;
  const ldChange = result.forcesFinite && baselineAero.forcesFinite ? result.ld - baselineAero.ld : null;
  const center = 380;
  const frameLeft = 24;
  const frameRight = 736;
  const frameTop = 42;
  const frameBottom = 214;
  const frameWidth = frameRight - frameLeft;
  const frameHeight = frameBottom - frameTop;
  const midY = frameTop + frameHeight / 2;
  const fuseHalf = 18;
  const semi = Math.max(span, 1e-6) / 2;
  const safeChord = Math.max(chord, 1e-6);
  const scale = Math.min((frameWidth - fuseHalf * 2) / (semi * 2), frameHeight / safeChord);
  const halfPx = semi * scale;
  const chordPx = safeChord * scale;
  const rootL = center - fuseHalf;
  const tipL = rootL - halfPx;
  const rootR = center + fuseHalf;
  const sparInset = Math.min(8, Math.max(2, halfPx * 0.08));
  const sparY = midY - chordPx * 0.15;
  const fuseHeight = Math.min(140, frameHeight - 8);
  const status = assessment.overall === 'pass' ? 'PASS' : assessment.overall === 'fail' ? 'FAIL' : 'NOT EVALUATED';

  return <>
    <div className="section-heading"><span>CURRENT AIRCRAFT</span><span className="section-rule"/><span className="timestamp">SHARED DESIGN / NOT A SECOND SOLVER</span></div>
    <section className="panel">
      <div className="panel-header"><div><div className="panel-kicker">PLANFORM / 01</div><h2>Wing in the shared configuration</h2></div><span className="model-pill">PLAN VIEW</span></div>
      <svg viewBox="0 0 760 250" className="structure-svg" role="img" aria-label="Geometric plan view of the current wing. Span and chord are drawn to the same scale. This is not a flow field or a CFD result.">
        <rect x={center - fuseHalf} y={midY - fuseHeight / 2} width={fuseHalf * 2} height={fuseHeight} rx={8} fill="#102c3c" stroke="#58c9ec"/>
        <rect x={tipL} y={midY - chordPx / 2} width={halfPx} height={chordPx} fill="#12384c" stroke="#8be9ff"/>
        <rect x={rootR} y={midY - chordPx / 2} width={halfPx} height={chordPx} fill="#12384c" stroke="#8be9ff"/>
        <line x1={tipL + sparInset} y1={sparY} x2={rootL - sparInset} y2={sparY} stroke="#f0a35c" strokeWidth={2}/>
        <line x1={rootR + sparInset} y1={sparY} x2={rootR + halfPx - sparInset} y2={sparY} stroke="#f0a35c" strokeWidth={2}/>
        <text x={center} y={28} fill="#9fb4c4" fontSize={11} textAnchor="middle">Geometric plan view · {digits(span, 1)} m span · {digits(chord, 2)} m chord · not a flow field</text>
        <text x={center} y={228} fill="#f0a35c" fontSize={11} textAnchor="middle">{material?.name ?? 'Material unset'} · fuselage and spar are schematic, not to scale</text>
      </svg>
      <div className="dash-actions">
        <button type="button" className="reset-button" onClick={() => open('aero')}>Aerodynamics lab</button>
        <button type="button" className="reset-button" onClick={() => open('materials')}>Materials and structures</button>
        <button type="button" className="reset-button" onClick={() => open('safety')}>Flight safety</button>
        <button type="button" className="reset-button" onClick={() => open('optimiser')}>Design optimiser</button>
      </div>
    </section>
    <div className="materials-grid materials-follow">
      <section className="panel">
        <div className="panel-kicker">AERODYNAMICS / 02</div>
        <h2>Finite-wing operating point</h2>
        <div className="readout-line"><span>Wingspan</span><b>{digits(span, 2)} m</b></div>
        <div className="readout-line"><span>Chord</span><b>{digits(chord, 2)} m</b></div>
        <div className="readout-line"><span>Speed / angle / density</span><b>{digits(speed, 0)} m/s · {digits(alpha, 1)}° · {digits(density, 3)} kg/m³</b></div>
        <div className="readout-line"><span>Reynolds number</span><b>{result.forcesFinite || Number.isFinite(result.reynolds) ? digits(result.reynolds, 0) : 'invalid'}</b></div>
        <div className="readout-line"><span>Finite-wing lift coefficient</span><b>{formatModelNumber(result.cl, 3, result.forcesFinite)}</b></div>
        <div className="readout-line"><span>Finite-wing drag coefficient</span><b>{formatModelNumber(result.cd, 4, result.forcesFinite)}</b></div>
        <div className="readout-line"><span>Finite-wing lift-to-drag</span><b>{formatModelNumber(result.ld, 2, result.forcesFinite)}</b></div>
        <p className="state-note">These are the lifting-line results for this wing. The 2D aerofoil section coefficients are on the aerodynamics laboratory. The plan view above is a geometric drawing, not a flow field.</p>
      </section>
      <section className="panel">
        <div className="panel-kicker">STRUCTURE / 03</div>
        <h2>Spar from the cantilever beam</h2>
        <div className="readout-line"><span>Material</span><b>{material?.name ?? '—'}</b></div>
        <div className="readout-line"><span>Spar width × height × wall</span><b>{digits(design.sparWidth * 1000, 0)} × {digits(design.sparHeight * 1000, 0)} × {digits(design.wallThickness * 1000, 1)} mm</b></div>
        <div className="readout-line"><span>Both spars</span><b>{structure.ok ? `${digits(structure.sparMassBothWings, 2)} kg` : '—'}</b></div>
        <div className="readout-line"><span>Root bending moment</span><b>{structure.ok ? `${digits(structure.rootMoment / 1000, 2)} kN·m` : '—'}</b></div>
        <div className="readout-line"><span>Maximum bending stress</span><b>{structure.ok ? `${digits(structure.bendingStress / 1e6, 1)} MPa` : '—'}</b></div>
        <div className="readout-line"><span>Tip deflection</span><b>{structure.ok ? `${digits(structure.tipDeflection * 1000, 1)} mm` : '—'}</b></div>
        <p className="state-note">{structure.ok ? `Design lift ${digits(structure.designLift / 1000, 2)} kN from n = ${digits(design.loadFactor, 1)} and ${digits(design.mass, 0)} kg. Elliptical load, assumed.` : structure.reason}</p>
      </section>
    </div>
    <div className="materials-grid materials-follow">
      <section className="panel">
        <div className="panel-kicker">FLIGHT SAFETY / 04</div>
        <h2>Preliminary assessment</h2>
        <div className={`condition-banner ${assessment.overall === 'fail' ? 'caution' : ''}`}><span className="condition-icon">{assessment.overall === 'pass' ? '✓' : '!'}</span><div><b>{status}</b><small>{passed} passed · {failed} failed · {unevaluated} not evaluated. The same limits as the safety page. An unevaluated row is not a pass.</small></div></div>
        {assessment.checks.filter((check) => check.status === 'fail').map((check) => <p className="state-note" key={check.id}>Failed: {check.name}. {check.detail}</p>)}
        {failed === 0 && <p className="state-note">No evaluated check is currently failing. Unevaluated modes include any limit you have not typed, spar-web material strength, and local buckling.</p>}
      </section>
      <section className="panel">
        <div className="panel-kicker">SEARCH / 05</div>
        <h2>{latest ? latest.name : 'No saved search yet'}</h2>
        {latest ? <p className="state-note">{digits(latest.span, 2)} m span, {digits(latest.chord, 2)} m chord, {materialById(latest.design.materialId)?.name ?? latest.design.materialId}. {latestStructure?.ok && baselineStructure.ok ? `Against the baseline, that saved spar mass changes by ${signed(latestStructure.sparMassBothWings - baselineStructure.sparMassBothWings, 2, 'kg')}.` : 'The saved spar could not be compared.'}</p> : <p className="state-note">Save a row in the design optimiser and it will appear here. Until then the comparison is the live wing against the stored baseline.</p>}
        <div className="readout-line"><span>Live spar mass versus baseline</span><b>{signed(massChange, 2, 'kg')}</b></div>
        <div className="readout-line"><span>Bending stress versus baseline</span><b>{signed(stressChange === null ? null : stressChange / 1e6, 1, 'MPa')}</b></div>
        <div className="readout-line"><span>Tip deflection versus baseline</span><b>{signed(deflectionChange === null ? null : deflectionChange * 1000, 1, 'mm')}</b></div>
        <div className="readout-line"><span>Lift-to-drag versus baseline wing</span><b>{signed(ldChange, 2, '')}</b></div>
        <p className="state-note">A negative mass, stress or deflection means the live wing is lower than the baseline. Lift-to-drag uses the aerodynamic model at the current speed and angle on each planform. Equal weights and a preferred search row stay on the optimiser page.</p>
      </section>
    </div>
    <footer className="footer-note"><span>AERO-X DESIGN DASHBOARD</span><span>Summary of the shared wing · Open a specialist page to change the model</span></footer>
  </>;
}
