# Heat Exchanger & Cooling Studio: senior test T1

- App: Heat Exchanger & Cooling Studio (`/dashboard/apps/facilities/heat-exchanger-sizer`)
- Wave / position: Wave 5, #61 (Senior Testing Programme; facilities and process safety)
- Build tested: main 1b9f43ce2 plus #684 to #689
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: Kern / TEMA shell-and-tube sizing, effectiveness-NTU rating, API 661 air-cooler screening
- Coverage before T1: engine goldens (heatTransfer.js), context and smoke tests; no human walk

## How it was tested

I used `/dev/facilities/heat-exchanger` at 1366 x 768. The defaults are
a 50,000 lb/hr hot stream at Cp 0.55 from 300 to 200 F, against 80,000
lb/hr of water from 100 F in pure counter-current. The rating tab uses
1,200 ft2 at U 120. The air cooler takes 20 MMBtu/hr from 250 to 150 F
at a 95 F ambient, a 30 F rise and U 4.5. I walked sizing, rating and
air cooler.

## Verdict

**Demo-ready after T1 (no S1 or S2).** I checked these numbers by hand:

- Sizing:
  - duty: 50,000 x 0.55 x 100 = 2.75 MMBtu/hr, so the cold outlet is
    134.4 F;
  - LMTD: (165.6 - 100) / ln(1.656) = 130.1 F;
  - U: 1 / 0.01086 = 92.1, so the area is 2.75e6 / (92.1 x 130.1) =
    230 ft2.
- Rating:
  - UA 144,000 over Cmin 27,500 gives NTU 5.24, with Cr 0.344;
  - counter-current effectiveness is 0.9678 / 0.9889 = 0.979, so the
    duty is 5.38 MMBtu/hr.
- Air cooler:
  - LMTD: (125 - 55) / ln(2.27) = 85.3 F;
  - area: 20e6 / (4.5 x 85.3) = 52,100 ft2;
  - air: 20e6 / (0.24 x 30) = 2.78e6 lb/hr.

  The hot day (110 F) keeps NTU and Cr, so 90% capacity and a 159.7 F
  outlet follow.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| HX-T1-001 | S3 | The controlling resistance showed the engine key ("outsideFilm", "ahead of insideFouling"). Resistances printed in exponent form ("1.000e-3"). | Row names ("Outside film", "ahead of inside fouling"). Resistances print as decimals, the way fouling allowances are quoted ("0.00100"). |
| HX-T1-002 | S3 | The air-cooler note was developer text: "`airCooler` therefore sizes ... says so in its return (`fCorrection: null`)", "not established in this repository". | Rewritten for the engineer: cross-flow sized on a counter-current basis with F = 1, the area is a counter-current basis, and the hot-day rating is unaffected. Info notes capitalise their first letter. |

## Tests

- `e2e/heat-exchanger-t1.spec.js` checks:
  - the LMTD, the named resistances and decimal values;
  - the rating NTU and the air-cooler area;
  - that no developer text is shown.
- Heat exchanger jest: 26 pass.
- Engine follow-up (after NAPE): user-facing wording for
  `heatTransfer.js` HELD notes.
