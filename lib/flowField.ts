/**
 * Screen geometry for the laboratory picture.
 *
 * The Hess–Smith solution is the one already computed for this angle of
 * attack. This module does not solve the panel system again.
 *
 * Potential-flow tracers are integrated in that field. Where the integral
 * boundary layer has separated, tracers inside a wedge downstream of that
 * station are blended toward the freestream. The wedge is a drawing of the
 * separation station. It is not a Navier–Stokes streamline and it does not
 * change the forces. Its height is screen geometry, not an aerodynamic
 * coefficient.
 */

import type { FlowRegime, SurfacePressure } from './aero';
import { NACA_2412, surfacePoint, type XY } from './naca';
import { pointInside, velocityAt, type PanelSolution } from './panel';

export const VIEW = { width: 740, height: 390, originX: 120, originY: 215, scale: 470, pivotX: 0.5 };

/** Chord length advanced on a successful step. Sampling interval, not a force coefficient. */
const STEP_CHORD = 0.028;

export type StreamlineRole = 'potential' | 'separation-approximation';

export type Streamline = {
  d: string;
  /** True when the path has entered the separation sketch. */
  wake: boolean;
  role: StreamlineRole;
};

export type PressureBar = { x1: number; y1: number; x2: number; y2: number; cp: number };

export type FlowScene = {
  foil: string;
  streamlines: Streamline[];
  bars: PressureBar[];
  separation: { x: number; y: number } | null;
  /** Angle, in degrees, of the panel solution that was drawn. */
  alphaDeg: number;
};

export type FlowSceneInput = {
  solution: PanelSolution;
  regime: FlowRegime;
  separationX: number;
  separationY: number;
  separationSurface: 'upper' | 'lower' | 'none';
  pressure: SurfacePressure[];
};

type LabVelocity = { u: number; v: number; wake: boolean };

export function buildFlowScene(input: FlowSceneInput): FlowScene {
  const solution = input.solution;
  if (!Number.isFinite(solution.alphaRad) || solution.panels.length === 0) {
    throw new Error('buildFlowScene requires the panel solution at the current angle of attack.');
  }
  const cos = Math.cos(solution.alphaRad);
  const sin = Math.sin(solution.alphaRad);
  const foil = solution.nodes
    .map((node, index) => {
      const screen = toScreen(rotateChordToLab(node.x, node.y, cos, sin));
      return `${index === 0 ? 'M' : 'L'} ${screen.x.toFixed(2)} ${screen.y.toFixed(2)}`;
    })
    .join(' ');
  const separated = input.regime !== 'attached' && input.separationSurface !== 'none';
  const seeds = [-0.3, -0.22, -0.14, -0.07, 0.0, 0.07, 0.14, 0.22, 0.3];
  const streamlines = seeds
    .map((y) => trace(solution, cos, sin, y, separated, input.separationX, input.separationSurface))
    .filter((line): line is Streamline => line !== null);

  const bars = input.pressure.map((panel) => {
    const length = Math.min(Math.abs(panel.cp), 1.8) * 0.05;
    const start = toScreen(rotateChordToLab(panel.xm, panel.ym, cos, sin));
    const end = toScreen(rotateChordToLab(panel.xm + panel.nx * length, panel.ym + panel.ny * length, cos, sin));
    return { x1: start.x, y1: start.y, x2: end.x, y2: end.y, cp: panel.cp };
  });

  const separation = separated
    ? toScreen(rotateChordToLab(input.separationX, input.separationY, cos, sin))
    : null;

  return { foil: `${foil} Z`, streamlines, bars, separation, alphaDeg: solution.alphaDeg };
}

