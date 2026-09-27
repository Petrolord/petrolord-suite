# Well Spacing Optimizer: senior test T1

- App: Well Spacing Optimizer (Reservoir Management)
- Wave / position: Wave 7, #89 (Senior Testing Programme; reservoir, ML and assurance)
- Build tested: main (Wave 6 merged) plus #718 to #723
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: volumetric EUR per drained area, exponential decline to the economic limit, discounted cash flow per spacing case
- Coverage before T1: well spacing calculation tests (21); no human walk

## How it was tested

I used `/dev/studio/well-spacing` at 1366 x 768 with the example the form
suggests in its placeholders:

- 5,000 acres x 60 ft, 15.2% porosity, Swi 0.25, 35% RF;
- 35 API, 0.75 gas gravity, 500 scf/stb, 180 F;
- $5MM wells and $75 oil;
- 20 to 160 acres in steps of 10.

## Verdict

**Demo-ready after T1. It was S2 before: every volume and every dollar
figure was in reservoir barrels priced as stock-tank barrels.**

- Standing's Bo: 0.9759 + 0.00012 (500 sqrt(0.75/0.8498) + 1.25 x
  180)^1.2 = **1.284 rb/stb**.
- EUR at 20 acres: 7758 x 20 x 60 x 0.152 x 0.75 x 0.35 / 1.284 = **289.2
  Mbbl**. It used to show 371.5, which is the same volume with no Bo,
  28% high.
- The page's own reading of the model (a fixed RF over the drained area,
  no interference, so NPV rises with spacing) still stands and is stated
  on the results.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| WS-T1-001 | S2 | OOIP per well was 7758 A h phi (1 - Sw) with no formation volume factor. EUR, produced volume, NPV and cost per barrel were all in reservoir barrels, about 28% high here. The form asks for GOR, API, gas gravity and temperature, and none of them was used for volume. | Oil in place is divided by Standing's Bo (the Suite's PVT module) from those inputs. The results say so and show the Bo, and the help guide formula is updated. The closed-form test now divides by Bo, with a new gate and negative control. |
| WS-T1-002 | S3 | The three result charts were the Suite's only Chart.js charts, off the chart standard, smoothed between discrete spacing cases. On the dev server that stray dependency also broke the page. | Recharts on the chart theme, straight segments, labelled axes and the logo. |
| WS-T1-003 | S3 | About two dozen required inputs opened blank with no example. | A "Load example field" button fills the placeholders the form already shows. |

## Tests

- `src/utils/__tests__/wellSpacingCalculations.test.js` checks:
  - Bo 1.284;
  - EUR = closed form / Bo, not 371.5.
- `e2e/well-spacing-t1.spec.js` checks:
  - the example loads and runs;
  - the Bo note;
  - an EUR cell of 289.2 and none of 371.5;
  - three recharts charts and no canvas;
  - no page errors.
- Well spacing and help jest pass.
