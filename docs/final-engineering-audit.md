# AERO-X final engineering integrity audit

Date of this audit: 19 November 2026.

Role: independent review of the code, the validation files, the automated tests, and the running interface. No production aerodynamic equation, coefficient, or calibration constant was changed. No discovered issue was corrected during the audit. No experimental comparison was retuned.

Verdict: AERO-X can be presented as an engineering portfolio project. It cannot be presented as a closed, certified, or experimentally validated design tool. The safety-ranking defect recorded below has been corrected: every judged margin is now `(capacity − demand) / capacity`, and the governing check is the smallest of those margins. The aerodynamic solver and the corrected NACA Report 586 comparison were left as they are.

## 1. Executive summary

The application has one aerodynamic solver, one beam model, one material list, and one safety judgement. The five pages read the same wing. The aerodynamic regression matches its stored baseline with a maximum absolute difference of 0 across 234 cases. The Report 586 working files still use minimum drag 0.0067 at effective Reynolds number 438,000, and a fresh `sectionAt` sweep still produces model minimum drag 0.00819098 at that condition.

The structural load, root moment, hollow-section modulus, and spar mass agree with the stated analytical relations. Material checks are labelled differently for metal and the carbon tape. Empty limits and a closed spar are not counted as passes. An infeasible search row is not called preferred.

The audit found one defect in `assessSafety`. User stress, strain, and deflection margins used `(capacity − demand) / capacity`. The yield factor and the minimum-factor margin used `(ratio − reference) / reference`. Those numbers were compared when the governing check was chosen. That ranking has since been corrected. The before-and-after numbers are in the correction record at the end of this file. The paragraphs below keep the evidence from the audit as it was run.

A second, smaller group of issues is presentational: the dashboard heading says “section model” above wing coefficients; the plan view does not scale span; a three-objective search refers to a table that is not on the page; `calculateAero` silently clamps a span that the beam still accepts.

## 2. Project architecture

Shared inputs live in `app/page.tsx`: airspeed, geometric angle, density, span, chord, `WingDesign` (mass, load factor, material, spar width, height, and wall), the baseline snapshot, the session saved-case list, and the safety limit strings.

| Quantity | Source of truth | Who calls it |
|---|---|---|
| NACA 2412 geometry | `nacaNodes` / `thicknessRatio` in `lib/naca.ts` | Panel solver |
| Hess–Smith solution, Kutta condition, Cp, Joukowski lift | `solveNaca2412` in `lib/panel.ts` | `sectionFromSolution`, and `buildFlowScene` on that same solution |
| Boundary layer | `marchBoundaryLayer` in `lib/boundaryLayer.ts` | `sectionFromSolution` only |
| Section and wing forces | `calculateAero`, `sectionAt`, `wingAt` in `lib/aero.ts` | Laboratory, dashboard, and the search when lift or lift-to-drag is requested |
| Wording for separation and invalid forces | `regimeCopy`, `formatModelNumber` in `lib/modelReport.ts` | Laboratory |
| Material cards | `MATERIALS` in `lib/materials.ts` | Beam, safety, search |
| Design lift, ellipse, root moment, stress, deflection, spar mass | `analyzeWing` in `lib/structures.ts` | Structures, safety, dashboard, search |
| PASS / FAIL / NOT EVALUATED | `assessSafety` in `lib/safety.ts` | Flight safety and the dashboard, through `limitsFromFields` |
| Grid, Pareto front, CSV | `searchDesigns`, `searchToCsv` in `lib/optimise.ts` | Design optimiser |

`WingDesign` does not contain span or chord. Those two lengths are separate state, passed into both the aerodynamic call and the beam. The flow picture does not solve the panels again and does not feed forces back. Safety does not re-derive `I` or the root moment. The search calls `analyzeWing` and, only when lift or lift-to-drag is active, the aerodynamic callback supplied by the page.

There is no second copy of the panel, boundary-layer, or beam equations in the pages. The dashboard calls `analyzeWing` and `assessSafety` for the live wing, so the beam runs twice per dashboard render. Both calls use the same input. That is repeated evaluation, not a second theory.

## 3. Aerodynamic integrity

### Geometry — PASS

`NACA_2412` is m = 0.02, p = 0.4, t = 0.12. Camber is the standard two-piece parabola. Thickness uses Report 460 coefficients with a₄ = −0.1036. At x = 1 the closed thickness ordinate is −1.7×10⁻¹⁷, which is numerical zero. The open coefficient a₄ = −0.1015 gives a trailing-edge half-thickness of 0.00126c, matching the comment in `lib/naca.ts`. Nodes are cosine-spaced. The laboratory profile control is fixed on NACA 2412.

### Hess–Smith, Kutta, pressure, and lift — PASS, with a numerical warning

