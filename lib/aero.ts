/**
 * Section and finite-wing coefficients for the NACA 2412 laboratory.
 *
 * This is a low-order model. It is not a Navier–Stokes solution and it does
 * not embed a wind-tunnel polar.
 *
 * Section:
 *   Inviscid lift and surface speed come from the Hess–Smith panel method.
 *   While both surface boundary layers stay attached, profile drag is the
 *   Squire–Young wake integral on the Thwaites / Michel / Head march.
 *   After separation, the section force is rebuilt with Kirchhoff's
 *   free-streamline factor in the static form used by Beddoes:
 *     Cn = Cn_potential * ((1 + √f) / 2)^2
 *     Ca = Ca_potential * √f
 *   f is the chordwise station of separation from the integral march
 *   (f = 1 while the surface is attached). Skin friction added to that
 *   pressure drag is Schlichting's turbulent flat-plate law on both sides,
 *     cf = 0.074 Re^(−1/5),  cd_f = 2 cf,
 *   which has no form factor and no camber. Profile drag is the larger of
 *   that sum and the Squire–Young value at the last attached station, so a
 *   station that has only just separated does not report less drag than the
 *   attached wake formula. Squire–Young itself is outside its derivation
 *   once the layer has left the wall.
 *   A station aft of x/c = 0.97 is kept attached. The march already stops
 *   at x/c = 0.99 because the inviscid trailing-edge spike is a sharp-edge
 *   artefact; reporting it as stall would be a numerical cutoff, not a
 *   measured stall angle.
 *
 * Wing, using only the chord and span entered in the laboratory:
 *   S = chord × span, unswept and untapered.
 *   Prandtl's elliptical lifting line supplies α_i = CL / (π AR) and
 *   CD_i = CL² / (π AR). A rectangular wing produces more induced drag
 *   than this. The elliptical value is the planar lower bound. No Oswald
 *   factor is added, because the planform inputs do not determine one.
 *
 * Air:
 *   Dynamic pressure uses the density slider. Dynamic viscosity is fixed at
 *   the ISA sea-level value 1.7894×10⁻⁵ Pa·s, so Re = ρ V c / μ does not
 *   follow a standard-atmosphere temperature lapse.
 *
 * The panel solution is incompressible and one-way coupled: displacement
 * thickness is not fed back into the tangency condition. Separation
 * therefore moves forward later than it does in a tunnel or in a
 * viscous–inviscid solver. Compressibility, sweep and rotation are absent.
 */

import { marchBoundaryLayer, type SurfaceMarch } from './boundaryLayer';
import { solveNaca2412, type PanelSolution } from './panel';
import type { XY } from './naca';

/** ISA sea-level dynamic viscosity, Pa·s. */
export const AIR_VISCOSITY = 1.7894e-5;

/** Stations aft of this are the trimmed trailing-edge artefact, not stall. */
export const ATTACHED_STATION = 0.97;

/**
 * Display boundary on this model's own separation station.
 * Forward of 0.80c the view calls the state a predicted stall region.
 * It is not a published stall angle.
 */
export const STALL_STATION = 0.8;

export type AeroInput = {
  speed: number;
  alpha: number;
  density: number;
  chord: number;
  span: number;
};

export type FlowRegime = 'attached' | 'separating' | 'stalled';

/** Labels for one surface. Stations are model events. None of them is a wind-tunnel measurement. */
export type SurfaceBoundaryState = {
  surface: 'upper' | 'lower';
  /** Michel's criterion. Null when laminar separation occurred first. */
  naturalTransitionX: number | null;
  /** Thwaites λ = −0.09. Null when that criterion was not the one that ended the laminar march. */
  laminarSeparationX: number | null;
  /** Assumed restart of Head at H = 1.4. Null when that assumption is not used. */
  shortBubbleRestartX: number | null;
  /** Finite Head criterion. Null when Head stayed attached or the march failed. */
  turbulentSeparationX: number | null;
  integrationFailed: boolean;
  /** Where Head starts. Equal to the Michel station or the assumed restart. 1 means Head was not started. */
  headStartX: number;
};

