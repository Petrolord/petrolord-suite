# Rod Pump Design Studio: senior test T1

- App: Rod Pump Design Studio (`/dashboard/apps/production/rod-pump-design-studio`)
- Wave / position: Wave 4, #53 (Senior Testing Programme; production)
- Build tested: main 2cc369f76 plus #681
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: RODSTAR / SROD wave-equation design, API RP 11L, modified Goodman diagram
- Coverage before T1: engine goldens (rodPumpDesign, rodDynamics, rodString, pumpingUnit); no human walk

## How it was tested

I used `/dev/production/rod-pump` at 1366 x 768. The unit is a
1.75 in plunger with a 64 in stroke at 8 spm, the pump at 4,800 ft on a
7/8 and 3/4 in Grade D taper. I walked design, dyno cards, rod string,
performance (speed sweep) and diagnostics.

## Verdict

**Demo-ready after T1. It was S1 before, because the default design
failed its own duty with every indicator green.**

- Fluid load: (2,107 - 1,082) psi x 2.405 in2 = 2,464 lb.
- Swept volume: 0.1166 x 1.75^2 x 56.2 in x 8 spm = 160.5 bbl/d. At
  90% pump efficiency that is 144.4 bbl/d.
- Goodman on the 7/8 in section: 12,798 lb / 0.601 in2 = 21,295 psi,
  against an allowable of 115,000 / 4 + 0.5625 x 9,225 = 33,939 psi.
  The loading is 62.7%.
- Speed sweep: production rises linearly with speed (71.2 bbl/d at
  4 spm, 107.1 at 6), and rod loading climbs with it.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| RP-T1-001 | S1 | The duty is an oil rate with a water cut, but nothing compared the liquid the pump lifts with the liquid that oil rate needs. The default case, 120 stb/d of oil at 80% water, needs 600 bbl/d of liquid. The pump lifted 140.9 bbl/d (about 28 stb/d of oil), and the summary said "all inside their limits". | A `rateShortfall` warning states the lifted liquid, the oil it carries, and the target in both units. The summary shows the liquid target. The default duty is now 25 stb/d at 80% water (125 bbl/d of liquid), which the default unit meets at 144.4 bbl/d. The e2e asks for the old duty and checks that the warning fires. |
| RP-T1-002 | S2 | The surface and downhole cards plotted position as "-63.99730591489059" to 0. The engine measures downward from the top of the stroke. | Each card is re-based to read 0 at the bottom of the stroke up to the stroke length, with whole-inch ticks. |
| RP-T1-003 | S3 | The rod stress table hid its Loading column (the result) off to the right. "Load the predicted card" wrapped. The six-tab header let the tabs draw over the title. | Tighter table, a one-line button, and a shared StudioHeader whose title block has a floor and whose tab row scrolls. |

## Tests

- `e2e/rod-pump-t1.spec.js` checks:
  - the liquid target on the default, with no shortfall warning;
  - a clean card axis and the 62.7% loading;
  - that the old 120 stb/d duty raises the shortfall warning (600 bbl/d
    of liquid).
- Rod pump, production and lift-advisor jest: 524 pass, plus the context
  test on the new default.
