# EOR Screening: senior test T1

- App: EOR Screening (Reservoir Management)
- Wave / position: Wave 7, #84 (Senior Testing Programme; reservoir, ML and assurance)
- Build tested: main plus the Wave 6 stack (#706 to #717)
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: Taber, Martin & Seright, "EOR Screening Criteria Revisited", SPE Reservoir Engineering (1997), Table 1 hard limits
- Coverage before T1: EOR screening tests (11); no human walk

## How it was tested

I used `/dev/studio/eor` at 1366 x 768. The defaults are:

- 32 API and 2 cp;
- 45% So;
- 40 ft at 25 md;
- 5,200 ft at 105 F;
- carbonate.

## Verdict

**Demo-ready after T1, at S3. Every method's count matches the paper.**

| Method | Met | Fails (Taber 1997) |
| --- | --- | --- |
| CO2 miscible | 5/5 | none |
| Hydrocarbon miscible | 5/5 | none |
| Immiscible gas | 4/4 | none |
| Micellar/polymer, ASP | 6/7 | carbonate (sandstone preferred) |
| In-situ combustion | 5/8 | So 45 < 50; carbonate; 25 < 50 md |
| Polymer flooding | 4/7 | viscosity 2 < 10; So 45 < 50; carbonate |
| Steam flooding | 4/7 | carbonate; 25 < 200 md; 5,200 > 4,500 ft |
| Nitrogen and flue gas | 2/5 | 32 < 35 API; 2 > 0.4 cp; 5,200 < 6,000 ft |

A check against the older 10 to 27 API band for combustion would say 4/8.
The 1997 paper sets only lower gravity limits for the thermal methods, and
the app follows the paper it cites.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| EOR-T1-001 | S3 | "Load sample (West-Texas-style CO2 candidate)" wrapped to two lines and pressed on the button's edge at 1366. | "Load a sample CO2 candidate", with the detail in the tooltip. |

## Tests

- `e2e/eor-screening-t1.spec.js` checks:
  - 3 of 8 qualify;
  - the 5/5, 4/4, 6/7, 5/8 and 2/5 counts;
  - the sample button's label fits.
- EOR jest: 11 pass.
