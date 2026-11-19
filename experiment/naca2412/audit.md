# Audit of the NACA 2412 comparison with NACA Report 586

The production solver was not changed. No further graphs were digitised. This file records a fresh reading of Table I and a fresh run of `sectionAt` at the eight effective Reynolds numbers. The working comparison files were later corrected to that reading. `audited-comparison.csv` was not rewritten.

Source: Jacobs and Sherman, NACA Report 586 (1937), Table I, the eight rows labelled NACA 2412. The scan is NASA NTRS 19930091662. Signed error is model minus the table value.

## 1. Table I, NACA 2412

| Effective Re | Zero-lift angle (deg) | Lift-curve slope (per deg) | Maximum section lift | Minimum profile drag |
|---|---|---|---|---|
| 8,240,000 | −2.0 | 0.098 | 1.72 | 0.0071 |
| 6,100,000 | −2.1 | 0.097 | 1.68 | 0.0080 |
| 3,420,000 | −2.0 | 0.098 | 1.53 | 0.0079 |
| 1,730,000 | −2.1 | 0.096 | 1.33 | 0.0089 |
| 879,000 | −2.1 | 0.096 | 1.16 | 0.0085 |
| 438,000 | −2.0 | 0.098 | 1.08 | 0.0067 |
| 218,000 | −2.2 | 0.102 | 1.08 | 0.0159 |
| 110,000 | −1.3 | not printed | 1.03 | 0.0227 |

The lift-curve slope at effective Reynolds number 110,000 is a dash in the table. It is omitted from the slope errors. Optimum lift, pitching moment and aerodynamic centre are also dashes at 438,000, 218,000 and 110,000. Those three quantities were not part of the comparison.

The working comparison files use this reading, including minimum profile drag 0.0067 at effective Reynolds number 438,000. An earlier one-digit misreading of that single cell was corrected in `table-i-comparison.csv`, `scalar-errors.csv` and the transcription script. `audited-comparison.csv` is unchanged and still carries a previous-extraction column so the correction stays traceable.

The eight test Reynolds numbers in the existing CSV are not cells of Table I. They were inferred by pairing the table with the figure legend. This audit does not treat that pairing as a checked Table I value.

## 2. Model comparison

Each model row was produced by `sectionAt` at the effective Reynolds number in the first column. `section.reynolds` matched that input on every sample. Forces were finite on every sample. The model angle sweep is −8° to 22° in steps of 0.5°. Zero-lift angle is the interpolated crossing. Slope is a straight-line fit on attached samples from −4° to 6°. Maximum lift and minimum drag are the extremes of that sweep. The same definitions produced the existing CSV, and the model numbers there match this run once they are rounded as printed.

| Effective Re | α0 model | α0 error | Slope model | Slope error | cl,max model | cl,max error | cd,min model | cd,min error |
|---|---|---|---|---|---|---|---|---|
| 8,240,000 | −2.129 | −0.129 | 0.1214 | +0.0234 | 2.193 | +0.473 | 0.00545 | −0.00165 |
| 6,100,000 | −2.129 | −0.029 | 0.1214 | +0.0244 | 2.129 | +0.449 | 0.00573 | −0.00227 |
| 3,420,000 | −2.129 | −0.129 | 0.1215 | +0.0235 | 2.001 | +0.471 | 0.00618 | −0.00172 |
| 1,730,000 | −2.129 | −0.029 | 0.1215 | +0.0255 | 1.839 | +0.509 | 0.00672 | −0.00218 |
| 879,000 | −2.129 | −0.029 | 0.1215 | +0.0255 | 1.658 | +0.498 | 0.00722 | −0.00128 |
| 438,000 | −2.129 | −0.129 | 0.1216 | +0.0236 | 1.522 | +0.442 | 0.00819 | +0.00149 |
| 218,000 | −2.129 | +0.071 | 0.1216 | +0.0196 | 1.389 | +0.309 | 0.00997 | −0.00593 |
| 110,000 | −2.129 | −0.829 | not compared |  | 1.254 | +0.224 | 0.01259 | −0.01011 |

| Quantity | n | MAE | RMSE | Maximum absolute error |
|---|---|---|---|---|
| Zero-lift angle (deg) | 8 | 0.172 | 0.305 | 0.829 |
| Lift-curve slope (per deg) | 7 | 0.0236 | 0.0237 | 0.0255 |
| Maximum section lift | 8 | 0.422 | 0.432 | 0.509 |
| Minimum profile drag | 8 | 0.00333 | 0.00443 | 0.0101 |