`solveNaca2412` builds 80 panels, constant source per panel, one vortex, and the Kutta row `(V·t)₁ + (V·t)ₙ = 0`. Cp is `1 − q²` on the freestream-normalised speed. The force coefficient used downstream is Joukowski, `cl = 2 Γ / (Vc)`, with circulation `γ` times the panel perimeter. Pressure-integrated lift is retained and is not the value used for forces.

At geometric α = 6°, 80 panels: Joukowski cl = 0.98580, pressure-integrated cl = 0.97159, difference −0.01421. Inviscid pressure drag is −0.000574. That residual is the expected discrete-panel departure from d’Alembert’s paradox, not a viscous drag. **WARNING.** File `lib/panel.ts`, `evaluate`. The Joukowski value is the one the rest of the model uses, and the code says so. It should not be described as identical to the pressure integral.

### Reynolds number — PASS

`Re = ρ V c / μ` with μ fixed at 1.7894×10⁻⁵ Pa·s. Default 1.225 kg/m³, 70 m/s, 1.5 m gives Re = 7,188,163.63. The dashboard shows 7,188,164. The laboratory card shows 7.19M. Density does not follow a standard-atmosphere lapse. The assumptions list says this.

**WARNING.** `sectionAt` caches on `Math.round(Re)`. `wingAt` fills that cache from the rounded Reynolds number before the exact call returns. The displayed Reynolds number is still the exact product. The force sample can belong to a Reynolds number up to half a count away. At flight Reynolds numbers that is negligible. It is a real cache identification choice in `sectionAt`.

### Boundary layer and separation reporting — PASS

The march is Thwaites with λ = −0.09, Michel’s `Re_θ ≥ 1.174 (1 + 22400/Re_x) Re_x^0.46`, and Head with the Cebeci–Bradshaw H₁ fits, Ludwieg–Tillmann friction, separation at H = 2.4 or H₁ = 3.43, and an imposed restart H = 1.4 when laminar separation occurs before Michel. The restart is stored as `shortBubbleRestart`, not as natural transition. The march stops at x/c = 0.99. `classifyHeadStop` refuses to call a non-finite step separated. Stations at or behind x/c = 0.97 stay attached in the force factor. The 0.80c regime label is a display boundary.

At the default point the upper surface records Michel transition at x/c = 0.08 and a Head criterion at x/c = 0.98. The laboratory banner says “Attached in this model”, and the note underneath says the 0.98 station stays attached because of the 0.97c trim. That is consistent with the code, and it is visible. It is not a measured stall angle.

A non-finite panel speed is covered by `tests/aero-regression.test.ts`: the force is invalid rather than an attached wake. Inside the 234-case matrix, integration failures were 0 and all 78 of the 80-panel force rows were finite. At the slider corners α = −8° and 24°, with the lowest slider Reynolds number (about 33,500), `forcesFinite` was still true and the regime was the model’s stalled class. **NOT TESTED** as a live browser operating point that shows the word “invalid”, because no slider corner reached a failed march. The wording function itself is tested.

### Finite wing, and geometric versus effective angle — PASS for the formula, WARNING for the sample

Wing area is chord times span. Induced angle is `CL / (π AR)` converted from radians to degrees. Induced drag is `CL² / (π AR)`. No Oswald factor is added. The assumptions list calls this the elliptical lower bound.

`wing.section`, the flow field, the separation station, and section cl and cd are evaluated at the geometric angle. Profile drag inside the wing drag is sampled at geometric angle minus induced angle, on 1° section samples with linear interpolation. The panel solution drawn on the screen is the geometric-angle solution. The figure says “NOT A CFD RESULT”. Orange paths are titled as a separation sketch.

Default operating point, from `calculateAero` and confirmed on both the dashboard and the laboratory:

| Quantity | Value | What it is |
|---|---|---|
| Section cl | 0.986 | Geometric α = 6°, attached, equal to Joukowski cl |
| Section cd | 0.006454, shown as 0.0065 | Squire–Young at geometric α |
| Induced angle | 2.39° | Lifting line |
| Profile drag used in the wing | 0.006397 | Sample at about 3.61° |
| Induced cd | 0.02905, shown as 0.0290 | `CL² / (π AR)` |
| Wing CL | 0.698 | Lifting line |
| Wing CD | 0.0354 | Profile sample plus induced drag |
| Lift | 25,125 N | `q S CL`, q = 3,001.25 Pa, S = 12 m² |

Adding the displayed section cd to the displayed induced cd gives 0.0355, not 0.0354. The difference is the angle at which profile drag was taken. **WARNING.** Files `lib/aero.ts`, `wingAt`, and the laboratory readout in `app/page.tsx`. The two drags are labelled section and induced, but the page does not say that section cd is not the profile term inside wing cd.

