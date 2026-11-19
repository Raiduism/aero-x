# AERO-X completion report

Date of this run: 19 November 2026.

The production aerodynamic solver was not edited. NACA 2412 geometry, the Hess–Smith solution, the boundary-layer march, the transition criteria and the force algebra are the existing code. The structural page does not call those functions, and those functions do not call the structural page.

## Features completed

- The working NACA Report 586 comparison uses the printed minimum drag 0.0067 at effective Reynolds number 438,000. The model minimum on that sweep remains 0.00819. The signed difference remains +0.00149. Drag MAE 0.00333, drag RMSE 0.00443, maximum absolute drag error 0.0101. Lift-slope MAE 0.0236 per degree, zero-lift MAE 0.172°, maximum-lift MAE 0.422. All eight rows are in `experiment/naca2412/audit.md`.
- Page 4 of Report 586 is quoted for the warning that drag below an effective Reynolds number of 800,000 is relatively inaccurate. No uncertainty band was added. The write-up does not claim a polar error, a stall angle, or a physical cause.
- Materials and structures is a working page: cantilever half-wing, elliptical load labelled as an assumption, hollow rectangular spar, four cited materials, comparison without a declared winner, load and moment graphs, and a bending sketch that says when it is exaggerated.
- Wingspan and chord are the same state as the aerodynamics laboratory. Design lift is `n m g`, not the panel lift. The panel lift is shown beside it and is not used in the beam.
- `docs/engineering-report.md` covers the fourteen requested sections and separates potential flow, the integral boundary layer, the Table I comparison, and the beam.

## Files created or modified

Created:

- `lib/materials.ts`
- `lib/structures.ts`
- `components/MaterialsStructures.tsx`
- `tests/structures.test.ts`
- `docs/engineering-report.md`
- `docs/completion-report.md`

Modified:

- `app/page.tsx` — the materials navigation item is enabled and shares span and chord. One assumptions sentence now points at the Table I comparison instead of saying the model had not been compared with a tunnel at all.
- `app/globals.css` — styles for the new page, and a small-screen rule so the sidebar wordmark does not cover the breadcrumb.
- `package.json` — the test script runs the structural tests as well as the aerodynamic regression.
- `scripts/naca2412-experiment.ts` — the 438,000 drag cell is the printed 0.0067. The script was not re-run, so it did not rewrite the other result files.
- `experiment/naca2412/table-i-comparison.csv` — that one experimental drag cell.
- `experiment/naca2412/scalar-errors.csv` — the drag summary line only.
- `experiment/naca2412/audit.md` and `experiment/naca2412/sources.txt` — wording brought into line with the printed table.

Not modified: `lib/naca.ts`, `lib/panel.ts`, `lib/boundaryLayer.ts`, `lib/aero.ts`, `lib/flowField.ts`, and `experiment/naca2412/audited-comparison.csv`.

`audited-comparison.csv` still has a previous-extraction column. That column is the record of the corrected cell. It is not shown on the site. The file’s corrected values were left as they were.

## Tests performed

- `npx tsx --test tests/structures.test.ts`
- `npx tsx --test tests/aero-regression.test.ts` (the 234-case sweep: 26 angles from −5° to 20°, Reynolds numbers 100,000, 500,000 and 1,000,000, and 40, 80 and 160 panels)
- `npx tsc --noEmit --incremental false`
- Browser pass on the running site at `http://localhost:3456/`, desktop width and a 390 px width

## Test results

Structural tests: 7 passed, 0 failed. The elliptical root moment matches `L b / (3π)` within 0.05%. A uniform load, used only in the test, matches `w s⁴ / (8 EI)`. The elliptical tip deflection is smaller than that uniform case for the same total load. A closed box and an unknown material are rejected. Changing material changes mass and deflection and leaves bending stress unchanged. The carbon row has no yield factor. A grid of spans, load factors and materials stayed finite and positive.

Aerodynamic regression: 5 passed, 0 failed. Maximum absolute difference from the stored baseline was 0. Finite 80-panel force rows: 78. State counts: Michel first 60, laminar separation first 385, same station 23, neither 0, Head separation 213, integration failure 0.

Typecheck: exit code 0.

Browser, default structural case (span 8 m, chord 1.5 m, mass 1,000 kg, load factor 3.8, 120 × 160 mm spar, 8 mm wall, 2024-T3):

- design lift 37.27 kN
- root moment 31.63 kN·m
- bending stress 167.8 MPa
- tip deflection 104.6 mm
- the bending curve was labelled as drawn larger than the calculated deflection
- two charts rendered
- setting the wall so that it closed the box showed “Spar geometry rejected” and no NaN
- HexPly 8552 / AS4, with the span already at 12 m, switched the modulus to 141.0 GPa and the both-spar mass to 80.09 kg, and the readout became a directional tape check rather than a yield factor
- raising span from 8 m to 12 m raised the root moment from 31.63 kN·m to 47.44 kN·m, and the aerodynamics page then showed span 12
- reset restored span 8 m, 2024-T3, and the 31.63 kN·m case
- at 390 px the page scroll width matched the viewport, and the four metric cards remained readable
- no NaN or Infinity in the visible text

