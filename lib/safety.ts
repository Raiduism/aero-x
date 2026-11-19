/**
 * Preliminary checks on one analyzeWing result.
 * The beam equations are not repeated here. Bending stress, shear force,
 * deflection and the published strength ratios come from that result.
 * Web shear stress is the elastic section formula τ = VQ / (I · 2t) at the
 * root neutral axis. No shear strength is stored, so that stress is reported
 * and the material shear check stays unevaluated.
 * Local buckling is unevaluated: this beam has no plate model, and the
 * material cards do not store Poisson's ratio or a buckling coefficient.
 */

import { analyzeWing, type StructureSuccess, type WingStructureInput } from './structures';

export type CheckStatus = 'pass' | 'fail' | 'not-evaluated';

export type SafetyLimits = {
  /** Pa. Null when the user has not entered one. */
  maxBendingStress: number | null;
  /** Dimensionless. Null when the user has not entered one. */
  maxBendingStrain: number | null;
  /** m. */
  maxTipDeflection: number | null;
  /** Applied only to the factor this material actually has. */
  minFactor: number | null;
};

export type SafetyFields = { stress: string; strain: string; deflection: string; factor: string };

export const EMPTY_SAFETY_FIELDS: SafetyFields = { stress: '', strain: '', deflection: '', factor: '' };

function typedLimit(text: string): number | null {
  if (text.trim() === '') return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : Number.NaN;
}

/** Shared parser so the dashboard and the safety page judge the same typed limits. */
export function limitsFromFields(fields: SafetyFields): SafetyLimits {
  const stress = typedLimit(fields.stress);
  const deflection = typedLimit(fields.deflection);
  return {
    maxBendingStress: stress === null ? null : stress * 1e6,
    maxBendingStrain: typedLimit(fields.strain),
    maxTipDeflection: deflection === null ? null : deflection / 1000,
    minFactor: typedLimit(fields.factor),
  };
}

export type SafetyCheck = {
  id: string;
  name: string;
  status: CheckStatus;
  /**
   * (capacity − demand) / capacity.
   * Zero on the limit, negative when demand exceeds capacity.
   * Null when the check is not evaluated or the capacity is not a positive finite number.
   */
  margin: number | null;
  detail: string;
};

/**
 * One margin for every judged check.
 * Capacity is the allowable (yield, directional strength, typed limit, or the calculated factor).
 * Demand is the beam result, or the required minimum factor.
 */
export function capacityMargin(capacity: number, demand: number): number | null {
  if (!(capacity > 0) || !Number.isFinite(capacity) || !Number.isFinite(demand)) return null;
  return (capacity - demand) / capacity;
}

export type SafetyAssessment = {
  structure: StructureSuccess | null;
  /** Pa. Null when the section was rejected. */
  webShearStress: number | null;
  bendingStrain: number | null;
  checks: SafetyCheck[];
  overall: CheckStatus;
  governing: SafetyCheck | null;
  reason: string | null;
};

export function rootWebShearStress(shear: number, secondMoment: number, width: number, height: number, thickness: number): number | null {
  if (!Number.isFinite(shear) || shear < 0) return null;
  if (!(secondMoment > 0) || !(width > 0) || !(height > 0) || !(thickness > 0)) return null;
  if (2 * thickness >= width || 2 * thickness >= height) return null;
  const flangeFirstMoment = width * thickness * (height / 2 - thickness / 2);
  const webAboveAxis = height / 2 - thickness;
  const webFirstMoment = thickness * webAboveAxis * webAboveAxis;
  const stress = (shear * (flangeFirstMoment + webFirstMoment)) / (secondMoment * 2 * thickness);
  return Number.isFinite(stress) ? stress : null;
}

function limitNumber(value: number | null): 'missing' | 'invalid' | 'set' {
  if (value === null) return 'missing';
  if (!Number.isFinite(value) || value <= 0) return 'invalid';
  return 'set';
}

