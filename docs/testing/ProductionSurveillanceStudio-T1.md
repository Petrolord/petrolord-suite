# Production Surveillance Studio: senior test T1

- App: Production Surveillance Studio (`/dashboard/apps/production/production-surveillance-studio`)
- Wave / position: Wave 4, #52 (Senior Testing Programme; production)
- Build tested: main plus #676 to #680
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: OFM / Spotfire production surveillance, exception-based monitoring, Arps decline overlays
- Coverage before T1: engine goldens (surveillance.js, dca/arps.js); no human walk

## How it was tested

I used `/dev/production/surveillance` on the seeded spine at 1366 x 768
(HP-1 oil, HP-2G gas, HP-3I injector, 180 days to 2026-09-25, one HP-1
deferment). I walked overview, trends, deferments, decline and data.

## Verdict

**Demo-ready after T1. It was S2 before, because the decline "forecast
volume" re-counted the history.**

- Trailing 7 days to 2026-09-25, all matching the seed exactly:
  - oil: 844 + 38 = 882 stb/d;
  - water: 509 + 8 = 516 stb/d;
  - gas: 675 + 3,840 = 4,515 Mscf/d;
  - watercut: 516 / 1,398 = 36.9%;
  - field GOR: 5,117 scf/stb, dominated by the gas well as it should be.
- Deferment: 1,200 x (e^-0.144 + e^-0.146 + e^-0.148) = 3,111 stb.
- Decline fit on HP-1: qi 1,200 stb/d and D 0.00200/day, recovered from
  177 points (180 less the three shut-in days). The first-year effective
  decline is 1 - e^-0.73 = 51.8%.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| SURV-T1-001 | S2 | The 1,825-day forecast started at the fit's first date (the line ended on 2026-03-30 + 1,825 days). "Forecast volume 583,821 stb" therefore re-counted six months already produced. From the last date (838.8 stb/d) the forward volume is about 408,000 stb. | Fixed in the engine (petrolord-engines #271): the same law is carried to the last fitted date (q there, Di re-based for b > 0). Vendored at a844abe. The panel says "from 2026-09-25, the last fitted date". Negative control: forecasting from t0 turns 4 engine tests red. |
| SURV-T1-002 | S3 | "Days to limit 1,825" showed with no economic limit set. | "Forecast days, no economic limit set" until a limit is entered. |
| SURV-T1-003 | S3 | The Overview was blank before a field was chosen. | Prompt to select a field. Legend band on the charts (production sweep). |

## Tests

- `e2e/production-surveillance-t1.spec.js` checks:
  - the empty-state prompt, the seeded KPIs and the deferment;
  - D = 0.00200;
  - a forward volume of about 408,000 (never 583,821);
  - the no-limit label.
- Engines: surveillance tests 76/76, and the full engines suite 231/231.
  The vendoring guard is clean at a844abe (1,059 paths), and the Data & AI
  engine pin moved with it.
