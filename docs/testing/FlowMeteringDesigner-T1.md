# Flow Metering Designer: senior test T1

- App: Flow Metering Designer (`/dashboard/apps/facilities/flow-metering-designer`)
- Wave / position: Wave 5, #59 (Senior Testing Programme; facilities and process safety)
- Build tested: main 1b9f43ce2 plus #684 to #687
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: ISO 5167-2 orifice metering (Reader-Harris/Gallagher Cd, expansibility, permanent loss), GUM uncertainty budget
- Coverage before T1: engine goldens (metering); no human walk

## How it was tested

I used `/dev/facilities/metering` at 1366 x 768. The default run is a
3.0 in bore in 6.065 in pipe, 100 inH2O on a 200 inH2O span, 500 psia,
2.5 lb/ft3, 0.012 cP, k 1.3, a single elbow upstream, and a 50,000 lb/hr
target. I walked flow and plate, and uncertainty.

## Verdict

**Demo-ready after T1 (no S1 or S2).** I checked these numbers by hand:

- Beta: 3 / 6.065 = 0.4946, so E = 1 / sqrt(1 - 0.0599) = 1.0314.
- Mass flow: 0.60241 x 1.0314 x 0.99794 x 0.04909 ft2 x
  sqrt(2 x 2.5 x 520.3 x 32.174) = 31,630 lb/hr (31,697 shown). The 0.2%
  gap is the inH2O reference temperature.
- Pipe Re: 4 x 8.80 / (pi x 0.5054 x 8.06e-6) = 2.75e6.
- Permanent loss (ISO 5167): (0.9807 - 0.1474) / (0.9807 + 0.1474) =
  73.9% of the differential.
- Uncertainty: 0.574% total, with the Cd term at 75.8% of the variance,
  which gives 0.50% (the RHG figure). The transmitter is 0.075% of a
  200 span read at 100, so 0.150%, and turndown is sqrt(200/100) = 1.41.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| MET-T1-001 | S3 | Engine notes started lowercase ("beta above 0.6...", "a plate is bored...", "the differential transmitter..."). | Their first letter is capitalised at display, as in the Control Valve studio. |
| MET-T1-002 | S3 | The Cd curve's axis title was clipped ("harge coeffi..."), and the ticks were uneven (0.6365, 0.627 ... then 0.609, 0.618, 0.635). The Reynolds axis printed "3e+3", "1e+4". | "Cd" axis on even 0.005 steps. Reynolds on decades, written 10k, 100k, 1M, 10M. Legend band (Wave 5 sweep). |

## Tests

- `e2e/flow-metering-t1.spec.js` checks:
  - the mass flow, beta and permanent loss;
  - the decade and 0.005 ticks, with no exponent labels;
  - the capitalised note and total uncertainty.
