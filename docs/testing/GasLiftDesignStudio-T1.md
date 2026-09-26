# Gas Lift Design Studio: senior test T1

- App: Gas Lift Design Studio (`/dashboard/apps/production/gas-lift-design-studio`)
- Wave / position: Wave 4, #48 (Senior Testing Programme; production)
- Build tested: main ec45ddcff plus #672 to #675
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: WinGLUE / Prosper gas lift design, API RP 11V6 (IPO surface-close method)
- Coverage before T1: engine goldens (gasLiftDesign, gasLiftValves) and Suite gates; no human walk

## How it was tested

I used `/dev/production/gas-lift` at 1366 x 768. The default design:

- 1,000 psig kickoff and 900 psig operating;
- 600 Mscf/d target injection;
- 400 stb/d design oil at 70% water;
- the packer at 7,000 ft, R15 IPO valves and a 0.25 in bottom orifice.

I walked the valve design (chart and valve sheet), unloading, injection
point and performance tabs, including the performance curve.

## Verdict

**Demo-ready after T1. It was S2 before, because the default design
multipointed during unloading.**

- Injection point: casing at 4,056 ft = 914.7 psia x
  exp(0.01875 x 0.65 x 4,056 / (0.9 x 560)) = about 994 psig (992 shown).
  Tubing is 50 psi of transfer drop lower (942).
- Performance: the marginal gain from 1,000 to 1,200 Mscf/d is
  (640 - 635) / 200 = 0.025 stb/Mscf, below the 0.05 economic slope, so the
  economic point is 1,000 Mscf/d and the maximum is 640 stb/d at 1,400.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| GL-T1-001 | S2 | The default design dropped 25 psi per valve. That is less than the valves' spread, so at stages 2 and 3 the valve above stayed open and the string injected at two depths. The studio said so correctly, but the case every visitor opens was a failing design. | The default drop is 50 psi (1,000, 950, 900 psig, the last at the operating pressure). Every stage shows the valves above shut. The engine's interference check is unchanged. |
| GL-T1-002 | S2 | "2 things to look at" stood over one line, "The string reached the target depth". The count's warnings were never listed, and the one line shown was not a problem. | The summary lists each warning, and the stop reason follows as plain text. |
| GL-T1-003 | S2 | "Target gas rate -- Mscf/d" with 600 entered. The injection-point and depth-sweep captions had the same string-to-number slip. | Coerced: "600 Mscf/d", "at 400 stb/d", "at 900 psig". |
| GL-T1-004 | S3 | Pressure axes ended on float ticks ("1799.6146838672119", 3350). Legends sat on axis titles. "Run sweep" wrapped. | Axes rounded up to 250 psi with integer ticks, plus the legend band (production sweep) and one-line buttons. |
| GL-T1-005 | S4 | Engine text "valve(s) 1 are still open". | Recorded for the engines repo (gasLiftDesign.js interference message). |

## Tests

- `e2e/gas-lift-t1.spec.js` checks:
  - the target rate, and no warnings on the default case;
  - three "all shut" stages and no "V# still open";
  - the injection-point figures and clean ticks.
- Gas lift and production jest: 432 pass. The two known flaky
  `gasLiftDesignContext` cases fail on main alone as well.