function materialChecks(structure: StructureSuccess): SafetyCheck[] {
  const stress = structure.bendingStress;
  if (structure.material.kind === 'metal' && structure.metal) {
    const yieldFactor = structure.metal.yieldFactor;
    return [
      {
        id: 'tension',
        name: 'Tensile yield',
        status: yieldFactor >= 1 ? 'pass' : 'fail',
        margin: capacityMargin(structure.material.tensileYield, stress),
        detail: `The tension face is at ${(stress / 1e6).toFixed(1)} MPa. The typical tensile yield of ${structure.material.name} is ${(structure.material.tensileYield / 1e6).toFixed(0)} MPa, so the yield factor is ${yieldFactor.toFixed(2)}. This is a typical published yield, not an allowable.`,
      },
      {
        id: 'compression',
        name: 'Compressive failure',
        status: 'not-evaluated',
        margin: null,
        detail: 'The compression face carries the same bending stress. The database stores tensile yield only, so compressive yield is not checked and this row is not a pass.',
      },
    ];
  }
  if (structure.material.kind === 'composite' && structure.composite) {
    return [
      {
        id: 'tension',
        name: '0° tensile strength',
        status: structure.composite.tensionRatio >= 1 ? 'pass' : 'fail',
        margin: capacityMargin(structure.material.tensileStrength0, stress),
        detail: `Bending stress ${(stress / 1e6).toFixed(1)} MPa against the 0° tensile strength ${(structure.material.tensileStrength0 / 1e6).toFixed(0)} MPa. Ratio ${structure.composite.tensionRatio.toFixed(2)}. This is not a yield factor.`,
      },
      {
        id: 'compression',
        name: '0° compressive strength',
        status: structure.composite.compressionRatio >= 1 ? 'pass' : 'fail',
        margin: capacityMargin(structure.material.compressiveStrength0, stress),
        detail: `The compressed face is compared with the 0° compression strength ${(structure.material.compressiveStrength0 / 1e6).toFixed(0)} MPa. Ratio ${structure.composite.compressionRatio.toFixed(2)}. A 90° ply is not this check.`,
      },
    ];
  }
  return [];
}

function userChecks(structure: StructureSuccess, limits: SafetyLimits, strain: number | null): SafetyCheck[] {
  const checks: SafetyCheck[] = [];
  const stressLimit = limitNumber(limits.maxBendingStress);
  checks.push(stressLimit === 'missing'
    ? { id: 'user-stress', name: 'Your bending-stress limit', status: 'not-evaluated', margin: null, detail: 'No maximum bending stress has been entered. None is assumed.' }
    : stressLimit === 'invalid'
      ? { id: 'user-stress', name: 'Your bending-stress limit', status: 'not-evaluated', margin: null, detail: 'The stress limit has to be a positive finite number before it is used.' }
      : {
        id: 'user-stress',
        name: 'Your bending-stress limit',
        status: structure.bendingStress <= limits.maxBendingStress! ? 'pass' : 'fail',
        margin: capacityMargin(limits.maxBendingStress!, structure.bendingStress),
        detail: `Root bending stress ${(structure.bendingStress / 1e6).toFixed(1)} MPa against the limit you entered, ${(limits.maxBendingStress! / 1e6).toFixed(1)} MPa. That limit is yours. It is not a certification value.`,
      });

  const strainLimit = limitNumber(limits.maxBendingStrain);
  checks.push(strainLimit === 'missing'
    ? { id: 'user-strain', name: 'Your bending-strain limit', status: 'not-evaluated', margin: null, detail: 'No maximum bending strain has been entered.' }
    : strainLimit === 'invalid' || strain === null
      ? { id: 'user-strain', name: 'Your bending-strain limit', status: 'not-evaluated', margin: null, detail: strain === null ? 'Bending strain σ/E was not finite.' : 'The strain limit has to be a positive finite number.' }
      : {
        id: 'user-strain',
        name: 'Your bending-strain limit',
        status: strain <= limits.maxBendingStrain! ? 'pass' : 'fail',
        margin: capacityMargin(limits.maxBendingStrain!, strain),
        detail: `Bending strain σ/E is ${strain.toExponential(3)} against the limit you entered, ${limits.maxBendingStrain!.toExponential(3)}.`,
      });

  const deflectionLimit = limitNumber(limits.maxTipDeflection);
  checks.push(deflectionLimit === 'missing'
    ? { id: 'deflection', name: 'Tip deflection', status: 'not-evaluated', margin: null, detail: 'No maximum tip deflection has been entered, so excessive deflection is not judged.' }
    : deflectionLimit === 'invalid'
      ? { id: 'deflection', name: 'Tip deflection', status: 'not-evaluated', margin: null, detail: 'The deflection limit has to be a positive finite length.' }
      : {
        id: 'deflection',
        name: 'Tip deflection',
        status: structure.tipDeflection <= limits.maxTipDeflection! ? 'pass' : 'fail',
        margin: capacityMargin(limits.maxTipDeflection!, structure.tipDeflection),
        detail: `Calculated tip deflection ${(structure.tipDeflection * 1000).toFixed(1)} mm against your limit of ${(limits.maxTipDeflection! * 1000).toFixed(1)} mm.`,
      });

  const factorLimit = limitNumber(limits.minFactor);
  if (factorLimit === 'missing') {
    checks.push({ id: 'factor', name: 'Your minimum factor', status: 'not-evaluated', margin: null, detail: 'No minimum factor has been entered.' });
  } else if (factorLimit === 'invalid') {
    checks.push({ id: 'factor', name: 'Your minimum factor', status: 'not-evaluated', margin: null, detail: 'The minimum factor has to be a positive finite number.' });
  } else if (structure.metal) {
    const factor = structure.metal.yieldFactor;
    checks.push({
      id: 'factor',
      name: 'Yield factor',
      status: factor >= limits.minFactor! ? 'pass' : 'fail',
      margin: capacityMargin(factor, limits.minFactor!),
      detail: `Yield factor ${factor.toFixed(2)} against your minimum of ${limits.minFactor!.toFixed(2)}. The numerator is typical tensile yield.`,
    });
  } else if (structure.composite) {
    const factor = Math.min(structure.composite.tensionRatio, structure.composite.compressionRatio);
    checks.push({
      id: 'factor',
      name: 'Directional strength ratio',
      status: factor >= limits.minFactor! ? 'pass' : 'fail',
      margin: capacityMargin(factor, limits.minFactor!),
      detail: `The smaller 0° ratio is ${factor.toFixed(2)} against your minimum of ${limits.minFactor!.toFixed(2)}. This is not a metal yield factor of safety.`,
    });
  }
  return checks;
}

