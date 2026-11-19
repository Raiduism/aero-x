# Convergence experiments

These runs do not modify the production solver. The production march was used only as a check: the transcribed three-point, midpoint, forced-stagnation case matches `marchBoundaryLayer` on every upper and lower station in this matrix (0 mismatches). No case returned a non-finite Head state. Nothing here is a wind-tunnel result.

The matrix is α = 5°, 10°, 13°, 15°; Re = 100,000 and 500,000; 40, 80, 160 and 320 panels. The fixed-chord half-width is 0.02c. That length was chosen before the runs. It was not adjusted afterwards.

Three questions are kept separate below.

- **Numerical convergence** means the discrete output stops changing as the panel count increases.
- **Physical accuracy** would require a viscous solution with displacement coupling, or a measurement. This study has neither.
- **Theoretical expectation** means a property of the equations being discretised, such as zero drag in steady incompressible potential flow, or a finite leading-edge speed on a smooth contour.

## 1. Velocity smoothing

Geometry was held fixed on the production midpoint spacing, with Ue = 0 imposed at the upstream panel midpoint. Four filters were applied to that same edge speed.

| Method | What changes |
|---|---|
| `none` | Raw panel speed. Derivative is the one-sided difference. |
| `three_panel` | Production stencil, 0.25 / 0.5 / 0.25 on neighbouring indices. |
| `fixed_chord_0_02` | Tent weights over stations within 0.02c in arc length. Derivative remains one-sided. |
| `quadratic_0_02` | Local quadratic least squares on the same 0.02c support. Thwaites and Head use that polynomial’s slope. |

At the suction peak the 0.02c window contains 3, 4, 10 and 19 stations at 40, 80, 160 and 320 panels. At 40 panels the fixed-chord filter is still a three-point stencil, so it reproduces the production separation. It becomes a different operator only once the panels are finer than 0.02c.

Upper-surface Head station, α = 13°, Re = 100,000:

| Panels | none | three_panel | fixed 0.02c | quadratic 0.02c |
|---:|---:|---:|---:|---:|
| 40 | 0.383 | 0.461 | 0.461 | 0.017 |
| 80 | 0.364 | 0.364 | 0.402 | 0.481 |
| 160 | 0.056 | 0.056 | 0.373 | 0.412 |
| 320 | 0.045 | 0.045 | 0.340 | 0.369 |

Same angle, Re = 500,000: the unsmoothed and three-point marches move from about 0.69–0.76 down to 0.651. The fixed-chord march moves from 0.762 to 0.670. The quadratic march is 0.017 at 40 panels, then 0.745, 0.702, 0.679.

Upper-surface Head station, α = 15°, Re = 100,000, at 320 panels: none and three-point both sit at 0.027; fixed-chord at 0.037; quadratic at 0.041. All four have joined the early-separation branch. At 40 panels the three-point value is still 0.308 and the fixed-chord value is 0.237.

At α = 5° every filter’s Head station stays near x/c = 0.90–0.95, and the 40-to-320 spread is about 0.02c. Michel transition appears on that case at Re = 500,000, near x/c = 0.26–0.28 for 160 and 320 panels. It does not appear at 13° or 15° in this matrix. The cliff is a laminar Thwaites crossing followed by an immediate Head restart, which is the production short-bubble path.

Raw peak speed at 13°, upper surface, with no smoothing: 3.183, 3.191, 3.230, 3.241. It is still rising at 320 panels. The strongest adverse gradient forward of x/c = 0.20 stays near −16 to −18 and its station moves from 0.037 to 0.021. The fixed-chord peak levels off (2.923, 3.054, 3.059, 3.061) while its Head station does not: from 160 to 320 panels it still moves by −0.033c, which is as large as the previous step.

The quadratic slope at 40 panels is a different failure. Laminar λ = −0.09 is reported at x/c = 0.042, and Head then stops at x/c = 0.017 for both Reynolds numbers. Chordwise x is not monotonic on the nose, because the march runs toward the leading edge and then aft. A three-point quadratic on that coarse nose produces a slope that trips H = 2.4 on the next station. By 80 panels the same method has jumped to 0.481. A method that moves 0.46c when the grid is doubled has not converged.

