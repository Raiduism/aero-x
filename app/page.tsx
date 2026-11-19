'use client';

import { useMemo, useState } from 'react';
import { Activity, ArrowDownRight, ArrowUpRight, ChevronDown, CircleHelp, Gauge, Layers3, Plane, RotateCcw, Settings2, ShieldCheck, SlidersHorizontal, Wind, Zap } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import DesignOptimiser from '@/components/DesignOptimiser';
import FlightSafety from '@/components/FlightSafety';
import MaterialsStructures from '@/components/MaterialsStructures';
import OverviewDashboard from '@/components/OverviewDashboard';
import { DEFAULT_DESIGN, type SavedCase, type WingDesign } from '@/lib/design';
import { EMPTY_SAFETY_FIELDS, type SafetyFields } from '@/lib/safety';
import { calculateAero, polarAt, STALL_STATION, type AeroResult } from '@/lib/aero';
import { buildFlowScene } from '@/lib/flowField';
import { describeBoundary, formatForce, formatModelNumber, formatSeparationFactor, regimeCopy } from '@/lib/modelReport';

function AirfoilView({ speed, result }: { speed: number; result: AeroResult }) {
  const scene = useMemo(
    () => buildFlowScene({
      solution: result.panel,
      regime: result.regime,
      separationX: result.separationX,
      separationY: result.separationY,
      separationSurface: result.separationSurface,
      pressure: result.pressure,
    }),
    [result.panel, result.regime, result.separationX, result.separationY, result.separationSurface, result.pressure, result.reynolds],
  );
  const duration = Math.min(8, Math.max(0.4, 90 / Math.max(speed, 8)));
  return <svg viewBox="0 0 740 390" className="airflow-svg" role="img" aria-label="Modelled airflow around a NACA 2412 aerofoil. Potential-flow streamlines. Orange paths are a separation sketch, not a CFD result.">
    <defs>
      <linearGradient id="wingFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#8be9ff"/><stop offset="100%" stopColor="#2385b9"/></linearGradient>
      <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="#4f9fbd"/></marker>
    </defs>
    {[0, 1, 2, 3, 4, 5, 6, 7].map(i => <line key={i} x1="0" x2="740" y1={35 + i * 45} y2={35 + i * 45} stroke="#233445" strokeDasharray="2 8"/>)}
    {scene.streamlines.map((line, i) => <path key={i} d={line.d} className={line.role === 'separation-approximation' ? 'streamline wake' : 'streamline'} stroke={line.role === 'separation-approximation' ? '#f0a35c' : '#4f9fbd'} strokeWidth={line.role === 'separation-approximation' ? 1.7 : 1.15} opacity={line.role === 'separation-approximation' ? 0.95 : 0.72} style={{ animationDuration: `${duration}s` }} markerEnd="url(#arrow)">{line.role === 'separation-approximation' ? <title>Separation sketch. The orange path marks this model's separation station. It is not a measured stall location and not a CFD streamline.</title> : <title>Potential-flow streamline from the panel solution.</title>}</path>)}
    <path d={scene.foil} fill="url(#wingFill)" stroke="#a6efff" strokeWidth="1.6"/>
    {scene.bars.map((bar, i) => <line key={i} x1={bar.x1} y1={bar.y1} x2={bar.x2} y2={bar.y2} className="pressure-bar" stroke={bar.cp < 0 ? '#7ee0ff' : '#f0a35c'} strokeWidth={bar.cp < 0 ? 1.4 : 1.15} opacity={Number((0.35 + 0.6 * Math.min(1, Math.abs(bar.cp) / 1.5)).toFixed(3))}/>)}
    {scene.separation ? <circle className="sep-marker" cx={scene.separation.x} cy={scene.separation.y} r="3.5"/> : null}
    <text x="18" y="22" fill="#7794a9" fontSize="10" letterSpacing="2">FLOW FIELD / LOW-ORDER MODEL</text>
    <text x="548" y="22" fill="#7794a9" fontSize="10">NOT A CFD RESULT</text>
    <text x="590" y="365" fill="#7794a9" fontSize="10">NACA 2412</text>
  </svg>;
}

function Metric({ label, value, unit, icon: Icon, note, accent = false }: { label: string; value: string; unit: string; icon: typeof Gauge; note: string; accent?: boolean }) {
  return <div className="metric-card"><div className="metric-top"><span>{label}</span><Icon size={16} className={accent ? 'accent' : ''}/></div><div className="metric-value">{value}<small>{unit}</small></div><div className="metric-note">{note}</div></div>;
}

export default function Home() {
  const [speed, setSpeed] = useState(70);
  const [alpha, setAlpha] = useState(6);
  const [density, setDensity] = useState(1.225);
  const [chord, setChord] = useState(1.5);
  const [span, setSpan] = useState(8);
  const [tab, setTab] = useState('overview');
  const [showNotes, setShowNotes] = useState(false);
  const [design, setDesignState] = useState<WingDesign>(DEFAULT_DESIGN);
  const [baseline, setBaseline] = useState({ span: 8, chord: 1.5, design: DEFAULT_DESIGN });
  const [saved, setSaved] = useState<SavedCase[]>([]);
  const [safetyFields, setSafetyFieldsState] = useState<SafetyFields>(EMPTY_SAFETY_FIELDS);
  const setSafetyFields = (patch: Partial<SafetyFields>) => setSafetyFieldsState((current) => ({ ...current, ...patch }));
  const setDesign = (patch: Partial<WingDesign>) => setDesignState((current) => ({ ...current, ...patch }));
  const result = useMemo(() => calculateAero({ speed, alpha, density, chord, span }), [speed, alpha, density, chord, span]);
  const chart = useMemo(() => {
    const rows = [];
    for (let station = -8; station <= 24; station += 1) rows.push(polarAt(station, result.reynolds, result.aspect));
    return rows;
  }, [result.reynolds, result.aspect]);
  const copy = regimeCopy(result);
  const reset = () => { setSpeed(70); setAlpha(6); setDensity(1.225); setChord(1.5); setSpan(8); setDesignState(DEFAULT_DESIGN); setSafetyFieldsState(EMPTY_SAFETY_FIELDS); };
  const titles: Record<string, [string, string, string]> = {
    overview: ['OVERVIEW', 'Aircraft design dashboard', 'One view of the shared wing: the aerodynamic operating point, the spar, the preliminary checks, and any saved search.'],
    aero: ['AERODYNAMICS LAB', 'Aerodynamics laboratory', 'Explore aerofoil performance under changing atmospheric and geometric conditions. Forces update from the panel and boundary-layer model as the sliders move.'],
    materials: ['MATERIALS AND STRUCTURES', 'Materials and structures', 'A cantilever spar for one wing half. Design lift comes from mass and load factor. The elliptical shape is an assumption, not a result of the panel method.'],
    safety: ['FLIGHT SAFETY', 'Flight safety', 'Preliminary checks on the shared beam. Limits you leave empty stay unevaluated. This page does not certificate an aircraft.'],
    optimiser: ['DESIGN OPTIMISER', 'Design optimiser', 'A bounded grid over the shared wing. The search uses the existing beam and, when asked, the existing aerodynamic model.'],
  };
  const title = titles[tab] ?? titles.overview;
  return <main className="shell">
    <aside className="sidebar"><div className="brand"><div className="brand-mark"><Plane size={20}/></div><div><b>AERO<span>-X</span></b><small>FLIGHT SYSTEMS LAB</small></div></div>
      <div className="workspace-label">WORKSPACE</div><button className={`nav-item ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}><Layers3 size={17}/> Overview</button><button className={`nav-item ${tab === 'aero' ? 'active' : ''}`} onClick={() => setTab('aero')}><Wind size={17}/> Aerodynamics lab <span className="nav-dot"/></button><button className={`nav-item ${tab === 'materials' ? 'active' : ''}`} onClick={() => setTab('materials')}><Settings2 size={17}/> Materials & structures {tab === 'materials' && <span className="nav-dot"/>}</button><button className={`nav-item ${tab === 'safety' ? 'active' : ''}`} onClick={() => setTab('safety')}><ShieldCheck size={17}/> Flight safety {tab === 'safety' && <span className="nav-dot"/>}</button><button className={`nav-item ${tab === 'optimiser' ? 'active' : ''}`} onClick={() => setTab('optimiser')}><Zap size={17}/> Design optimiser {tab === 'optimiser' && <span className="nav-dot"/>}</button>
      <div className="sidebar-bottom"><div className="status-line"><span className="live-dot"/> SIMULATION ENGINE ONLINE</div><div className="version">AERO-X / BUILD 0.1.0</div></div>
    </aside>
    <section className="main-area"><header className="topbar"><div className="breadcrumb">AERO-X <span>/</span> {title[0]}</div><div className="top-right"><span className="environment"><span className="live-dot"/> LOCAL SIMULATION</span>{tab === 'aero' && <button className="help-button" title="Show model assumptions" onClick={() => setShowNotes(value => !value)}><CircleHelp size={17}/></button>}<div className="avatar">AX</div></div></header>
      <div className="content"><div className="page-heading"><div><div className="eyebrow">{tab === 'overview' ? 'AIRCRAFT DESIGN / SHARED CONFIGURATION' : 'AEROSPACE ENGINEERING / DIGITAL WIND TUNNEL'}</div><h1>{title[1]}</h1><p>{title[2]}</p></div><button className="reset-button" onClick={reset}><RotateCcw size={14}/> Reset parameters</button></div>
      {tab === 'overview' ? <OverviewDashboard speed={speed} alpha={alpha} density={density} span={span} chord={chord} design={design} baseline={baseline} saved={saved} result={result} fields={safetyFields} open={setTab}/> : tab === 'materials' ? <MaterialsStructures span={span} chord={chord} setSpan={setSpan} setChord={setChord} design={design} setDesign={setDesign} operatingLift={result.lift} operatingFinite={result.forcesFinite}/> : tab === 'safety' ? <FlightSafety span={span} chord={chord} setSpan={setSpan} setChord={setChord} design={design} setDesign={setDesign} operatingLift={result.lift} operatingFinite={result.forcesFinite} fields={safetyFields} setFields={setSafetyFields}/> : tab === 'optimiser' ? <DesignOptimiser span={span} chord={chord} setSpan={setSpan} setChord={setChord} speed={speed} alpha={alpha} density={density} design={design} setDesign={setDesign} baseline={baseline} setBaseline={setBaseline} saved={saved} setSaved={setSaved}/> : <>
      <div className="section-heading"><span>LIVE PERFORMANCE</span><span className="section-rule"/><span className="timestamp">LOW-ORDER MODEL / SI UNITS / NOT CFD</span></div>
      <div className="metrics-grid"><Metric label="LIFT FORCE" value={formatForce(result.lift, result.forcesFinite)} unit="N" icon={ArrowUpRight} note={result.forcesFinite ? 'Finite-wing lifting-line force' : 'Force result invalid'} accent/><Metric label="DRAG FORCE" value={formatForce(result.drag, result.forcesFinite)} unit="N" icon={ArrowDownRight} note={result.forcesFinite ? 'Finite-wing drag' : 'Force result invalid'}/><Metric label="LIFT / DRAG" value={formatModelNumber(result.ld, 2, result.forcesFinite)} unit=":1" icon={Gauge} note={result.forcesFinite ? 'Finite-wing lift-to-drag' : 'Force result invalid'}/><Metric label="REYNOLDS NUMBER" value={(result.reynolds / 1e6).toFixed(2)} unit="M" icon={Activity} note="Chord Reynolds number"/></div>
      <div className="workspace-grid"><section className="panel simulation-panel"><div className="panel-header"><div><div className="panel-kicker">VISUALISATION / 01</div><h2>Airflow simulation</h2></div><div className="panel-tools"><span className="model-pill">NOT CFD</span><span className="live-pill"><i/> LIVE</span></div></div><div className="visual-meta"><span>NACA 2412 / PANEL + BOUNDARY LAYER</span><span>α = {alpha.toFixed(1)}°</span></div><div className="visual-stage"><AirfoilView speed={speed} result={result}/><div className="flow-legend"><span><i className="legend-cyan"/> Potential flow</span><span><i className="legend-orange"/> Separation sketch</span><span><i className="legend-cyan"/> Cp suction</span><span><i className="legend-orange"/> Cp pressure</span></div></div><div className="visual-footer"><div><small>2D SECTION cl</small><b>{formatModelNumber(result.clSection, 3, result.forcesFinite)}</b></div><div><small>2D SECTION cd</small><b>{formatModelNumber(result.cdSection, 4, result.forcesFinite)}</b></div><div><small>DYNAMIC PRESSURE</small><b>{result.q.toFixed(0)} <em>Pa</em></b></div></div></section>
      <section className="panel controls-panel"><div className="panel-header"><div><div className="panel-kicker">INPUT PARAMETERS / 02</div><h2>Flight conditions</h2></div><SlidersHorizontal size={17} className="muted-icon"/></div>
        <div className="control-group"><div className="control-label"><label htmlFor="speed">Airspeed</label><b>{speed} <small>m/s</small></b></div><input id="speed" type="range" min="10" max="180" step="1" value={speed} onChange={e => setSpeed(+e.target.value)}/><div className="range-ends"><span>10 m/s</span><span>180 m/s</span></div></div>
        <div className="control-group"><div className="control-label"><label htmlFor="alpha">Angle of attack</label><b className={result.stall ? 'warning' : ''}>{alpha.toFixed(1)}°</b></div><input id="alpha" className="angle-range" type="range" min="-8" max="24" step="0.5" value={alpha} onChange={e => setAlpha(+e.target.value)}/><div className="range-ends"><span>-8°</span><span>24°</span></div><div className="angle-status"><span className={result.forcesFinite && result.regime === 'attached' ? 'live-dot' : 'warning-dot'}/>{copy.title} <span className="status-threshold">DISPLAY BOUNDARY {STALL_STATION.toFixed(2)}c</span></div></div>
        <div className="control-group"><div className="control-label"><label htmlFor="density">Air density</label><b>{density.toFixed(3)} <small>kg/m³</small></b></div><input id="density" type="range" min="0.3" max="1.3" step="0.005" value={density} onChange={e => setDensity(+e.target.value)}/><div className="range-ends"><span>High altitude</span><span>Sea level</span></div></div>
        <div className="control-divider"/><div className="subsection-title">WING GEOMETRY</div>
        <div className="geometry-row"><label htmlFor="chord">Chord length</label><div className="number-input"><input id="chord" type="number" min="0.2" max="8" step="0.1" value={chord} onChange={e => setChord(Math.max(.2, Math.min(8, +e.target.value || .2)))}/><span>m</span></div></div>
        <div className="geometry-row"><label htmlFor="span">Wing span</label><div className="number-input"><input id="span" type="number" min="1" max="40" step="0.5" value={span} onChange={e => setSpan(Math.max(1, Math.min(40, +e.target.value || 1)))}/><span>m</span></div></div>
        <div className="profile-select"><span>AEROFOIL PROFILE</span><button disabled>NACA 2412 <ChevronDown size={14}/></button></div>
      </section></div>
      <div className="bottom-grid"><section className="panel chart-panel"><div className="panel-header"><div><div className="panel-kicker">AEROFOIL CHARACTERISTICS / 03</div><h2>Lift coefficient vs angle of attack</h2></div><span className="chart-unit">2D SECTION / 3D WING</span></div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><LineChart data={chart} margin={{ top: 12, right: 16, left: -16, bottom: 2 }}><CartesianGrid stroke="#203244" strokeDasharray="3 5" vertical={false}/><XAxis type="number" dataKey="alpha" domain={[-8, 24]} tick={{ fill: '#7890a3', fontSize: 10 }} tickLine={false} axisLine={{ stroke: '#314456' }} label={{ value: 'ANGLE OF ATTACK (°)', position: 'insideBottom', offset: -1, fill: '#7890a3', fontSize: 9 }}/><YAxis tick={{ fill: '#7890a3', fontSize: 10 }} tickLine={false} axisLine={false}/><Tooltip contentStyle={{ background: '#101d2a', border: '1px solid #294156', borderRadius: 8, fontSize: 12 }} labelFormatter={v => `Angle: ${v}°`} formatter={(value, name) => [Number(value).toFixed(3), name === 'clWing' ? '3D finite-wing CL' : '2D section cl']}/><ReferenceLine x={alpha} stroke="#f0a35c" strokeDasharray="3 3"/><Line type="monotone" dataKey="cl" name="cl" stroke="#57c9ed" strokeWidth={2.2} dot={false} activeDot={{ r: 4, fill: '#57c9ed' }}/><Line type="monotone" dataKey="clWing" name="clWing" stroke="#5dd5a1" strokeWidth={1.5} dot={false} strokeDasharray="4 3"/></LineChart></ResponsiveContainer></div><p className="chart-note">Solid: 2D aerofoil section cl at the geometric angle and this Reynolds number. Dashed: 3D finite-wing CL from the elliptical lifting line, AR {result.aspect.toFixed(2)}. The wing value includes induced angle, so the curves are not the same coefficient. Neither is a measured polar.</p></section>
      <section className="panel readout-panel"><div className="panel-kicker">ENGINEERING READOUT / 04</div><h2>Current operating point</h2><div className={`condition-banner ${result.forcesFinite && result.regime === 'attached' ? '' : 'caution'}`}><span className="condition-icon">{result.forcesFinite && result.regime === 'attached' ? '✓' : '!'}</span><div><b>{copy.title}</b><small>{copy.detail}</small></div></div><div className="readout-line"><span>Wing planform area</span><b>{result.area.toFixed(2)} m²</b></div><div className="readout-line"><span>Aspect ratio</span><b>{result.aspect.toFixed(2)}</b></div><div className="readout-line"><span>Finite-wing lift coefficient</span><b>{formatModelNumber(result.cl, 3, result.forcesFinite)}</b></div><div className="readout-line"><span>Finite-wing drag coefficient</span><b>{formatModelNumber(result.cd, 4, result.forcesFinite)}</b></div><div className="readout-line"><span>Induced drag coefficient</span><b>{formatModelNumber(result.cdInduced, 4, result.forcesFinite)}</b></div><div className="readout-line"><span>Induced angle</span><b>{result.forcesFinite ? `${result.alphaInduced.toFixed(2)}°` : 'invalid'}</b></div><div className="readout-line"><span>Inviscid 2D section cl</span><b>{result.clInviscid.toFixed(3)}</b></div><div className="readout-line"><span>2D section profile cd</span><b>{formatModelNumber(result.cdSection, 4, result.forcesFinite)}</b></div><div className="readout-line"><span>Separation factor</span><b>{formatSeparationFactor(result.separationFactor, result.forcesFinite, result.upperBoundary.integrationFailed || result.lowerBoundary.integrationFailed)}</b></div><p className="state-note">The 2D section cd is the aerofoil at the geometric angle. Finite-wing drag accounts for induced angle, so the profile drag inside it is taken at a different angle and need not match the section value. This is the same model sampled twice, not a measurement and not a discrepancy to be removed.</p><p className="state-note">{describeBoundary(result.upperBoundary)}</p><p className="state-note">{describeBoundary(result.lowerBoundary)}</p><details className="assumptions" open={showNotes} onToggle={event => setShowNotes(event.currentTarget.open)}><summary>ASSUMPTIONS AND LIMITS</summary><ul>
        <li>Geometry is the NACA four-digit camber and thickness equations. The thickness polynomial uses a₄ = −0.1036 so the trailing edge closes. NACA Report 460 published a₄ = −0.1015, which leaves a small trailing-edge gap.</li>
        <li>Inviscid flow is an incompressible Hess–Smith panel solution. Surface colour and the Cp bars are that pressure field. They are not a viscous or CFD pressure.</li>
        <li>Streamlines are integrated in the same Hess–Smith solution that produced the forces, at the geometric angle of attack. Airspeed does not change that incompressible field. It changes Reynolds number, and therefore the separation station, and it changes how fast the dashes move. After separation, nearby tracers are blended toward the freestream. Those orange paths are a visual approximation of the separation station, not Navier–Stokes streamlines.</li>
        <li>Attached profile drag is the Squire–Young wake integral. After separation, drag is the larger of that value and Kirchhoff’s normal force with leading-edge suction recovery, plus Schlichting flat-plate skin friction, cf = 0.074 Re^(−1/5) on both sides.</li>
        <li>Wing lift and drag add Prandtl’s elliptical induced angle and induced drag. A rectangular wing has more induced drag than this lower bound. No Oswald factor is inserted. Past separation this is the same algebra continued, without the linear-section assumption.</li>
        <li>Viscosity is fixed at the ISA sea-level value 1.7894×10⁻⁵ Pa·s. Density is independent, so Reynolds number does not follow a standard atmosphere.</li>
        <li>The aerodynamic model is a low-order approximation: an incompressible panel method, Thwaites’ laminar march, Michel’s transition criterion, and Head’s turbulent march. It is not a Navier–Stokes solution. Eight section scalars were compared with NACA Report 586, Table I. That comparison is not a polar, and the operating point on this page is still this model.</li>
        <li>If laminar separation occurs before Michel’s criterion, the model assumes a short bubble and restarts Head at that station with an imposed shape factor H = 1.4. It does not calculate bubble growth, transition in the separated shear layer, or reattachment. That restart is not labelled as natural transition.</li>
        <li>Where Head meets H = 2.4, the station is this model’s separation criterion. It moves when the panel count or the starting shape factor changes. The 0.80c wording is a display boundary on that station, not a measured stall angle. A non-finite Head step is reported as an integration failure and is not counted as separation.</li>
        <li>There is no displacement-thickness coupling, compressibility, sweep, or wind-tunnel polar in these numbers.</li>
      </ul></details></section></div>
      <footer className="footer-note"><span>AERO-X ENGINEERING LABORATORY</span><span>Low-order panel and boundary-layer model · Not CFD · Not for aircraft design or flight decisions</span></footer>
      </>}
      </div>
    </section>
  </main>;
}
