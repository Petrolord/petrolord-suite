# Gas Well Performance Studio: senior test T1

- App: Gas Well Performance Studio (`/dashboard/apps/production/gas-well-performance-studio`)
- Wave / position: Wave 4, #49 (Senior Testing Programme; production)
- Build tested: main ec45ddcff plus #672 to #677
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: Prosper gas well, Turner (1969) / Coleman (1991) loading, Foss and Gaul plunger lift
- Coverage before T1: engine goldens (gasWellLoading, plungerLift, gasProperties); no human walk

## How it was tested

I used `/dev/production/gas-well` at 1366 x 768. The default well:

- back-pressure inflow, Pr 2,200 psia, 8,000 ft, 400 psia wellhead;
- gas gravity 0.65;
- water at 60 dyne/cm and 67 lb/ft3.

I walked deliverability, liquid loading, the depletion forecast and
plunger lift.

## Verdict

**Demo-ready after T1 (no S1 or S2).** I checked these numbers by hand:

- Deliverability: 1,636 x (1 - (513/2,200)^2)^0.85 = 1,560 Mscf/d
  (1,558 shown). Drawdown is 1,687 psi.
- Coleman at the controlling depth (8,000 ft, 513 psia, 210 F):
  - rho_g = 1.59 lb/ft3;
  - v_c = 1.593 x (60 x 65.4)^0.25 / 1.59^0.5 = 10.0 ft/s (10.7 shown with
    the engine's z and T);
  - q_c = 3.067 p v A / (zT) = 859 Mscf/d (843 shown);
  - the margin is 1,558 / 843 - 1 = 85%.

  Critical rate rises with pressure, so the deepest station controls. That
  is correct, and the screen says why.
- Plunger:
  - the 150 ft slug in 2.441 in tubing is 0.87 bbl a cycle;
  - 7,355 scf / 0.868 = 8,472 scf/bbl needed, against 20,000 made;
  - 1,440 min / about 69 min per cycle = 20.8 trips a day, which lifts
    18.0 bbl a day;
  - the rule of thumb is 400 x 8 = 3,200 scf/bbl, reported only.
- Forecast: with the deliverability coefficients held, the well loads at a
  reservoir pressure of 1,570 psia.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| GW-T1-001 | S3 | Deliverability rate ticks printed float noise ("1.6358951818802125", "1634.2592866983323"). | Axis from 0, rounded to 250 Mscf/d, with whole-number ticks. |
| GW-T1-002 | S3 | The bottomhole axis title was clipped ("Bottomhole pressure (ps"). The "Controls" and "Loads here" labels were clipped at the plot edges. Legends sat on axis titles. | "Bottomhole (psia)"; labels inside the plot ("Controlling depth"); legend band (production sweep). |
| GW-T1-003 | S3 | "Run forecast" wrapped inside its button. | One line. |

## Tests

- `e2e/gas-well-t1.spec.js` checks deliverability, the critical rate,
  clean ticks, the plunger GLR test and the loading pressure.
