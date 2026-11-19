import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assessSafety, capacityMargin, rootWebShearStress, type SafetyCheck, type SafetyLimits } from '../lib/safety';
import type { WingStructureInput } from '../lib/structures';

const wing: WingStructureInput = {
  span: 8,
  chord: 1.5,
  mass: 1000,
  loadFactor: 3.8,
  sparWidth: 0.12,
  sparHeight: 0.16,
  wallThickness: 0.008,
  materialId: 'al-2024-t3',
};

const openLimits: SafetyLimits = { maxBendingStress: null, maxBendingStrain: null, maxTipDeflection: null, minFactor: null };

describe('preliminary safety', () => {
  it('passes 2024-T3 yield at the default load and leaves shear and buckling unevaluated', () => {
    const assessment = assessSafety(wing, openLimits);
    assert.equal(assessment.overall, 'pass');
    assert.equal(assessment.checks.find((check) => check.id === 'tension')?.status, 'pass');
    assert.equal(assessment.checks.find((check) => check.id === 'compression')?.status, 'not-evaluated');
    assert.equal(assessment.checks.find((check) => check.id === 'shear')?.status, 'not-evaluated');
    assert.equal(assessment.checks.find((check) => check.id === 'buckling')?.status, 'not-evaluated');
    assert.ok(assessment.webShearStress !== null && assessment.webShearStress > 0);
    assert.equal(assessment.governing?.id, 'tension');
  });

  it('fails a metal when the load drives bending stress past typical yield', () => {
    const assessment = assessSafety({ ...wing, mass: 4000, loadFactor: 6 }, openLimits);
    assert.equal(assessment.overall, 'fail');
    assert.equal(assessment.checks.find((check) => check.id === 'tension')?.status, 'fail');
    assert.ok((assessment.checks.find((check) => check.id === 'tension')?.margin ?? 0) < 0);
  });

  it('uses directional tension and compression for the tape and does not call them yield', () => {
    const assessment = assessSafety({ ...wing, materialId: 'hexply-8552-as4' }, { ...openLimits, minFactor: 2 });
    const tension = assessment.checks.find((check) => check.id === 'tension');
    const compression = assessment.checks.find((check) => check.id === 'compression');
    const factor = assessment.checks.find((check) => check.id === 'factor');
    assert.equal(tension?.status, 'pass');
    assert.equal(compression?.status, 'pass');
    assert.equal(factor?.name, 'Directional strength ratio');
    assert.match(factor?.detail ?? '', /not a metal yield factor/);
    assert.equal(assessment.structure?.metal, null);
  });

  it('fails only the user deflection limit and reports that check as governing', () => {
    const assessment = assessSafety(wing, { ...openLimits, maxTipDeflection: 0.01 });
    assert.equal(assessment.checks.find((check) => check.id === 'deflection')?.status, 'fail');
    assert.equal(assessment.overall, 'fail');
    assert.equal(assessment.governing?.id, 'deflection');
  });

  it('does not treat an empty or invalid limit as a pass', () => {
    const empty = assessSafety(wing, openLimits);
    assert.equal(empty.checks.find((check) => check.id === 'deflection')?.status, 'not-evaluated');
    const invalid = assessSafety(wing, { ...openLimits, maxBendingStress: Number.NaN, minFactor: -1 });
    assert.equal(invalid.checks.find((check) => check.id === 'user-stress')?.status, 'not-evaluated');
    assert.equal(invalid.checks.find((check) => check.id === 'factor')?.status, 'not-evaluated');
    assert.equal(invalid.overall, 'pass');
  });

  it('rejects a closed spar without calling the wing a pass', () => {
    const assessment = assessSafety({ ...wing, wallThickness: 0.08 }, openLimits);
    assert.equal(assessment.structure, null);
    assert.equal(assessment.overall, 'not-evaluated');
    assert.equal(assessment.checks.every((check) => check.status === 'not-evaluated'), true);
    assert.match(assessment.reason ?? '', /hollow/);
  });

  it('matches the section shear formula', () => {
    const shear = 1000;
    const secondMoment = 1e-5;
    const stress = rootWebShearStress(shear, secondMoment, 0.12, 0.16, 0.008);
    const flange = 0.12 * 0.008 * (0.08 - 0.004);
    const web = 0.008 * 0.072 * 0.072;
    const expected = (shear * (flange + web)) / (secondMoment * 0.016);
    assert.ok(stress !== null && Math.abs(stress - expected) / expected < 1e-12);
    assert.equal(rootWebShearStress(shear, secondMoment, 0.01, 0.16, 0.008), null);
  });
});

