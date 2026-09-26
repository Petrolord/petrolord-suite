# Well Integrity & P&A Studio: senior test T1

- App: Well Integrity & P&A Studio (`/dashboard/apps/drilling/well-integrity-pa`)
- Wave / position: Wave 3, #43, the last app in the wave (Senior Testing Programme; drilling)
- Build tested: main plus Wave 3 PRs #669 and #670
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: WellMaster / iQx integrity registers, NORSOK D-010 rev 4, API RP 90, Oil & Gas UK abandonment guidelines
- Coverage before T1: D10 build (barrier roll-up, MAASP/MAWOP, balanced plug and program against oracle goldens)

## How it was tested

The `/dev/well-integrity` harness loads the golden integrity case on
Harness-10I:

- a ten-element two-envelope register, with the DHSV degraded;
- annulus A with three limiting elements;
- four plugs (two reservoir plugs, one intermediate, one surface);
- two flow zones.

I walked the barriers, annulus pressure, P&A plugs and program tabs at
1366 x 768.

## Verdict

**Demo-ready after T1 (no S1).** I checked these numbers by hand:

- Traffic light YELLOW: a degraded element with no failure, and both
  envelopes independent.
- MAWOP, annulus A:
  - tubing collapse: 0.75 x 25 - 700 x 9.81 x 996 m TVD = 11.91 MPa, which
    governs;
  - 9-5/8 in burst: 0.5 x 40 - 170 x 9.81 x TVD = 17.5 MPa;
  - 7 in burst: 0.8 x 35 - 100 x 9.81 x TVD = 26.8 MPa.
- Balanced plug P1:
  - hole area 0.036644 m2;
  - slurry 140 m x 1.2 = 6.16 m3;
  - annulus plus pipe capacity 0.023977 + 0.009263 m2 gives a balanced
    height of 185.2 m, with the top at 2,335 m;
  - the spacer behind is 1 m3 x 0.009263 / 0.023977 = 0.39 m3;
  - displacement is 0.009263 x (2,334.8 - 41.7) = 21.24 m3;
  - the top after POOH is 2,520 - 168 = 2,352 m.
- Program: the intermediate gas stringer has a primary plug (P3) but no
  secondary, so the golden program shows GAPS. That result is correct.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| WI-T1-001 | S2 | Plug rule checks judged the selected plug against every flow zone. The reservoir plug at 2,380 to 2,520 m showed a red FAIL ("extends -580 m above the source") against the gas stringer at 1,800 m, which it sits below and could never isolate. A plug wholly above a source was failed on "base at or below the source top", although it can be the secondary barrier. | A zone the plug sits below reads "Not applicable". A plug above the source is checked for length only and says it can serve as the secondary barrier (see Program). |
| WI-T1-002 | S2 | On the barrier register and annulus element rows, the name fields were squeezed to a few letters ("Casing c", "Producti"). On the annulus tab they were blank squares. | Each name sits on its own full-width line above its controls. |
| WI-T1-003 | S3 | Program compliance said FAIL with "Secondary: none" and gave no next step. | The failing zone now states the fix: "Add a second plug above P3 intermediate, at least 50 m on a verified foundation (100 m otherwise)". |
| WI-T1-004 | S3 | The MAWOP marker on the annulus chart was hidden behind the bars, and the amber governing bar was unexplained. | The label "MAWOP 11.91 MPa (governing bar in amber)" is drawn above the plot. The axis label spacing follows the standard. |
| WI-T1-005 | S3 | The program checklist step printed the slurry to 1 decimal ("6.2 m3") beside the 6.16 m3 total. | Recorded for the engines repo (the text comes from `plugAbandonment.js abandonmentProgram`). There is no Suite change. |

## Drilling-wide copy sweep (Wave 3)

Prose em dashes were removed from user-facing strings in the Wave 3 drilling
apps: status bars, run history rows, chart titles, load case blurbs, the
C&T PPFG toast, the catalog errors in C&T and Completion, and the C&T
governing line. Dashes used alone as empty-cell placeholders remain. The
ISO 10400 reference keeps its official title. All 14 drilling e2e specs
(32 tests) pass after the sweep.

## Tests

- `e2e/well-integrity-t1.spec.js` checks:
  - name field width;
  - the MAWOP label;
  - 6.16 m3;
  - no FAIL on the plug tab, and "Not applicable" for the stringer;
  - the program fix text.
- The existing `well-integrity-pa.spec.js` passes (5/5).
- Well Integrity jest: 10/10 pass.
