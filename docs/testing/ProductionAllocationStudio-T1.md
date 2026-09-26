# Production Allocation Studio: senior test T1

- App: Production Allocation Studio (`/dashboard/apps/production/production-allocation-studio`)
- Wave / position: Wave 4, #50 (Senior Testing Programme; production)
- Build tested: main ec45ddcff plus #672 to #678
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: Energy Components / ProCount allocation, well-test-times-uptime back allocation
- Coverage before T1: engine goldens (allocation.js); no human walk

## How it was tested

I used `/dev/production/allocation` on the seeded spine at 1366 x 768.
The harness now carries daily field totals at the export point:

- 95% of the wells' oil;
- all of their water;
- 98% of their gas.

The wells are tested monthly at the declining rate, from day 15. Every
factor therefore has a closed form. I walked allocation, test QC,
reconciliation, factors and data.

## Verdict

**Demo-ready after T1. It was S2 before, because the headline period
factor was wrong.**

- Per-date oil factor for HP-1 between tests:
  0.95 x exp(-0.002 (t - t_test)), a saw from 0.95 down to about 0.90.
  April's monthly factor is 0.95 x exp(-0.002 x 8) = 0.935, which matches.
- Period factor on the carried dates: 159,472 / 172,437 = 0.925. HP-1 is
  152,722 / 165,136 = 0.925 and HP-2G is 6,751 / 7,301 = 0.925, pro rata
  as they should be.
- Reconciliation: 177,040 metered / 186,358 booked = 0.950.
- The 15 days before the first test are uncarried (17,568 stb), and the
  diagnostics name those dates.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| ALLOC-T1-001 | S2 | "Period oil factor 1.027" divided metered oil over all 180 dates by theoretical oil over only the 165 dates a test could carry. On a field metering 95% of its wells, the headline said the meter read high. | Allocated / theoretical over the carried dates: 0.925. A line states the 17,568 stb metered on dates no well could carry. |
| ALLOC-T1-002 | S3 | Reconciliation said "an excess of 9,318 stb" without saying which side was higher. | "the wells book 9,318 stb (5.0%) more than the meter reads", or the reverse. |
| ALLOC-T1-003 | S3 | Factor table month and well cells wrapped ("2026- / 04", "HP- / 2G"). Legends sat on axis titles. | One line; legend band (production sweep). |

## Harness

`src/dev/productionSpineSeed.js` now seeds `po_field_totals`.

## Tests

- `e2e/production-allocation-t1.spec.js` checks the 0.925 factor (never
  1.027), the uncarried line and the imbalance wording.
- Allocation jest: 59 pass.