Closing the lifting line on `sectionAt` instead of the 1° table changes wing CL at 6° from 0.69763 to 0.69679, and wing CD from 0.03544 to 0.03530. At 6.5° the table differs from that closed sample by 0.00021 in CL. **WARNING.** The iteration stores the blended CL, then recomputes induced angle and samples profile drag without replacing CL with that last sample. At the displayed three decimals the default card still reads 0.698 either way. It is a numerical weakness, not a second theory.

### Airflow picture — PASS

`buildFlowScene` takes the `PanelSolution` already used for the forces. It does not call the panel solver again. Separated tracers are a wedge downstream of the model station. The wedge is not an input to lift or drag. The laboratory header, the pill, the SVG text, and the footer all say the picture is not CFD.

### Regression — PASS

`npx tsx --test tests/aero-regression.test.ts` was executed in this audit.

- Cases checked: 234 (26 angles from −5° to 20°, Reynolds numbers 100,000, 500,000 and 1,000,000, panel counts 40, 80 and 160).
- Maximum absolute difference from `validation/aero-validation.csv`: 0.
- Finite 80-panel force rows: 78. The test requires `forcesFinite` on each of them.
- State counts: Michel first 60, laminar separation first 385, same station 23, neither 0, Head separation 213, integration failure 0.
- Failed tests: 0.

UI values at the default point match `calculateAero` to the digits the page prints. Changing the laboratory angle to 10.0° changed the laboratory wing CL to 1.034, and the dashboard then showed 10.0°, wing CL 1.034, CD 0.0708, and L/D 14.60.

## 4. Experimental validation integrity

### Corrected Table I comparison — PASS

Working files inspected: `experiment/naca2412/audit.md`, `table-i-comparison.csv`, `scalar-errors.csv`, `sources.txt`, and `audited-comparison.csv`.

All eight effective Reynolds numbers are present: 8,240,000, 6,100,000, 3,420,000, 1,730,000, 879,000, 438,000, 218,000, and 110,000. The slope at 110,000 is blank. `table-i-comparison.csv` also stores a test Reynolds number beside each effective value. `audit.md` says that pairing was inferred from the figure legend and is not a Table I cell. That caveat is in the report.

At effective Re = 438,000 the working experimental drag is 0.0067. A fresh `sectionAt` sweep from −8° to 22° in steps of 0.5° produced minimum profile drag 0.00819098 at 1.5°. Signed difference, model minus table, is +0.001491. Rounded as the report prints it, +0.00149.

`audited-comparison.csv` was not rewritten. Its 438,000 row still contains a previous-extraction column of 0.0087 next to the corrected 0.0067 and the model value 0.00819098. That file is a trace of the correction. It is not the comparison shown as the working table.

Arithmetic on the rounded model columns in `table-i-comparison.csv`:

| Quantity | n | MAE | RMSE | Maximum absolute error |
|---|---|---|---|---|
| Minimum drag | 8 | 0.003329 | 0.004427 | 0.01011 |
| Lift slope, per degree | 7 | 0.02364 | 0.02371 | 0.0255 |
| Zero-lift angle, from the three-decimal column | 8 | 0.17175 | 0.305 | 0.829 |
| Maximum lift | 8 | 0.42187 | 0.432 | 0.509 |

`scalar-errors.csv` reports drag MAE 0.00333, RMSE 0.00443, maximum 0.01011; slope MAE 0.02364; zero-lift MAE 0.17203; maximum-lift MAE 0.42188. The zero-lift MAE uses the unrounded angle −2.12937°, which `audit.md` states. The printed summary figures requested for this audit (0.00333, 0.00443, 0.0101, 0.0236 per degree, 0.172°, 0.422) are those rounded values. They were not altered.

### What the write-up claims — PASS

`audit.md` and `sources.txt` say the comparison is eight scalars, not a polar. They say Table I does not give a stall angle. They say the drag difference does not prove that the short-bubble restart is the cause. They say page 4 of Report 586 calls drag below an effective Reynolds number of 800,000 relatively inaccurate, and that the report gives no numerical uncertainty band. The three rows under that warning are 438,000, 218,000, and 110,000. 879,000 is correctly left outside it. The laboratory assumptions bullet repeats that the comparison is not a polar.

**NOT TESTED:** this audit did not re-open the NASA scan of Report 586. The finding is that the project’s own audit and tables agree with each other and with a new model sweep at Re = 438,000. It is not a fresh transcription from the scan.

## 5. Structural mechanics integrity

### Design lift and the ellipse — PASS

