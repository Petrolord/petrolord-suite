# Well Cost & Time Estimator: senior test T1

- App: Well Cost & Time Estimator (`/dashboard/apps/drilling/well-cost-time`)
- Wave / position: Wave 2, #26 (Senior Testing Programme)
- Build tested: main plus Wave 2 PRs #652 and #653
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: Peloton WellView cost, DrillPlan, spreadsheet AFEs
- Coverage before T1: D11 build (engine vs oracle goldens, seeded Monte Carlo via the canonical module), existing e2e on the golden case

## How it was tested

The existing `/dev/well-cost` harness (oracle golden case on the in-memory
backend) was walked at 1366 x 768 across Time Program, AFE Cost, Risk (a
Monte Carlo run of 2,000 iterations with seed 42) and Report. The results
were then checked by hand.

## Verdict

**Demo-ready (no S1 or S2 in the numbers).** Every figure checked:

- **AFE items:** the rig day rate of 100,000 over 18.0 days is 1,800,000
  USD, services are 1,080,000, and mud at 150 USD/m over 3,000 m is
  450,000.
- **AFE totals:** base 5,380,000 plus 10 percent contingency is 5,918,000.
- **Schedule:** NPT is 0.125 x 384 h = 48 h, so the total is 432 h (18.0
  days). A casing run is (500/500 + 11) x 1.125 = 13.5 h.
- **Cost per metre (ADE form):** (50,000 + 6,000 x 120) / 1,000 = 770
  USD/m.
- **Report:** base cost per drilled metre is 5.38M / 3,000 = 1,793 USD/m.
- **Monte Carlo:** P10/P50/P90 of 5.19 / 5.51 / 5.87 MM USD follow the AFE
  convention (P10 low), with rig rate as the top Spearman driver.

The one defect was the AFE item editor: a lump-sum row carries a
linked-activity picker as well, and at 1366 its name box shrank to an empty
square. "Wellhead", "Cementing services" and three more were unreadable.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| WCT-T1-001 | S2 | Lump-sum AFE item names squeezed to an empty box at 1366 | Name keeps a minimum width and the row wraps; activity names on the Time Program get the same treatment |

## Observations (not changed)

- Histogram percentile labels sit over the bars and read faintly.
- The time program's numeric columns carry no inline unit labels (the
  kind column implies them); the help guide explains the fields.

## Tests

`e2e/well-cost-time-t1.spec.js` (name width, AFE total); the existing
`well-cost-time.spec.js` (5) still passes. WCT jest 21/21.
