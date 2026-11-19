import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { comparePoints, describeConfiguration, searchDesigns, searchToCsv, type AeroSample, type SearchRequest } from '../lib/optimise';

const quietAero = (): AeroSample => ({ lift: 20_000, ld: 40, forcesFinite: true });

function request(patch: Partial<SearchRequest> = {}): SearchRequest {
  return {
    span: { min: 8, max: 8, step: 1 },
    chord: { min: 1.5, max: 1.5, step: 0.1 },
    sparWidth: { min: 0.12, max: 0.12, step: 0.01 },
    sparHeight: { min: 0.16, max: 0.16, step: 0.01 },
    wallThickness: { min: 0.008, max: 0.008, step: 0.001 },
    materialIds: ['al-2024-t3', 'hexply-8552-as4'],
    objectives: ['mass'],
    constraints: { minAeroLift: null, maxBendingStress: null, maxTipDeflection: null, minFactor: null },
    mass: 1000,
    loadFactor: 3.8,
    ...patch,
  };
}

describe('design search', () => {
  it('minimises spar mass and keeps the heavier alloy off the preferred row', () => {
    const result = searchDesigns(request(), quietAero);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.evaluated, 2);
    assert.equal(result.preferred?.materialId, 'hexply-8552-as4');
    assert.ok((result.preferred?.mass ?? 0) < (result.points.find((point) => point.materialId === 'al-2024-t3')?.mass ?? 0));
  });

  it('does not prefer a lighter row that breaks the stress constraint', () => {
    const open = searchDesigns(request({
      wallThickness: { min: 0.002, max: 0.008, step: 0.006 },
      materialIds: ['al-2024-t3'],
    }), quietAero);
    assert.equal(open.ok, true);
    if (!open.ok) return;
    const light = open.points.find((point) => point.wallThickness === 0.002);
    assert.equal(light?.feasible, true);
    const limited = searchDesigns(request({
      wallThickness: { min: 0.002, max: 0.008, step: 0.006 },
      materialIds: ['al-2024-t3'],
      constraints: { minAeroLift: null, maxBendingStress: light!.stress! * 0.5, maxTipDeflection: null, minFactor: null },
    }), quietAero);
    assert.equal(limited.ok, true);
    if (!limited.ok) return;
    assert.equal(limited.points.some((point) => point.wallThickness === 0.002 && point.feasible), false);
    assert.equal(limited.preferred?.wallThickness, 0.008);
    assert.equal(limited.preferred?.feasible, true);
  });

  it('follows the injected lift-to-drag ratio and the lift constraint', () => {
    const aero = (span: number): AeroSample => ({ lift: span * 1000, ld: 100 / span, forcesFinite: true });
    const result = searchDesigns(request({
      span: { min: 6, max: 10, step: 2 },
      materialIds: ['al-2024-t3'],
      objectives: ['ld'],
    }), (span) => aero(span));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.preferred?.span, 6);
    const blocked = searchDesigns(request({
      span: { min: 6, max: 10, step: 2 },
      materialIds: ['al-2024-t3'],
      objectives: ['ld'],
      constraints: { minAeroLift: 7000, maxBendingStress: null, maxTipDeflection: null, minFactor: null },
    }), (span) => aero(span));
    assert.equal(blocked.ok, true);
    if (!blocked.ok) return;
    assert.equal(blocked.points.find((point) => point.span === 6)?.feasible, false);
    assert.notEqual(blocked.preferred?.span, 6);
  });

  it('minimises deflection and builds a Pareto front without infeasible points', () => {
    const single = searchDesigns(request({ materialIds: ['al-2024-t3', 'hexply-8552-as4'], objectives: ['deflection'] }), quietAero);
    assert.equal(single.ok, true);
    if (!single.ok) return;
    assert.equal(single.preferred?.materialId, 'hexply-8552-as4');
    const front = searchDesigns(request({
      sparHeight: { min: 0.12, max: 0.18, step: 0.02 },
      materialIds: ['al-2024-t3'],
      objectives: ['mass', 'deflection'],
      constraints: { minAeroLift: null, maxBendingStress: 150e6, maxTipDeflection: null, minFactor: null },
    }), quietAero);
    assert.equal(front.ok, true);
    if (!front.ok) return;
    assert.ok(front.pareto.length >= 1);
    assert.equal(front.pareto.every((point) => point.feasible), true);
    assert.equal(front.preferred?.feasible, true);
    assert.match(front.preference, /equal weight/i);
  });

  it('rejects a bad grid and reports baseline deltas', () => {
    const bad = searchDesigns(request({ span: { min: 10, max: 8, step: 1 } }), quietAero);
    assert.equal(bad.ok, false);
    const invalid = searchDesigns(request({ constraints: { minAeroLift: Number.NaN, maxBendingStress: null, maxTipDeflection: null, minFactor: null } }), quietAero);
    assert.equal(invalid.ok, false);
    const found = searchDesigns(request({ materialIds: ['hexply-8552-as4'] }), quietAero);
    assert.equal(found.ok, true);
    if (!found.ok || !found.preferred) return;
    const baseline = describeConfiguration({
      span: 8, chord: 1.5, mass: 1000, loadFactor: 3.8, materialId: 'al-2024-t3', sparWidth: 0.12, sparHeight: 0.16, wallThickness: 0.008,
    }, request().constraints, quietAero());
    const delta = comparePoints(baseline, found.preferred);
    assert.ok((delta.massChange ?? 0) < 0);
    assert.equal(delta.stressChange, 0);
    assert.ok((delta.deflectionChange ?? 0) < 0);
    const csv = searchToCsv(found);
    assert.match(csv.split('\n')[0], /spar_mass_both_kg/);
    assert.match(csv, /HexPly 8552 \/ AS4 tape/);
    assert.match(csv, /yes/);
    const quoted = searchToCsv({ ...found, points: [{ ...found.points[0], violations: ['walls, crossed'] }] });
    assert.match(quoted, /"walls, crossed"/);
  });
});
