# Drilling Fluids & Hydraulics Studio: senior test T1

- App: Drilling Fluids & Hydraulics Studio (`/dashboard/apps/drilling/hydraulics`)
- Wave / position: Wave 3, #35 (Senior Testing Programme; drilling)
- Build tested: main plus Wave 3 PR #662
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: Landmark WELLPLAN Hydraulics, Drillbench, API RP 13D
- Coverage before T1: D2 build (API RP 13D method against oracle goldens), human tester feedback (moderate)

## How it was tested

The existing `/dev/hydraulics` harness, which loads the oracle golden case
(TD 3,000 m MD / 2,508 m TVD, 1,440 kg/m3 mud), was walked at 1366 x 768
across the mud, hydraulics, surge/swab and hole cleaning tabs.

## Verdict

**Demo-ready after T1 (no S1 or S2).** The numbers agree with hand
calculations:

| Quantity | Hand calculation | App |
| --- | --- | --- |
| Plastic viscosity | 64 - 38 | 26 cP |
| Yield point | 12 x 0.511 | 6.12 Pa |
| Power-law n | 3.32 log(64/38) | 0.752 |
| Jet velocity | 0.025 m3/s over 4.618e-4 m2 | 54.1 m/s |
| Bit pressure drop | 1440 x 54.1^2 / (2 x 0.95^2) | 2,335 kPa (app 2,338) |
| Bit power share | 2,338 / 11,771 | 20% |
| Transport ratio | 1 - 0.168 / 0.98 | 0.829 |

The defects were in the charts.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| HYD-T1-001 | S3 | Surge/swab chart: the pore and fracture limits sat off the auto axis, so the margin that sets the safe trip speed was invisible; the legend overlapped the axis title | Limits extend the axis and are labelled PP and FP; shared legend band |
| HYD-T1-002 | S3 | ECD chart started at 400 m TVD, and the static and ECD lines began at the first element boundary (about 1,270 m) | Axis from surface; static mud line at every depth; ECD anchored at the static weight at surface |
| HYD-T1-003 | S3 | Rheogram legend showed code keys ("powerLaw", "herschelBulkley (used)") | Model names |

## Tests

- `e2e/hydraulics-t1.spec.js`: bit figures, PP/FP on the surge chart, ECD
  axis from 0.
- The existing `hydraulics-studio.spec.js` still passes.
- Hydraulics jest: 10/10 pass.
