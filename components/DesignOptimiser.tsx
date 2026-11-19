'use client';

import { useState } from 'react';
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import { calculateAero } from '@/lib/aero';
import { type SavedCase, type WingDesign } from '@/lib/design';
import { MATERIALS } from '@/lib/materials';
import { comparePoints, describeConfiguration, objectiveName, searchDesigns, searchToCsv, type Axis, type DesignPoint, type ObjectiveId, type SearchConstraints, type SearchResult } from '@/lib/optimise';

type Props = {
  span: number;
  chord: number;
  setSpan: (span: number) => void;
  setChord: (chord: number) => void;
  speed: number;
  alpha: number;
  density: number;
  design: WingDesign;
  setDesign: (patch: Partial<WingDesign>) => void;
  baseline: { span: number; chord: number; design: WingDesign };
  setBaseline: (value: { span: number; chord: number; design: WingDesign }) => void;
  saved: SavedCase[];
  setSaved: (value: SavedCase[]) => void;
};

type RangeState = { span: Axis; chord: Axis; sparWidth: Axis; sparHeight: Axis; wallThickness: Axis };

const INITIAL_RANGES: RangeState = {
  span: { min: 7, max: 9, step: 1 },
  chord: { min: 1.2, max: 1.8, step: 0.3 },
  sparWidth: { min: 0.1, max: 0.14, step: 0.02 },
  sparHeight: { min: 0.14, max: 0.18, step: 0.02 },
  wallThickness: { min: 0.006, max: 0.01, step: 0.002 },
};

function digits(value: number | null, places: number): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('en-GB', { maximumFractionDigits: places, minimumFractionDigits: places });
}

