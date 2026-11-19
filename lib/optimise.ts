/**
 * Bounded grid search over the existing beam and, when requested, the
 * existing aerodynamic model. It is not a genetic algorithm and it does not
 * use gradients. A configuration that breaks an active constraint is feasible:
 * false and is never returned as the preferred design.
 */

import { materialById } from './materials';
import { analyzeWing, type WingStructureInput } from './structures';

export const MAX_CONFIGURATIONS = 1500;

export type Axis = { min: number; max: number; step: number };
export type ObjectiveId = 'mass' | 'ld' | 'deflection';

export type SearchConstraints = {
  /** N, from the aerodynamic model at the shared flight condition. */
  minAeroLift: number | null;
  /** Pa. */
  maxBendingStress: number | null;
  /** m. */
  maxTipDeflection: number | null;
  minFactor: number | null;
};

export type AeroSample = { lift: number; ld: number; forcesFinite: boolean };

export type SearchRequest = {
  span: Axis;
  chord: Axis;
  sparWidth: Axis;
  sparHeight: Axis;
  wallThickness: Axis;
  materialIds: string[];
  objectives: ObjectiveId[];
  constraints: SearchConstraints;
  mass: number;
  loadFactor: number;
};

export type DesignPoint = {
  span: number;
  chord: number;
  sparWidth: number;
  sparHeight: number;
  wallThickness: number;
  materialId: string;
  materialName: string;
  mass: number | null;
  stress: number | null;
  deflection: number | null;
  lift: number | null;
  ld: number | null;
  factor: number | null;
  factorKind: 'yield' | 'directional' | null;
  feasible: boolean;
  violations: string[];
};

export type SearchResult = {
  ok: true;
  evaluated: number;
  feasible: number;
  points: DesignPoint[];
  pareto: DesignPoint[];
  preferred: DesignPoint | null;
  objectives: ObjectiveId[];
  preference: string;
};

export type SearchFailure = { ok: false; reason: string };

function axisValues(axis: Axis, label: string): number[] | string {
  if (!Number.isFinite(axis.min) || !Number.isFinite(axis.max) || !Number.isFinite(axis.step)) return `${label} needs finite minimum, maximum and increment.`;
  if (!(axis.step > 0)) return `${label} increment has to be greater than zero.`;
  if (axis.max < axis.min) return `${label} maximum is below its minimum.`;
  const count = Math.floor((axis.max - axis.min) / axis.step + 1e-8) + 1;
  if (count > 20) return `${label} would take ${count} values. Use a larger increment.`;
  if (count < 1) return `${label} produced no values.`;
  const values: number[] = [];
  for (let index = 0; index < count; index += 1) values.push(Number((axis.min + index * axis.step).toPrecision(12)));
  return values;
}

function invalidConstraint(constraints: SearchConstraints): string | null {
  const fields: [number | null, string][] = [
    [constraints.minAeroLift, 'Minimum aerodynamic lift'],
    [constraints.maxBendingStress, 'Maximum bending stress'],
    [constraints.maxTipDeflection, 'Maximum tip deflection'],
    [constraints.minFactor, 'Minimum factor'],
  ];
  for (const [value, label] of fields) {
    if (value !== null && (!Number.isFinite(value) || value <= 0)) return `${label} has to be empty or a positive number.`;
  }
  return null;
}

function activeLimit(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value > 0;
}

function metric(point: DesignPoint, objective: ObjectiveId): number {
  if (objective === 'mass') return point.mass ?? Number.POSITIVE_INFINITY;
  if (objective === 'deflection') return point.deflection ?? Number.POSITIVE_INFINITY;
  return point.ld ?? Number.NEGATIVE_INFINITY;
}

function dominates(candidate: DesignPoint, other: DesignPoint, objectives: ObjectiveId[]): boolean {
  let better = false;
  for (const objective of objectives) {
    const left = metric(candidate, objective);
    const right = metric(other, objective);
    const higherBetter = objective === 'ld';
    if (higherBetter ? left < right : left > right) return false;
    if (left !== right) better = true;
  }
  return better;
}

