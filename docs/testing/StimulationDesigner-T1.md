# Stimulation Designer: senior test T1

- App: Stimulation Designer (`/dashboard/apps/drilling/stimulation-designer`)
- Wave / position: Wave 3, #42 (Senior Testing Programme; drilling)
- Build tested: main plus Wave 3 PRs #665 to #669
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: FracPro, StimPlan, MFrac (2D planning level); Economides and Nolte, Reservoir Stimulation
- Coverage before T1: D9 build (PKN/KGD, Nolte balance and schedule, Cinco-Ley, Hawkins and wormholing against oracle goldens)

## How it was tested

The `/dev/stimulation` harness loads the golden stimulation case on
Harness-9S. It treats the 2,450 to 2,550 m MD interval (mid-point 2,125 m
TVD) using the published SHMIN and PP curves. I walked the frac design,
pump schedule, productivity and acidizing tabs at 1366 x 768.

## Verdict

**Demo-ready after T1 (no S1).** I checked these numbers by hand:

- E' = 25 / (1 - 0.28^2) = 27.13 GPa.
- PKN net pressure: E' w_max / (2 hf) = 27.13e9 x 6.39e-3 / 60 = 2.89 MPa.
  BHTP is 38.13 + 2.89 = 41.02 MPa. Average width is pi/5 x 6.39 = 4.02 mm.
- Nolte balance:
  - slurry 0.053 m3/s x 65.8 min = 209.1 m3;
  - efficiency 4.02 mm x 300 m x 30 m / 209.1 = 17.3%;
  - pad fraction (1 - 0.173) / (1 + 0.173) = 0.705, which ends the pad at
    46.4 min.
- Proppant mass: 800 x (209.1 - 147.5) / 1.705 = 28.9 t. Areal
  concentration is 28,900 / (300 x 30) = 3.21 kg/m2.
- C_fD: 132 D x 0.5 retained x 1.51 mm / (1 mD x 150 m) = 0.665. That
  gives r'w = 21.9 m and s_f = ln(0.108 / 21.9) = -5.31. FOI is
  7.93 / ln(300 / 21.9) = 3.03.
- Hawkins: 4 ln(0.9 / 0.108) = 8.48 before and 4 ln(0.9 / 0.6) = 1.62
  after. Acid volume is pi (0.6^2 - 0.108^2) x 0.18 x 100 m x 1.5 = 29.5 m3.
- Wormhole: sqrt(8 / (pi x 0.18 x 100) + 0.108^2) = 0.39 m, so the skin is
  -1.29.
- Matrix ceiling: steady Darcy at 14.4 MPa below closure, with the damage
  skin, gives 33 L/min.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| ST-T1-001 | S2 | The frac height (30 m) was never compared with the interval, whose vertical thickness is 77 m at 40 degrees. The design silently leaves about 60% of the perforated interval unstimulated. | The design tab states the coverage ("covers 39% of the interval's 77 m vertical thickness") and what to do. It is display context, and the engine and goldens are unchanged. |
| ST-T1-002 | S3 | The pump schedule time axis ended on an unrounded tick ("65.75381946775921"). The axis label ran into the legend. | Whole-minute ticks with the axis rounded up to 70 min, plus the chart-standard legend band. |
| ST-T1-003 | S3 | The EOJ reference sat on the top edge of the chart with a cryptic label. The pad marker label floated mid-chart. | "end-of-job concentration" is drawn with headroom, and "end of pad" sits at the top of its line. |
| ST-T1-004 | S3 | The PKN width profile had a visible kink before the tip because it was sampled every 3.75 m, while the (1 - x/xf)^(1/4) shape drops steeply there. | Tip samples are refined. |
| ST-T1-005 | S3 | The unknown-proppant error used an em dash. | Reworded. |

## Tests

- `e2e/stimulation-t1.spec.js` checks the coverage note, the whole-minute
  axis with no float tick, the EOJ label and the FOI.
- The existing `stimulation-designer.spec.js` passes (4/4).
- Stimulation jest: 9/9 pass.