`L = n m g` with g = 9.80665 m/s². Default 3.8 × 1,000 × 9.80665 = 37,265.27 N, shown as 37.27 kN. Half of that is the lift on one wing. Root load intensity is `4 W / (π s)`. The beam does not use panel lift. The structures and safety pages both show the operating aerodynamic lift beside it and say it is not the design load. Raising mass from 1,000 kg to 1,500 kg on the structures page moved the dashboard to design lift 55.90 kN, root moment 47.44 kN·m, stress 251.7 MPa, and tip deflection 156.9 mm, which is 1.5 times the default beam. Spar mass stayed 93.94 kg. Chord is not in `EI`. The structures test “follows span and ignores chord” passed.

### Root moment and root shear — PASS

Analytical moment is `M_root = L b / (3 π)`. At the default wing the 400-step trapezoidal integral gives 31,628.36 N·m against 31,631.74 N·m, a relative error of −1.071×10⁻⁴. Root shear is low by −4.68×10⁻⁵ relative to `L/2`. The same relative errors, to six figures, appeared at spans of 4, 8, 12, and 20 m and masses of 500, 1,000, and 1,800 kg. The error is the quadrature of the ellipse, and it does not grow with span or load in this set. The page shows 31.63 kN·m.

### Section, stress, deflection, mass — PASS

For B = 0.12 m, H = 0.16 m, t = 0.008 m, `I = [BH³ − (B−2t)(H−2t)³] / 12` = 1.508147×10⁻⁵ m⁴, matching `hollowRectangle`. Outer-fibre stress `M c / I` with c = H/2 is 167.77 MPa, shown as 167.8 MPa. Tip deflection is 104.59 mm, shown as 104.6 mm. Both-spar mass is density × area × span = 93.942 kg, shown as 93.94 kg. A wall of 80 mm on the 120 mm box is rejected because the walls meet. The uniform-load tip `w s⁴ / (8 EI)` is covered by `tests/structures.test.ts`, which passed, including the statement that the elliptical tip is smaller than that uniform case for the same total load.

Shear stress `τ = VQ / (I · 2t)` matches a hand evaluation of the same first moment: 8.836 MPa at the default root. The first moment used is the flange above the neutral axis plus both webs. Deflection does not include shear deformation. The safety page reports the shear stress and does not pass it.

**WARNING.** The spar is a constant section over the full semi-span. There is no fuselage cutout, no rib, and no torsion box. The page says so. Local buckling, fatigue, joints, torsion, and aeroelasticity are not calculated.

## 6. Materials database integrity

**PASS** for how the four cards are used. **NOT TESTED** against a fresh download of MatWeb or the Hexcel sheet in this session. The numbers below are the values stored in `lib/materials.ts`, each with a source URL in that file.

| Card | ρ (kg/m³) | E used (GPa) | Strength stored | Source string in the file |
|---|---|---|---|---|
| Aluminium 2024-T3 | 2,780 | 73.1 | Tensile yield 345 MPa, UTS 483 MPa | ASM MatWeb, AA typical, not for design |
| Aluminium 6061-T6 | 2,700 | 68.9 | 276 MPa, 310 MPa | ASM MatWeb, AA typical, not for design |
| Aluminium 7075-T6 | 2,810 | 71.7 | 503 MPa, 572 MPa | ASM MatWeb, AA typical, not for design. SCC noted |
| HexPly 8552 / AS4 tape | 1,580 | 141 at 0° | 0° tension 2,207 MPa, 0° compression 1,531 MPa, 90° tension 81 MPa, 90° modulus 10 GPa | Hexcel European sheet, 25°C dry |

The metal modulus is described as isotropic. The tape modulus is described as a 0° equivalent only if the fibres run along the spar. The 90° values are stored and are not the beam modulus. The structures page says the tape check is not a yield factor. The comparison note says the carbon strength column must not be read as “better than 7075” on the same scale. Changing material changes mass and deflection and leaves bending stress unchanged; that structural test passed.

**WARNING.** `components/MaterialsStructures.tsx`, the composite status icon. The banner class is caution when either 0° ratio is below 1, but the tick character depends only on the compression ratio. With the stored strengths, compression is the lower allowable (1,531 MPa versus 2,207 MPa), so a tension-only failure cannot occur on this card. The icon condition is still narrower than the banner condition.

No shear strength, Poisson’s ratio, fatigue allowable, bearing allowable, or buckling coefficient is stored. Those omissions are written on the cards and on the safety rows.

## 7. Flight Safety integrity

Individual checks use `analyzeWing`. They do not recompute the beam.

