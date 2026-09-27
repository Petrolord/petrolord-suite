# Crude Assay & Blending Studio: senior test T1

- App: Crude Assay & Blending Studio (Midstream & Downstream)
- Wave / position: Wave 6, #77 (Senior Testing Programme; economics and downstream)
- Build tested: main 3280cf406 plus #700 to #707
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: SG-volume API blending; mass-basis sulfur, TAN, N, Ni and V; Refutas viscosity; Watson K; colloidal instability index; TBP cut yields and netback
- Coverage before T1: crude assay engine goldens (vendored engines), page smoke and copy-style tests; no human walk

## How it was tested

I used `/dev/studio/crude-assay` at 1366 x 768 on the two example crudes:

- Light sweet: 35.4 API, 60%.
- Medium sour: 24.0 API, 40%.

I then added SARA to both, checked yields and netback, and added a third
crude.

## Verdict

**Demo-ready after T1, at S3. Every figure hand-checks.**

- SG = 141.5 / (API + 131.5): 0.84781 and 0.90997. The volume blend is
  0.87268, which gives **API 30.65**. The mass split is **58.3 / 41.7**.
- Mass basis:
  - sulfur 0.583 x 0.15 + 0.417 x 2.2 = **1.005 wt%**;
  - TAN **0.36**;
  - N **0.150**;
  - Ni **12.1 ppm**;
  - V **25.6 ppm**.
- Refutas: VBI 19.17 and 30.47, mass-blended 23.89, so **10.6 cSt**.
- Blend T50 from the volume-mixed curves is about 617 F, so Watson K =
  1076.8^(1/3) / 0.8727 = **11.75**.
- SARA 60/25/12/3 and 45/30/18/7, mass-blended 53.74/27.09/14.50/4.67:
  CII = 58.41 / 41.59 = **1.40**, which is unstable against the 0.9 band.
- Light LPG to 90 F is 0.8%, and naphtha is 24.74 - 0.77 = 24.0%. Blend
  naphtha is 20.2% x $78 = $15.76. Gross is $76.62; netback is 76.62 -
  0.38 - 4.50 - 2.00 = **$69.73**.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| CA-T1-001 | S3 | The distillation X axis ticked at 80, 480, 880 and 1500 F (the data ends), with the title close to the ticks. The legend was on top. | Round 250 F ticks from 0 to 1500 through a shared `niceTicks` helper in chartTheme. The Y axis ticks every 20%, the title has its own band, and the legend uses the Suite standard. |
| CA-T1-002 | S3 | The cut-yield chart showed a stray black legend square (a single series coloured per bar) and ticked at 0, 7, 14, 21 and 28. | Legend removed (the cuts are named on the axis). Ticks at 0, 10, 20 and 30. |
| CA-T1-003 | S3 | "Add crude" opened a crude with placeholder properties and a copy of the first crude's distillation curve, drawn exactly over that crude's line. Nothing said so. | The new card says its figures are placeholders and its curve is a copy. The note clears when its curve is edited. |
| CA-T1-004 | S3 | The assay field labels were not tied to their inputs (screen readers read unnamed number boxes). The spinner covered the value in the narrow SARA fields. | Labels are linked with ids and the spinners are hidden. |

## Tests

- `e2e/crude-assay-t1.spec.js` checks:
  - API 30.65, sulfur 1.005 wt%, 10.6 cSt and K 11.75;
  - X ticks 0 to 1500, and not 480;
  - SARA by label, giving CII 1.40;
  - Y ticks 0/10/20/30 with no legend;
  - netback $69.73;
  - the placeholder note.
- `src/utils/__tests__/niceTicks.test.js` checks the shared tick helper,
  including the 80 to 1500 F case.
- Crude assay engine, smoke and copy-style jest pass (501 in the filtered run).
