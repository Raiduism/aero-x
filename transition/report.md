# Transition and the Head initial condition

The production solver and the website were not changed. The march with initial H = 1.4 matches `marchBoundaryLayer` on every case below (0 mismatches). No integration returned a non-finite θ or H. These stations are outputs of the existing one-way model. They are not measurements.

## 1. What the code does

`marchBranch` in `lib/boundaryLayer.ts` integrates Thwaites’ momentum thickness from the stagnation point:

θ² = 0.45 ν ∫ Ue⁵ ds / Ue⁶, with θ² = 0.075 ν / (dUe/ds) on the first interval.

At each station it forms λ = θ² (dUe/ds) / ν and

Re_θ = Ue θ / ν, Re_x = Ue s / ν, with s measured from the stagnation panel.

Laminar separation is the first station with λ ≤ −0.09. Michel transition is the first station with Re_x > 50 and Re_θ ≥ 1.174 (1 + 22400/Re_x) Re_x^0.46. The loop stops at whichever of those two occurs first. If they occur on the same station, both flags are set and the turbulent march still starts at that station.

If neither occurs before the x/c = 0.99 trim, the surface stays laminar and the returned shape factor is the Thwaites polynomial, clamped to λ ∈ [−0.1, 0.1]:

H = 2.61 − 3.75 λ + 5.24 λ².

If either occurs, `integrateHead` is called with the Thwaites θ at that station, floored at 10⁻⁸. The laminar H is not passed in. The function sets

H = 1.4, H₁ = H₁(H),

using the Cebeci–Bradshaw fit already in the file. For H ≤ 1.6,

H₁ = 3.3 + 0.8234 (H − 1.1)^(−1.287).

At H = 1.4 this gives H₁ = 7.178. The entrainment function, evaluated but not stored, is

F = 0.0306 (H₁ − 3)^(−0.6169) = 0.0127.

The first turbulent step does not happen at the switch station. It happens on the next panel interval. That interval is split into four equal substeps. On each substep the code uses the production updates

dθ/ds = cf/2 − (H + 2) θ (dUe/ds) / Ue,

d(Ue θ H₁)/ds = Ue F,

with the Ludwieg–Tillmann cf, then replaces H by the inverse of the Cebeci–Bradshaw fit. After any substep it stops if H ≥ 2.4 or H₁ ≤ 3.43. The separation station reported to the rest of the program is the downstream end of that interval, not the switch station.

`sectionAt` in `lib/aero.ts` does not look at λ or at Michel’s criterion again. It reads `separationX` and `transitionX` from this march. `transitionX` is the station where Head started. On the laminar-separation path, the value shown as transition is the laminar-separation station. The Kirchhoff factor is the Head separation x/c, unless that station is at or behind x/c = 0.97, in which case the section is treated as attached. A factor below 0.80 is labelled stalled.

## 2. Is H = 1.4 defensible?