| Check | Rule | Default 2024-T3 result |
|---|---|---|
| Tensile yield | Pass when σy/σ ≥ 1. At the time of the audit the stored margin was σy/σ − 1 | PASS, factor 2.056, margin then 1.056 |
| Metal compression | No compressive yield in the database | NOT EVALUATED |
| Tape 0° tension and 0° compression | Separate ratios. Names do not say yield | On the default beam, 13.15 and 9.13, both PASS |
| User stress, strain, deflection, minimum factor | Empty or non-positive stays NOT EVALUATED. Strain is σ/E | Empty on the default page |
| Web shear | Stress is shown. No allowable | NOT EVALUATED, 8.84 MPa |
| Local buckling | No plate model | NOT EVALUATED |
| Closed spar | Overall NOT EVALUATED, with the rejection reason. Not a pass | Confirmed in the browser |

Overall status is FAIL if any judged check fails, PASS if every judged check passes, and NOT EVALUATED if none is judged. Unevaluated rows are excluded from the pass count. The default dashboard reads “PASS · 1 passed · 0 failed · 7 not evaluated” and says an unevaluated row is not a pass.

### Cases run in this audit

1. Default configuration: yield passes; compression, shear, buckling, and four empty limits stay unevaluated. Browser and `assessSafety` agree.
2. Excessive deflection: a 10 mm limit fails. With a 100 MPa stress limit and a minimum factor of 3 as well, the browser governing line was “Tip deflection. Its margin is -9.46.” Stress and the yield-factor check also failed. Shear and strain stayed NOT EVALUATED.
3. Invalid geometry: width 20 mm and wall 20 mm. Banner: nothing has been passed or failed, and the walls meet or cross.
4. Empty limits: remain NOT EVALUATED. An invalid numeric limit is specified as NOT EVALUATED in `limitNumber`. The safety unit test for that case passed.
5. Composite: the live rows were named “0° tensile strength” and “0° compressive strength”, both PASS on this beam. The minimum-factor row was named “Directional strength ratio”, not “Yield factor”.
6. Metal: the same beam named the row “Tensile yield” and the factor row “Yield factor”.
7. Several constraints at once: stress, deflection, and minimum factor failed together; shear was still not evaluated. See the margin defect below.

The automated safety file, 7 tests, passed in this audit, including “a closed spar is not a pass” and the shear-formula comparison.

### Margin definition — FAIL

`SafetyCheck.margin` is commented as `(capacity − demand) / capacity`.

- User stress, strain, and deflection follow that comment.
- Tensile yield stores `yieldFactor − 1`, which is `(σy − σ) / σ`, not `(σy − σ) / σy`.
- The minimum-factor row stores `(factor − minimum) / minimum`.

`assessSafety` selects the governing check by the smallest of these mixed numbers.

Evidence: default beam, deflection limit 348.7 mm. Both the yield check and the deflection check pass. Yield margin is stored as 1.056. Deflection margin is 0.700. The code therefore names deflection. On the capacity definition, the yield margin is `(2.056 − 1) / 2.056 = 0.514`, which is smaller than 0.700, so yield would govern.

Evidence from the browser, with stress limit 100 MPa, deflection limit 10 mm, and minimum factor 3: three checks fail, and deflection governs at −9.46. The stress margin on the stated definition is −0.678 and the factor margin is −0.315. Deflection wins the sort because a large ratio makes `(limit − value) / limit` a large negative number, while the yield margin uses a different expression. The beam numbers are right. The ranking is not on one definition.

File and function: `lib/safety.ts`, `materialChecks`, `userChecks`, and the `governing` reduction in `assessSafety`. The structures page prints the yield factor itself, which is consistent. The safety page prints the mixed margin.

**WARNING, not a second failure.** A default overall PASS does not mean shear, buckling, or metal compression was shown to be safe. Those rows are on the page and are counted as not evaluated. The word PASS is still easy to over-read. The interface does not hide the rows.

**WARNING.** A rejected spar and an empty limit share the status NOT EVALUATED. The rejection reason is in the banner, which the browser showed. A glance at the status word alone does not distinguish them.

## 8. Design Optimiser integrity

`searchDesigns` is a bounded grid. Each axis allows at most 20 values. The product, including materials, stops above 1,500. A reversed axis returns “Wingspan maximum is below its minimum.” The browser showed that sentence and did not draw a preferred row. A non-positive constraint is rejected before the loop. Invalid spar geometry is a violation. `feasible` is false when any violation is present. The preferred row is chosen only from the Pareto subset of feasible points. Ties keep the earlier grid row because the score comparison is strict.

Objectives are spar mass from `analyzeWing`, tip deflection from the same result, and lift-to-drag from the injected `calculateAero` sample. More than one objective normalises each metric across the feasible set and averages them with equal weight. The preference text says equal weights are not a claim that one aircraft is best. The Pareto note says the orange set is a trade, not a single winner.

### Cases

