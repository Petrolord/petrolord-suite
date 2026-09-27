# QRA Studio: senior test T1

- App: QRA Studio (`/dashboard/apps/process-safety/qra-studio`)
- Wave / position: Wave 5, #70, the last app in the wave (Senior Testing Programme; process safety)
- Build tested: main e4a9fbca2 plus #695 to #698
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: TNO Purple Book (CPR 18E) individual and societal risk, UK HSE R2P2 tolerability limits, HSE cost benefit checklist
- Coverage before T1: 213 QRA and process-safety tests; no human walk

## How it was tested

I used `/dev/facilities/qra` at 1366 x 768 with the opening study: gas
line jet fire, flash fire and VCE outcomes and an H2S release, three
locations (process area, control room, site boundary) and the HSE
checklist measure. I walked register, event tree, individual risk,
societal risk and ALARP.

## Verdict

**Demo-ready after T1 (no S1 or S2).** I checked these numbers by hand:

- Pd, Purple Book heat probit: -36.38 + 2.56 ln(20,000^(4/3) x 20) =
  5.09, so 0.537. At 6 kW/m2 it is 2.95e-5.
- LSIR at the process area: 4e-6 x 0.537 + 1.728e-5 + 1.152e-5 +
  5e-6 x 0.35 = 3.27e-5, with the flash fire the largest contributor at
  52.8%.
- IRPA: 3.27e-5 x 2,000/8,760 + 2.50e-7 x 1,500/8,760 = 7.51e-6, which
  is TOLERABLE against the R2P2 worker limits.
- PLL: 3.2e-6 + 2.59e-5 + 4.61e-5 + 6.0e-5 = 1.352e-4.
  FAR = 1.352e-4 x 1e8 / 80,000 = 0.169.
- F-N: at N = 12, F = 5e-6 against 1e-3 / 144 = 6.94e-6, ratio 0.72,
  BELOW.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| QRA-T1-001 | S3 | The F-N chart's fatalities axis drew about two dozen overlapping tick labels ("84100120140170200..."), and recharts repeated some of them, which is the console duplicate-key warning. Risk axes printed "1.0e-4" and mixed forms. The F-N and band Y titles were clipped. | One tick per decade on every log axis. Risk ticks read 1e-4, counts read 0.1, 1, 10, 100, 1k. Y titles fit. The transect distance axis is rounded to 50 m. No console warnings. |
| QRA-T1-002 | S3 | State badges showed enum keys ("BROADLY_ACCEPTABLE", "NOT_GROSSLY_DISPROPORTIONATE"). | Shown as words. The band annotation on the chart is the same. |

## Tests

- `e2e/qra-t1.spec.js` checks:
  - LSIR, IRPA, PLL and FAR;
  - the worded badges;
  - decade labels on the F-N chart;
  - no duplicate-key warnings.
- QRA and process-safety jest: 213 pass, with the smoke assertions
  updated to worded states.