function signed(value: number | null, places: number, unit: string): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${digits(value, places)} ${unit}`;
}

export default function DesignOptimiser({ span, chord, setSpan, setChord, speed, alpha, density, design, setDesign, baseline, setBaseline, saved, setSaved }: Props) {
  const [ranges, setRanges] = useState<RangeState>(INITIAL_RANGES);
  const [materials, setMaterials] = useState<string[]>(MATERIALS.map((material) => material.id));
  const [objectives, setObjectives] = useState<ObjectiveId[]>(['mass']);
  const [constraintText, setConstraintText] = useState({ lift: '', stress: '', deflection: '', factor: '' });
  const [result, setResult] = useState<SearchResult | null>(null);
  const [message, setMessage] = useState('Set the grid, then run the search. Nothing has been ranked yet.');

  const constraints = (): SearchConstraints => ({
    minAeroLift: constraintText.lift.trim() === '' ? null : Number(constraintText.lift) * 1000,
    maxBendingStress: constraintText.stress.trim() === '' ? null : Number(constraintText.stress) * 1e6,
    maxTipDeflection: constraintText.deflection.trim() === '' ? null : Number(constraintText.deflection) / 1000,
    minFactor: constraintText.factor.trim() === '' ? null : Number(constraintText.factor),
  });

  const aeroAt = (nextSpan: number, nextChord: number) => {
    const sample = calculateAero({ speed, alpha, density, span: nextSpan, chord: nextChord });
    return { lift: sample.lift, ld: sample.ld, forcesFinite: sample.forcesFinite };
  };

  const run = () => {
    const search = searchDesigns({
      ...ranges,
      materialIds: materials,
      objectives,
      constraints: constraints(),
      mass: design.mass,
      loadFactor: design.loadFactor,
    }, aeroAt);
    if (!search.ok) {
      setResult(null);
      setMessage(search.reason);
      return;
    }
    setResult(search);
    setMessage(search.preference);
  };

  const applyPoint = (point: DesignPoint) => {
    setSpan(point.span);
    setChord(point.chord);
    setDesign({
      materialId: point.materialId,
      sparWidth: point.sparWidth,
      sparHeight: point.sparHeight,
      wallThickness: point.wallThickness,
    });
  };

  const savePoint = (point: DesignPoint, label: string) => {
    setSaved([...saved, {
      name: label,
      span: point.span,
      chord: point.chord,
      design: {
        ...design,
        materialId: point.materialId,
        sparWidth: point.sparWidth,
        sparHeight: point.sparHeight,
        wallThickness: point.wallThickness,
      },
    }]);
  };

  const baselinePoint = describeConfiguration({
    span: baseline.span,
    chord: baseline.chord,
    ...baseline.design,
  }, constraints(), objectives.includes('ld') || constraintText.lift.trim() !== '' ? aeroAt(baseline.span, baseline.chord) : null);
  const comparison = result?.preferred ? comparePoints(
    describeConfiguration({ span: baseline.span, chord: baseline.chord, ...baseline.design }, constraints(), aeroAt(baseline.span, baseline.chord)),
    describeConfiguration({
      span: result.preferred.span,
      chord: result.preferred.chord,
      mass: design.mass,
      loadFactor: design.loadFactor,
      materialId: result.preferred.materialId,
      sparWidth: result.preferred.sparWidth,
      sparHeight: result.preferred.sparHeight,
      wallThickness: result.preferred.wallThickness,
    }, constraints(), aeroAt(result.preferred.span, result.preferred.chord)),
  ) : null;

  const plotObjectives = result && result.objectives.length >= 2 ? [result.objectives[0], result.objectives[1]] as const : null;
  const axisValue = (point: DesignPoint, objective: ObjectiveId) => objective === 'mass' ? point.mass : objective === 'deflection' ? (point.deflection ?? 0) * 1000 : point.ld;
  const axisLabel = (objective: ObjectiveId) => objective === 'mass' ? 'Spar mass (kg)' : objective === 'deflection' ? 'Tip deflection (mm)' : 'Lift / drag';

  const toggle = (list: string[], value: string, setter: (next: string[]) => void) => {
    setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  };

  return <>
    <div className="section-heading"><span>GRID SEARCH</span><span className="section-rule"/><span className="timestamp">BOUNDED SWEEP / NOT A GENETIC ALGORITHM</span></div>
    <div className="condition-banner"><span className="condition-icon">i</span><div><b>{message}</b><small>Mass and load factor stay at the shared values, {digits(design.mass, 0)} kg and {digits(design.loadFactor, 1)}. Lift-to-drag uses the aerodynamic model at {digits(speed, 0)} m/s, {digits(alpha, 1)}° and {digits(density, 3)} kg/m³. A row that breaks a constraint is not called preferred.</small></div></div>
    <div className="materials-grid">
      <section className="panel">
        <div className="panel-kicker">VARIABLES / 01</div>
        <h2>Search ranges</h2>
        {([
          ['span', 'Wingspan', 'm'],
          ['chord', 'Chord', 'm'],
          ['sparWidth', 'Spar width', 'm'],
          ['sparHeight', 'Spar height', 'm'],
          ['wallThickness', 'Wall thickness', 'm'],
        ] as const).map(([key, label, unit]) => <div className="range-line" key={key}><span>{label}</span><label>Min<input type="number" step="any" value={ranges[key].min} onChange={(event) => setRanges((current) => ({ ...current, [key]: { ...current[key], min: Number(event.target.value) } }))}/></label><label>Max<input type="number" step="any" value={ranges[key].max} onChange={(event) => setRanges((current) => ({ ...current, [key]: { ...current[key], max: Number(event.target.value) } }))}/></label><label>Step<input type="number" step="any" value={ranges[key].step} onChange={(event) => setRanges((current) => ({ ...current, [key]: { ...current[key], step: Number(event.target.value) } }))}/></label><em>{unit}</em></div>)}
        <div className="material-picker">{MATERIALS.map((material) => <button key={material.id} type="button" className={`material-option ${materials.includes(material.id) ? 'active' : ''}`} onClick={() => toggle(materials, material.id, setMaterials)}><b>{material.name}</b><small>{materials.includes(material.id) ? 'Included in the grid' : 'Left out of the grid'}</small></button>)}</div>
      </section>
      <section className="panel">
        <div className="panel-kicker">OBJECTIVE AND CONSTRAINTS / 02</div>
        <h2>What the search prefers</h2>
        {(['mass', 'ld', 'deflection'] as ObjectiveId[]).map((objective) => <button key={objective} type="button" className={`material-option ${objectives.includes(objective) ? 'active' : ''}`} onClick={() => toggle(objectives, objective, (next) => setObjectives(next as ObjectiveId[]))}><b>{objectiveName(objective)}</b><small>{objectives.includes(objective) ? 'Active objective' : 'Not in this search'}</small></button>)}
        <div className="geometry-row"><label htmlFor="min-lift">Minimum aerodynamic lift</label><div className="number-input"><input id="min-lift" type="number" min="0" step="1" placeholder="empty" value={constraintText.lift} onChange={(event) => setConstraintText((current) => ({ ...current, lift: event.target.value }))}/><span>kN</span></div></div>
        <div className="geometry-row"><label htmlFor="max-stress">Maximum bending stress</label><div className="number-input"><input id="max-stress" type="number" min="0" step="10" placeholder="empty" value={constraintText.stress} onChange={(event) => setConstraintText((current) => ({ ...current, stress: event.target.value }))}/><span>MPa</span></div></div>
        <div className="geometry-row"><label htmlFor="max-deflection">Maximum tip deflection</label><div className="number-input"><input id="max-deflection" type="number" min="0" step="5" placeholder="empty" value={constraintText.deflection} onChange={(event) => setConstraintText((current) => ({ ...current, deflection: event.target.value }))}/><span>mm</span></div></div>
        <div className="geometry-row"><label htmlFor="min-factor">Minimum factor</label><div className="number-input"><input id="min-factor" type="number" min="0" step="0.1" placeholder="empty" value={constraintText.factor} onChange={(event) => setConstraintText((current) => ({ ...current, factor: event.target.value }))}/><span>—</span></div></div>
        <p className="state-note">An empty constraint is inactive. The factor is yield divided by stress for a metal, and the smaller 0° strength ratio for the tape. Invalid spar geometry is always rejected.</p>
        <button type="button" className="reset-button search-button" onClick={run}>Run grid search</button>
      </section>
    </div>
    {result && <div className="materials-grid materials-follow">
      <section className="panel">
        <div className="panel-kicker">PREFERRED FEASIBLE ROW / 03</div>
        <h2>{result.preferred ? result.preferred.materialName : 'No feasible design'}</h2>
        <p className="state-note">{result.evaluated} configurations were evaluated. {result.feasible} satisfied every active constraint. {result.pareto.length} of those sit on the Pareto front of the selected objectives.</p>
        {result.preferred ? <>
          <div className="readout-line"><span>Wingspan / chord</span><b>{digits(result.preferred.span, 2)} m / {digits(result.preferred.chord, 2)} m</b></div>
          <div className="readout-line"><span>Spar B × H × t</span><b>{digits(result.preferred.sparWidth * 1000, 0)} × {digits(result.preferred.sparHeight * 1000, 0)} × {digits(result.preferred.wallThickness * 1000, 1)} mm</b></div>
          <div className="readout-line"><span>Both spars</span><b>{digits(result.preferred.mass, 2)} kg</b></div>
          <div className="readout-line"><span>Bending stress</span><b>{digits(result.preferred.stress === null ? null : result.preferred.stress / 1e6, 1)} MPa</b></div>
          <div className="readout-line"><span>Tip deflection</span><b>{digits(result.preferred.deflection === null ? null : result.preferred.deflection * 1000, 1)} mm</b></div>
          <div className="readout-line"><span>Lift / drag</span><b>{result.objectives.includes('ld') ? digits(result.preferred.ld, 2) : 'not an objective'}</b></div>
          <div className="readout-line"><span>{result.preferred.factorKind === 'directional' ? 'Directional ratio' : 'Yield factor'}</span><b>{digits(result.preferred.factor, 2)}</b></div>
          <div className="button-row"><button type="button" className="reset-button" onClick={() => applyPoint(result.preferred!)}>Use this design</button><button type="button" className="reset-button" onClick={() => savePoint(result.preferred!, `Search ${saved.length + 1}`)}>Save in this session</button><button type="button" className="reset-button" onClick={() => downloadCsv(searchToCsv(result))}>Export CSV</button></div>
        </> : <p className="state-note">The search finished. No row met the constraints, so there is no preferred design to apply.</p>}
      </section>
      <section className="panel readout-panel">
        <div className="panel-kicker">BASELINE / 04</div>
        <h2>Current baseline against the preferred row</h2>
        <div className="readout-line"><span>Baseline wing</span><b>{digits(baseline.span, 2)} m × {digits(baseline.chord, 2)} m</b></div>
        <div className="readout-line"><span>Baseline feasible here</span><b>{baselinePoint.feasible ? 'yes' : 'no'}</b></div>
        {comparison && <>
          <div className="readout-line"><span>Spar-mass change</span><b>{signed(comparison.massChange, 2, 'kg')}</b></div>
          <div className="readout-line"><span>Stress change</span><b>{signed(comparison.stressChange === null ? null : comparison.stressChange / 1e6, 1, 'MPa')}</b></div>
          <div className="readout-line"><span>Deflection change</span><b>{signed(comparison.deflectionChange === null ? null : comparison.deflectionChange * 1000, 1, 'mm')}</b></div>
          <div className="readout-line"><span>Lift-to-drag change</span><b>{signed(comparison.ldChange, 2, '')}</b></div>
        </>}
        <p className="state-note">A negative mass, stress or deflection change means the preferred row is lower than the baseline. Lift-to-drag is the aerodynamic model at the shared flight condition, including when it was not the search objective. The structural numbers are the beam.</p>
        <div className="button-row"><button type="button" className="reset-button" onClick={() => { setSpan(baseline.span); setChord(baseline.chord); setDesign(baseline.design); }}>Restore baseline</button><button type="button" className="reset-button" onClick={() => setBaseline({ span, chord, design })}>Set baseline to current</button></div>
        {saved.length > 0 && <div className="saved-list">{saved.map((item, index) => <button key={`${item.name}-${index}`} type="button" className="material-option" onClick={() => { setSpan(item.span); setChord(item.chord); setDesign(item.design); }}><b>{item.name}</b><small>{item.span} m span, {item.design.materialId}</small></button>)}</div>}
      </section>
    </div>}
    {result && plotObjectives && <section className="panel materials-follow chart-panel"><div className="panel-header"><div><div className="panel-kicker">PARETO / 05</div><h2>Feasible trade-off</h2></div><span className="chart-unit">{result.objectives.length > 2 ? 'Third objective stays in the table' : 'Selected objectives'}</span></div>
      <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{ top: 12, right: 12, left: 0, bottom: 8 }}><CartesianGrid stroke="#203244" strokeDasharray="3 5"/><XAxis dataKey="x" type="number" name={axisLabel(plotObjectives[0])} tick={{ fill: '#7890a3', fontSize: 10 }} label={{ value: axisLabel(plotObjectives[0]), position: 'insideBottom', offset: -2, fill: '#7890a3', fontSize: 9 }}/><YAxis dataKey="y" type="number" name={axisLabel(plotObjectives[1])} tick={{ fill: '#7890a3', fontSize: 10 }}/><ZAxis range={[40, 40]}/><Tooltip contentStyle={{ background: '#101d2a', border: '1px solid #294156', borderRadius: 8, fontSize: 12 }} formatter={(value, name) => [Number(value).toFixed(2), name]}/><Scatter data={result.points.filter((point) => point.feasible && !result.pareto.includes(point)).map((point) => ({ x: axisValue(point, plotObjectives[0]), y: axisValue(point, plotObjectives[1]) }))} fill="#4f9fbd"/><Scatter data={result.pareto.map((point) => ({ x: axisValue(point, plotObjectives[0]), y: axisValue(point, plotObjectives[1]) }))} fill="#f0a35c"/></ScatterChart></ResponsiveContainer></div>
      <p className="state-note">Cyan points are feasible. Orange points are the Pareto front for the plotted pair. Dominated points are drawn, and infeasible points are omitted. The orange set is a trade, not a single winner.</p>
    </section>}
    <footer className="footer-note"><span>AERO-X DESIGN SEARCH</span><span>Grid of the existing beam and section model · Not a certified optimisation</span></footer>
  </>;
}

function downloadCsv(csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'aero-x-search.csv';
  link.click();
  URL.revokeObjectURL(url);
}