## Known limitations

- The aerodynamic model is a sectional panel method plus an elliptical induced-drag bound. It is not CFD and it does not produce the spanwise load used by the beam.
- The Table I comparison is eight scalars. It is not a polar and it does not give a stall angle. Drag below an effective Reynolds number of 800,000 is the measurement the report calls relatively inaccurate.
- The beam is one constant box spar in pure bending. Shear, torsion, buckling, fittings and aeroelasticity are outside it. It is not a finite-element model.
- Aluminium properties are typical published values, not design allowables. The carbon properties are unidirectional, 25°C, dry, from the European HexPly sheet. Using 141 GPa for the whole spar is an equivalent, and only if the fibres run along the spar. The US sheet lists a different 0° tensile modulus.
- Metal yield and the tape’s 0° tension and compression strengths are different checks. The page does not pick a winning material.

## Flight safety and design search

Both navigation items are implemented. The SOON labels were removed after the tests below.

Flight safety calls `assessSafety`, which calls `analyzeWing` and does not re-derive the beam. It reports design lift, root moment, bending stress, tip deflection, and the material margin already on that result. Metals are judged on typical tensile yield. The tape is judged on 0° tension and 0° compression, and that ratio is not labelled a yield factor. Root web shear is `τ = VQ/(I·2t)` from the beam’s root shear. No shear strength is stored, so the shear row stays NOT EVALUATED. Local buckling stays NOT EVALUATED. Empty user limits stay NOT EVALUATED. A closed spar does not become a pass.

The design search is a bounded grid in `searchDesigns`. Objectives are minimum spar mass, maximum lift-to-drag from `calculateAero`, and minimum tip deflection. More than one objective builds a Pareto front and picks a point with equal weights after scaling. An infeasible row is never preferred. The user can restore a baseline, save a case in the session, apply a row to the shared wing, and export the grid as CSV.

Mass, load factor, material and spar size are one shared design. Span and chord are the same state as the aerodynamics laboratory. Safety limits and search constraints are separate entries. The aerodynamic model is not called unless lift or lift-to-drag is needed.

### Files

Created: `lib/design.ts`, `lib/safety.ts`, `lib/optimise.ts`, `components/FlightSafety.tsx`, `components/DesignOptimiser.tsx`, `tests/safety.test.ts`, `tests/optimise.test.ts`.

Modified: `app/page.tsx`, `app/globals.css`, `components/MaterialsStructures.tsx` (the spar inputs now use the shared design), `package.json`, `docs/engineering-report.md`, `docs/completion-report.md`.

Not modified: `lib/aero.ts`, `lib/panel.ts`, `lib/boundaryLayer.ts`, `lib/naca.ts`, `lib/structures.ts`.

### Tests and results

- `tests/safety.test.ts`: 7 passed. Default 2024-T3 yield passes. A 4,000 kg, 6 g case fails yield. The tape uses both directional checks. A 10 mm deflection limit fails and governs. Empty and invalid limits stay unevaluated. A closed wall is not a pass. The shear formula matches `VQ/(I·2t)`.
- `tests/optimise.test.ts`: 5 passed. Mass search prefers the tape. A lighter wall that breaks a stress limit is not preferred. Injected lift-to-drag prefers the span the fake model ranks highest, and a lift constraint removes that span. The Pareto front contains only feasible points. A reversed axis and a NaN constraint are rejected. Baseline deltas and CSV quoting are checked.
- `tests/structures.test.ts`: 7 passed.
- `tests/aero-regression.test.ts`: 5 passed. 234 cases, maximum absolute difference 0.
- Typecheck: exit code 0.
- Browser: with no extra limits, flight safety reported a preliminary pass at the default beam (104.6 mm tip). Entering a 10 mm deflection limit changed it to a fail, with that check governing at margin −9.46. Shear and local buckling remained NOT EVALUATED. No NaN.
- Browser search: 972 configurations, all feasible with no active constraints. The mass objective preferred HexPly 8552 / AS4, 7.00 m span, 1.20 m chord, 100 × 140 × 6.0 mm spar, 30.26 kg for both spars. Against the 8 m baseline the mass change was −63.68 kg, stress +91.0 MPa, deflection −31.4 mm. Applying that row set the structures page to 7 m and the tape. Adding lift-to-drag drew the Pareto plot. At 390 px, flight safety and the search had no horizontal overflow.

## Known limitations, current

- Safety and the search do not add certification limits. A pass is only the criterion that was actually evaluated.
- Web shear is reported and not compared with a material strength. Buckling, torsion, fatigue and aeroelasticity are not evaluated.
- The grid is exhaustive inside the increments the user sets, and it stops above 1,500 rows. Equal objective weights are a choice.
- Saved cases live in the page session. They are not written to disk.
- A digitised polar, displacement coupling and a real laminate are not in this version.

## Overview and the aerodynamics laboratory

Overview is now an aircraft design dashboard. The aerodynamics laboratory keeps the existing simulation: NACA 2412, angle and operating conditions, the airflow view, pressure, the boundary-layer readout, lift and drag, the separation label, and the Report 586 comparison note.