function trace(
  solution: PanelSolution,
  cos: number,
  sin: number,
  ySeed: number,
  separated: boolean,
  separationX: number,
  surface: 'upper' | 'lower' | 'none',
): Streamline | null {
  let x = -0.22;
  let y = ySeed;
  const points: string[] = [];
  let wake = false;
  const start = toScreen({ x, y });
  points.push(`M ${start.x.toFixed(2)} ${start.y.toFixed(2)}`);

  for (let step = 0; step < 90; step++) {
    const predicted = velocityLab(solution, x, y, cos, sin, separated, separationX, surface);
    if (!usable(predicted)) break;
    const speed = Math.hypot(predicted.u, predicted.v);
    if (speed < 0.04) break;
    let dt = STEP_CHORD / speed;
    let advanced = false;
    for (let attempt = 0; attempt < 6; attempt++) {
      const mid = velocityLab(
        solution,
        x + predicted.u * dt * 0.5,
        y + predicted.v * dt * 0.5,
        cos,
        sin,
        separated,
        separationX,
        surface,
      );
      if (!usable(mid)) {
        dt *= 0.5;
        continue;
      }
      const nextX = x + mid.u * dt;
      const nextY = y + mid.v * dt;
      if (!Number.isFinite(nextX) || !Number.isFinite(nextY) || insideLab(solution, nextX, nextY, cos, sin)) {
        dt *= 0.5;
        continue;
      }
      x = nextX;
      y = nextY;
      if (predicted.wake || mid.wake) wake = true;
      advanced = true;
      break;
    }
    if (!advanced || x > 1.62 || y > 0.72 || y < -0.62) break;
    const screen = toScreen({ x, y });
    points.push(`L ${screen.x.toFixed(2)} ${screen.y.toFixed(2)}`);
  }
  if (points.length < 8) return null;
  return {
    d: points.join(' '),
    wake,
    role: wake ? 'separation-approximation' : 'potential',
  };
}

function velocityLab(
  solution: PanelSolution,
  x: number,
  y: number,
  cos: number,
  sin: number,
  separated: boolean,
  separationX: number,
  surface: 'upper' | 'lower' | 'none',
): LabVelocity | null {
  const chord = labToChord(x, y, cos, sin);
  if (pointInside(solution.nodes, chord.x, chord.y)) return null;
  const field = velocityAt(solution, chord.x, chord.y);
  if (!Number.isFinite(field.u) || !Number.isFinite(field.v)) return null;
  let u = field.u;
  let v = field.v;
  let wake = false;
  if (separated && surface !== 'none' && inWake(chord.x, chord.y, separationX, surface)) {
    wake = true;
    const gap = wallGap(chord.x, chord.y, surface);
    const remain = Math.max(0.05, 1 - separationX);
    const opened = Math.max(0, chord.x - separationX) / remain;
    const height = 0.025 + 0.22 * (1 - separationX) * (0.35 + opened);
    const depth = clamp01(1 - Math.max(gap, 0) / height);
    u = u * (1 - depth) + cos * depth;
    v = v * (1 - depth) + sin * depth;
  }
  return { u: u * cos + v * sin, v: -u * sin + v * cos, wake };
}

function usable(velocity: LabVelocity | null): velocity is LabVelocity {
  return velocity !== null && Number.isFinite(velocity.u) && Number.isFinite(velocity.v);
}

function insideLab(solution: PanelSolution, x: number, y: number, cos: number, sin: number): boolean {
  const chord = labToChord(x, y, cos, sin);
  return pointInside(solution.nodes, chord.x, chord.y);
}

function inWake(x: number, y: number, separationX: number, surface: 'upper' | 'lower'): boolean {
  if (x < separationX || x > 1.35) return false;
  const gap = wallGap(x, y, surface);
  const remain = Math.max(0.05, 1 - separationX);
  const opened = Math.max(0, x - separationX) / remain;
  const height = 0.03 + 0.28 * (1 - separationX) * (0.4 + opened);
  return gap > -0.015 && gap < height;
}

function wallGap(x: number, y: number, surface: 'upper' | 'lower'): number {
  const station = clamp01(x);
  const wall = surfacePoint(station, NACA_2412, surface);
  return surface === 'upper' ? y - wall.y : wall.y - y;
}

function labToChord(xLab: number, yLab: number, cos: number, sin: number): XY {
  const dx = xLab - VIEW.pivotX;
  return { x: VIEW.pivotX + dx * cos - yLab * sin, y: dx * sin + yLab * cos };
}

function rotateChordToLab(x: number, y: number, cos: number, sin: number): XY {
  const dx = x - VIEW.pivotX;
  return { x: VIEW.pivotX + dx * cos + y * sin, y: -dx * sin + y * cos };
}

function toScreen(lab: XY): { x: number; y: number } {
  return {
    x: round2(VIEW.originX + lab.x * VIEW.scale),
    y: round2(VIEW.originY - lab.y * VIEW.scale),
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