| Case | Result in this audit |
|---|---|
| One feasible 2024-T3 point, mass objective | Preferred mass 93.94176 kg and stress 167,773,313 Pa. The CSV row contains those exact fields, with lift and lift-to-drag blank because they were not required. |
| Deflection limit 10⁻⁶ m, stress limit 500 MPa, two materials | 2 evaluated, 0 feasible, preferred null. |
| Span maximum below minimum, one material | Search rejected. Browser message matched the function. |
| One material versus two | The single-point search used only 2024-T3. The two-material impossible search evaluated both ids. |
| Stress under 500 MPa but tip over 50 mm | Four rows, all infeasible, only the deflection violation recorded. Preferred null. Stress was 203 MPa or 142 MPa, so the stress constraint was not what removed them. |
| Unevaluated modes | The search does not call `assessSafety`. Shear, buckling, and metal compression are not violations unless the user types a stress, deflection, or factor limit that happens to cover them. |

Automated file `tests/optimise.test.ts`: 5 passed, including “a lighter row that breaks the stress constraint is not preferred”, an injected lift constraint, a Pareto front of feasible points only, and CSV quoting.

**WARNING.** `components/DesignOptimiser.tsx`. With three objectives the chart caption says “Third objective stays in the table.” There is no results table on the page. The third objective affects the equal-weight score and the CSV only. This audit did not click a three-objective search in the browser; the caption is in the component.

**WARNING.** A preferred row can be a minimum-mass spar whose web shear, local buckling, and, for a metal, compression face were never judged. The page says a broken active constraint is not preferred, and the footer says the search is not a certified optimisation. It does not list the modes that were outside the grid.

**PASS** for the CSV contract on the one-row case: displayed mass and stress are the CSV mass and stress. Baseline restore and session save are wired to the same `WingDesign` object the other pages read. This audit did not download the file through the button; `searchToCsv` was called on the same result object the button would serialise.

## 9. Shared state and interface integrity

### Pages — PASS, with labelling warnings

Overview is a dashboard: plan view, four summaries, and links. It has no angle slider and no airflow canvas. The laboratory keeps the sliders, the flow field, the polar, the boundary-layer notes, and the assumptions control. Structures, safety, and the search use the parent span, chord, and `WingDesign`.

The dashboard heading “Operating point from the section model” sits above wing CL 0.698, not section cl 0.986. **WARNING.** `components/OverviewDashboard.tsx`. The row labels say “Wing”, so the digits are not the section coefficients, but the heading is the wrong model.

The plan-view rectangles are a fixed pixel span. Chord thickness is capped at 72 px. The text states span and chord; the drawing does not scale span, and the spar line is labelled as not to structural scale. **WARNING.** It does not feed any force or stress.

### Cross-page values — PASS for the edits made in this audit

- Default dashboard, laboratory, and `calculateAero` agree: Re 7,188,164, wing CL 0.698, wing CD 0.0354, L/D 19.68, 93.94 kg, 31.63 kN·m, 167.8 MPa, 104.6 mm.
- Angle 10° on the laboratory appeared on the dashboard as wing CL 1.034.
- Mass 1,500 kg on the structures page appeared on the dashboard as 55.90 kN and 47.44 kN·m.
- Reset restored 8.00 m, 1.50 m, 6.0°, 2024-T3, 120 × 160 × 8.0 mm, and empty safety fields. The browser limits after reset were blank strings.

**WARNING.** `reset` in `app/page.tsx` does not clear the baseline snapshot or the saved-case list. A baseline that the user has moved will still produce non-zero deltas after reset. This audit did not move the baseline before pressing reset; the omission is in the reset function. Saved cases are session state, which the optimiser states. They are not written to disk.

**WARNING.** `calculateAero` clamps span into [0.2, 80] m and chord into [0.05, 20] m. `analyzeWing` uses the requested span. A direct call at span 0.05 m produced an aerodynamic span of 0.20 m and a structural span of 0.05 m. The laboratory number inputs clamp span to [1, 40] m, so the slider cannot do this. `applyPoint` in the optimiser calls `setSpan` with the grid value and does not use that input clamp. A search bound below 0.2 m would show two spans. Not the default grid.

### Layout — PASS for overflow, WARNING for the narrow structural charts

| Width | What was measured |
|---|---|
| 390 px | Overview, laboratory, structures, safety, and optimiser: page overflow 0. Wordmark did not cover the breadcrumb. Laboratory chart 277 × 185 px. Safety chart 270 × 185 px. Two structures charts, each 117 × 185 px. Axes 0–4 m and the curves were visible. The load-chart unit sits on the heading line. |
| 768 px (client width 753 px) | Structures page overflow 0. Charts 207 px wide, still side by side. |
| 1,280 px (client width 1,265 px) | Laboratory overflow 0. Polar chart 546 × 185 px. |

