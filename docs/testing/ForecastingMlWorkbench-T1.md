# Production Forecasting ML Workbench: senior test T1

- App: Production Forecasting ML Workbench (Data & AI)
- Wave / position: Wave 7, #91 (Senior Testing Programme; reservoir, ML and assurance)
- Build tested: main (Wave 6 merged) plus #718 to #726
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: an exact exponential decline, q = 1000 e^(-0.05 t), against Arps, simple, Holt and damped exponential smoothing, the residual bootstrap and the rolling-origin backtest
- Coverage before T1: forecasting engine and smoke tests (11 in the filtered run); no human walk

## How it was tested

I used `/dev/studio/forecasting-ml` at 1366 x 768 and uploaded
`e2e/fixtures/forecast-exponential.csv` (one well, 36 months). I fitted
with a 24-step horizon, ran the bootstrap on the damped trend and ran the
default backtest.

## Verdict

**Demo-ready after T1. It was S2 before: every forecast chart drew with no
axes.**

- Arps (auto-select): **qi 1000.000016, Di 0.05, b 0 (exponential)**.
- The damped trend fits **phi 0.951229 = e^-0.05**, the exact step ratio,
  with SSE 1.4e-7. Its step-36 forecast is **165.2988**, against the exact
  1000 e^-1.8 = 165.2989.
- Simple exponential smoothing from origin 18 stays flat at **427.41** =
  1000 e^-0.85, as it should. The backtest ranks Arps first on MASE (9e-7).

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| FML-T1-001 | S2 | The forecast and backtest charts drew with no axes, ticks or grid. The axes lived in an `<Axes />` wrapper component, and recharts renders only its own element types as a chart's children, so everything inside the wrapper was dropped. | The axes are returned as elements the chart holds directly. I scanned the whole Suite for the same wrapper pattern and found no other instance. |
| FML-T1-002 | S3 | Once drawn, the step axis ended on the data (59, 23). | Round ticks (0 to 60) through niceTicks. |

## Tests

- `e2e/forecasting-ml-t1.spec.js` checks:
  - Arps qi 1000, Di 0.05, b 0;
  - phi 0.95122;
  - the forecast chart has one X and one Y axis, with ticks 0 to 60;
  - the bootstrap step-36 point is 165.2988.
- Forecasting jest passes (11 in the filtered run).