The laminar march does contain θ, Ue, dUe/ds, λ and a Thwaites H. Head’s entrainment shape factor H₁ is not one of those quantities. Head’s 1958 report defines H₁ for a turbulent layer, from the rate at which the layer entrains irrotational fluid, and takes that rate to depend on the turbulent velocity profile. A laminar profile at separation does not supply it. ([Head, R&M 3152](https://reports.aerade.cranfield.ac.uk/bitstream/handle/1826.2/3720/arc-rm-3152.pdf))

Across an attached transition, the usual integral statement is that θ stays about the same while H falls, because the displacement thickness falls as the profile fills out. Lecture notes from Instituto Superior Técnico state that explicitly and give an empirical H at the end of zero-pressure-gradient transition. ([Lecture 10](https://fenix.tecnico.ulisboa.pt/downloadFile/563568428976833/Lecture10.pdf)) Those notes are a secondary source, and a second transcription of the same correlation uses a natural logarithm rather than log₁₀, so this study does not adopt either formula as Coles’ result. What the notes do support is the direction of the change: H drops, θ is carried across. The code does that much, and then chooses the number 1.4.

H = 1.4 is in the range of an attached zero-pressure-gradient turbulent layer. It is not the laminar value at the switch. In this implementation the Thwaites polynomial is already clamped, and at separation it returns H = 3.04 while the raw λ is often −0.1 to −0.36. Starting Head from that laminar H is a different assumption, and section 4 shows what the closure does with it. Nothing in the laminar state selects 1.4 rather than another attached turbulent value.

Restarting a turbulent layer at the laminar-separation point is the short-bubble shortcut: assume the separated shear layer transitions and reattaches at once, and continue with an attached turbulent profile. JavaFoil documents the same shortcut and states that laminar separation bubbles are not modelled. It also prints the same Michel formula used here, and recommends that formula for chord Reynolds numbers above about 2×10⁶. ([JavaFoil user’s guide](https://www.mh-aerotools.de/airfoils/java/JavaFoil%20Users%20Guide.pdf)) The cases in this study are 10⁵ to 10⁶.

A short bubble, in Horton’s definition, has only a slight effect on the pressure distribution. A long bubble does not. His model therefore calculates a transition point inside the separated shear layer, the growth of θ across the bubble, and a turbulent reattachment criterion

(θ²/ν) dUe/dx = −0.0082.

If that criterion cannot be met, the bubble bursts. He also records that Owen and Klanfer’s earlier rule, a boundary-layer Reynolds number at separation of about 450, does not by itself decide bursting. ([Horton, ARC CP 1073](https://aerade.cranfield.ac.uk/bitstream/handle/1826.2/1086/arc-cp-1073.pdf); [thesis](https://qmro.qmul.ac.uk/xmlui/handle/123456789/1508))

The present code does none of that test. It always restarts, at every angle and every Reynolds number, whenever λ reaches −0.09 before Michel’s criterion. On the upper surface of this matrix, Michel’s criterion wins only at 5° and Re = 1,000,000, and it ties laminar separation at 5° and Re = 500,000 on the coarser panels. At 10°, 13° and 15°, for all three Reynolds numbers and all three panel counts, the switch is laminar separation. At 13° the momentum-thickness Reynolds number at that station is 58 to 332, depending on panel count and Reynolds number. Those values lie below the figure Horton quotes from Owen and Klanfer. That comparison does not prove the bubble is long. Horton says the figure is not sufficient. It does show that the code’s universal short-bubble assumption is being applied in the region where a bubble model would still have to test reattachment.

The assumption is a clear, cheap idealisation of an attached transition followed by a turbulent layer. It is not a model of a separation bubble, and it is not appropriate as a silent default at 10°–15° and Re = 10⁵–10⁶.

## 3. Four ways to treat the same event

**A. Immediate turbulent restart at laminar separation.** This is the current model. The physical assumption is that any laminar separation is a short bubble which has already reattached as an attached turbulent layer with H = 1.4 and the laminar θ. The cost is one Head march on the existing Ue(s). The inputs already exist. The limitation, supported by Horton’s distinction and by JavaFoil’s own description of this shortcut, is that reattachment is assumed rather than tested, the bubble length is zero, and the inviscid pressure field never feels the bubble. It is suitable as a labelled teaching approximation. It is not suitable as the prediction of low-Reynolds-number stall.

**B. A simplified laminar-separation-bubble model.** Horton’s semi-empirical theory, and later integral bubble models built on it, keep the laminar θ at separation, estimate where the free shear layer becomes turbulent, grow θ across a bubble of finite length, and apply a reattachment criterion. If reattachment fails, the bubble is burst and the layer stays separated. ([CP 1073](https://aerade.cranfield.ac.uk/bitstream/handle/1826.2/1086/arc-cp-1073.pdf); a later integral form is described by [Bastedo and Mueller, Journal of Aircraft, 1995](https://doi.org/10.2514/3.46558)) The cost is a short extra quadrature between separation and reattachment, still on a prescribed Ue(s). The new inputs are a transition rule inside the shear layer and a reattachment constant of the kind Horton gives. The limitation he states himself is that the pressure distribution is imposed. A bubble that would have changed the pressure cannot be distinguished from one that would not, except through the bursting test. For this simulator that is the proportionate next model: it replaces an unnamed restart with a stated bubble length and a stated failure condition, without requiring a new flow solver.

**C. Transition inside the separated shear layer.** Horton already includes an empirical transition location in the bubble, of the form (Ue/ν)(x_transition − x_separation) related to Re at separation. Drela and Giles instead integrate an e⁹ amplification and allow transition either in the attached layer or in the separated shear layer; the transition location ends the bubble. ([AIAA Journal, 1987](https://people.maths.ox.ac.uk/~gilesm/files/aiaa87b.pdf)) The physical content is that the separated shear layer is unstable and that transition, not the laminar-separation point, is what permits reattachment. Michel’s attached-flow criterion does not describe that shear layer. An eⁿ calculation needs the velocity profiles, a frequency envelope, and a critical amplification factor that depends on the disturbance environment. XFOIL’s documentation states that dependence directly. ([XFOIL user guide](https://web.mit.edu/aeroutil_v1.0/xfoil_doc.txt)) As a standalone addition to the present Thwaites march it is only part of a bubble model. It is the right transition piece inside approach B or D, not a third constant to swap for H = 1.4.

**D. Viscous–inviscid interaction.** Drela and Giles couple a two-equation integral boundary layer to the inviscid flow through the displacement thickness and solve the whole system, including transition, by a global Newton method. They state that for chord Reynolds numbers below about one million the bubble and its loss have to be calculated, because the displacement changes the pressure. The same paper is the formulation XFOIL uses, with the inviscid part reduced to a panel method and a wall-transpiration condition. The cost is a nonlinear coupled solution, repeated as the displacement changes. The inputs add a closure for the turbulent layer and an eⁿ threshold. The limitation is practical rather than conceptual: it is a different program from a one-way panel march, and it still depends on the transition threshold. It is the method to move toward if this simulator is later required to predict low-Reynolds-number drag or the lift break. It is not required in order to stop treating H = 1.4 as a property of the laminar layer.

## 4. Sensitivity of the existing march

The test repeats the production march and changes only the number stored in `h` before the first turbulent substep. Prescribed values 1.2, 1.4, 1.8 and 2.2 lie inside the attached branch of the closure used here: the separation test is H ≥ 2.4, and the Cebeci–Bradshaw inverse changes character at H₁ = 3.43. A fifth case sets H to the clamped Thwaites value at the switch. That is the laminar information the march has. It is not proposed as a replacement constant. Panel counts are 40, 80 and 160. The matrix is α = 5°, 10°, 13°, 15° and Re = 10⁵, 5×10⁵, 10⁶. Full rows are in `transition/head-initial.csv`. The plot is `transition/separation-vs-initial-h.svg`.

At H = 1.4, H₁ = 7.178 and F = 0.0127. At H = 1.2, H₁ = 19.24 and F = 0.0055. At the clamped laminar value H = 3.037, H₁ = 3.412 and F = 0.0529. The laminar H₁ sits on the separation side of the inverse fit. No case produced a non-finite step.

The first substep is mild when H starts at 1.4. At 13°, 80 panels and Re = 10⁵, H moves from 1.400 to 1.444. The laminar momentum thickness is unchanged by that choice of H, and Re_θ at the switch is 83. The march fails later, when H grows to 2.4, not on the first substep. The first substep reaches H ≥ 2.4 in 6 of 180 upper-surface runs, all of them starting at H = 2.2 or at the laminar value, and all at Re = 10⁵. Those stops are the closure’s separation test, not an arithmetic failure.

At 13° and Re = 10⁵ the upper-surface Head station is:

| Panels | H = 1.2 | H = 1.4 | H = 1.8 | H = 2.2 | Thwaites H |
|---:|---:|---:|---:|---:|---:|
| 40 | 0.461 | 0.461 | 0.461 | 0.461 | 0.461 |
| 80 | 0.364 | 0.364 | 0.402 | 0.402 | 0.402 |
| 160 | 0.280 | 0.056 | 0.039 | 0.032 | 0.010 |

On the 40-panel grid the initial H does not move the station at all. On the 160-panel grid, at the same angle and Reynolds number, changing H from 1.4 to 1.2 moves it from 0.056 to 0.280. The same 160-panel case at Re = 10⁶ moves only from 0.754 to 0.719. The initial condition matters when the restart sits inside the leading-edge adverse gradient and the panels are fine enough to sample it. That is the same cliff found in the convergence study. It is evidence that the station is sensitive to an arbitrary start, not evidence for a better number.

Using the laminar H does not automatically separate on the first substep at 80 panels: entrainment lifts H₁ off the floor and the inverse returns H ≈ 2.36, after which the march continues and separates at 0.402. At 160 panels and Re = 10⁵ the same start does trip on the first interval, at x/c = 0.010. The laminar shape factor is usable as a diagnostic of the closure. It is not a consistent initial turbulent profile, because the closure treats H near 3 as a separated turbulent layer.

## 5. Recommendation

Retain the present restart, and state the limitation in the wording that accompanies it. H = 1.4 should be described as an attached-turbulent shape factor imposed after an assumed short bubble, not as a quantity derived from the laminar layer. The displayed transition station on the 10°–15° cases is the laminar-separation station. Michel’s criterion is not what ends the laminar march there.

Do not replace 1.4 by another constant. The 160-panel, 13°, Re = 10⁵ row shows a 0.22 chord movement between H = 1.2 and H = 1.4. Choosing the value that places separation at a familiar chord fraction would be tuning.

When a model change is made, the defensible next model is a laminar-separation-bubble calculation of Horton’s type: a finite length, growth of θ across that length, and an explicit reattachment test that is allowed to fail. That uses the laminar θ the march already has, and it puts the short-bubble statement where it can be false. Transition inside the shear layer belongs in that bubble model. A full viscous–inviscid coupling is the method Drela and Giles show is needed to predict the bubble’s effect on pressure and drag below a Reynolds number of about one million. It is the right destination for a quantitative stall prediction. It is a larger change than the inconsistency found here, and it should follow a bubble model that already distinguishes reattachment from an imposed restart.
