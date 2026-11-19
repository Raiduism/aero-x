import { ATTACHED_STATION, type AeroResult } from './aero';

/** Words the page uses for the operating point. Shared with the regression tests. */
export function regimeCopy(result: Pick<AeroResult, 'regime' | 'separationX' | 'separationSurface' | 'upperBoundary' | 'lowerBoundary'>): { title: string; detail: string } {
  const failed = [result.upperBoundary.integrationFailed ? 'upper' : '', result.lowerBoundary.integrationFailed ? 'lower' : ''].filter(Boolean);
  if (failed.length > 0 && result.regime === 'attached') {
    return {
      title: 'Boundary-layer integration failed',
      detail: `The Head march on the ${failed.join(' and ')} surface did not stay finite. There is no separation station and no attached wake. Lift and drag from this operating point are invalid.`,
    };
  }
  const failureNote = failed.length > 0
    ? ` The ${failed.join(' and ')} march did not stay finite. That failure is not a separation station, and the force values are invalid.`
    : '';
  if (result.regime === 'stalled') {
    return {
      title: 'Separation forward of 0.80c in this model',
      detail: `Head's separation criterion is met at x/c = ${result.separationX.toFixed(2)} on the ${result.separationSurface} surface. The 0.80c label is a display boundary inside this model, not a measured stall angle.${failureNote}`,
    };
  }
  if (result.regime === 'separating') {
    return {
      title: 'Turbulent separation aft of 0.80c',
      detail: `Head's separation criterion is met at x/c = ${result.separationX.toFixed(2)} on the ${result.separationSurface} surface. This is still behind the model's 0.80c display boundary.${failureNote}`,
    };
  }
  return {
    title: 'Attached in this model',
    detail: `Neither surface meets Head's separation criterion ahead of the trailing-edge trim. The trim keeps stations at or behind ${ATTACHED_STATION.toFixed(2)}c attached, because the inviscid spike in the last percent of chord is a cutoff.${failureNote}`,
  };
}

export function describeBoundary(state: AeroResult['upperBoundary']): string {
  const name = state.surface === 'upper' ? 'Upper' : 'Lower';
  if (state.integrationFailed) return `${name} surface: the Head integration failed. This is not a separation station.`;
  const sameStation = state.naturalTransitionX !== null && state.laminarSeparationX !== null && Math.abs(state.naturalTransitionX - state.laminarSeparationX) < 1e-6;
  let event = `${name} surface: neither Michel's criterion nor laminar separation is reached before the trim.`;
  if (sameStation) event = `${name} surface: Michel's criterion and laminar separation fall on the same station, x/c = ${state.naturalTransitionX!.toFixed(2)}.`;
  else if (state.naturalTransitionX !== null) event = `${name} surface: Michel transition at x/c = ${state.naturalTransitionX.toFixed(2)}.`;
  else if (state.laminarSeparationX !== null) event = `${name} surface: laminar separation at x/c = ${state.laminarSeparationX.toFixed(2)}, before Michel's criterion.`;
  const bubble = state.shortBubbleRestartX !== null ? ` A short bubble is assumed, so Head restarts at that station with H = 1.4. Bubble length, shear-layer transition and reattachment are not calculated.` : '';
  const turbulent = state.turbulentSeparationX === null
    ? ' Head does not meet its separation criterion ahead of the trim.'
    : state.turbulentSeparationX >= 0.97
      ? ` Head meets its separation criterion at x/c = ${state.turbulentSeparationX.toFixed(2)}. Stations at or behind 0.97c stay attached in the force calculation.`
      : ` Head meets its separation criterion at x/c = ${state.turbulentSeparationX.toFixed(2)}.`;
  return `${event}${bubble}${turbulent}`;
}

/** Finite force values keep their digits. An invalid march is labelled invalid instead of a stand-in number. */
export function formatModelNumber(value: number, digits: number, forcesFinite: boolean): string {
  if (!forcesFinite || !Number.isFinite(value)) return 'invalid';
  return value.toFixed(digits);
}

export function formatForce(value: number, forcesFinite: boolean): string {
  if (!forcesFinite || !Number.isFinite(value)) return 'invalid';
  return value.toLocaleString('en-GB', { maximumFractionDigits: 0 });
}

/** A factor of 1 after a failed march is the attached identity, so it is not shown as a physical factor. */
export function formatSeparationFactor(factor: number, forcesFinite: boolean, integrationFailed: boolean): string {
  if (!forcesFinite && integrationFailed && factor >= 1) return 'invalid';
  if (!Number.isFinite(factor)) return 'invalid';
  return factor.toFixed(2);
}
