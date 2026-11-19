import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { analyzeWing, ellipticalRootMoment, integrateCantilever, type WingStructureInput } from '../lib/structures';

const base: WingStructureInput = {
  span: 8,
  chord: 1.5,
  mass: 1000,
  loadFactor: 3.8,
  sparWidth: 0.12,
  sparHeight: 0.16,
  wallThickness: 0.008,
  materialId: 'al-2024-t3',
};

describe('cantilever spar', () => {
  it('matches the closed-form elliptical root moment and keeps the tip load-free', () => {
    const result = analyzeWing(base);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const expected = ellipticalRootMoment(result.designLift, base.span);
    assert.ok(Math.abs(result.rootMoment - expected) / expected < 5e-4);
    assert.ok(Math.abs(result.rootShear - result.liftPerWing) / result.liftPerWing < 5e-4);
    const tip = result.stations[result.stations.length - 1];
    assert.equal(tip.moment, 0);
    assert.ok(tip.deflection > 0);
    assert.equal(result.loadName, 'elliptical');
    assert.equal(result.metal !== null, true);
    assert.equal(result.composite, null);
  });

  it('integrates a uniform load to the textbook tip deflection', () => {
    const load = 1000;
    const length = 4;
    const rigidity = 1e6;
    const beam = integrateCantilever(() => load, length, rigidity, 400);
    assert.equal('ok' in beam, false);
    if ('ok' in beam) return;
    const momentError = Math.abs(beam.moment[0] - load * length * length / 2) / (load * length * length / 2);
    const tip = beam.deflection[beam.deflection.length - 1];
    const expectedTip = load * length ** 4 / (8 * rigidity);
    assert.ok(momentError < 1e-6);
    assert.ok(Math.abs(tip - expectedTip) / expectedTip < 1e-4);
  });

  it('deflects less under the elliptical load than under the same total uniform load', () => {
    const lift = 20000;
    const length = 4;
    const rigidity = 2e6;
    const root = (4 * lift) / (Math.PI * length);
    const elliptical = integrateCantilever((y) => root * Math.sqrt(1 - (y / length) ** 2), length, rigidity, 400);
    const uniform = integrateCantilever(() => lift / length, length, rigidity, 400);
    assert.equal('ok' in elliptical || 'ok' in uniform, false);
    if ('ok' in elliptical || 'ok' in uniform) return;
    const ellipticalTip = elliptical.deflection[elliptical.deflection.length - 1];
    const uniformTip = uniform.deflection[uniform.deflection.length - 1];
    assert.ok(ellipticalTip < uniformTip);
  });

  it('rejects a wall that closes the box', () => {
    const closed = analyzeWing({ ...base, wallThickness: 0.06 });
    assert.equal(closed.ok, false);
    const crossed = analyzeWing({ ...base, sparWidth: 0.01, wallThickness: 0.006 });
    assert.equal(crossed.ok, false);
    const missing = analyzeWing({ ...base, materialId: 'titanium' });
    assert.equal(missing.ok, false);
  });

  it('changes mass and deflection with the material and leaves the stress unchanged', () => {
    const alloy = analyzeWing(base);
    const other = analyzeWing({ ...base, materialId: 'al-6061-t6' });
    const tape = analyzeWing({ ...base, materialId: 'hexply-8552-as4' });
    assert.equal(alloy.ok && other.ok && tape.ok, true);
    if (!alloy.ok || !other.ok || !tape.ok) return;
    assert.ok(Math.abs(alloy.bendingStress - other.bendingStress) / alloy.bendingStress < 1e-9);
    assert.ok(Math.abs(alloy.bendingStress - tape.bendingStress) / alloy.bendingStress < 1e-9);
    assert.ok(Math.abs(other.sparMassOneWing / alloy.sparMassOneWing - 2700 / 2780) < 1e-9);
    assert.ok(Math.abs(other.tipDeflection / alloy.tipDeflection - 73.1 / 68.9) < 1e-9);
    assert.ok(tape.tipDeflection < alloy.tipDeflection);
    assert.ok(tape.sparMassOneWing < alloy.sparMassOneWing);
    assert.equal(tape.metal, null);
    assert.ok(tape.composite !== null);
    assert.notEqual(tape.composite?.compressionRatio, tape.composite?.tensionRatio);
  });

  it('follows span and ignores chord in the beam equations', () => {
    const longer = analyzeWing({ ...base, span: 12 });
    const thickerChord = analyzeWing({ ...base, chord: 3 });
    const reference = analyzeWing(base);
    assert.equal(longer.ok && thickerChord.ok && reference.ok, true);
    if (!longer.ok || !thickerChord.ok || !reference.ok) return;
    assert.ok(Math.abs(longer.rootMoment / reference.rootMoment - 12 / 8) < 5e-4);
    assert.ok(longer.tipDeflection > reference.tipDeflection);
    assert.equal(thickerChord.rootMoment, reference.rootMoment);
    assert.equal(thickerChord.bendingStress, reference.bendingStress);
    assert.equal(thickerChord.thicknessExceedsSection, false);
    const tall = analyzeWing({ ...base, sparHeight: 0.2 });
    assert.equal(tall.ok, true);
    if (tall.ok) assert.equal(tall.thicknessExceedsSection, true);
  });

  it('stays finite across a grid of valid inputs', () => {
    const spans = [2, 8, 20];
    const factors = [1, 3.8, 6];
    const materials = ['al-2024-t3', 'al-6061-t6', 'al-7075-t6', 'hexply-8552-as4'];
    for (const span of spans) {
      for (const loadFactor of factors) {
        for (const materialId of materials) {
          const result = analyzeWing({ ...base, span, loadFactor, materialId, sparHeight: 0.2, wallThickness: 0.01 });
          assert.equal(result.ok, true);
          if (!result.ok) continue;
          const numbers = [result.designLift, result.rootMoment, result.bendingStress, result.tipDeflection, result.sparMassBothWings, result.specificStiffness];
          assert.equal(numbers.every((value) => Number.isFinite(value) && value > 0), true);
        }
      }
    }
  });
});
