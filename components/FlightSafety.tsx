'use client';

import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EXAMPLE_CONDITIONS, type WingDesign } from '@/lib/design';
import { MATERIALS } from '@/lib/materials';
import { assessSafety, limitsFromFields, type CheckStatus, type SafetyFields } from '@/lib/safety';

type Props = {
  span: number;
  chord: number;
  setSpan: (span: number) => void;
  setChord: (chord: number) => void;
  design: WingDesign;
  setDesign: (patch: Partial<WingDesign>) => void;
  operatingLift: number;
  operatingFinite: boolean;
  fields: SafetyFields;
  setFields: (patch: Partial<SafetyFields>) => void;
};

function digits(value: number, places: number): string {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('en-GB', { minimumFractionDigits: places, maximumFractionDigits: places });
}

function statusWord(status: CheckStatus): string {
  if (status === 'pass') return 'PASS';
  if (status === 'fail') return 'FAIL';
  return 'NOT EVALUATED';
}

export default function FlightSafety({ span, chord, setSpan, setChord, design, setDesign, operatingLift, operatingFinite, fields, setFields }: Props) {
  const limits = useMemo(() => limitsFromFields(fields), [fields]);
  const assessment = useMemo(() => assessSafety({
    span,
    chord,
    mass: design.mass,
    loadFactor: design.loadFactor,
    materialId: design.materialId,
    sparWidth: design.sparWidth,
    sparHeight: design.sparHeight,
    wallThickness: design.wallThickness,
  }, limits), [span, chord, design, limits]);
  const structure = assessment.structure;
  const chart = structure ? structure.stations.map((station) => ({ y: Number(station.y.toFixed(3)), moment: station.moment / 1000 })) : [];
  const headline = assessment.overall === 'pass'
    ? 'Preliminary assessment: every evaluated check is inside the criterion used here'
    : assessment.overall === 'fail'
      ? 'Preliminary assessment: at least one evaluated check is outside its criterion'
      : 'Preliminary assessment: nothing on this page has been passed or failed';

  return <>
    <div className="section-heading"><span>PRELIMINARY SAFETY</span><span className="section-rule"/><span className="timestamp">BEAM CHECKS / NOT CERTIFICATION</span></div>
    <div className={`condition-banner ${assessment.overall === 'fail' ? 'caution' : ''}`}><span className="condition-icon">{assessment.overall === 'pass' ? '✓' : '!'}</span><div><b>{headline}</b><small>{assessment.reason ?? 'PASS means the number is within the published typical strength or the limit you typed. It does not certificate an aircraft. NOT EVALUATED is not a pass.'}</small></div></div>
    <div className="metrics-grid">
      <div className="metric-card"><div className="metric-top"><span>DESIGN LIFT</span></div><div className="metric-value">{structure ? digits(structure.designLift / 1000, 2) : '—'}<small>kN</small></div><div className="metric-note">Structural model, n · m · g</div></div>
      <div className="metric-card"><div className="metric-top"><span>ROOT MOMENT</span></div><div className="metric-value">{structure ? digits(structure.rootMoment / 1000, 2) : '—'}<small>kN·m</small></div><div className="metric-note">Same elliptical beam as structures</div></div>
      <div className="metric-card"><div className="metric-top"><span>BENDING STRESS</span></div><div className="metric-value">{structure ? digits(structure.bendingStress / 1e6, 1) : '—'}<small>MPa</small></div><div className="metric-note">Root outer fibre</div></div>
      <div className="metric-card"><div className="metric-top"><span>TIP DEFLECTION</span></div><div className="metric-value">{structure ? digits(structure.tipDeflection * 1000, 1) : '—'}<small>mm</small></div><div className="metric-note">From the beam integration</div></div>
    </div>
    <div className="materials-grid">
      <section className="panel">
        <div className="panel-kicker">CHECKS / 01</div>
        <h2>What was actually judged</h2>
        {assessment.checks.map((check) => <div className="check-row" key={check.id}><div><b>{check.name}</b><p>{check.detail}</p></div><span className={`pill ${check.status === 'pass' ? 'pass' : check.status === 'fail' ? 'fail' : 'noteval'}`}>{statusWord(check.status)}</span></div>)}
        <p className="state-note">{assessment.governing ? `Governing evaluated check: ${assessment.governing.name}. Its margin is ${digits(assessment.governing.margin ?? 0, 2)}.` : 'No evaluated check is available to govern.'} Margin is (capacity − demand) / capacity. The governing row is the smallest of those margins. Unevaluated rows are left out of that comparison, and an unevaluated row is not a pass.</p>
        {structure?.thicknessExceedsSection && <p className="state-note warning">Spar height is above 12% of the shared chord. That is a packaging warning from the structures page. It is not one of the failure rows above.</p>}
      </section>
      <section className="panel controls-panel">
        <div className="panel-kicker">CONDITIONS / 02</div>
        <h2>Load, wing and spar</h2>
        <div className="example-row">{EXAMPLE_CONDITIONS.map((example) => <button key={example.id} type="button" className="material-option" onClick={() => setDesign({ mass: example.mass, loadFactor: example.loadFactor })}><b>{example.name}</b><small>{example.detail}</small></button>)}</div>
        <div className="control-group"><div className="control-label"><label htmlFor="safe-mass">Aircraft mass</label><b>{digits(design.mass, 0)} <small>kg</small></b></div><input id="safe-mass" type="range" min="200" max="4000" step="10" value={design.mass} onChange={(event) => setDesign({ mass: Number(event.target.value) })}/></div>
        <div className="control-group"><div className="control-label"><label htmlFor="safe-n">Load factor</label><b>{digits(design.loadFactor, 1)}</b></div><input id="safe-n" type="range" min="1" max="6" step="0.1" value={design.loadFactor} onChange={(event) => setDesign({ loadFactor: Number(event.target.value) })}/></div>
        <div className="geometry-row"><label htmlFor="safe-span">Wingspan</label><div className="number-input"><input id="safe-span" type="number" min="1" max="40" step="0.5" value={span} onChange={(event) => setSpan(Math.max(1, Math.min(40, Number(event.target.value) || 1)))}/><span>m</span></div></div>
        <div className="geometry-row"><label htmlFor="safe-chord">Chord</label><div className="number-input"><input id="safe-chord" type="number" min="0.2" max="8" step="0.1" value={chord} onChange={(event) => setChord(Math.max(0.2, Math.min(8, Number(event.target.value) || 0.2)))}/><span>m</span></div></div>
        <div className="material-picker">{MATERIALS.map((material) => <button key={material.id} type="button" className={`material-option ${material.id === design.materialId ? 'active' : ''}`} onClick={() => setDesign({ materialId: material.id })}><b>{material.name}</b><small>{material.kind === 'metal' ? 'Yield check uses tensile yield.' : 'Checks use 0° tension and 0° compression.'}</small></button>)}</div>
        <div className="control-group"><div className="control-label"><label htmlFor="safe-width">Spar width</label><b>{digits(design.sparWidth * 1000, 0)} <small>mm</small></b></div><input id="safe-width" type="range" min="20" max="300" step="1" value={design.sparWidth * 1000} onChange={(event) => setDesign({ sparWidth: Number(event.target.value) / 1000 })}/></div>
        <div className="control-group"><div className="control-label"><label htmlFor="safe-height">Spar height</label><b>{digits(design.sparHeight * 1000, 0)} <small>mm</small></b></div><input id="safe-height" type="range" min="40" max="400" step="1" value={design.sparHeight * 1000} onChange={(event) => setDesign({ sparHeight: Number(event.target.value) / 1000 })}/></div>
        <div className="control-group"><div className="control-label"><label htmlFor="safe-wall">Wall thickness</label><b>{digits(design.wallThickness * 1000, 1)} <small>mm</small></b></div><input id="safe-wall" type="range" min="1" max="20" step="0.5" value={design.wallThickness * 1000} onChange={(event) => setDesign({ wallThickness: Number(event.target.value) / 1000 })}/></div>
        <p className="state-note">These are the same mass, wing and spar as Materials & Structures. Operating aerodynamic lift at the laboratory condition is {operatingFinite ? `${digits(operatingLift / 1000, 2)} kN` : 'invalid'}. That lift is not the design load.</p>
      </section>
    </div>
    <div className="materials-grid materials-follow">
      <section className="panel">
        <div className="panel-kicker">YOUR LIMITS / 03</div>
        <h2>Entered design limits</h2>
        <p className="state-note">Leave a box empty and that limit stays unevaluated. Nothing here is a universal aviation limit.</p>
        <div className="geometry-row"><label htmlFor="limit-stress">Maximum bending stress</label><div className="number-input"><input id="limit-stress" type="number" min="0" step="10" value={fields.stress} placeholder="empty" onChange={(event) => setFields({ stress: event.target.value })}/><span>MPa</span></div></div>
        <div className="geometry-row"><label htmlFor="limit-strain">Maximum bending strain</label><div className="number-input"><input id="limit-strain" type="number" min="0" step="0.0001" value={fields.strain} placeholder="empty" onChange={(event) => setFields({ strain: event.target.value })}/><span>—</span></div></div>
        <div className="geometry-row"><label htmlFor="limit-deflection">Maximum tip deflection</label><div className="number-input"><input id="limit-deflection" type="number" min="0" step="5" value={fields.deflection} placeholder="empty" onChange={(event) => setFields({ deflection: event.target.value })}/><span>mm</span></div></div>
        <div className="geometry-row"><label htmlFor="limit-factor">Minimum factor</label><div className="number-input"><input id="limit-factor" type="number" min="0" step="0.1" value={fields.factor} placeholder="empty" onChange={(event) => setFields({ factor: event.target.value })}/><span>—</span></div></div>
        <p className="state-note">For a metal the factor is typical yield divided by bending stress. For the carbon tape it is the smaller of the 0° tension and 0° compression ratios. Web shear is shown in the shear row and is not compared with this stress box.</p>
      </section>
      <section className="panel chart-panel">
        <div className="panel-header"><div><div className="panel-kicker">LOADING / 04</div><h2>Root moment from the beam</h2></div><span className="chart-unit">kN·m</span></div>
        <div className="chart-wrap">{structure ? <ResponsiveContainer width="100%" height="100%"><LineChart data={chart} margin={{ top: 12, right: 12, left: -8, bottom: 2 }}><CartesianGrid stroke="#203244" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="y" type="number" domain={[0, structure.semiSpan]} tick={{ fill: '#7890a3', fontSize: 10 }} tickLine={false} axisLine={{ stroke: '#314456' }}/><YAxis tick={{ fill: '#7890a3', fontSize: 10 }} tickLine={false} axisLine={false}/><Tooltip contentStyle={{ background: '#101d2a', border: '1px solid #294156', borderRadius: 8, fontSize: 12 }} formatter={(value) => [`${Number(value).toFixed(2)} kN·m`, 'Moment']}/><Line type="monotone" dataKey="moment" stroke="#f0a35c" strokeWidth={2.2} dot={false}/></LineChart></ResponsiveContainer> : <p className="state-note">The moment diagram appears when the spar section is valid.</p>}</div>
        <p className="state-note">Web shear at the root is {assessment.webShearStress === null ? 'unavailable' : `${digits(assessment.webShearStress / 1e6, 2)} MPa`}. Bending strain σ/E is {assessment.bendingStrain === null ? 'unavailable' : assessment.bendingStrain.toExponential(3)}.</p>
      </section>
    </div>
    <section className="panel materials-follow">
      <div className="panel-kicker">LIMITS OF THIS ASSESSMENT / 05</div>
      <h2>What a pass does not cover</h2>
      <p className="state-note">The load is the assumed ellipse on one cantilever spar. Shear deformation, torsion, buckling, fatigue, fittings and aeroelasticity are outside the beam. Aluminium numbers are typical values marked not for design. The tape check is unidirectional and directional. A row left as NOT EVALUATED has not been shown to be safe. Changing the wing here changes the structures page, because they share one design.</p>
    </section>
    <footer className="footer-note"><span>AERO-X FLIGHT SAFETY</span><span>Preliminary beam checks · Not a certified load assessment · Not for flight decisions</span></footer>
  </>;
}