No broken navigation was observed across the five buttons. Units on the default readouts match the calculation units. The closed-spar and reversed-bound error states both rendered.

## 10. Test results

Executed in this audit. Nothing in this list is carried over from an earlier session.

| Command | Result |
|---|---|
| `npx tsc --noEmit --pretty false --incremental false` | Exit code 0 |
| `npm test` (`tests/aero-regression.test.ts`, `tests/structures.test.ts`, `tests/safety.test.ts`, `tests/optimise.test.ts`) | 24 passed, 0 failed, 0 skipped |
| Aerodynamic regression inside that run | 234 cases, maximum absolute difference 0, integration failures 0, finite 80-panel force rows 78 |
| Structural tests | 7 passed |
| Safety tests | 7 passed |
| Optimiser tests | 5 passed |
| Read-only numerical script importing the existing functions | Moment error −0.0107% on 12 span/mass pairs; shear formula match; safety cases; search cases; Re 438,000 minimum drag 0.00819098 |
| Browser at `http://localhost:3456/` | Default agreement, angle and mass propagation, multi-limit safety, closed spar, tape labels, reversed search bounds, reset, and the three widths above |

The production files `lib/aero.ts`, `lib/panel.ts`, `lib/boundaryLayer.ts`, `lib/naca.ts`, `lib/flowField.ts`, and `lib/structures.ts` were not edited.

## 11. Known limitations

These are properties of the model, already stated in the code or the engineering report, and confirmed rather than discovered as defects.

- The aerodynamic model is incompressible Hess–Smith plus an integral boundary layer. It is not Navier–Stokes CFD. Displacement thickness is not fed back. There is no compressibility, sweep, or wind-tunnel polar in the force calculation.
- Profile drag after separation is a Kirchhoff / flat-plate construction, floored by Squire–Young. The orange wake is a drawing.
- Elliptical induced drag is a lower bound for a planar wing. The rectangular wing the page describes would have more induced drag. No Oswald factor is invented.
- Viscosity is locked at the ISA sea-level value.
- The Table I comparison is eight scalars. Drag below an effective Reynolds number of 800,000 is the measurement Report 586 calls relatively inaccurate. No uncertainty band was added.
- Design lift is `nmg`, not the panel lift. The spanwise shape is an assumed ellipse.
- The spar is a constant hollow rectangle in pure bending. Metal properties are typical published values, marked not for design. The tape is unidirectional. 141 GPa is not an isotropic modulus.
- Shear stress is reported. Shear strength, local buckling, fatigue, joints, torsion, and aeroelasticity are not evaluated. A PASS does not cover them.
- The search is a grid with a 1,500-row cap and equal objective weights. Saved cases stay in the page session.
- `audited-comparison.csv` still carries the previous 0.0087 extraction beside the corrected 0.0067.

## 12. Critical issues requiring attention

### FAIL — governing margin mixes two definitions (corrected after this audit; see the correction record)

- File and function: `lib/safety.ts`, `materialChecks`, `userChecks`, `assessSafety`.
- Evidence: yield margin is stored as 1.056 while a 348.7 mm deflection limit has margin 0.700, so deflection is selected. The capacity definition of the same yield check is 0.514 and would govern. In the browser, with three failing limits, tip deflection governed at −9.46 ahead of a stress margin of −0.678.
- Significance: the stress, the deflection, and the factor are each computed from the right beam. The sentence “this check governs” is not robust once a user limit and a material factor are both active. A portfolio reviewer who treats that sentence as a ranked structural conclusion will be misled.
- Action: pick one margin definition, use it for every judged row, and only then choose the minimum. Until that is done, do not describe the governing line as a unique structural ranking. Do not change the beam equations in order to adjust it.

### WARNING — items that should stay visible in a presentation

- Section cd and the profile part of wing cd are taken at different angles (`lib/aero.ts`, `wingAt`). At the default point the displayed sum is off by 0.0001.
- Lifting-line CL at non-integer angles uses 1° interpolation, and the iterated CL is not replaced by the final sample. Default difference about 0.0008 in CL.
- Joukowski cl and pressure-integrated cl differ by 0.014 at 6°.
- The dashboard heading says “section model” above wing coefficients.
- The plan view does not scale span.
- `calculateAero` can clamp a span the beam does not clamp.
- Reset does not restore a moved baseline or clear saved cases.
- The composite status tick ignores the tension ratio. The present allowable cannot expose it.
- The optimiser does not identify unevaluated shear, buckling, or metal compression on a preferred row.
- The three-objective caption refers to a table that is not rendered.
- At 390 px the two structural charts are 117 px wide and the unit collides with the title. The curves remain visible.
- Material numbers were not re-read from MatWeb or Hexcel in this session.

