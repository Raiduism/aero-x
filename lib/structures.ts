/**
 * Cantilever beam for one wing half. This is not a finite-element model and
 * not a complete aircraft loads analysis.
 *
 * Coordinates: y = 0 at the fixed root, y = s at the free tip, s = b/2.
 * The load is an assumed elliptical lift per unit span,
 *   ℓ(y) = ℓ0 √(1 − (y/s)²),  ℓ0 = 4W / (π s) = 2L / (π s),
 * where W = L/2 is the lift on one wing and L = n m g is the design lift
 * of the whole aircraft. Standard gravity is g = 9.80665 m/s².
 * The integral of ℓ from root to tip is W. The root bending moment of that
 * distribution is M(0) = L b / (3π). A uniform load is not substituted.
 *
 * Integration, N equal steps, trapezoidal rule:
 *   V(s) = 0, M(s) = 0
 *   moving toward the root, ΔV = ℓ_avg Δy and ΔM = V_avg Δy
 * Deflection magnitude, from the built-in root:
 *   θ(0) = 0, v(0) = 0
 *   Δθ = (M_avg / EI) Δy,  Δv = θ_avg Δy
 * v is the upward deflection. The drawing may exaggerate it; the number is
 * this integration.
 *
 * Hollow rectangle, outer width B, outer height H, wall t:
 *   I = [B H³ − (B − 2t)(H − 2t)³] / 12
 *   σ = M c / I,  c = H/2
 * Stress is the root outer-fibre bending stress. Shear stress, torsion,
 * buckling and spar-cap cutouts are omitted. The same I and E are used at
 * every station.
 */

import { materialById, type CompositeMaterial, type Material, type MetalMaterial } from './materials';

export const STANDARD_GRAVITY = 9.80665;
export const BEAM_STATIONS = 400;
/** NACA 2412 maximum thickness is 12% of chord. Used only as a fit warning. */
export const NACA_2412_THICKNESS_RATIO = 0.12;

export type WingStructureInput = {
  /** Full wingspan b, m. */
  span: number;
  /** Reference chord, m. Shared with the aerodynamic page. Not used in EI. */
  chord: number;
  /** Aircraft mass, kg. An input, not a weighed aeroplane. */
  mass: number;
  /** Positive design load factor n. Design lift is n m g, not the panel lift. */
  loadFactor: number;
  /** Outer spar width B, m. */
  sparWidth: number;
  /** Outer spar height H, m. */
  sparHeight: number;
  /** Wall thickness t, m. */
  wallThickness: number;
  materialId: string;
};

export type BeamSample = {
  /** m from the root. */
  y: number;
  /** N/m, elliptical. */
  load: number;
  /** N·m. */
  moment: number;
  /** m, upward. */
  deflection: number;
};

export type StructureFailure = { ok: false; reason: string };

export type StructureSuccess = {
  ok: true;
  material: Material;
  designLift: number;
  liftPerWing: number;
  semiSpan: number;
  /** ℓ0, N/m. */
  rootLoad: number;
  rootShear: number;
  rootMoment: number;
  /** Closed-form check L b / (3π). */
  rootMomentCheck: number;
  secondMoment: number;
  sectionArea: number;
  /** Root outer-fibre bending stress, Pa. */
  bendingStress: number;
  tipDeflection: number;
  sparMassOneWing: number;
  sparMassBothWings: number;
  /** E/ρ, N·m/kg. */
  specificStiffness: number;
  metal: {
    /** Typical tensile yield / bending stress. */
    yieldFactor: number;
    specificYieldStrength: number;
  } | null;
  composite: {
    /** 0° tensile strength / bending stress. Not a yield factor. */
    tensionRatio: number;
    /** 0° compression strength / bending stress. Not a yield factor. */
    compressionRatio: number;
    specificTensileStrength0: number;
  } | null;
  /** True when H is taller than 12% of the shared chord. */
  thicknessExceedsSection: boolean;
  sectionThickness: number;
  stations: BeamSample[];
  loadName: 'elliptical';
};