function preferenceScore(point: DesignPoint, feasible: DesignPoint[], objectives: ObjectiveId[]): number {
  let total = 0;
  for (const objective of objectives) {
    const values = feasible.map((item) => metric(item, objective));
    const low = Math.min(...values);
    const high = Math.max(...values);
    const value = metric(point, objective);
    if (high === low) total += 1;
    else total += objective === 'ld' ? (value - low) / (high - low) : (high - value) / (high - low);
  }
  return total / objectives.length;
}

export function searchDesigns(request: SearchRequest, aeroAt: (span: number, chord: number) => AeroSample): SearchResult | SearchFailure {
  const constraintError = invalidConstraint(request.constraints);
  if (constraintError) return { ok: false, reason: constraintError };
  if (request.objectives.length === 0) return { ok: false, reason: 'Choose at least one objective.' };
  if (request.materialIds.length === 0) return { ok: false, reason: 'Choose at least one material.' };
  const unknown = request.materialIds.find((id) => !materialById(id));
  if (unknown) return { ok: false, reason: 'One of the selected materials is not in the database.' };
  const span = axisValues(request.span, 'Wingspan');
  const chord = axisValues(request.chord, 'Chord');
  const width = axisValues(request.sparWidth, 'Spar width');
  const height = axisValues(request.sparHeight, 'Spar height');
  const thickness = axisValues(request.wallThickness, 'Wall thickness');
  for (const axis of [span, chord, width, height, thickness]) {
    if (typeof axis === 'string') return { ok: false, reason: axis };
  }
  const axes = [span, chord, width, height, thickness] as number[][];
  const total = axes.reduce((product, values) => product * values.length, 1) * request.materialIds.length;
  if (total > MAX_CONFIGURATIONS) {
    return { ok: false, reason: `That grid has ${total} configurations. The search stops above ${MAX_CONFIGURATIONS}. Widen an increment.` };
  }
  const needsAero = request.objectives.includes('ld') || activeLimit(request.constraints.minAeroLift);
  const aeroCache = new Map<string, AeroSample>();
  const points: DesignPoint[] = [];
  for (const spanValue of span as number[]) {
    for (const chordValue of chord as number[]) {
      let aero: AeroSample | null = null;
      if (needsAero) {
        const key = `${spanValue}|${chordValue}`;
        aero = aeroCache.get(key) ?? aeroAt(spanValue, chordValue);
        aeroCache.set(key, aero);
      }
      for (const sparWidth of width as number[]) {
        for (const sparHeight of height as number[]) {
          for (const wallThickness of thickness as number[]) {
            for (const materialId of request.materialIds) {
              const input: WingStructureInput = {
                span: spanValue,
                chord: chordValue,
                mass: request.mass,
                loadFactor: request.loadFactor,
                sparWidth,
                sparHeight,
                wallThickness,
                materialId,
              };
              points.push(scorePoint(input, request, aero));
            }
          }
        }
      }
    }
  }
  const feasible = points.filter((point) => point.feasible);
  const pareto = feasible.filter((point) => !feasible.some((other) => other !== point && dominates(other, point, request.objectives)));
  let preferred: DesignPoint | null = null;
  let preference = 'No configuration satisfied every active constraint, so none is reported as preferred.';
  if (pareto.length > 0) {
    preferred = pareto.reduce((best, point) => (preferenceScore(point, feasible, request.objectives) > preferenceScore(best, feasible, request.objectives) ? point : best));
    preference = request.objectives.length === 1
      ? `One objective, ${objectiveName(request.objectives[0])}. The preferred row is the best feasible value. Ties keep the earliest row in the grid.`
      : 'Several objectives are scaled from worst to best across the feasible set and added with equal weight. The preferred row is the highest score on the Pareto front. Equal weights are a choice, not a statement that one design is best for every aircraft.';
  }
  return { ok: true, evaluated: points.length, feasible: feasible.length, points, pareto, preferred, objectives: request.objectives, preference };
}

