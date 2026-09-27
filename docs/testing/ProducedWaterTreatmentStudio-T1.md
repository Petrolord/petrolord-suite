# Produced Water Treatment Studio: senior test T1

- App: Produced Water Treatment Studio (`/dashboard/apps/facilities/produced-water-treatment`)
- Wave / position: Wave 5, #63 (Senior Testing Programme; facilities and process safety)
- Build tested: main 3ad8894b4 plus #690 and #691
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: Stokes-law gravity separation (API 421 style), hydrocyclone and walnut filter grade-efficiency screening, log-normal droplet distributions
- Coverage before T1: engine goldens (producedWater.js); no human walk

## How it was tested

I used `/dev/facilities/produced-water` at 1366 x 768. The default is
conventional produced water: 50,000 bwpd at 500 ppm OIW, 120 F,
35,000 ppm TDS, 32 API oil, an inlet d50 of 30 um and a 29 ppm spec,
through a CPI, a de-oiling hydrocyclone and a walnut shell filter. I
walked the treatment train and droplets.

## Verdict

**Demo-ready after T1 (no S1 or S2).** I checked these numbers by hand:

- Overall removal: 1 - 6.5 / 500 = 98.7%. The spec is met by 22.5 ppm.
- By stage:
  - CPI 500 to 455.2 ppm (9.0%, the cut at 102.7 um catches only the
    coarse tail);
  - hydrocyclone 455.2 to 11.2 ppm (97.5%);
  - walnut shell 11.2 to 6.5 ppm (41.9%).
- Fluids: 32 API oil is 865 kg/m3 at 60 F and 844 at 120 F. Brine is
  1,013 kg/m3, so the difference is 168.7 kg/m3, the gravity driving
  force.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| PWT-T1-001 | S3 | The dissolved-oil caveat (engine text) began lowercase and ended "pass dissolvedOilFloorPpm to apply your own", an argument the screen has no input for. | Rewritten for the user, with the same meaning and the action they can take (a dissolved-oil analysis). |
| PWT-T1-002 | S3 | On the droplet chart, the device cut-line labels overlapped and were clipped at the top ("De-oiling hydrocycl..." over "Walnut shell filter"). Ticks printed bin edges to two decimals ("3.05, 4.43, 6.43"). | Labels staggered inside the plot. Ticks at 2, 5, 10, 20, 50, 100, 200 um. Legend band (Wave 5 sweep). |

## Tests

- `e2e/produced-water-t1.spec.js` checks the removal figures, the
  rewritten caveat with no parameter name, and the clean droplet ticks.
- Engine follow-up (after NAPE): user-facing wording for
  `producedWater.js` DISSOLVED_OIL_NOTE.