export function boundaryState(march: SurfaceMarch): SurfaceBoundaryState {
  return {
    surface: march.surface,
    naturalTransitionX: march.naturalTransitionX,
    laminarSeparationX: march.laminarSeparationX,
    shortBubbleRestartX: march.shortBubbleRestartX,
    turbulentSeparationX: march.turbulentSeparation ? march.separationX : null,
    integrationFailed: march.integrationFailed,
    headStartX: march.transitionX,
  };
}

export type SurfacePressure = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  xm: number;
  ym: number;
  nx: number;
  ny: number;
  cp: number;
};

export type SectionState = {
  alpha: number;
  reynolds: number;
  cl: number;
  cd: number;
  clInviscid: number;
  /** Profile drag actually used. Squire–Young while attached, Kirchhoff plus flat-plate friction after separation. */
  cdProfile: number;
  /** Squire–Young value even when its assumptions have been left. */
  cdSquireYoung: number;
  squireYoungValid: boolean;
  /** False when a march is non-finite or a force value is non-finite. The force equations are still the ones above. */
  forcesFinite: boolean;
  separationFactor: number;
  regime: FlowRegime;
  separationX: number;
  separationY: number;
  separationSurface: 'upper' | 'lower' | 'none';
  transitionX: number;
  upperBoundary: SurfaceBoundaryState;
  lowerBoundary: SurfaceBoundaryState;
  nodes: XY[];
  pressure: SurfacePressure[];
  solution: PanelSolution;
};

export type AeroResult = {
  lift: number;
  drag: number;
  ld: number;
  reynolds: number;
  /** Wing lift coefficient, L / (q S). */
  cl: number;
  /** Wing drag coefficient, D / (q S). */
  cd: number;
  clSection: number;
  cdSection: number;
  clInviscid: number;
  cdProfile: number;
  cdInduced: number;
  cdSquireYoung: number;
  squireYoungValid: boolean;
  forcesFinite: boolean;
  q: number;
  area: number;
  aspect: number;
  alphaInduced: number;
  stall: boolean;
  regime: FlowRegime;
  separationFactor: number;
  separationX: number;
  separationY: number;
  separationSurface: 'upper' | 'lower' | 'none';
  transitionX: number;
  upperBoundary: SurfaceBoundaryState;
  lowerBoundary: SurfaceBoundaryState;
  nodes: XY[];
  pressure: SurfacePressure[];
  /**
   * Hess–Smith solution at the geometric angle of attack.
   * The field is normalised by freestream speed, so airspeed does not change
   * these singularities. Airspeed enters the picture through Reynolds number,
   * which moves the separation station, and through the streamline animation.
   */
  panel: PanelSolution;
};

const sectionCache = new Map<string, SectionState>();

export function reynoldsNumber(density: number, speed: number, chord: number): number {
  return (Math.max(density, 0) * Math.max(speed, 0) * Math.max(chord, 1e-6)) / AIR_VISCOSITY;
}

export function sectionAt(alphaDeg: number, reynolds: number): SectionState {
  const alpha = clamp(alphaDeg, -40, 40);
  const re = Math.max(reynolds, 1);
  const key = `${Math.round(alpha * 100)}_${Math.round(re)}`;
  const cached = sectionCache.get(key);
  if (cached) return cached;
  const state = sectionFromSolution(solveNaca2412(alpha), re, alpha);
  sectionCache.set(key, state);
  if (sectionCache.size > 2500) sectionCache.clear();
  return state;
}

