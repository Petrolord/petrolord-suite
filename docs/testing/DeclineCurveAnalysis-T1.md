# Decline Curve Analysis: senior test T1

- App: Decline Curve Analysis (`/dashboard/apps/reservoir/decline-curve-analysis`)
- Wave / position: Wave 2, #20 (Senior Testing Programme)
- Build tested: main after Material Balance T1 (#647)
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: Harmony (S&P), Aries, OFM
- Coverage before T1: several fix rounds (#169, #178, #179, #182, #243); canonical Arps engine

## How it was tested

`/dev/dca` rendered the app, but projects save through the shared
`saved_*_projects` service to Supabase, so nothing could be created
anonymously. T1 added `src/dev/InMemorySupabase`, a reusable dev-only
Supabase double (tables, auth, edge functions), and ran a synthetic
hyperbolic well with known parameters: qi 1,000 bbl/d, Di 0.08 per month,
b 0.5, 36 months, 2 percent noise.

## Verdict

**Not Demo-ready before T1: one S1; now Demo-ready.** The fit is right
(b 0.50, qi and decline as expected from the first sample date). The
forecast was not: it ran from the first fitted date, and the whole curve
from first production was labelled "remaining reserves". On the test well
the app reported 611,294 bbl remaining; the closed form gives about 612,000
from first production, of which about 429,000 was already produced, so the
true remaining over the next ten years is about 208,000. Remaining reserves
were overstated by a factor of three, and the horizon ended ten years after
first production, not ten years from today.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| DCA-T1-001 | S1 | Remaining reserves included the volume already produced; forecast and horizon ran from first production | `forecastFromHistory`: the engine curve runs through history plus the horizon and is split at the last history date; remaining, produced to date (from the rate history) and EUR reported separately |
| DCA-T1-002 | S2 | "Life of well, until econ limit" when the forecast stopped at the duration cap | Life counted from the last history date and labelled limit or horizon |
| DCA-T1-003 | S2 | Rate-time plot on a category axis: a month of history as wide as a day of forecast; last tick a raw ISO string | Numeric time axis, year-month ticks, dated tooltip |
| DCA-T1-004 | S3 | R squared shown as 1 and 100.0 percent on a fit with 4.5 bbl/d RMSE | Four decimals |
| DCA-T1-005 | S3 | "Remaining reserves 0 bbl" before any forecast | Dash and "Run a forecast" |
| DCA-T1-006 | S3 | Deterministic legend listed P10, P90 and a band; forecast named P50 | Band and P names only on probabilistic runs |
| DCA-T1-007 | S3 | Monte Carlo P10/P50/P90 labelled "reserves" | Labelled EUR (from first production, same end date as the deterministic curve) |
| DCA-T1-008 | S3 | Shared picker's create button read "Create Project" | Follows the picker's noun |
| DCA-T1-E1 | Enhancement | In-memory Supabase double for harnesses | Built, reused by later Wave 2 apps |

## Tests

`forecastFromHistory.test.js` (closed-form remaining, EUR, limit from the
last data; the old logic fails the first), DCA jest, `e2e/dca-t1.spec.js`.