`scalar-errors.csv` now follows this table. With the printed minimum drag of 0.0067, the signed drag error at 438,000 is +0.00149, the drag MAE is 0.00333, the drag RMSE is 0.00443, and the maximum absolute drag error remains 0.0101, from the 110,000 row.

The rounded model columns in `table-i-comparison.csv` match this run. The summary metrics in `scalar-errors.csv` were computed from the unrounded zero-lift angle (−2.12937°), not from the three-decimal column. That rounding does not change the reported MAE of 0.172°.

## 3. What the report says about low-Reynolds-number drag

NACA Report 586, page 4, states that drag and pitching-moment results for effective Reynolds numbers below 800,000 become relatively inaccurate because of the sensitivity of the measuring equipment. It also says the accuracy is then insufficient to define the shape of those curves against angle of attack or lift coefficient, and that optimum lift coefficient and aerodynamic-centre position are in most cases not given below that Reynolds number.

For these eight rows, 438,000, 218,000 and 110,000 fall under that warning. 879,000 does not. The table still prints a minimum drag at the three lower values, and those printed numbers are what the comparison uses. The warning means the large drag differences at 218,000 and 110,000, and the smaller difference at 438,000, are differences from values the source itself calls relatively inaccurate. No numerical uncertainty band is stated on page 4, and none is added here. Lift, zero-lift angle and lift-curve slope are not the quantities named in that sentence.

## 4. What is measurement, what is the model, what is explanation

Directly supported by the published table and page 4:

- The eight Reynolds numbers, zero-lift angles, maximum lifts and minimum drags listed above, and the seven printed slopes.
- The slope at 110,000 is absent.
- Below an effective Reynolds number of 800,000 the report itself treats drag as relatively inaccurate.
- No angle of maximum lift or of minimum drag is given in Table I, so this audit has no measured stall angle.

Supported by the current model run, not by the tunnel:

- At every one of these Reynolds numbers the fitted attached slope is about 0.121 per degree and the zero-lift angle is −2.129°.
- The highest section lift on the −8° to 22° sweep is above the printed maximum at every Reynolds number. At 8,240,000 the model lift at 14° is already above the printed maximum of 1.72, and the sweep maximum is 2.193 at 21.5°.
- Minimum drag on that sweep is below the printed minimum at seven rows and above it at 438,000, by the signed errors in the table.
- Those statements describe this calculation. They do not identify a physical cause.

A plausible explanation that this comparison does not verify:

- Missing displacement coupling can raise the model lift slope and delay separation. Report 586 does not test that statement.
- The imposed short-bubble restart at H = 1.4 can contribute to the low-Reynolds-number drag difference. The drag difference does not prove that restart is the cause. Page 4 also limits how firmly the low-Reynolds-number drag numbers can be used.

## 5. Inconsistencies found

- The earlier transcription of minimum profile drag at effective Reynolds number 438,000 has been replaced in the working files by the printed value 0.0067. The model value on that row is 0.00819, and the signed difference is +0.00149.
- Model minimum drag is therefore not below the printed measurement on every row. It is above it at 438,000.
- The drag MAE and RMSE in `scalar-errors.csv` are the values calculated from 0.0067: 0.00333 and 0.00443. The maximum absolute drag error is 0.0101.
- No other Table I cell used in the comparison disagreed with this reading. The model Reynolds numbers, and the lift, slope and zero-lift metrics, agree with the existing files.

## What this validation establishes

It establishes a comparison between eight printed section scalars and one unchanged run of the present section model at those effective Reynolds numbers. The model lift slope is higher by about 0.024 per degree on the seven printed slopes. The model maximum lift on a sweep to 22° is higher than the printed maximum at all eight Reynolds numbers. The model minimum drag is lower than the printed minimum at the rows not affected by the 800,000 warning, by roughly 0.001 to 0.002.

It does not establish a lift or drag polar error, a stall angle, or a measured cause. Table I does not list coefficients against angle of attack, and the graphs were not digitised. It does not establish that the short-bubble restart produced the drag difference. The drag numbers below an effective Reynolds number of 800,000 remain the values the report warns are relatively inaccurate.