export type StructureResult = StructureSuccess | StructureFailure;

export function ellipticalRootLoad(liftPerWing: number, semiSpan: number): number {
  return (4 * liftPerWing) / (Math.PI * semiSpan);
}

export function ellipticalRootMoment(totalLift: number, span: number): number {
  return (totalLift * span) / (3 * Math.PI);
}

export function hollowRectangle(width: number, height: number, thickness: number): { secondMoment: number; area: number } | StructureFailure {
  if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(thickness)) {
    return { ok: false, reason: 'Spar width, height and wall thickness have to be finite numbers.' };
  }
  if (width <= 0 || height <= 0 || thickness <= 0) {
    return { ok: false, reason: 'Spar width, height and wall thickness have to be greater than zero.' };
  }
  if (2 * thickness >= width || 2 * thickness >= height) {
    return { ok: false, reason: 'The walls meet or cross. Twice the wall thickness has to be less than both the width and the height, so the box stays hollow.' };
  }
  const innerWidth = width - 2 * thickness;
  const innerHeight = height - 2 * thickness;
  const secondMoment = (width * height ** 3 - innerWidth * innerHeight ** 3) / 12;
  const area = width * height - innerWidth * innerHeight;
  if (!(secondMoment > 0) || !(area > 0) || !Number.isFinite(secondMoment) || !Number.isFinite(area)) {
    return { ok: false, reason: 'The spar section did not produce a positive second moment of area.' };
  }
  return { secondMoment, area };
}

export function integrateCantilever(
  loadAt: (y: number) => number,
  semiSpan: number,
  flexuralRigidity: number,
  stations = BEAM_STATIONS,
): { y: number[]; load: number[]; shear: number[]; moment: number[]; deflection: number[] } | StructureFailure {
  if (!Number.isFinite(semiSpan) || semiSpan <= 0) return { ok: false, reason: 'Semi-span has to be positive.' };
  if (!Number.isFinite(flexuralRigidity) || flexuralRigidity <= 0) return { ok: false, reason: 'Flexural rigidity EI has to be positive.' };
  if (!Number.isInteger(stations) || stations < 20) return { ok: false, reason: 'The beam integration needs at least 20 stations.' };
  const y = Array.from({ length: stations + 1 }, (_, index) => (index / stations) * semiSpan);
  const load = y.map((station) => loadAt(station));
  if (load.some((value) => !Number.isFinite(value) || value < 0)) {
    return { ok: false, reason: 'The spanwise load has to be finite and upward.' };
  }
  const shear = Array<number>(stations + 1).fill(0);
  const moment = Array<number>(stations + 1).fill(0);
  for (let index = stations - 1; index >= 0; index -= 1) {
    const dy = y[index + 1] - y[index];
    const shearStep = 0.5 * (load[index] + load[index + 1]) * dy;
    shear[index] = shear[index + 1] + shearStep;
    moment[index] = moment[index + 1] + 0.5 * (shear[index] + shear[index + 1]) * dy;
  }
  const slope = Array<number>(stations + 1).fill(0);
  const deflection = Array<number>(stations + 1).fill(0);
  for (let index = 0; index < stations; index += 1) {
    const dy = y[index + 1] - y[index];
    const slopeStep = (0.5 * (moment[index] + moment[index + 1]) / flexuralRigidity) * dy;
    slope[index + 1] = slope[index] + slopeStep;
    deflection[index + 1] = deflection[index] + 0.5 * (slope[index] + slope[index + 1]) * dy;
  }
  return { y, load, shear, moment, deflection };
}

function sampleBeam(integrated: { y: number[]; load: number[]; moment: number[]; deflection: number[] }): BeamSample[] {
  const last = integrated.y.length - 1;
  const stride = Math.max(1, Math.floor(last / 40));
  const samples: BeamSample[] = [];
  for (let index = 0; index <= last; index += stride) {
    samples.push({
      y: integrated.y[index],
      load: integrated.load[index],
      moment: integrated.moment[index],
      deflection: integrated.deflection[index],
    });
  }
  if (samples[samples.length - 1].y !== integrated.y[last]) {
    samples.push({
      y: integrated.y[last],
      load: integrated.load[last],
      moment: integrated.moment[last],
      deflection: integrated.deflection[last],
    });
  }
  return samples;
}

