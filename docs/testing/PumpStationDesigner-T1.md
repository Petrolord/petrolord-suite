# Pump Station Designer: senior test T1

- App: Pump Station Designer (`/dashboard/apps/facilities/pump-station-designer`)
- Wave / position: Wave 5, #64 (Senior Testing Programme; facilities and process safety)
- Build tested: main 3ad8894b4 plus #690 to #692
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: pump and system curve intersection, affinity laws, Hydraulic Institute viscosity correction, NPSH margin practice
- Coverage before T1: Suite pump gates (37) and engine goldens; no human walk

## How it was tested

I used `/dev/facilities/pump-station` at 1366 x 768. The defaults are
SG 0.85, 5 cSt and Pv 0.5 psia, with a system of 150 ft static plus
200 ft of friction at 1,500 gpm, against a four-point pump curve with
its BEP at 1,500 gpm and 78% efficiency. I walked the duty point, and
suction and changes.

## Verdict

**Demo-ready after T1 (no S1 or S2).** I checked these numbers by hand:

- Crossing: system head is 150 + 200 (1,509 / 1,500)^2 = 352.4 ft at
  1,509 gpm (curve fit R2 0.9998).
- Power:
  - hydraulic: 1,509 x 352 x 0.85 / 3,960 = 114.0 hp;
  - brake: 146.3 bhp at 78%;
  - motor: 146.3 x 0.7457 / 0.94 = 116.1 kW.
- NPSHa: (14.7 - 0.5) x 2.31 / 0.85 = 38.6 ft, plus 8 ft flooded suction
  (the input is labelled "positive if the source is above the pump"),
  less 3 ft friction = 43.6 ft. That is 29.6 ft over the 14 ft required,
  and the customary margin max(3, 0.35 x 14) = 4.9 ft is met.
- Viscosity: B = 0.72, which is at or below 1, so no HI correction
  applies.

The changes card starts level on purpose (a gated design rule: the duty
is shown before any change), so it reads zero until a trim or speed is
entered.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| PS-T1-001 | S3 | The flow axis ended on an odd tick (0, 700, 1,400, 2,640). | Axis rounded up to 500 gpm steps with grouped labels (0, 750, 1,500, 2,250, 3,000). |

## Tests

- `e2e/pump-station-t1.spec.js` checks the duty, the motor input, the
  rounded axis and NPSHa.
- Pump jest: 37 pass.
- Engine follow-up (after NAPE): rename `staticSuctionLiftFt` in
  `pumps.js` to a head-positive name. The screen already labels it
  correctly.
