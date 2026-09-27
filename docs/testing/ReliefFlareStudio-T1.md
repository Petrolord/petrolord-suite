# Relief & Flare Studio: senior test T1

- App: Relief & Flare Studio (`/dashboard/apps/facilities/relief-blowdown-sizer`)
- Wave / position: Wave 5, #65 (Senior Testing Programme; facilities and process safety)
- Build tested: main 3ad8894b4 plus #690 to #693
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: API 520 Part I gas PSV sizing and API 526 orifices, API 521 KO drum and point-source radiation, adiabatic depressuring
- Coverage before T1: relief gates (44) and engine goldens; no human walk

## How it was tested

I used `/dev/facilities/relief` at 1366 x 768. The defaults:

- PSV: 50,000 lb/hr of MW 19 gas at 150 F, set at 285 psig with 10%
  overpressure, z 0.9, k 1.25.
- KO drum: 8 ft, 30 MMscfd.
- Flare: 100,000 lb/hr at 20,000 Btu/lb, F 0.3, 4.73 kW/m2.
- Blowdown: 500 ft3 from 1,000 to 100 psig through a 1 in orifice.

I walked PSV, KO drum, radiation and blowdown.

## Verdict

**Demo-ready after T1 (no S1 or S2).** I checked these numbers by hand:

- PSV:
  - C for k 1.25 = 520 sqrt(1.25 x 0.8889^9) = 342.2;
  - P1 = 285 x 1.1 + 14.7 = 328.2 psia;
  - A = 50,000 / (342.2 x 0.975 x 328.2) x sqrt(609.7 x 0.9 / 19) =
    2.454 in2, which takes an L orifice (2.853 in2, 16% margin).
- Radiation:
  - 2e9 Btu/h = 586.1 MW;
  - D = sqrt(0.3 x 586.1e6 / (4 pi x 4,730)) = 54.4 m;
  - 1.40 kW/m2 at 100 m.
- Blowdown: 559.7 R x (114.7 / 1,014.7)^0.2308 = 338.4 R = -121 F. It
  takes 4.5 min, inside 15 min.
- KO drum: a 6.0 ft fall above a 2.0 ft level, with drag C 1.55
  iterated. The flagged L/D of 1.23 correctly says a smaller drum may do.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| RF-T1-001 | S3 | The blowdown time axis ended on "4.469127125537". | Axis from 0, rounded up to a whole minute, integer ticks. |
| RF-T1-002 | S3 | Engine warnings started lowercase ("L/D below 2: a smaller drum..."). | Warning notes capitalise their first letter. |

## Tests

- `e2e/relief-flare-t1.spec.js` checks the area, relieving pressure,
  heat release and final temperature, with a clean time axis.
- Relief jest: 44 pass.
