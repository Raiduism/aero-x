# AERO-X engineering report

AERO-X is an interactive laboratory for one aerofoil and one simplified wing spar. It is a portfolio model for design engineering. It is not a Navier–Stokes solver, and the structural page is not a finite-element analysis.

The production aerodynamic equations were left as they are. The structural calculations do not feed back into them.

## 1. Project objectives

The laboratory is meant to show four things that can be inspected, not just displayed:

- a NACA 2412 section, generated from the four-digit equations
- an incompressible Hess–Smith panel solution, with an integral boundary layer on that velocity
- a comparison of eight section scalars with NACA Report 586, Table I
- a cantilever spar whose load, material and section can be changed, with the assumptions written next to the numbers

The aerodynamic operating point and the structural design load are different questions. The page says so.

## 2. Design requirements

The model has to stay traceable.

- Geometry, panel method, boundary-layer criteria and force algebra are fixed. They are not tuned to the tunnel.
- Experimental numbers are copied from a named table. Missing cells stay missing. No uncertainty band is invented.
- Structural loads use SI units. Design lift is `n m g`, with `g = 9.80665 m/s²`.
- The elliptical lift used by the beam is labelled as an assumption.
- Material numbers come from named datasheets and are typical values, not allowables.
- A composite tape is not given a metal yield stress.
- Invalid spar geometry is rejected instead of plotted.

What the project does not require, and does not claim: a certified load case, a full aircraft mass model, a 3D aerodynamic load, or a closed aeroelastic loop.

## 3. NACA 2412 geometry

The section is the NACA four-digit family: 2% camber at 40% chord, 12% thickness. The thickness polynomial in the code uses `a4 = −0.1036` so the trailing edge closes. NACA Report 460 published `a4 = −0.1015`, which leaves a small gap. That difference is stated in the laboratory notes.

The planform used for wing force and for the beam is unswept and untapered: area `S = chord × span`. There is no twist, dihedral or sweep in either model.

Source: Jacobs, Ward and Pinkerton, NACA Report 460, *The Characteristics of 78 Related Airfoil Sections from Tests in the Variable-Density Wind Tunnel*, 1933. NTRS 19930091108. https://ntrs.nasa.gov/citations/19930091108

## 4. Hess–Smith panel method

Inviscid lift and surface speed come from an incompressible Hess–Smith panel solution at the geometric angle of attack. The production call uses 80 panels. The same geometry can be re-discretised at 40 and 160 panels for the regression sweep; that path is not the interactive solver.

The pressure colours and the `Cp` bars are this inviscid field. Streamlines are integrated in the same solution. After the model's separation station, nearby tracers are blended toward the freestream. Those orange paths mark the station. They are not Navier–Stokes streamlines.

Airspeed does not change the incompressible pressure field. It changes Reynolds number, and it changes how fast the dashes move.

Source of the method: Hess and Smith, "Calculation of Potential Flow About Arbitrary Bodies," *Progress in Aeronautical Sciences*, Vol. 8, 1967.

## 5. Boundary-layer modelling

The boundary layer is an integral march on the panel speed. Displacement thickness is not fed back. The equations in `lib/boundaryLayer.ts` are:

- Laminar: Thwaites' quadrature, `θ² u_e⁶ = 0.45 ν ∫ u_e⁵ ds`, with a stagnation start `θ² = 0.075 ν / u_e'`. Separation when `λ = −0.09`.
- Turbulent: Head's entrainment method, with the Cebeci–Bradshaw `H₁(H)` fits and the Ludwieg–Tillmann skin friction. The march treats `H = 2.4` as separation.
- The march stops at `x/c = 0.99`. The inviscid spike in the last percent of chord is a sharp trailing edge, not a measured stall.

Viscosity is fixed at the ISA sea-level value `1.7894×10⁻⁵ Pa·s`. Density is the slider, so Reynolds number does not follow a standard-atmosphere temperature lapse.

Thwaites, B., "Approximate Calculation of the Laminar Boundary Layer," *Aeronautical Quarterly*, Vol. 1, 1949. Head, M. R., *Entrainment in the Turbulent Boundary Layer*, ARC R&M 3152, 1960.

## 6. Transition and separation assumptions

Michel's criterion is the natural-transition test:

`Re_θ ≥ 1.174 (1 + 22400 / Re_x) Re_x^0.46`, with `Re_x` measured from stagnation.

If Thwaites' `λ = −0.09` is met before Michel, the model does not calculate the bubble. It restarts Head at that station with an imposed shape factor `H = 1.4`. The laboratory calls that an assumed short bubble. Bubble length, shear-layer transition and reattachment are not solved, and the restart is not labelled as Michel transition.

A station at or behind `x/c = 0.97` is kept attached in the force calculation, because reporting the trimmed trailing-edge spike as stall would be a cutoff. The `0.80c` wording on the page is a display boundary on this model's own separation station. It is not a measured stall angle.

A Head step that does not stay finite is an integration failure. It is not counted as separation, and the force readout is marked invalid.

## 7. Lift and drag calculations

While both surfaces stay attached, profile drag is the Squire–Young wake integral on the Thwaites / Michel / Head march.

After separation, the section force uses Kirchhoff's free-streamline factor in the static form used by Beddoes:

- `Cn = Cn_potential ((1 + √f) / 2)²`
- `Ca = Ca_potential √f`

`f` is the chordwise separation station from the integral march, and `f = 1` while the surface is attached. Skin friction added to that pressure drag is Schlichting's turbulent flat-plate law on both sides, `cf = 0.074 Re^(−1/5)`, `cd_f = 2 cf`, with no form factor and no camber. Profile drag is the larger of that sum and the Squire–Young value at the last attached station, so a station that has only just separated does not report less drag than the attached wake formula. Squire–Young itself is outside its derivation once the layer has left the wall.

Squire and Young, *The Calculation of the Profile Drag of Aerofoils*, ARC R&M 1838, 1938.

## 8. Finite-wing approximation

Wing lift and drag add Prandtl's elliptical lifting-line results:

- induced angle `α_i = CL / (π AR)`
- induced drag `CD_i = CL² / (π AR)`

`AR = span / chord` for this rectangular planform. The elliptical induced drag is a lower bound. A rectangular wing produces more. No Oswald factor is inserted, because the two inputs do not determine one. Past separation the same algebra is continued, without the linear-section assumption.

This is not a three-dimensional lift distribution. The structural page must not read the elliptical shape as something the panel method calculated.

## 9. Experimental comparison against NACA Report 586

The comparison uses Jacobs and Sherman, NACA Report 586, *Airfoil Section Characteristics as Affected by Variations of the Reynolds Number*, 1937. NASA NTRS 19930091662. https://ntrs.nasa.gov/citations/19930091662

The quantities are the eight NACA 2412 rows of Table I: corrected section characteristics at the effective Reynolds number, not a polar. The lift-curve slope at effective Reynolds number 110,000 is blank and is omitted. No stall angle is printed.

The model row is `sectionAt` at that effective Reynolds number, angles from −8° to 22° in steps of 0.5°. Zero-lift angle is the interpolated crossing. Slope is a straight-line fit on attached samples from −4° to 6°. Maximum lift and minimum drag are the extremes of that sweep.

At effective Reynolds number 438,000 the printed minimum profile drag is 0.0067. The model minimum on that sweep is 0.00819. The signed difference, model minus table, is +0.00149.

| Quantity | n | MAE | RMSE | Maximum absolute error |
|---|---|---|---|---|
| Zero-lift angle | 8 | 0.172° | 0.305° | 0.829° |
| Lift-curve slope | 7 | 0.0236 per degree | 0.0237 | 0.0255 |
| Maximum section lift | 8 | 0.422 | 0.432 | 0.509 |
| Minimum profile drag | 8 | 0.00333 | 0.00443 | 0.0101 |

Page 4 of the report says that drag and pitching-moment results below an effective Reynolds number of 800,000 become relatively inaccurate because of the measuring equipment. The curve of drag against angle or lift is then not well defined. No numerical uncertainty band is given, and none is added here. The rows at 438,000, 218,000 and 110,000 fall under that warning. The row at 879,000 does not. Lift, zero-lift angle and slope are not the quantities named in that sentence.

The full-precision record is `experiment/naca2412/audited-comparison.csv`. The working transcription is `experiment/naca2412/table-i-comparison.csv` and `experiment/naca2412/scalar-errors.csv`. An earlier misreading of the 438,000 drag cell was corrected in the working files. The audited file was not rewritten.

This comparison does not establish a lift or drag polar error, a stall angle, or a physical cause. In particular it does not show that the imposed `H = 1.4` restart produced the drag difference. The graphs in Report 586 were not digitised.

The eight test Reynolds numbers stored beside the table were inferred by pairing Table I with the figure legend in high-to-low order. That pairing is not itself a Table I cell.

## 10. Numerical sensitivity and convergence

Two checks sit beside the production solver and do not replace it.

The regression matrix is 26 angles from −5° to 20°, Reynolds numbers 100,000, 500,000 and 1,000,000, and 40, 80 and 160 panels: 234 cases. It compares the current force path with `validation/aero-validation.csv`. The run recorded in `docs/completion-report.md` is the result for this version.

Separate convergence and boundary-layer studies live in `convergence/report.md` and `transition/report.md`. They varied smoothing, station spacing and the Head start. They were not used to retune the production march. The `H = 1.4` restart remains an assumed short bubble.

A non-finite Head step is classified as an integration failure. On the stored regression matrix that class did not occur. The failure path is still tested with a poisoned input so that an invalid march cannot be presented as an attached wake.

## 11. Materials and structural methodology

One wing is a cantilever. The root is built in. The tip is free. Lift is a distributed upward load. The spar is a hollow rectangle of constant section.

Design lift of the aircraft is `L = n m g`. Each wing carries `L/2`. The default load is elliptical:

`ℓ(y) = ℓ0 √(1 − (y/s)²)`, `s = b/2`, `ℓ0 = 2L / (π s)`.

The root bending moment of that distribution is `M(0) = L b / (3π)`. A uniform load would give `L b / 8` and is not used when the elliptical distribution is selected. The integrator is checked against both: the elliptical moment against the closed form, and a separate uniform-load case against `w s⁴ / (8 EI)`.

The integration uses 400 equal steps and the trapezoidal rule. Shear and moment start at zero at the tip and accumulate toward the root. Slope and deflection start at zero at the root and accumulate toward the tip, with `dθ/dy = M/(EI)` and `dv/dy = θ`. `EI` is constant.

The section properties are

`I = [B H³ − (B − 2t)(H − 2t)³] / 12`

`σ = M c / I`, `c = H/2`.

`σ` is the root outer-fibre bending stress. If `2t` reaches the width or the height, the section is rejected.

Spar mass is density times the hollow area times the semi-span, reported for one wing and for both. The skin, ribs and fuselage are not in that mass.

Chord does not enter `EI`. It is shared with the aerodynamic page so that one wing is being discussed. If `H` exceeds 12% of that chord, the page warns that a NACA 2412 section cannot contain the spar. The beam result is still shown.

The aerodynamic model's present lift is shown beside the design lift and is not substituted for it.

## 12. Material comparison

Four materials are stored in `lib/materials.ts`. Aluminium figures are Aluminium Association typical values as published by ASM MatWeb, marked not for design. The composite figures are the AS4 unidirectional column of the Hexcel HexPly 8552 European product sheet at 25°C, dry.

| Material | Density | Modulus used | Strength used in the check | Source |
|---|---|---|---|---|
| 2024-T3 | 2,780 kg/m³ | 73.1 GPa | 345 MPa tensile yield | https://asm.matweb.com/search/specificmaterial.asp?bassnum=ma2024t3 |
| 6061-T6 | 2,700 kg/m³ | 68.9 GPa | 276 MPa tensile yield | https://asm.matweb.com/search/specificmaterial.asp?bassnum=ma6061t6 |
| 7075-T6 | 2,810 kg/m³ | 71.7 GPa | 503 MPa tensile yield | https://asm.matweb.com/search/SpecificMaterial.asp?bassnum=MA7075T6 |
| HexPly 8552 / AS4 | 1,580 kg/m³ | 141 GPa, 0° tension | 2,207 MPa 0° tension and 1,531 MPa 0° compression | https://www.hexcel.com/wp-content/uploads/2025/12/HexPly_8552_eu_DataSheet1.pdf |

The tape also lists 10 GPa and 81 MPa in 90° tension, and a 0° compression modulus of 128 GPa. The beam uses 141 GPa for the whole section only as an equivalent, and only if the fibres are imagined along the spar. The US HexPly sheet lists 19.6 msi for the 0° tensile modulus in the same nominal condition, so the stiffness is sheet-dependent. https://www.hexcel.com/wp-content/uploads/2026/01/HexPly_8552_us_DataSheet.pdf

In this elastic beam the stress does not change with material. Mass follows density. Deflection follows `1/E`. Metals are checked with yield divided by stress. The tape is checked with its 0° tension and 0° compression strengths divided by the same stress. Those ratios are not yield factors, and the 0° tensile strength is not compared with 7075 yield as if they were one criterion.

No material is ranked as the winner. 7075-T6 gives the largest yield margin at a fixed section and carries a stress-corrosion penalty that this beam does not model. 6061-T6 is heavier in margin and easier to join. The tape is light and stiff only along the fibre direction assumed here.

Properties vary with temper, product form, layup, manufacturing and loading direction. These cards are a comparison of published typical numbers, not a material allowables database.

## 13. Structural model assumptions

- The aircraft mass and the load factor are inputs. They are not taken from a flight manual.
- Positive load factor only. No negative-g case, no ground case, no fuel.
- Lift is shared equally by two wings. The fuselage carries none of the bending in this drawing.
- The load shape is elliptical from root to tip. Real rectangular wings are not elliptical, and the panel method does not produce this shape.
- One box spar, constant along the span, takes all of the bending. The skin is not a torsion box.
- Shear deformation, torsion, buckling, cutouts, fittings and fatigue are omitted from the deflection. The safety page reports root web shear with τ = VQ/(I·2t) and leaves the material shear check unevaluated, because no shear strength is stored.
- Deflection is the engineer’s beam equation for small rotation of a constant `EI` beam. It is not a large-displacement solution.
- The drawing exaggerates the curve when the true deflection would be hard to see, and it says so.
- Metal isotropy is the usual engineering assumption for these wrought alloys. The composite is not isotropic, and the page says when it is being treated as an equivalent unidirectional bar.

## 14. Limitations and future development

Four layers should stay distinct.

| Layer | What it is here | What it is not |
|---|---|---|
| Potential flow | Hess–Smith, incompressible, one angle | Navier–Stokes, or a viscous pressure |
| Integral boundary layer | Thwaites, Michel, Head, one-way coupled | A calculated laminar bubble, or a measured stall |
| Experiment | Eight Table I scalars, including the page-4 drag warning | A polar error, a stall angle, or a cause |
| Beam | Constant-section cantilever under an assumed elliptical load | A finite-element wing, or a certified sizing |

The aerodynamic gaps that would change the numbers, if they were ever built, are displacement coupling, a real laminar-bubble model, and a planform that can support an Oswald factor without inventing one. None of those are in this version, and the production solver was not adjusted toward Report 586.

The flight-safety page judges the same beam against typical published strengths and against limits the user types. Empty limits stay unevaluated. Local buckling stays unevaluated. The design search is a bounded grid over that beam and, when lift or lift-to-drag is requested, over `calculateAero`. It is not a gradient or genetic search, and an infeasible row is not called preferred.

Safety margin, one definition. Every evaluated check reports `margin = (capacity − demand) / capacity`. For tensile yield, capacity is the published typical yield and demand is the root bending stress. For the tape, capacity is the 0° tensile strength or the 0° compressive strength, and demand is the same bending stress. For a typed stress, strain or deflection limit, capacity is that limit and demand is the beam result. For a minimum factor, capacity is the calculated factor and demand is the required minimum. A pass is still demand within capacity: the sign of the margin matches the existing threshold, and a zero margin is exactly on the limit. The governing check is the smallest of those margins. Unevaluated rows have no margin, are excluded from that choice, and are not passes.

The structural gaps that remain are shear flow in a skin-spar box, a load shape taken from a vortex lattice or from measured pressure, buckling of the thin wall, and a laminate that is actually laid up. Joining any of those back to the panel method would be a new model, not a display option on this one.

The regression result for the aerodynamic baseline, and the structural tests, are recorded in `docs/completion-report.md` for the run that accompanied this report.