function metalMargin(material: MetalMaterial, stress: number): StructureSuccess['metal'] {
  return {
    yieldFactor: material.tensileYield / stress,
    specificYieldStrength: material.tensileYield / material.density,
  };
}

function compositeMargin(material: CompositeMaterial, stress: number): StructureSuccess['composite'] {
  return {
    tensionRatio: material.tensileStrength0 / stress,
    compressionRatio: material.compressiveStrength0 / stress,
    specificTensileStrength0: material.tensileStrength0 / material.density,
  };
}

export function analyzeWing(input: WingStructureInput): StructureResult {
  const material = materialById(input.materialId);
  if (!material) return { ok: false, reason: 'That material is not in the database.' };
  if (!Number.isFinite(input.span) || input.span <= 0) return { ok: false, reason: 'Wingspan has to be positive.' };
  if (!Number.isFinite(input.chord) || input.chord <= 0) return { ok: false, reason: 'Chord has to be positive.' };
  if (!Number.isFinite(input.mass) || input.mass <= 0) return { ok: false, reason: 'Aircraft mass has to be positive.' };
  if (!Number.isFinite(input.loadFactor) || input.loadFactor <= 0) return { ok: false, reason: 'Load factor has to be positive.' };

  const section = hollowRectangle(input.sparWidth, input.sparHeight, input.wallThickness);
  if ('ok' in section) return section;

  const designLift = input.loadFactor * input.mass * STANDARD_GRAVITY;
  const liftPerWing = designLift / 2;
  const semiSpan = input.span / 2;
  const rootLoad = ellipticalRootLoad(liftPerWing, semiSpan);
  const integrated = integrateCantilever(
    (y) => rootLoad * Math.sqrt(Math.max(0, 1 - (y / semiSpan) ** 2)),
    semiSpan,
    material.youngsModulus * section.secondMoment,
  );
  if ('ok' in integrated) return integrated;

  const rootShear = integrated.shear[0];
  const rootMoment = integrated.moment[0];
  const rootMomentCheck = ellipticalRootMoment(designLift, input.span);
  const outerFibre = input.sparHeight / 2;
  const bendingStress = (rootMoment * outerFibre) / section.secondMoment;
  const tipDeflection = integrated.deflection[integrated.deflection.length - 1];
  const sparMassOneWing = material.density * section.area * semiSpan;
  const values = [designLift, liftPerWing, rootLoad, rootShear, rootMoment, bendingStress, tipDeflection, sparMassOneWing];
  if (values.some((value) => !Number.isFinite(value))) {
    return { ok: false, reason: 'The beam result was not finite. Check the spar size and the load.' };
  }

  const sectionThickness = NACA_2412_THICKNESS_RATIO * input.chord;
  return {
    ok: true,
    material,
    designLift,
    liftPerWing,
    semiSpan,
    rootLoad,
    rootShear,
    rootMoment,
    rootMomentCheck,
    secondMoment: section.secondMoment,
    sectionArea: section.area,
    bendingStress,
    tipDeflection,
    sparMassOneWing,
    sparMassBothWings: 2 * sparMassOneWing,
    specificStiffness: material.youngsModulus / material.density,
    metal: material.kind === 'metal' ? metalMargin(material, bendingStress) : null,
    composite: material.kind === 'composite' ? compositeMargin(material, bendingStress) : null,
    thicknessExceedsSection: input.sparHeight > sectionThickness,
    sectionThickness,
    stations: sampleBeam(integrated),
    loadName: 'elliptical',
  };
}

export function compareMaterials(input: WingStructureInput): StructureResult[] {
  return ['al-2024-t3', 'al-6061-t6', 'al-7075-t6', 'hexply-8552-as4'].map((materialId) => analyzeWing({ ...input, materialId }));
}