No aerodynamic coefficient was found that disagrees with the regression baseline. No Report 586 summary figure was found to have been retuned.

## 13. Recommended final actions

1. Leave `lib/aero.ts`, `lib/panel.ts`, `lib/boundaryLayer.ts`, `lib/naca.ts`, and `lib/flowField.ts` unchanged. Leave the 0.0067 / 0.00819 / +0.00149 comparison unchanged. Do not add an Oswald factor, a polar, or an uncertainty band.
2. The margin definition has been unified and the 348.7 mm case and the 100 MPa / 10 mm / factor-3 case have been re-checked. Keep the capacity-margin tests in `tests/safety.test.ts`. They are what catch a return to the mixed definition.
3. Rename the dashboard aerodynamic heading so it says the coefficients are the wing, and say on the laboratory readout that section cd is the geometric-angle value.
4. On the preferred-row panel, state that web shear, local buckling, and metal compression were not search constraints.
5. Remove the claim that a third objective stays in a table, or add the table.
6. Keep the presentation language already on the pages: not CFD, not a certified load, not a measured stall angle, typical properties not for design, and the tape check is not a metal yield.

### Presentation verdict

AERO-X is ready to be shown as a Design Engineering portfolio piece that builds a low-order wing model, connects it to a cantilever spar, and is explicit about what was not evaluated. It is not ready to be described as experimentally validated in stall, as a certification calculation, or as an optimiser that has found a safe aircraft. The governing-margin inconsistency found in the audit has been corrected and re-tested. Everything else that this audit executed either matches the stated equations or is already labelled as an assumption.

## Correction record: safety margins

Date of the correction: 19 November 2026. `lib/aero.ts`, `lib/panel.ts`, `lib/boundaryLayer.ts`, `lib/naca.ts`, `lib/flowField.ts`, `lib/structures.ts`, and the Report 586 files were not edited. The optimiser still compares factors and beam results directly. It does not read `SafetyCheck.margin`.

`capacityMargin` in `lib/safety.ts` is `(capacity − demand) / capacity`. Yield uses the typical yield strength as capacity and the bending stress as demand. The tape uses the 0° tensile strength and the 0° compressive strength the same way. A typed stress, strain, or deflection limit is the capacity, and the beam result is the demand. A minimum factor uses the calculated factor as capacity and the required minimum as demand. Pass and fail thresholds are unchanged: a non-negative margin is a pass, and zero is exactly on the limit. Unevaluated checks still have a null margin and are excluded from the governing reduction. The flight-safety page states the definition next to the governing line. Section 14 of `docs/engineering-report.md` states it as well.

| Case | Check | Margin before | Margin after | Governing before | Governing after |
|---|---|---|---|---|---|
| A. Default 2024-T3 | Tensile yield | 1.056 | 0.514 | Tensile yield | Tensile yield |
| B. Deflection limit 348.7 mm, both pass | Yield / deflection | 1.056 / 0.700 | 0.514 / 0.700 | Deflection | Tensile yield |
| C. 100 MPa, 10 mm, minimum factor 3 | Stress / deflection / factor | −0.678 / −9.46 / −0.315 | −0.678 / −9.46 / −0.459 | Tip deflection | Tip deflection |
| D. Each typed limit and the minimum factor set exactly to the beam result | Those four checks | not ranked this way | 0, and each still passes | — | The first exact row, the typed stress limit. Yield remains about 0.514 |
| E. One check made tightest in turn | Yield, deflection, typed stress, typed strain, minimum factor | mixed definitions | each can be the unique minimum | not reliable | The tightened check |
| F. Empty optional limits | Deflection, strain, stress, factor | null | null | not those rows | not those rows |
| G. HexPly 8552 / AS4, no typed limits | 0° tension / 0° compression | ratio − 1 | (strength − stress) / strength | not compared on one scale | 0° compression, because 1,531 MPa is the lower capacity |

Case C still selects tip deflection. Under the single definition its margin is −9.46, which is smaller than the stress margin −0.678 and the factor margin −0.459. The factor number changed. The deflection and stress numbers did not, because they already used this definition.

Re-run after the correction: `npx tsc --noEmit --incremental false` exit 0. `npm test` 30 passed, 0 failed. Aerodynamic regression inside that run: 234 cases, maximum absolute difference 0. The new capacity-margin tests are the six cases in `tests/safety.test.ts`. On the safety page, the default governing line read “Tensile yield” at 0.51, a 348.7 mm limit left that yield row governing with the deflection row still PASS, and the three-limit case read “Tip deflection” at −9.46 while shear, buckling, metal compression, and the empty strain limit stayed NOT EVALUATED. The overall PASS on the default wing still prints that unevaluated rows are not passes.
