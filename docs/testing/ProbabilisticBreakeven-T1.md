# Probabilistic Breakeven Analyzer: senior test T1

- App: Probabilistic Breakeven Analyzer (`/dashboard/apps/economics-project-management/probabilistic-breakeven-analyzer`)
- Wave / position: Wave 6, #74 (Senior Testing Programme; economics and downstream)
- Build tested: main 3280cf406 plus #700 to #702
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: Monte Carlo breakeven price from triangular CAPEX, OPEX and production uncertainty over an uploaded profile
- Coverage before T1: breakeven jest (10); no human walk

## How it was tested

I used `/dev/studio/breakeven` at 1366 x 768 and uploaded a 36-month profile:
10,000 bopd declining 2% a month (`e2e/fixtures/breakeven-profile.csv`).
That is 10,000 x 30.4 x (1 - 0.98^36) / 0.02, about 7.9 MMbbl. I kept the
default variables (CAPEX 800 / 1,000 / 1,300 $MM) and ran the simulation.

## Verdict

**Demo-ready after T1. It was S2 before, because the user could not read
their own CAPEX inputs.**

- The undiscounted floor is about 1,180 / 7.9 / 0.875, or $172/bbl.
  Discounting and OPEX lift it to the reported P50 of $238.31/bbl, with
  P10 $194.69, P90 $301.62 and a mean of $243.85. The ordering and the
  spread follow the CAPEX triangle.
- The S-curve crosses 50% at the median line, and the histogram peaks
  near the mean.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| BE-T1-001 | S2 | The percentile inputs were clipped at 1366: CAPEX 1000 read "100" and 1300 read "130". The spinner and the padding ate the field. | Tighter card padding, no spinners and tabular figures. The full value shows. |
| BE-T1-002 | S3 | After upload nothing said what to do next; the Run button sits below the fold of the setup panel. | The empty state now says the profile is loaded and points to Run Simulation at the bottom of the setup panel. |
| BE-T1-003 | S3 | The S-curve legend sat on top of the median label. Ticks read "187.80" and "226.95", and the X axis title collided with the tick labels. | The legend uses the Suite standard, the median label sits inside the plot, and ticks fall on round $10 steps. The axis title has its own band. The same fixes apply on the histogram and the tornado. |

## Tests

- `e2e/breakeven-t1.spec.js` checks:
  - the CAPEX P50 input shows 1000 without clipping;
  - the next-step message after upload;
  - P50 $238.31/STB, the median label, and no decimal ticks.
- Negative control: with the old VariableCard the spec fails, with a
  10 px clip.
- Breakeven jest: 10 pass.
