/**
 * NACA four-digit geometry.
 *
 * Camber and thickness follow Jacobs, Ward and Pinkerton, NACA Report 460:
 *   y_t = 5 t (0.2969 √x − 0.1260 x − 0.3516 x² + 0.2843 x³ + a4 x⁴)
 *   y_c from the standard two-piece parabolic camber line.
 *
 * Report 460 uses a4 = −0.1015, which leaves a trailing-edge thickness of
 * about 0.00126 c on a 12% section. The coefficient used here is
 * a4 = −0.1036 so that y_t(1) = 0. That is the usual closure for a panel
 * method; it is an algebraic adjustment of the published polynomial, not a
 * change to the camber line. Cosine spacing is only the node distribution.
 */

export const NACA_2412 = { m: 0.02, p: 0.4, t: 0.12 } as const;

/** Closed-trailing-edge thickness coefficients. a4 replaces the open-TE value −0.1015. */
export const THICKNESS_COEFFS = {
  a0: 0.2969,
  a1: -0.126,
  a2: -0.3516,
  a3: 0.2843,
  a4: -0.1036,
  openTrailingEdgeA4: -0.1015,
} as const;

export type NacaDigits = { m: number; p: number; t: number };
export type XY = { x: number; y: number };

export function thicknessRatio(x: number, t: number): number {
  const xc = clamp01(x);
  const { a0, a1, a2, a3, a4 } = THICKNESS_COEFFS;
  const yt =
    5 *
    t *
    (a0 * Math.sqrt(xc) + a1 * xc + a2 * xc * xc + a3 * xc * xc * xc + a4 * xc * xc * xc * xc);
  return yt;
}

/** Camber line ordinate and slope dy_c/dx. At x = p the two analytic pieces meet with zero slope. */
export function camberLine(x: number, m: number, p: number): { yc: number; dyc: number } {
  const xc = clamp01(x);
  if (m === 0 || p <= 0 || p >= 1) return { yc: 0, dyc: 0 };
  if (xc < p) {
    const p2 = p * p;
    return { yc: (m / p2) * (2 * p * xc - xc * xc), dyc: ((2 * m) / p2) * (p - xc) };
  }
  const q = 1 - p;
  const q2 = q * q;
  return {
    yc: (m / q2) * (1 - 2 * p + 2 * p * xc - xc * xc),
    dyc: ((2 * m) / q2) * (p - xc),
  };
}

export function surfacePoint(x: number, digits: NacaDigits, side: 'upper' | 'lower'): XY {
  const { yc, dyc } = camberLine(x, digits.m, digits.p);
  const yt = thicknessRatio(x, digits.t);
  const theta = Math.atan(dyc);
  const s = Math.sin(theta);
  const c = Math.cos(theta);
  if (side === 'upper') return { x: x - yt * s, y: yc + yt * c };
  return { x: x + yt * s, y: yc - yt * c };
}

/**
 * Closed loop of panel nodes, clockwise, starting at the trailing edge and
 * running along the lower surface, around the leading edge, and back along
 * the upper surface. The final node is the last upper-surface point before
 * the trailing edge; the closing panel returns to the trailing edge.
 */
export function nacaNodes(digits: NacaDigits, panelCount: number): XY[] {
  const n = panelCount % 2 === 0 ? panelCount : panelCount + 1;
  const half = n / 2;
  const upper: XY[] = [];
  const lower: XY[] = [];
  for (let i = 0; i <= half; i++) {
    const beta = (Math.PI * i) / half;
    const x = 0.5 * (1 - Math.cos(beta));
    upper.push(surfacePoint(x, digits, 'upper'));
    lower.push(surfacePoint(x, digits, 'lower'));
  }
  const nodes: XY[] = [];
  for (let i = lower.length - 1; i >= 0; i--) nodes.push(lower[i]);
  for (let i = 1; i < upper.length - 1; i++) nodes.push(upper[i]);
  return nodes;
}

export function naca2412Nodes(panelCount = 80): XY[] {
  return nacaNodes(NACA_2412, panelCount);
}

/** Maximum of the thickness polynomial on (0, 1). The four-digit family peaks near x = 0.3. */
export function maxThicknessStation(t = NACA_2412.t): { x: number; yt: number } {
  let bestX = 0.3;
  let best = 0;
  for (let i = 1; i < 2000; i++) {
    const x = i / 2000;
    const yt = thicknessRatio(x, t);
    if (yt > best) {
      best = yt;
      bestX = x;
    }
  }
  return { x: bestX, yt: best };
}

function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}