function scorePoint(input: WingStructureInput, request: SearchRequest, aero: AeroSample | null): DesignPoint {
  const material = materialById(input.materialId);
  const structure = analyzeWing(input);
  const violations: string[] = [];
  if (!structure.ok) violations.push(structure.reason);
  const factor = !structure.ok ? null : structure.metal ? structure.metal.yieldFactor : structure.composite ? Math.min(structure.composite.tensionRatio, structure.composite.compressionRatio) : null;
  const factorKind = !structure.ok ? null : structure.metal ? 'yield' as const : 'directional' as const;
  if (structure.ok && activeLimit(request.constraints.maxBendingStress) && structure.bendingStress > request.constraints.maxBendingStress) {
    violations.push('Bending stress is above the search limit.');
  }
  if (structure.ok && activeLimit(request.constraints.maxTipDeflection) && structure.tipDeflection > request.constraints.maxTipDeflection) {
    violations.push('Tip deflection is above the search limit.');
  }
  if (structure.ok && activeLimit(request.constraints.minFactor) && (factor === null || factor < request.constraints.minFactor)) {
    violations.push(factorKind === 'directional' ? 'Directional strength ratio is below the search minimum.' : 'Yield factor is below the search minimum.');
  }
  if (aero && !aero.forcesFinite) violations.push('The aerodynamic force at this span and chord is not finite.');
  if (aero && aero.forcesFinite && activeLimit(request.constraints.minAeroLift) && aero.lift < request.constraints.minAeroLift) {
    violations.push('Aerodynamic lift is below the search minimum.');
  }
  return {
    span: input.span,
    chord: input.chord,
    sparWidth: input.sparWidth,
    sparHeight: input.sparHeight,
    wallThickness: input.wallThickness,
    materialId: input.materialId,
    materialName: material?.name ?? input.materialId,
    mass: structure.ok ? structure.sparMassBothWings : null,
    stress: structure.ok ? structure.bendingStress : null,
    deflection: structure.ok ? structure.tipDeflection : null,
    lift: aero && aero.forcesFinite ? aero.lift : null,
    ld: aero && aero.forcesFinite ? aero.ld : null,
    factor,
    factorKind,
    feasible: violations.length === 0,
    violations,
  };
}

export function objectiveName(objective: ObjectiveId): string {
  if (objective === 'mass') return 'minimum spar mass';
  if (objective === 'ld') return 'maximum lift-to-drag ratio';
  return 'minimum tip deflection';
}

export function comparePoints(baseline: DesignPoint, selected: DesignPoint): {
  massChange: number | null;
  stressChange: number | null;
  deflectionChange: number | null;
  ldChange: number | null;
} {
  const delta = (left: number | null, right: number | null) => (left === null || right === null ? null : right - left);
  return {
    massChange: delta(baseline.mass, selected.mass),
    stressChange: delta(baseline.stress, selected.stress),
    deflectionChange: delta(baseline.deflection, selected.deflection),
    ldChange: delta(baseline.ld, selected.ld),
  };
}

/** One evaluated row, for the baseline column. Uses the same constraint rules as the search. */
export function describeConfiguration(
  input: WingStructureInput,
  constraints: SearchConstraints,
  aero: AeroSample | null,
): DesignPoint {
  return scorePoint(input, {
    span: { min: input.span, max: input.span, step: 1 },
    chord: { min: input.chord, max: input.chord, step: 1 },
    sparWidth: { min: input.sparWidth, max: input.sparWidth, step: 1 },
    sparHeight: { min: input.sparHeight, max: input.sparHeight, step: 1 },
    wallThickness: { min: input.wallThickness, max: input.wallThickness, step: 1 },
    materialIds: [input.materialId],
    objectives: ['mass'],
    constraints,
    mass: input.mass,
    loadFactor: input.loadFactor,
  }, aero);
}

function csvCell(value: string | number | null): string {
  if (value === null) return '';
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function searchToCsv(result: SearchResult): string {
  const header = ['span_m', 'chord_m', 'spar_width_m', 'spar_height_m', 'wall_thickness_m', 'material', 'spar_mass_both_kg', 'bending_stress_Pa', 'tip_deflection_m', 'lift_N', 'lift_to_drag', 'factor', 'factor_kind', 'feasible', 'violations'];
  const rows = result.points.map((point) => [
    point.span,
    point.chord,
    point.sparWidth,
    point.sparHeight,
    point.wallThickness,
    point.materialName,
    point.mass,
    point.stress,
    point.deflection,
    point.lift,
    point.ld,
    point.factor,
    point.factorKind,
    point.feasible ? 'yes' : 'no',
    point.violations.join('; '),
  ].map(csvCell).join(','));
  return [header.join(','), ...rows].join('\n');
}