function shearAndBuckling(structure: StructureSuccess, shear: number | null): SafetyCheck[] {
  return [
    {
      id: 'shear',
      name: 'Spar-web shear',
      status: 'not-evaluated',
      margin: null,
      detail: shear === null
        ? 'Root shear stress could not be formed from the beam result.'
        : `Root web shear from τ = VQ/(I·2t) is ${(shear / 1e6).toFixed(2)} MPa, using the beam's root shear of ${(structure.rootShear / 1000).toFixed(2)} kN. No shear strength is stored for this material, so the stress is reported and not passed or failed. Your bending-stress limit is not applied to shear.`,
    },
    {
      id: 'buckling',
      name: 'Local buckling',
      status: 'not-evaluated',
      margin: null,
      detail: 'Not evaluated. The beam has no plate-buckling model, the cards do not store Poisson’s ratio, and rib spacing is unknown. This row is not a pass.',
    },
  ];
}

export function assessSafety(input: WingStructureInput, limits: SafetyLimits): SafetyAssessment {
  const structure = analyzeWing(input);
  if (!structure.ok) {
    const idle = (id: string, name: string): SafetyCheck => ({
      id,
      name,
      status: 'not-evaluated',
      margin: null,
      detail: 'Not evaluated because the spar section was rejected. This is not a pass.',
    });
    return {
      structure: null,
      webShearStress: null,
      bendingStrain: null,
      checks: [
        { id: 'beam', name: 'Beam model', status: 'not-evaluated', margin: null, detail: structure.reason },
        idle('tension', 'Tensile failure'),
        idle('compression', 'Compressive failure'),
        idle('shear', 'Spar-web shear'),
        idle('buckling', 'Local buckling'),
        idle('deflection', 'Tip deflection'),
      ],
      overall: 'not-evaluated',
      governing: null,
      reason: structure.reason,
    };
  }
  const shear = rootWebShearStress(structure.rootShear, structure.secondMoment, input.sparWidth, input.sparHeight, input.wallThickness);
  const strain = structure.bendingStress / structure.material.youngsModulus;
  const checks = [
    ...materialChecks(structure),
    ...shearAndBuckling(structure, Number.isFinite(strain) ? shear : shear),
    ...userChecks(structure, limits, Number.isFinite(strain) ? strain : null),
  ];
  const judged = checks.filter((check) => check.status !== 'not-evaluated');
  const overall: CheckStatus = judged.length === 0 ? 'not-evaluated' : judged.some((check) => check.status === 'fail') ? 'fail' : 'pass';
  const ranked = judged.filter((check) => check.margin !== null);
  const governing = ranked.reduce<SafetyCheck | null>((worst, check) => {
    if (!worst || (check.margin ?? 0) < (worst.margin ?? 0)) return check;
    return worst;
  }, null);
  return {
    structure,
    webShearStress: shear,
    bendingStrain: Number.isFinite(strain) ? strain : null,
    checks,
    overall,
    governing,
    reason: null,
  };
}