/** Same force assembly as sectionAt, on a supplied panel solution. */
export function sectionFromSolution(solution: PanelSolution, re: number, alpha: number): SectionState {
  const boundary = marchBoundaryLayer(solution, re);
  const upper = stationOf(boundary.upper);
  const lower = stationOf(boundary.lower);
  const useLower = lower.factor < upper.factor;
  const chosen = useLower ? lower : upper;
  const factor = chosen.factor;
  const regime = regimeOf(factor);
  const surface = factor >= 1 ? 'none' : useLower ? 'lower' : 'upper';
  const march = useLower ? boundary.lower : boundary.upper;

  const clInviscid = solution.cl;
  const ca = Math.cos(solution.alphaRad);
  const sa = Math.sin(solution.alphaRad);
  const cnPotential = clInviscid * ca + solution.cdPressure * sa;
  const caPotential = solution.cdPressure * ca - clInviscid * sa;
  const root = Math.sqrt(factor);
  const kirchhoff = (0.5 * (1 + root)) ** 2;
  const normal = kirchhoff * cnPotential;
  const axial = root * caPotential;
  const cl = normal * ca - axial * sa;
  const cdFromForces = normal * sa + axial * ca;

  const squireYoungValid = factor >= 1 && Number.isFinite(boundary.cdSquireYoung);
  const flatPlate = 2 * 0.074 * Math.pow(re, -0.2);
  const separatedDrag = Math.max(cdFromForces, 0) + flatPlate;
  const cdProfile = factor >= 1 ? Math.max(boundary.cdSquireYoung, 0) : Math.max(boundary.cdSquireYoung, separatedDrag);

  const pressure: SurfacePressure[] = solution.panels.map((panel, index) => ({
    x1: panel.x1,
    y1: panel.y1,
    x2: panel.x2,
    y2: panel.y2,
    xm: panel.xm,
    ym: panel.ym,
    nx: panel.nx,
    ny: panel.ny,
    cp: solution.cp[index],
  }));

  const state: SectionState = {
    alpha,
    reynolds: re,
    cl,
    cd: cdProfile,
    clInviscid,
    cdProfile,
    cdSquireYoung: boundary.cdSquireYoung,
    squireYoungValid,
    forcesFinite: !boundary.upper.integrationFailed
      && !boundary.lower.integrationFailed
      && Number.isFinite(cl)
      && Number.isFinite(cdProfile)
      && Number.isFinite(boundary.cdSquireYoung),
    separationFactor: factor,
    regime,
    separationX: factor >= 1 ? 1 : march.separationX,
    separationY: factor >= 1 ? 0 : march.separationY,
    separationSurface: surface,
    transitionX: march.transitionX,
    upperBoundary: boundaryState(boundary.upper),
    lowerBoundary: boundaryState(boundary.lower),
    nodes: solution.nodes,
    pressure,
    solution,
  };
  return state;
}

export type WingState = {
  cl: number;
  cd: number;
  cdProfile: number;
  cdInduced: number;
  alphaInduced: number;
  section: SectionState;
};

const sampleCache = new Map<number, { alpha: number; cl: number; cd: number }[]>();

/** Half-degree section samples so the lifting-line iteration does not resolve a new panel field for every induced angle. */
function sectionSamples(reynolds: number): { alpha: number; cl: number; cd: number }[] {
  const key = Math.round(reynolds);
  const hit = sampleCache.get(key);
  if (hit) return hit;
  const samples: { alpha: number; cl: number; cd: number }[] = [];
  for (let alpha = -18; alpha <= 36; alpha += 1) {
    const section = sectionAt(alpha, key);
    samples.push({ alpha, cl: section.cl, cd: section.cd });
  }
  if (sampleCache.size >= 6) sampleCache.clear();
  sampleCache.set(key, samples);
  return samples;
}

function sampleSection(reynolds: number, alpha: number): { cl: number; cd: number } {
  const samples = sectionSamples(reynolds);
  if (alpha < samples[0].alpha || alpha > samples[samples.length - 1].alpha) {
    const exact = sectionAt(alpha, reynolds);
    return { cl: exact.cl, cd: exact.cd };
  }
  const index = (alpha - samples[0].alpha);
  const slot = Math.min(samples.length - 2, Math.max(0, Math.floor(index)));
  const weight = Math.min(1, Math.max(0, index - slot));
  return {
    cl: samples[slot].cl * (1 - weight) + samples[slot + 1].cl * weight,
    cd: samples[slot].cd * (1 - weight) + samples[slot + 1].cd * weight,
  };
}

