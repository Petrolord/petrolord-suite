# Corrosion & Integrity Studio: senior test T1

- App: Corrosion & Integrity Studio (`/dashboard/apps/facilities/corrosion-rate-predictor`)
- Wave / position: Wave 5, #57 (Senior Testing Programme; facilities and process safety)
- Build tested: main 1b9f43ce2 plus #684 and #685
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: de Waard-Milliams / NORSOK M-506 style CO2 corrosion screening, inhibitor availability model, corrosion allowance life
- Coverage before T1: engine goldens (corrosion.js); no human walk

## How it was tested

I used `/dev/facilities/corrosion` at 1366 x 768. The default case is
140 F and 725 psig with 3% CO2 and 0.1% H2S, in-situ pH 4.5, 10 ft/s in
6 in, water wet, a 90% inhibitor at 95% availability, a 0.125 in
allowance and a 20-year life. I walked corrosion rate, sour service and
integrity.

## Verdict

**Demo-ready after T1 (no S1 or S2).** I checked these numbers by hand:

- Partial pressures: 739.7 psia = 51.0 bar, so CO2 is 1.53 bar
  (fugacity 1.344 at coefficient 0.879) and H2S is 0.051 bar.
- Resistances in series: 1 / (1/44.23 + 1/11.70) = 9.25 mm/yr, which is
  mass-transfer controlled, as the screen says.
- Inhibition: 1 - 0.95 x 0.90 = 0.145 left, so 85.5% effective and
  5.204 x 0.145 = 0.755 mm/yr (1.45 times the datasheet metal loss).
- Life: a 20-year life needs 0.755 x 20 = 15.1 mm (0.5941 in) against
  0.125 in. The allowance lasts 4.2 years and falls short by 11.92 mm.
  The studio names availability as the thing to fix, which is correct.

The default case ends "SHORT". This is an analysis default that shows the
availability lesson, and the studio says what to change.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| COR-T1-001 | S3 | The H2S note (engine text) printed "5.100e-2 bar (7.397e-1 psia)" and "0.050763 psia". The sour tab printed "0.051000 bar" and "0.7397 psia". | Engine notes are read as plain decimals to three significant figures ("0.051 bar (0.74 psia) ... 0.0508 psia"). Stat formats tightened. |
| COR-T1-002 | S3 | The summary's "Binding constraint" sentence ran off the right edge of the rail. | Sentence values wrap right-aligned; short figures stay on one line. |
| COR-T1-003 | S3 | The rate-against-velocity chart used recharts' default 14px legend on top. | Chart-standard legend band. Swept across the Wave 5 facilities studios (corrosion, produced water, metering, relief, line sizing, pump station). |

## Tests

- `e2e/corrosion-integrity-t1.spec.js` checks:
  - the rate, the series combination and the readable H2S sentence (no
    exponent form);
  - the 0.5941 in needed;
  - no page overflow.
- Engine follow-up (after NAPE): print the H2S note's pressures as
  decimals in `corrosion.js`.