The dashboard does not own a second copy of the wing. It reads the shared span, chord, speed, angle, density and spar, and the aerodynamic result already computed for the laboratory. Structure comes from `analyzeWing`. The safety banner comes from `assessSafety` with the same typed limits as the safety page. A saved search row is the latest case in the parent list. Live-versus-baseline mass, stress, deflection and lift-to-drag are differences of those existing results. The plan view follows span and chord. It is labelled as not a flow field, and the spar line is not to structural scale.

The preferred-row object from a search stays on the optimiser page. Overview sees that search after the row is applied to the live wing or saved in the session.

### Files

Created: `components/OverviewDashboard.tsx`.

Modified: `app/page.tsx` (overview renders the dashboard; the laboratory remains the aerodynamics tab; safety limit text is parent state), `components/FlightSafety.tsx` (limits are controlled by that parent state), `lib/safety.ts` (the limit-text parser only), `app/globals.css` (action row), `docs/completion-report.md`.

Not modified: `lib/aero.ts`, `lib/panel.ts`, `lib/boundaryLayer.ts`, `lib/naca.ts`, `lib/flowField.ts`, `lib/structures.ts`.

### Tests and results

- `npx tsc --noEmit --pretty false --incremental false`: exit code 0.
- `tests/aero-regression.test.ts`: 5 passed. 234 cases, maximum absolute difference 0. Finite 80-panel force rows 78. Integration failures 0.
- `tests/safety.test.ts`: 7 passed. The new limit parser did not change the assessment cases.
- Browser, `http://localhost:3456/`:
  - Overview opened as the dashboard: plan view, no airflow canvas, no angle slider. Default readout was span 8.00 m, chord 1.50 m, 70 m/s, 6.0°, Reynolds number 7,188,164, wing CL 0.698, CD 0.0354, L/D 19.68, 2024-T3, 120 × 160 × 8.0 mm, both spars 93.94 kg, root moment 31.63 kN·m, stress 167.8 MPa, tip 104.6 mm, safety PASS, deltas 0 against the baseline.
  - The dashboard action opened the aerodynamics laboratory. That page still had the airflow view, angle control, Cp legend, polar, boundary-layer wording, and the assumptions button. Setting the angle to 10.0° changed section CL to 1.418 and wing lift to 37,230 N. Returning to Overview showed 10.0°, wing CL 1.034, CD 0.0708, L/D 14.60, and the same Reynolds number.
  - Setting spar height to 140 mm on the structures page updated Overview to 86.82 kg, 202.8 MPa, 144.5 mm, mass −7.12 kg, stress +35.0 MPa, deflection +39.9 mm.
  - A 10 mm tip-deflection limit on the safety page made Overview FAIL: 1 passed, 1 failed, 6 not evaluated, with the tip-deflection detail.
  - A mass search of 972 rows preferred HexPly 8552 / AS4, 7.00 m, 1.20 m, 100 × 140 × 6.0 mm, 30.26 kg. Saving it and applying it updated Overview to those values, Reynolds number 5,750,531, L/D 15.43, live mass −63.68 kg, stress +91.0 MPa, deflection −31.4 mm, L/D +0.83, and the saved-case line of −63.68 kg. The 10 mm limit still failed at 73.2 mm.
  - At 390 px the dashboard had no horizontal overflow and the wordmark did not cover the breadcrumb. The assumptions button is only on the laboratory.

## Safety margin definition

`assessSafety` now reports every judged margin as `(capacity − demand) / capacity`. Yield capacity is the typical yield strength. Tape capacities are the 0° tensile and 0° compressive strengths. A typed limit is the capacity for stress, strain and deflection. A minimum factor uses the calculated factor as capacity and the required minimum as demand. Pass and fail thresholds were not changed. Unevaluated rows still have no margin and are excluded from the governing check. The beam equations, the aerodynamic solver, and the optimiser objectives were not changed. The flight-safety page and section 14 of `docs/engineering-report.md` name the definition.

Before this change, the default yield margin was 1.056 and a 348.7 mm deflection limit, margin 0.700, was selected as governing even though both checks passed. After the change the yield margin is 0.514, which is smaller than 0.700, so yield governs. For a 100 MPa stress limit, a 10 mm deflection limit and a minimum factor of 3, the stress margin stayed −0.678 and the deflection margin stayed −9.46. The factor margin changed from −0.315 to −0.459. Tip deflection still governs, because −9.46 is the smallest of the three. Empty limits stay unevaluated. A check set exactly equal to the beam result has margin 0 and still passes.

`npm test` after the change: 30 passed, 0 failed, including the six new capacity-margin tests and the 234-case aerodynamic regression at maximum absolute difference 0. Typecheck exit 0. On the safety page the default governing line showed tensile yield at 0.51, the 348.7 mm case kept yield as governing, and the three-limit case showed tip deflection at −9.46 with shear and buckling still NOT EVALUATED.

## Unfinished tasks

No requested safety, search, or overview control was left as a disabled SOON item. Certification loads, shear allowables, plate buckling and a saved file on disk were not invented. The dashboard does not store the optimiser’s full preferred-row object; it shows the live wing against the baseline and the latest saved case.
