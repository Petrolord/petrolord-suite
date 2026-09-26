# Well Control Studio: senior test T1

- App: Well Control Studio (`/dashboard/apps/drilling/well-control`)
- Wave / position: Wave 3, #36 (Senior Testing Programme; drilling)
- Build tested: main plus Wave 3 PRs #662 and #663
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: IWCF kill sheet, Drillbench Kick, Landmark WELLPLAN Well Control
- Coverage before T1: D3 build (engine against oracle goldens; gates A16 and A17; L8 and L9 armed)

## How it was tested

The existing `/dev/well-control` harness loads the oracle golden kick:
TD 3,000 m MD / 2,508 m TVD, a 40 degree bottom section, 1,440 kg/m3 mud,
SIDPP 2,000 kPa, SICP 2,900 kPa, a 3 m3 pit gain and a shoe at 1,400 m MD.
I walked volumes, the kill sheet and kick tolerance at 1366 x 768.

## Verdict

**Demo-ready after T1 (no S1).** The kill sheet is right:

| Quantity | Hand calculation | App |
| --- | --- | --- |
| Formation pressure | 2,000 + 1,440 x 9.80665 x 2,508 | 37,416 kPa |
| Kill mud weight | | 1.521 g/cc |
| ICP | 4,500 + 2,000 | 6,500 kPa |
| FCP | 4,500 x 1,521 / 1,440 | 4,754 kPa |
| Strokes to bit | 26.1 m3 / 12 L | 2,174 |
| MAASP | 0.31 x 9.80665 x 1,282 | 3,898 kPa |
| Kick tolerance | 205.6 m vertical x 0.0135 m2 | 2.78 m3 |

One engine convention matters in a deviated well. The engine takes the
influx length along the hole as the vertical height in its hydrostatic
terms.

- **Influx characterisation.** The column is 222 m along the 40 degree
  bottom section but only 170 m vertical. The influx density therefore
  reads 1.03 g/cc where the vertical height gives 0.90 g/cc. That is the
  number a supervisor reads to decide gas or liquid.
- **Kick tolerance.** The same convention turns the allowed vertical
  height into a volume using the capacity per metre along the hole. That
  errs on the safe side (2.78 m3 against about 3.62 m3).

The goldens encode this convention. The fix belongs in the engines repo,
with an oracle update. The Suite now states it on screen.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| WC-T1-001 | S2 | Influx density used the along-hole column as its vertical height (1.03 against 0.90 g/cc on the golden kick) | The kill sheet states the along-hole and vertical heights and the vertical-height density. **Engine fix to be made in petrolord-engines** (wellControl.js killSheet influx height; kickTolerance volume) with an oracle update. |
| WC-T1-002 | S3 | Kick tolerance volumes use along-hole capacity for a vertical height (conservative), unstated | Stated under the result |
| WC-T1-003 | S3 | Kick tolerance x axis ticks at 1.22, 1.37, 1.52, 1.80; legends over axis titles; em dashes in the chart title, status bar and run history | A tick on every swept mud weight; shared legend band; copy fixed |

## Tests

- `e2e/well-control-t1.spec.js`: ICP, FCP, the deviation statement, and
  kick tolerance.
- The existing `well-control-studio.spec.js` still passes.
- WC jest: 8/8 pass.