**Numerical convergence.** With no smoothing, and with the production three-point stencil, the 13° / Re = 100,000 Head station does approach a stable value, and that value is near x/c = 0.045. The three-point stencil has become so narrow that it matches the unsmoothed march at 160 and 320 panels. The fixed-chord march has not reached a stable station by 320 panels at 13°, and at 15° it is approaching the same early station as the unsmoothed march. The quadratic march is the least stable of the four at coarse resolution.

**Physical accuracy.** The early station is the inviscid suction peak, sampled one way, with Head restarted at H = 1.4 inside an adverse gradient of about −18. Displacement thickness is not fed back, so refining the panels resolves that spike more sharply. A stable number from that system is a property of the one-way coupling. It is not a prediction that the boundary layer separates at 4% chord.

**Theoretical expectation.** On a smooth contour the incompressible potential speed at the nose is finite. The unsmoothed peak is still changing in the third digit at 320 panels, so the leading-edge velocity itself is not fully grid-converged. A filter that holds the peak at 3.06 while the raw peak is 3.24 is solving a smoothed problem. Agreement across panel counts for that smoothed problem would still need to be demonstrated; 0.02c has not demonstrated it.

## 2. Arc length and the stagnation point

The filter was held on the production three-point stencil. Four geometries were compared: midpoint gaps or panel arc length, and Ue = 0 either at the upstream midpoint or at a vt zero interpolated between the two midpoints.

Arc length between adjacent midpoints is half of each panel length. The interpolated zero moves the recorded stagnation point. At 13° the forced midpoint sits at x/c = 0.078 on 40 panels and at 0.047 on 320 panels. The interpolated zero sits at 0.051 and 0.046 on those same grids.

Laminar stations are identical across all four geometries on every case in the matrix. Head stations are identical at 13°, including the cliff from 0.364 at 80 panels to 0.056 at 160. The largest Head difference found anywhere is 0.075c, on one case: α = 15°, Re = 500,000, 40 panels, arc length versus midpoint (0.617 versus 0.692). Refinement removes even that difference.

**Numerical convergence.** Changing the surface coordinate and placing the zero between panels does not remove the panel-count cliff. The separation station is set by the leading-edge velocity samples, and those samples are the same panel speeds in all four geometries.

**Physical accuracy.** A stagnation point that moves from x/c = 0.078 to 0.047 under refinement is a collocation-point detail. It does not identify where the viscous layer leaves the surface.

**Theoretical expectation.** Arc length is the coordinate in Thwaites’ integral. Using it is consistent with the equation. These runs show that consistency changes the separation station by less than one coarse panel, except for the single 40-panel case above.

## 3. Pressure integration

Kutta–Joukowski lift is the circulation of the same panel solution. Four integrals of that solution were compared.

| Method | Sampling |
|---|---|
| `rectangle_midpoint` | Production sum of Cp at the collocation point times panel length. |
| `gauss3_speed` | Three-point Gauss on each flat panel, Cp = 1 − q² with q the full speed. |
| `gauss3_tangential` | Same nodes, Cp = 1 − (V·t)². |
| `gauss3_offset` | Same nodes displaced 0.002c along the outward normal, Cp = 1 − q². |

The rectangle reproduction matches the solver’s stored pressure lift and drag on every case.

At α = 13° the rectangle lift sits below the circulation lift by 0.0376, 0.0202, 0.0104 and 0.0053 as the panel count doubles. The drag residual is −1.4×10⁻⁴, −9.6×10⁻⁴, −6.3×10⁻⁴ and −3.4×10⁻⁴. The same halving of the lift gap appears at 5°, 10° and 15°. The normal residual at the collocation points stays near 10⁻⁸. Nose thrust and aft drag remain about −0.25 and +0.25; the reported drag is what is left after that cancellation.

