# Compressor Station Designer: senior test T1

- App: Compressor Station Designer (`/dashboard/apps/facilities/compressor-station-designer`)
- Wave / position: Wave 5, #55 (Senior Testing Programme; facilities and process safety)
- Build tested: main plus Wave 4 #681 to #683
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: GPSA Engineering Data Book ch. 13, Aspen HYSYS compressor train, reciprocating versus centrifugal selection charts
- Coverage before T1: engine goldens (facilities compression); no human walk

## How it was tested

Wave 5 adds a shared harness at `/dev/facilities/:app`, covering all 16
Facilities and Process Safety studios on the in-memory Supabase double.
All 16 load at 1366 x 768 with no console errors.

The default duty here is 20 MMscfd of 0.65 gas, compressed from 85 to
985 psig at 100 F, with k 1.28, a polytropic efficiency of 0.75, a 4.0
ratio limit, a 300 F discharge limit and 110 F intercooling. I walked
staging and power, machine and fuel, and the pressure sweep.

## Verdict

**Demo-ready after T1 (no S1 or S2).** I checked these numbers by hand:

- Ratio: 999.7 / 99.7 = 10.03, which is 2.16 per stage over three stages.
- Discharge temperature, with (k - 1)/(k eta_p) = 0.28 / 0.96 = 0.2917:
  - 560 R x 2.157^0.2917 = 701 R = 241 F from 100 F;
  - 253 F from 110 F.

  Two stages would reach 324 F, over the 300 F limit, so the temperature
  sets three stages, as the screen says.
- Power: 3,238 gas hp / 0.97 = 3,339 bhp.
- Interstage cooling, stage 1: 41,350 lb/h x 0.55 x (241 - 110) F =
  2.98 MMBtu/hr (2.97 shown).
- Inlet: 20 MMscfd at 100 psia, 100 F, Z 0.986 = 2,168 acfm (2,175 shown).
- Fuel: 0.675 / 20 = 3.37%. At a thermal efficiency of 31.8% that
  implies 950 Btu/scf.
- Sweep at 600 psig: ratio 6.17, two stages of 2.48, finishing at 283 F
  from 110 F.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| CS-T1-001 | S3 | At 1366 the third tab ("Pressure Sweep") was clipped to "Pre..." behind the Full precision toggle. | The shared StudioHeader tightens its gaps below 2xl and lets the title absorb the squeeze before the tabs do. The toggle label is one line at 11px. All three tabs show. |
| CS-T1-002 | S3 | On the sweep chart the stage bars ran over the power axis ticks (number axis), and an oversized legend sat on top. | Category axis, lighter narrower bars, the stage axis headroom, and the chart-standard legend band. |
| CS-T1-003 | S3 | The copy used "X, not Y" ("the one just below a step, not the one just above it"). | "The cheap discharge pressure sits just below a step." |

## Tests

- `e2e/compressor-station-t1.spec.js` checks:
  - brake power, the overall ratio and stage 1 cooling;
  - that the sweep tab sits clear of the toggle;
  - the 600 psig row, and the reworded copy.
