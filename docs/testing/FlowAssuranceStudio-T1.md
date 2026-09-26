# Flow Assurance Studio: senior test T1

- App: Flow Assurance Studio (`/dashboard/apps/production/flow-assurance-studio`)
- Wave / position: Wave 4, #47 (Senior Testing Programme; production)
- Build tested: main ec45ddcff plus #672 to #674
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: OLGA steady state / PIPESIM thermal, Hammerschmidt and Nielsen-Bucklin, Motiee hydrate screening
- Coverage before T1: engine goldens (flowlineThermal, hydrateInhibition); no human walk

## How it was tested

I used `/dev/production/flow-assurance` at 1366 x 768. The default case:

- 1,200 stb/d of oil at 20% water, GOR 600, 900 psia wellhead;
- a 500 psi choke at 0.04 F/psi;
- 26,400 ft of 6 in flowline at 39 F with 1.5 in syntactic foam, then a
  riser.

I walked trace (phase plot and profile), hydrates, thermal (insulation
sweep) and the summary.

## Verdict

**Demo-ready after T1 (no S1 or S2).** I checked these numbers by hand:

- Choke: 0.04 x 500 = 20 F of cooling.
- U, referred to the 3 in bore radius (0.25 ft):
  - inside film: 1/200 = 0.005;
  - steel: 0.25 ln(3.5/3) / 26 = 0.0015;
  - foam: 0.25 ln(5/3.5) / 0.09 = 0.991;
  - outside film: 3 / (5 x 200) = 0.003.

  The sum is 1.0003, so U = 1.000 Btu/hr-ft2-F. NTU is
  26,400 / 8,290 = 3.18.
- Inhibitor: depression 10.7 F + 5 F margin = 15.7 F, giving 18.6 wt%
  (Nielsen-Bucklin). Hammerschmidt at 18.6 wt% gives
  2,335 x 18.6 / (32 x 81.4) = 16.7 F, as shown. Pure methanol is
  300 bbl/d water x 350 lb/bbl x 0.186 / 0.814 = 24,000 lb/d, and
  24,055 lb/d / 6.6 lb/gal / 42 = 86.8 bbl/d.
- Insulation sweep: the arrival leaves the hydrate region at about
  U = 0.50, half this line's U.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| FA-T1-001 | S3 | Phase plot temperature ticks printed float noise ("29.200000000000003", "129.20000000000002"), and the legend sat on the axis title. | Axis rounded outward to 10 F with integer ticks, plus the chart-standard legend band (also on the insulation chart). |
| FA-T1-002 | S3 | The summary's "Overall U 1.000" had no unit. | "Btu/hr-ft2-F, NTU 3.18". |
| FA-T1-003 | S3 | "No-touch time --" gave no reason. | "cooldown is off; turn it on in the Thermal tab". |
| FA-T1-004 | S3 | Long coating names wrapped over three lines inside their select. Reference labels ("This line", "No-touch") were clipped above the plot. | The shared SelectTrigger now clamps its label to one line, suite-wide. Labels sit inside the plot. |
| FA-T1-005 | S3 | The salinity note used "--" dashes. | Reworded. The help-guide dashes go in the Wave 4 copy sweep. |

## Tests

- `e2e/flow-assurance-t1.spec.js` checks the choke cooling, the U unit,
  the inhibitor rate, the no-touch hint, clean ticks, and the note copy.
- Known pre-existing failure: `gasLiftDesignContext.test.jsx` (2 cases)
  fails on main too when run alone, the timing flake recorded in memory.
  It is unrelated to this change.