Both on-panel Gauss rules miss the circulation lift by 0.5 to 1.0 and the error is larger at 320 panels than at 80. Their maximum normal speed on the sample points is about 3.2, and it does not fall with panel count. A flat panel is a chord of the curved nose, so a Gauss node that is not the midpoint lies inside the aerofoil, where this velocity evaluation is not the exterior flow. Discarding the normal component does not repair that.

The 0.002c outward offset brings the 40-panel lift error at 13° down to 0.018, which is smaller than the rectangle error. With refinement the offset error grows (0.023, 0.026, 0.028) and the drag residual grows (0.012 to 0.037). The largest normal speed falls only from 0.66 to 0.25. A fixed offset is a different mesh-dependent sample, and it does not approach the circulation lift.

**Numerical convergence.** The midpoint rectangle is the integral that moves toward the Kutta–Joukowski value. The observed lift gap behaves as 1/N over this range. The on-panel and fixed-offset rules do not.

**Physical accuracy.** Closing the gap between the two inviscid lift definitions does not validate the viscous drag. The rectangle drag is an inviscid residual.

**Theoretical expectation.** Steady incompressible potential flow on a closed body exerts no drag. A convergent pressure integral should drive that residual toward zero and should drive pressure lift toward the circulation lift. The rectangle rule is the one behaving that way. Kutta–Joukowski lift is the definition that does not depend on this quadrature.

## 4. Which change comes first

Arc length and stagnation interpolation are not the first change. They leave the laminar station untouched and leave the 13° cliff in place.

On-panel Gauss quadrature, with or without a fixed normal offset, is not a replacement for the rectangle rule. The rectangle rule is the pressure integral that converges toward the circulation lift, and the circulation lift should remain the force coefficient while that gap is still several thousandths.

The quadratic derivative is not the first change. At 40 panels it trips Head at x/c = 0.017 for both Reynolds numbers, then moves by nearly half a chord at the next refinement.

The experiment that changes the panel-count behaviour is the width of the velocity filter. The production three-point stencil is an index stencil. By 160 panels it is narrow enough to match no smoothing, and both then sit on the leading-edge spike. A filter whose support is a fixed fraction of chord is the numerical change that addresses that defect.

The particular width 0.02c should not be installed as a settled model. At 13° and Re = 100,000 its Head station is still moving at 320 panels (0.373 to 0.340), and at 15° it has already fallen to 0.037. Those plots are smoother than the unsmoothed cliff at moderate resolution. Smoothness is not convergence, and the early station of the unsmoothed march is not a physical separation point.

So the first implementation, when one is requested, is to replace the index stencil with a fixed-chord filter and to repeat this panel sweep at more than one width until the Head station stops moving. Arc length can be adopted in that same change as the coordinate the integral is written in. It should not be expected to move the separation station. The pressure path stays the midpoint rectangle, reported beside the Kutta–Joukowski lift, until a quadrature is shown to approach that lift under refinement.

## Files

- `smoothing.csv`, `arc-length.csv`, `pressure.csv` — one row per case, surface, and method
- `lambda-stations.csv` — Ue, dUe/ds and λ at each station, including stations after Head has started
- `convergence-metrics.csv` — stations at 40, 80, 160 and 320 panels, and whether the last step is smaller than the one before it
- `head-smoothing-re100000.svg`, `head-smoothing-re500000.svg`, `laminar-smoothing-re100000.svg`, `laminar-smoothing-re500000.svg`
- `head-arc-re100000.svg`, `head-arc-re500000.svg`, `laminar-arc-re100000.svg`, `laminar-arc-re500000.svg`
- `ue-alpha13-re100000.svg`, `lambda-alpha13-re100000.svg` — filters at 40 and 320 panels, x/c ≤ 0.20
- `pressure-lift.svg`, `pressure-drag.svg`

A plotted separation at x/c = 1 means the march reached the trim still attached. The λ plot clips the axis for display. The CSV keeps every value. The script is `scripts/convergence-experiments.ts`.
