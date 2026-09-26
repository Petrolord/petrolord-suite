# Forecast Scenario Hub: senior test T1

- App: Forecast Scenario Hub (`/dashboard/apps/reservoir/forecast-scenario-hub`)
- Wave / position: Wave 2, #21 (Senior Testing Programme)
- Build tested: main plus Decline Curve Analysis T1 (#648)
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: Aries, PHDWin, OFM forecast comparison
- Coverage before T1: R5 build, help guide, unit tests on the wrapper

## How it was tested

New harness `/dev/forecast-scenario-hub` on the in-memory Supabase double,
so scenario sets save, load and delete without a database. The shipped
three-case sample (qi 1,200 / 1,500 / 1,000 bbl/d, nominal 18 / 14 / 24
percent per year, b 0.5 / 0.7 / 0.3, 20 years, 30 bbl/d limit) was checked
against the Arps closed forms, walked at 1366 x 768, and saved twice under
one name.

## Verdict

**Not Demo-ready before T1: one S1; now Demo-ready.** The rates and horizon
cumulatives are right (Base 3.13 MMbbl at 20 years against the closed form
3.129). The column labelled EUR was not an EUR. None of the three cases
reaches 30 bbl/d inside 20 years, so the "EUR" was the 20 year cumulative
and every case showed "Time to limit 20.0". Base actually reaches the limit
after about 59 years with 4.10 MMbbl, Low after 25.9 years with 1.99
MMbbl, and High after about 148 years. The help guide documented this as
"ambiguous by design".

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| FSH-T1-001 | S1 | "EUR" was the cumulative to the horizon; "Time to limit" reported the horizon when the limit was never reached | EUR follows the decline to the economic limit under a 50 year maximum life (the Aries and PHDWin default), marked "50 yr max life" when capped; new "Cum to horizon" column; time to limit shows the real crossing, "past horizon", "> 50" or "No limit" |
| FSH-T1-002 | S2 | Rate chart x axis "Month" with 244 odd ticks (30 day sample index) | Years from forecast start on a numeric axis with round ticks; last horizon day kept; tooltip in bbl/d |
| FSH-T1-003 | S2 | Chart series keyed by case name: two cases with one name collapsed into one line | Keyed by case id, named for the legend |
| FSH-T1-004 | S2 | Saving under an existing name created a twin set; delete in Load had no confirmation | Same name updates the set; delete takes a second click |
| FSH-T1-005 | S3 | "Cum @5 yr" labelled five years for shorter horizons | Cell states the horizon used |
| FSH-T1-006 | S3 | "Annual CSV" wrapped in the table at 1366; em dash placeholder | No wrap; hyphen placeholder |
| FSH-T1-007 | S3 | Help guide described the defects above as behaviour; one "X, not Y" title | Guide rewritten for the new EUR, axis and save behaviour |
| FSH-T1-E1 | Enhancement | Harness double restored the real client during StrictMode's effect re-run, so the first table read went to the live database | `InMemorySupabase` restores on the next tick; stable default functions map |

## Observations (not changed)

- Arps without a terminal decline: slow hyperbolic cases (High, b 0.7) take
  over a century to reach a low limit, which the 50 year cap now makes
  visible. A modified hyperbolic (Dmin switch to exponential) belongs in the
  engines repo after NAPE.
- Clearing a numeric box writes zero (documented in the guide).
- b above 1 is accepted without warning (documented).

## Tests

`forecastScenarioCalculations.test.js` (closed-form EUR to the limit and time
to limit for a hyperbolic case past the horizon, harmonic capped at the
maximum life, sample semantics; the old wrapper fails the new EUR test),
`e2e/forecast-scenario-hub-t1.spec.js` (table values, years axis, save by
name, delete confirmation).