/** Elliptical lifting line wrapped around the viscous section polar. */
export function wingAt(alphaDeg: number, reynolds: number, aspectRatio: number): WingState {
  const ar = Math.max(aspectRatio, 0.4);
  let cl = sampleSection(reynolds, alphaDeg).cl;
  let alphaInduced = 0;
  for (let pass = 0; pass < 12; pass++) {
    alphaInduced = (cl / (Math.PI * ar)) * (180 / Math.PI);
    const next = sampleSection(reynolds, alphaDeg - alphaInduced).cl;
    if (Math.abs(next - cl) < 1e-4) {
      cl = next;
      break;
    }
    cl = 0.5 * cl + 0.5 * next;
  }
  alphaInduced = (cl / (Math.PI * ar)) * (180 / Math.PI);
  const atEffective = sampleSection(reynolds, alphaDeg - alphaInduced);
  const cdInduced = (cl * cl) / (Math.PI * ar);
  return {
    cl,
    cd: atEffective.cd + cdInduced,
    cdProfile: atEffective.cd,
    cdInduced,
    alphaInduced,
    section: sectionAt(alphaDeg, reynolds),
  };
}

export function calculateAero(input: AeroInput): AeroResult {
  const speed = clamp(input.speed, 0, 400);
  const alpha = input.alpha;
  const density = clamp(input.density, 0.05, 2);
  const chord = clamp(input.chord, 0.05, 20);
  const span = clamp(input.span, 0.2, 80);
  const area = chord * span;
  const aspect = span / chord;
  const reynolds = reynoldsNumber(density, speed, chord);
  const q = 0.5 * density * speed * speed;
  const wing = wingAt(alpha, reynolds, aspect);
  const section = wing.section;
  const lift = q * area * wing.cl;
  const drag = q * area * wing.cd;
  const ld = drag > 1e-9 ? lift / drag : 0;
  return {
    lift,
    drag,
    ld,
    reynolds,
    cl: wing.cl,
    cd: wing.cd,
    clSection: section.cl,
    cdSection: section.cd,
    clInviscid: section.clInviscid,
    cdProfile: wing.cdProfile,
    cdInduced: wing.cdInduced,
    cdSquireYoung: section.cdSquireYoung,
    squireYoungValid: section.squireYoungValid,
    forcesFinite: section.forcesFinite && Number.isFinite(wing.cl) && Number.isFinite(wing.cd) && Number.isFinite(lift) && Number.isFinite(drag),
    q,
    area,
    aspect,
    alphaInduced: wing.alphaInduced,
    stall: section.regime === 'stalled',
    regime: section.regime,
    separationFactor: section.separationFactor,
    separationX: section.separationX,
    separationY: section.separationY,
    separationSurface: section.separationSurface,
    transitionX: section.transitionX,
    upperBoundary: section.upperBoundary,
    lowerBoundary: section.lowerBoundary,
    nodes: section.nodes,
    pressure: section.pressure,
    panel: section.solution,
  };
}

export function polarAt(alpha: number, reynolds: number, aspectRatio: number): { alpha: number; cl: number; clWing: number } {
  const section = sectionAt(alpha, reynolds);
  const wing = wingAt(alpha, reynolds, aspectRatio);
  return { alpha, cl: section.cl, clWing: wing.cl };
}

function stationOf(surface: SurfaceMarch): { factor: number } {
  if (!surface.separated || surface.separationX >= ATTACHED_STATION) return { factor: 1 };
  return { factor: Math.max(0, Math.min(1, surface.separationX)) };
}

function regimeOf(factor: number): FlowRegime {
  if (factor >= ATTACHED_STATION) return 'attached';
  if (factor >= STALL_STATION) return 'separating';
  return 'stalled';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
