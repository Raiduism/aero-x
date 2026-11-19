'use client';

import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { type WingDesign } from '@/lib/design';
import { MATERIALS } from '@/lib/materials';
import { analyzeWing, compareMaterials, type StructureSuccess } from '@/lib/structures';

type Props = {
  span: number;
  chord: number;
  setSpan: (span: number) => void;
  setChord: (chord: number) => void;
  design: WingDesign;
  setDesign: (patch: Partial<WingDesign>) => void;
  operatingLift: number;
  operatingFinite: boolean;
};

function digits(value: number, places: number): string {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('en-GB', { minimumFractionDigits: places, maximumFractionDigits: places });
}

function kilonewtons(value: number): string {
  return `${digits(value / 1000, 2)} kN`;
}

function mpa(value: number): string {
  return `${digits(value / 1e6, 1)} MPa`;
}

function WingFigure({ result }: { result: StructureSuccess }) {
  const x0 = 86;
  const x1 = 700;
  const axis = 176;
  const spanPx = x1 - x0;
  const tip = result.stations[result.stations.length - 1]?.deflection ?? 0;
  const truePx = (tip / result.semiSpan) * spanPx;
  const drawn = Math.min(72, Math.max(truePx, tip > 0 ? 26 : 0));
  const factor = truePx > 1e-9 ? drawn / truePx : 1;
  const scaleNote = factor > 1.05
    ? `The bending curve is drawn ${factor.toFixed(1)}× the calculated deflection. It is not to scale.`
    : factor < 0.95
      ? 'The frame limits the curve. The calculated tip deflection is larger than the line drawn here.'
      : 'The bending curve uses the same scale as the span.';
  const curve = result.stations.map((station) => {
    const x = x0 + (station.y / result.semiSpan) * spanPx;
    const y = axis - (tip > 0 ? (station.deflection / tip) * drawn : 0);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const arrows = result.stations.filter((_, index) => index % 4 === 0);
  return <div>
    <svg viewBox="0 0 760 300" className="structure-svg" role="img" aria-label="Half wing as a cantilever. The root is fixed, the tip is free, and the elliptical load is an assumption.">
      <line x1="58" y1="48" x2="58" y2="250" stroke="#8fb4c6" strokeWidth="3"/>
      {[0, 1, 2, 3, 4, 5].map((mark) => <line key={mark} x1="46" y1={58 + mark * 32} x2="58" y2={70 + mark * 32} stroke="#8fb4c6" strokeWidth="1.4"/>)}
      <text x="18" y="150" fill="#9fb4c4" fontSize="10" transform="rotate(-90 18 150)">Fixed root</text>
      <line x1={x0} y1={axis} x2={x1} y2={axis} stroke="#3d6d84" strokeWidth="14" strokeLinecap="butt"/>
      <line x1={x0} y1={axis} x2={x1} y2={axis} stroke="#16384a" strokeWidth="6"/>
      <polyline points={curve} fill="none" stroke="#f0a35c" strokeWidth="2.2"/>
      <circle cx={x1} cy={axis - drawn} r="3.5" fill="#f0a35c"/>
      {arrows.map((station) => {
        const x = x0 + (station.y / result.semiSpan) * spanPx;
        const length = 10 + 48 * (station.load / result.rootLoad);
        return <line key={station.y} x1={x} y1={axis - 16} x2={x} y2={axis - 16 - length} stroke="#58c9ec" strokeWidth="1.4" markerEnd="url(#loadArrow)"/>;
      })}
      <defs><marker id="loadArrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0,6 L3,0 L6,6" fill="#58c9ec"/></marker></defs>
      <text x={x1 - 8} y="42" fill="#9fb4c4" fontSize="10" textAnchor="end">Free tip</text>
      <text x="390" y="268" fill="#9fb4c4" fontSize="10" textAnchor="middle">Spar axis, root to tip · cyan arrows are the assumed elliptical lift</text>
      <text x="390" y="286" fill="#f0a35c" fontSize="10" textAnchor="middle">{scaleNote}</text>
    </svg>
  </div>;
}

function SectionFigure({ widthM, heightM, thicknessM }: { widthM: number; heightM: number; thicknessM: number }) {
  const outerW = 140;
  const naturalH = outerW * (heightM / widthM);
  const limited = naturalH > 210;
  const outerH = Math.min(naturalH, 210);
  const x = (260 - outerW) / 2;
  const y = 28;
  const insetX = (thicknessM / widthM) * outerW;
  const insetY = (thicknessM / heightM) * outerH;
  return <svg viewBox={`0 0 260 ${y + outerH + 36}`} className="structure-svg" role="img" aria-label="Hollow rectangular spar cross-section. The outer height sets the distance to the stressed face.">
    <rect x={x} y={y} width={outerW} height={outerH} fill="#12384c" stroke="#8be9ff" strokeWidth="1.4"/>
    <rect x={x + insetX} y={y + insetY} width={Math.max(0, outerW - 2 * insetX)} height={Math.max(0, outerH - 2 * insetY)} fill="#0b1926"/>
    <line x1={x - 16} y1={y + outerH / 2} x2={x + outerW + 16} y2={y + outerH / 2} stroke="#f0a35c" strokeDasharray="3 3"/>
    <text x="130" y="16" fill="#9fb4c4" fontSize="10" textAnchor="middle">Neutral axis · c = H/2</text>
    <text x="130" y={y + outerH + 18} fill="#9fb4c4" fontSize="10" textAnchor="middle">{limited ? 'Height capped in this sketch. Wall thickness stays in proportion.' : 'Outer B and H, wall t in proportion'}</text>
  </svg>;
}

export default function MaterialsStructures({ span, chord, setSpan, setChord, design, setDesign, operatingLift, operatingFinite }: Props) {
  const { mass, loadFactor, materialId } = design;
  const widthMm = design.sparWidth * 1000;
  const heightMm = design.sparHeight * 1000;
  const thicknessMm = design.wallThickness * 1000;
  const setMass = (value: number) => setDesign({ mass: value });
  const setLoadFactor = (value: number) => setDesign({ loadFactor: value });
  const setMaterialId = (value: string) => setDesign({ materialId: value });
  const setWidthMm = (value: number) => setDesign({ sparWidth: value / 1000 });
  const setHeightMm = (value: number) => setDesign({ sparHeight: value / 1000 });
  const setThicknessMm = (value: number) => setDesign({ wallThickness: value / 1000 });
  const input = useMemo(() => ({
    span,
    chord,
    mass,
    loadFactor,
    sparWidth: widthMm / 1000,
    sparHeight: heightMm / 1000,
    wallThickness: thicknessMm / 1000,
    materialId,
  }), [span, chord, mass, loadFactor, widthMm, heightMm, thicknessMm, materialId]);
  const result = useMemo(() => analyzeWing(input), [input]);
  const comparison = useMemo(() => compareMaterials(input), [input]);
  const chart = result.ok ? result.stations.map((station) => ({
    y: Number((station.y).toFixed(3)),
    load: station.load / 1000,
    moment: station.moment / 1000,
  })) : [];

  return <>
    <div className="section-heading"><span>HALF-WING BEAM</span><span className="section-rule"/><span className="timestamp">CANTILEVER / ELLIPTICAL LOAD ASSUMED / NOT FEA</span></div>
    <div className="metrics-grid">
      <div className="metric-card"><div className="metric-top"><span>DESIGN LIFT</span></div><div className="metric-value">{result.ok ? digits(result.designLift / 1000, 2) : '—'}<small>kN</small></div><div className="metric-note">n · m · g for the whole aircraft</div></div>
      <div className="metric-card"><div className="metric-top"><span>ROOT MOMENT</span></div><div className="metric-value">{result.ok ? digits(result.rootMoment / 1000, 2) : '—'}<small>kN·m</small></div><div className="metric-note">One wing, elliptical load</div></div>
      <div className="metric-card"><div className="metric-top"><span>BENDING STRESS</span></div><div className="metric-value">{result.ok ? digits(result.bendingStress / 1e6, 1) : '—'}<small>MPa</small></div><div className="metric-note">Root outer fibre, σ = Mc/I</div></div>
      <div className="metric-card"><div className="metric-top"><span>TIP DEFLECTION</span></div><div className="metric-value">{result.ok ? digits(result.tipDeflection * 1000, 1) : '—'}<small>mm</small></div><div className="metric-note">Integrated along the elliptical load</div></div>
    </div>
    {!result.ok && <div className="condition-banner caution"><span className="condition-icon">!</span><div><b>Spar geometry rejected</b><small>{result.reason}</small></div></div>}
    <div className="materials-grid">
      <section className="panel">
        <div className="panel-header"><div><div className="panel-kicker">LOAD PATH / 01</div><h2>One wing, root fixed</h2></div><span className="model-pill">NOT FEA</span></div>
        {result.ok ? <WingFigure result={result}/> : <p className="state-note">The drawing waits until the box section is physically possible.</p>}
        <div className="visual-footer"><div><small>LIFT PER WING</small><b>{result.ok ? kilonewtons(result.liftPerWing) : '—'}</b></div><div><small>ROOT LOAD ℓ0</small><b>{result.ok ? `${digits(result.rootLoad / 1000, 2)} kN/m` : '—'}</b></div><div><small>SEMI-SPAN</small><b>{digits(span / 2, 2)} <em>m</em></b></div></div>
        <p className="state-note">The arrows are an assumed elliptical distribution, ℓ(y) = ℓ0 √(1 − (y/s)²). The aerodynamic page does not calculate this shape. Its wing force uses a sectional solver plus an elliptical induced-drag bound.</p>
      </section>
      <section className="panel controls-panel">
        <div className="panel-header"><div><div className="panel-kicker">STRUCTURAL INPUTS / 02</div><h2>Load and spar</h2></div></div>
        <div className="control-group"><div className="control-label"><label htmlFor="mass">Aircraft mass</label><b>{digits(mass, 0)} <small>kg</small></b></div><input id="mass" type="range" min="200" max="4000" step="10" value={mass} onChange={(event) => setMass(Number(event.target.value))}/><div className="range-ends"><span>200 kg</span><span>4000 kg</span></div></div>
        <div className="control-group"><div className="control-label"><label htmlFor="load-factor">Load factor</label><b>{digits(loadFactor, 1)}</b></div><input id="load-factor" type="range" min="1" max="6" step="0.1" value={loadFactor} onChange={(event) => setLoadFactor(Number(event.target.value))}/><div className="range-ends"><span>1.0</span><span>6.0</span></div></div>
        <div className="control-divider"/><div className="subsection-title">SHARED WING GEOMETRY</div>
        <div className="geometry-row"><label htmlFor="struct-span">Wingspan</label><div className="number-input"><input id="struct-span" type="number" min="1" max="40" step="0.5" value={span} onChange={(event) => setSpan(Math.max(1, Math.min(40, Number(event.target.value) || 1)))}/><span>m</span></div></div>
        <div className="geometry-row"><label htmlFor="struct-chord">Chord</label><div className="number-input"><input id="struct-chord" type="number" min="0.2" max="8" step="0.1" value={chord} onChange={(event) => setChord(Math.max(0.2, Math.min(8, Number(event.target.value) || 0.2)))}/><span>m</span></div></div>
        <div className="control-divider"/><div className="subsection-title">BOX SPAR</div>
        <div className="control-group"><div className="control-label"><label htmlFor="spar-width">Width B</label><b>{digits(widthMm, 0)} <small>mm</small></b></div><input id="spar-width" type="range" min="20" max="300" step="1" value={widthMm} onChange={(event) => setWidthMm(Number(event.target.value))}/></div>
        <div className="control-group"><div className="control-label"><label htmlFor="spar-height">Height H</label><b>{digits(heightMm, 0)} <small>mm</small></b></div><input id="spar-height" type="range" min="40" max="400" step="1" value={heightMm} onChange={(event) => setHeightMm(Number(event.target.value))}/></div>
        <div className="control-group"><div className="control-label"><label htmlFor="spar-thickness">Wall t</label><b>{digits(thicknessMm, 1)} <small>mm</small></b></div><input id="spar-thickness" type="range" min="1" max="20" step="0.5" value={thicknessMm} onChange={(event) => setThicknessMm(Number(event.target.value))}/></div>
        <p className="state-note">Chord is shared with the aerodynamics laboratory and is not inside the beam stiffness. It is used only to compare H with the 12% thickness of a NACA 2412 section.</p>
      </section>
    </div>
    <div className="two-charts">
      <section className="panel chart-panel"><div className="panel-header"><div><div className="panel-kicker">SPANWISE LOAD / 03</div><h2>Assumed lift distribution</h2></div><span className="chart-unit">kN/m</span></div>
        <div className="chart-wrap">{result.ok ? <ResponsiveContainer width="100%" height="100%"><LineChart data={chart} margin={{ top: 12, right: 12, left: -8, bottom: 2 }}><CartesianGrid stroke="#203244" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="y" type="number" domain={[0, result.semiSpan]} tick={{ fill: '#7890a3', fontSize: 10 }} tickLine={false} axisLine={{ stroke: '#314456' }} label={{ value: 'Y FROM ROOT (m)', position: 'insideBottom', offset: -1, fill: '#7890a3', fontSize: 9 }}/><YAxis tick={{ fill: '#7890a3', fontSize: 10 }} tickLine={false} axisLine={false}/><Tooltip contentStyle={{ background: '#101d2a', border: '1px solid #294156', borderRadius: 8, fontSize: 12 }} formatter={(value) => [`${Number(value).toFixed(2)} kN/m`, 'Elliptical load']}/><Line type="monotone" dataKey="load" stroke="#57c9ed" strokeWidth={2.2} dot={false}/></LineChart></ResponsiveContainer> : <p className="state-note">No load diagram until the section is valid.</p>}</div>
      </section>
      <section className="panel chart-panel"><div className="panel-header"><div><div className="panel-kicker">BENDING MOMENT / 04</div><h2>Moment from tip to root</h2></div><span className="chart-unit">kN·m</span></div>
        <div className="chart-wrap">{result.ok ? <ResponsiveContainer width="100%" height="100%"><LineChart data={chart} margin={{ top: 12, right: 12, left: -8, bottom: 2 }}><CartesianGrid stroke="#203244" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="y" type="number" domain={[0, result.semiSpan]} tick={{ fill: '#7890a3', fontSize: 10 }} tickLine={false} axisLine={{ stroke: '#314456' }} label={{ value: 'Y FROM ROOT (m)', position: 'insideBottom', offset: -1, fill: '#7890a3', fontSize: 9 }}/><YAxis tick={{ fill: '#7890a3', fontSize: 10 }} tickLine={false} axisLine={false}/><Tooltip contentStyle={{ background: '#101d2a', border: '1px solid #294156', borderRadius: 8, fontSize: 12 }} formatter={(value) => [`${Number(value).toFixed(2)} kN·m`, 'Bending moment']}/><Line type="monotone" dataKey="moment" stroke="#f0a35c" strokeWidth={2.2} dot={false}/></LineChart></ResponsiveContainer> : <p className="state-note">No moment diagram until the section is valid.</p>}</div>
      </section>
    </div>
    <div className="materials-grid materials-follow">
      <section className="panel">
        <div className="panel-header"><div><div className="panel-kicker">MATERIAL / 05</div><h2>What the spar is made of</h2></div></div>
        <div className="material-picker">
          {MATERIALS.map((material) => <button key={material.id} type="button" className={`material-option ${material.id === materialId ? 'active' : ''}`} onClick={() => setMaterialId(material.id)}><b>{material.name}</b><small>{material.kind === 'metal' ? 'Isotropic metal. Margin uses tensile yield.' : 'Directional tape. The beam uses the 0° modulus only as an equivalent.'}</small></button>)}
        </div>
        {result.ok && <div className="readout-panel material-readout">
          <div className="readout-line"><span>Density</span><b>{digits(result.material.density, 0)} kg/m³</b></div>
          <div className="readout-line"><span>Young&apos;s modulus used</span><b>{digits(result.material.youngsModulus / 1e9, 1)} GPa</b></div>
          <div className="readout-line"><span>Specific stiffness E/ρ</span><b>{digits(result.specificStiffness / 1e6, 1)} MN·m/kg</b></div>
          {result.metal && result.material.kind === 'metal' && <>
            <div className="readout-line"><span>Tensile yield</span><b>{mpa(result.material.tensileYield)}</b></div>
            <div className="readout-line"><span>Ultimate tensile</span><b>{mpa(result.material.ultimateTensile)}</b></div>
            <div className="readout-line"><span>Specific yield strength</span><b>{digits(result.metal.specificYieldStrength / 1000, 1)} kN·m/kg</b></div>
            <div className="readout-line"><span>Yield factor σy/σ</span><b className={result.metal.yieldFactor < 1 ? 'warning' : ''}>{digits(result.metal.yieldFactor, 2)}</b></div>
          </>}
          {result.composite && result.material.kind === 'composite' && <>
            <div className="readout-line"><span>0° tensile strength</span><b>{mpa(result.material.tensileStrength0)}</b></div>
            <div className="readout-line"><span>0° compression strength</span><b>{mpa(result.material.compressiveStrength0)}</b></div>
            <div className="readout-line"><span>90° tensile modulus</span><b>{digits(result.material.tensileModulus90 / 1e9, 0)} GPa</b></div>
            <div className="readout-line"><span>90° tensile strength</span><b>{mpa(result.material.tensileStrength90)}</b></div>
            <div className="readout-line"><span>0° tension / stress</span><b>{digits(result.composite.tensionRatio, 2)}</b></div>
            <div className="readout-line"><span>0° compression / stress</span><b className={result.composite.compressionRatio < 1 ? 'warning' : ''}>{digits(result.composite.compressionRatio, 2)}</b></div>
          </>}
          <div className="readout-line"><span>Both spars, mass</span><b>{digits(result.sparMassBothWings, 2)} kg</b></div>
          <p className="state-note">{result.material.limitations}</p>
          <p className="state-note">{result.material.source} <a href={result.material.sourceUrl}>{result.material.sourceUrl}</a></p>
        </div>}
      </section>
      <section className="panel readout-panel">
        <div className="panel-kicker">CHECK / 06</div>
        <h2>What this beam is saying</h2>
        {result.ok && result.material.kind === 'metal' && result.metal && <div className={`condition-banner ${result.metal.yieldFactor >= 1 ? '' : 'caution'}`}><span className="condition-icon">{result.metal.yieldFactor >= 1 ? '✓' : '!'}</span><div><b>{result.metal.yieldFactor >= 1 ? 'Root stress is under the typical yield' : 'Root stress is over the typical yield'}</b><small>Factor {digits(result.metal.yieldFactor, 2)} against the published typical tensile yield. This is not a certified margin and it ignores shear, buckling and fatigue.</small></div></div>}
        {result.ok && result.material.kind === 'composite' && result.composite && <div className={`condition-banner ${result.composite.compressionRatio >= 1 && result.composite.tensionRatio >= 1 ? '' : 'caution'}`}><span className="condition-icon">{result.composite.compressionRatio >= 1 ? '✓' : '!'}</span><div><b>Directional tape check, not a yield factor</b><small>The compressed face is compared with the 0° compression strength ({digits(result.composite.compressionRatio, 2)}). The tension face uses the 0° tensile strength ({digits(result.composite.tensionRatio, 2)}). A 90° ply would see a different allowable.</small></div></div>}
        <div className="readout-line"><span>Closed-form root moment</span><b>{result.ok ? `${digits(result.rootMomentCheck / 1000, 2)} kN·m` : '—'}</b></div>
        <div className="readout-line"><span>Second moment I</span><b>{result.ok ? `${digits(result.secondMoment * 1e8, 2)} ×10⁻⁸ m⁴` : '—'}</b></div>
        <div className="readout-line"><span>Section area</span><b>{result.ok ? `${digits(result.sectionArea * 1e4, 2)} cm²` : '—'}</b></div>
        <div className="readout-line"><span>Operating model lift</span><b>{operatingFinite ? kilonewtons(operatingLift) : 'invalid'}</b></div>
        <p className="state-note">Operating lift is the aerodynamic model at the current speed and angle. Design lift is n times weight. They are allowed to differ. The beam is not driven by the panel solution, and the panel solution is not driven by the beam.</p>
        {result.ok && result.thicknessExceedsSection && <p className="state-note warning">Spar height {digits(heightMm, 0)} mm is taller than 12% of the shared chord ({digits(result.sectionThickness * 1000, 0)} mm). A NACA 2412 section cannot contain that spar. The beam numbers are still computed.</p>}
        {result.ok && <SectionFigure widthM={widthMm / 1000} heightM={heightMm / 1000} thicknessM={thicknessMm / 1000}/>}
      </section>
    </div>
    <section className="panel comparison-panel">
      <div className="panel-header"><div><div className="panel-kicker">SAME SPAR, FOUR MATERIALS / 07</div><h2>Trade, not a winner</h2></div></div>
      <div className="table-scroll"><table className="compare-table"><thead><tr><th>Material</th><th>Density</th><th>E used</th><th>Strength basis</th><th>E/ρ</th><th>Specific strength</th><th>Both spars</th><th>Stress</th><th>Tip</th><th>Check</th></tr></thead><tbody>
        {MATERIALS.map((material) => {
          const found = comparison.find((item) => item.ok && item.material.id === material.id);
          const row = found && found.ok ? found : undefined;
          const strength = material.kind === 'metal' ? `${digits(material.tensileYield / 1e6, 0)} MPa yield` : `${digits(material.compressiveStrength0 / 1e6, 0)} MPa 0° compression`;
          const specific = material.kind === 'metal' ? `${digits((material.tensileYield / material.density) / 1000, 1)} yield` : `${digits((material.tensileStrength0 / material.density) / 1000, 0)} 0° tension`;
          const check = row?.metal ? `${digits(row.metal.yieldFactor, 2)} yield FoS` : row?.composite ? `${digits(row.composite.compressionRatio, 1)} × 0° compression` : '—';
          return <tr key={material.id} className={material.id === materialId ? 'selected-row' : ''}><td>{material.name}</td><td>{digits(material.density, 0)}</td><td>{digits(material.youngsModulus / 1e9, 1)}</td><td>{strength}</td><td>{digits(material.youngsModulus / material.density / 1e6, 1)}</td><td>{specific}</td><td>{row ? `${digits(row.sparMassBothWings, 1)} kg` : '—'}</td><td>{row ? digits(row.bendingStress / 1e6, 1) : '—'}</td><td>{row ? `${digits(row.tipDeflection * 1000, 1)} mm` : '—'}</td><td>{check}</td></tr>;
        })}
      </tbody></table></div>
      {!result.ok && <p className="state-note">Structural columns stay blank while the box section is impossible. The material properties themselves do not depend on that section.</p>}
      <p className="state-note">Stress is the same for every material because this elastic beam does not let the material change the load or the section. Mass follows density. Deflection follows 1/E. The carbon row is lighter and stiffer only under the unidirectional equivalent. Its strength column is a directional compression strength, so it is not a yield factor of safety and it should not be read as “better than 7075” on the same scale. The useful material depends on whether the limit is mass, stiffness, yield, damage tolerance, corrosion or manufacturing.</p>
    </section>
    <section className="panel">
      <div className="panel-kicker">INTERPRETATION / 08</div>
      <h2>What the changes mean</h2>
      <details className="question" open><summary>Why does increasing wingspan increase structural bending?</summary><p>Design lift stays n·m·g. A longer arm carries the same half-aircraft lift farther from the root. For this elliptical load the root moment is L b / (3π), so it grows directly with span. The tip also gets a longer lever, so deflection grows faster than the moment.</p></details>
      <details className="question"><summary>Why does increasing spar height improve bending stiffness?</summary><p>The second moment of the box goes with the cube of the outer height, and the inner cutout is cubed as well. Moving material away from the neutral axis resists curvature more than thickening the side walls by the same amount. Stress falls because both I grows and, for a given moment, the gain in I outruns the growth in c = H/2.</p></details>
      <details className="question"><summary>Why can a lighter material still produce greater deflection?</summary><p>Deflection is M integrated against 1/(EI). Density never enters that equation. A material can weigh less per cubic metre and still have a lower modulus, so the same spar bends more. Specific stiffness, E/ρ, is the comparison that joins the two. On these four cards the carbon tape is the case that is both lighter and stiffer, and only along the fibre direction used here.</p></details>
      <details className="question"><summary>Why is carbon fibre attractive for aerospace structures?</summary><p>The Hexcel AS4 tape lists a cured density of 1,580 kg/m³ against about 2,700–2,810 kg/m³ for these aluminium alloys, and a 0° tensile modulus of 141 GPa against about 70 GPa. Along the fibres, the spar in this model is lighter and deflects less. That is the attraction. It is also directional: the same sheet lists 10 GPa and 81 MPa across the fibres, and a compression strength below the tensile strength. A wing is not a unidirectional bar.</p></details>
      <details className="question"><summary>Why is material selection not determined by strength alone?</summary><p>At a fixed section the stress does not change when the alloy changes, so a higher yield buys margin rather than a lower stress. Stiffness, mass, corrosion, joining and the difference between yield and a composite failure mode all sit outside that one number. 7075-T6 has the highest typical yield here and a known stress-corrosion penalty. 6061-T6 has the lowest yield and is the easier alloy to join. The tape wins on mass only inside the equivalent used on this page.</p></details>
      <details className="question"><summary>What are the limitations of a simple beam model?</summary><p>One spar carries the whole lift as pure bending. There is no rib, skin, torsion box, shear flow, buckling or aeroelastic feedback. The load shape is assumed, not taken from the panel method. The root is perfectly built in and the section is constant. Metal yield and a unidirectional allowable are different criteria. None of this is a sizing certification, and it is not a finite-element analysis.</p></details>
    </section>
    <footer className="footer-note"><span>AERO-X MATERIALS AND STRUCTURES</span><span>Cantilever beam and published typical properties · Not FEA · Not for aircraft design or flight decisions</span></footer>
  </>;
}