function check(assessment: ReturnType<typeof assessSafety>, id: string): SafetyCheck {
  const found = assessment.checks.find((item) => item.id === id);
  assert.ok(found, id);
  return found;
}

function close(actual: number | null, expected: number) {
  assert.ok(actual !== null && Math.abs(actual - expected) < 1e-9, `margin ${actual} expected ${expected}`);
}

describe('capacity margin', () => {
  it('uses (capacity − demand) / capacity on the default yield check and ignores unevaluated rows', () => {
    const assessment = assessSafety(wing, openLimits);
    const stress = assessment.structure?.bendingStress ?? 0;
    const yieldStrength = 345e6;
    const corrected = (yieldStrength - stress) / yieldStrength;
    const previous = yieldStrength / stress - 1;
    close(check(assessment, 'tension').margin, corrected);
    assert.ok(Math.abs(corrected - 0.514) < 0.001);
    assert.ok(Math.abs(previous - 1.056) < 0.001);
    assert.ok(Math.abs((check(assessment, 'tension').margin ?? 0) - previous) > 0.4);
    assert.equal(assessment.governing?.id, 'tension');
    assert.equal(assessment.checks.filter((item) => item.status === 'not-evaluated').every((item) => item.margin === null), true);
    assert.equal(assessment.overall, 'pass');
    assert.ok(assessment.checks.some((item) => item.id === 'shear' && item.status === 'not-evaluated'));
    assert.ok(assessment.checks.some((item) => item.id === 'buckling' && item.status === 'not-evaluated'));
  });

  it('lets yield govern a 348.7 mm deflection limit because 0.514 is below 0.700', () => {
    const assessment = assessSafety(wing, { ...openLimits, maxTipDeflection: 0.3487 });
    const tension = check(assessment, 'tension');
    const deflection = check(assessment, 'deflection');
    assert.equal(tension.status, 'pass');
    assert.equal(deflection.status, 'pass');
    assert.ok(Math.abs((tension.margin ?? 0) - 0.514) < 0.001);
    assert.ok(Math.abs((deflection.margin ?? 0) - 0.700) < 0.001);
    assert.ok((tension.margin ?? 0) < (deflection.margin ?? 0));
    assert.equal(assessment.governing?.id, 'tension');
    assert.equal(assessment.overall, 'pass');
  });

  it('ranks a 100 MPa stress limit, a 10 mm deflection limit and a minimum factor of 3 on one definition', () => {
    const assessment = assessSafety(wing, { maxBendingStress: 100e6, maxBendingStrain: null, maxTipDeflection: 0.01, minFactor: 3 });
    const stress = assessment.structure?.bendingStress ?? 0;
    const tip = assessment.structure?.tipDeflection ?? 0;
    const factor = assessment.structure?.metal?.yieldFactor ?? 0;
    const stressMargin = (100e6 - stress) / 100e6;
    const deflectionMargin = (0.01 - tip) / 0.01;
    const factorMargin = (factor - 3) / factor;
    const previousFactorMargin = (factor - 3) / 3;
    close(check(assessment, 'user-stress').margin, stressMargin);
    close(check(assessment, 'deflection').margin, deflectionMargin);
    close(check(assessment, 'factor').margin, factorMargin);
    assert.equal(check(assessment, 'user-stress').status, 'fail');
    assert.equal(check(assessment, 'deflection').status, 'fail');
    assert.equal(check(assessment, 'factor').status, 'fail');
    assert.equal(check(assessment, 'user-strain').status, 'not-evaluated');
    assert.equal(check(assessment, 'shear').status, 'not-evaluated');
    assert.ok(Math.abs(deflectionMargin + 9.46) < 0.01);
    assert.ok(Math.abs(stressMargin + 0.678) < 0.001);
    assert.ok(Math.abs(factorMargin + 0.459) < 0.001);
    assert.ok(Math.abs(previousFactorMargin + 0.315) < 0.001);
    assert.equal(assessment.governing?.id, 'deflection');
    assert.equal(assessment.overall, 'fail');
  });

  it('gives a zero margin to a check that sits exactly on its limit and still passes', () => {
    const base = assessSafety(wing, openLimits);
    const structure = base.structure;
    assert.ok(structure?.metal);
    const strain = structure.bendingStress / structure.material.youngsModulus;
    const assessment = assessSafety(wing, {
      maxBendingStress: structure.bendingStress,
      maxBendingStrain: strain,
      maxTipDeflection: structure.tipDeflection,
      minFactor: structure.metal.yieldFactor,
    });
    for (const id of ['user-stress', 'user-strain', 'deflection', 'factor']) {
      const item = check(assessment, id);
      assert.equal(item.status, 'pass');
      close(item.margin, 0);
    }
    assert.equal(assessment.governing?.id, 'user-stress');
    assert.equal(assessment.overall, 'pass');
  });

  it('can make each judged metal check the one with the smallest margin', () => {
    const base = assessSafety(wing, openLimits);
    const structure = base.structure;
    assert.ok(structure);
    const tip = structure.tipDeflection;
    const strain = structure.bendingStress / structure.material.youngsModulus;
    const cases: { id: string; limits: SafetyLimits }[] = [
      { id: 'tension', limits: { ...openLimits, maxTipDeflection: 0.3487 } },
      { id: 'deflection', limits: { ...openLimits, maxTipDeflection: tip / 0.8 } },
      { id: 'user-stress', limits: { ...openLimits, maxBendingStress: structure.bendingStress / 0.95 } },
      { id: 'user-strain', limits: { ...openLimits, maxBendingStrain: strain / 0.95, maxBendingStress: 1000e6 } },
      { id: 'factor', limits: { ...openLimits, minFactor: 1.9 } },
    ];
    for (const item of cases) {
      const assessment = assessSafety(wing, item.limits);
      assert.equal(assessment.governing?.id, item.id, item.id);
      assert.equal(assessment.checks.filter((row) => row.status !== 'not-evaluated').every((row) => row.margin !== null), true);
    }
  });

  it('keeps an empty limit out of the ranking and uses directional capacities for the tape', () => {
    const empty = assessSafety(wing, openLimits);
    assert.equal(check(empty, 'deflection').status, 'not-evaluated');
    assert.equal(check(empty, 'deflection').margin, null);
    assert.notEqual(empty.governing?.id, 'deflection');

    const tape = assessSafety({ ...wing, materialId: 'hexply-8552-as4' }, openLimits);
    const stress = tape.structure?.bendingStress ?? 0;
    const tensionMargin = (2207e6 - stress) / 2207e6;
    const compressionMargin = (1531e6 - stress) / 1531e6;
    close(check(tape, 'tension').margin, tensionMargin);
    close(check(tape, 'compression').margin, compressionMargin);
    assert.ok(compressionMargin < tensionMargin);
    assert.equal(tape.governing?.id, 'compression');
    assert.equal(check(tape, 'tension').name, '0° tensile strength');
    assert.equal(check(tape, 'compression').name, '0° compressive strength');
    assert.equal(check(tape, 'shear').status, 'not-evaluated');

    const tight = assessSafety({ ...wing, materialId: 'hexply-8552-as4' }, { ...openLimits, maxTipDeflection: (tape.structure?.tipDeflection ?? 1) / 0.8 });
    assert.equal(tight.governing?.id, 'deflection');
    assert.equal(capacityMargin(10, 4), 0.6);
    assert.equal(capacityMargin(0, 4), null);
  });
});
