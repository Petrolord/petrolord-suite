# Gas Processing Studio: senior test T1

- App: Gas Processing Studio (`/dashboard/apps/facilities/gas-treating-dehydration`)
- Wave / position: Wave 5, #60 (Senior Testing Programme; facilities and process safety)
- Build tested: main 1b9f43ce2 plus #684 to #688
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: GPSA ch. 20 (TEG dehydration, Kremser), ch. 21 (amine circulation), Joule-Thomson screening
- Coverage before T1: engine goldens (gas processing); no human walk

## How it was tested

I used `/dev/facilities/gas-processing` at 1366 x 768 with the defaults:

- TEG: 50 MMscfd, 1,000 psia, 100 F, water saturated, 7 lb/MMscf
  spec, 3 gal/lb, 99% lean, 2 stages, A = 2.5.
- MDEA: 100 MMscfd, 4% CO2 to 2%, 1% H2S to 4 ppmv, 45 wt%, loading
  0.05 to 0.5.
- JT: 1,000 to 600 psia at 100 F.

I walked dehydration, sweetening and dew point.

## Verdict

**Demo-ready, with no findings.** I checked these numbers by hand:

- Dehydration:
  - water removed 50 x (45 - 7) = 1,900 lb/day (1,902 shown), so
    circulation is 3 x 1,902 / 1,440 = 3.96 gpm;
  - reboiler: 240 gal/h x (1,432 sensible + 1,100 x 1/3 x 1.25 reflux =
    458) = 0.45 MMBtu/hr;
  - the spec needs (45 - 7) / 45 = 84.5% removal, and Kremser at A = 2.5,
    N = 2 gives (2.5^3 - 2.5) / (2.5^3 - 1) = 89.7%.
- Sweetening:
  - acid gas is 3% of 263,470 lbmol/day = 7,904;
  - at a pickup of 0.45 that is 17,565 lbmol of MDEA, 4.65e6 lb/day of
    45% solution at about 8.6 lb/gal, so 375 gpm (372 shown);
  - reboiler 800 x 372 x 60 = 17.9 MMBtu/hr.
- JT: 24 F over 400 psi is 6.0 F/100 psi, against 5.7 at the inlet from
  the DAK derivative, finishing at 76 F.

The tab clipping at 1366 was fixed by the shared StudioHeader change in
#684.

## Tests

- `e2e/gas-processing-t1.spec.js` checks the water removed, the Kremser
  removal, all three tabs clear of the toggle, the acid gas pickup and the
  JT outlet temperature.
