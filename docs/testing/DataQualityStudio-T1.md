# Data Quality Studio: senior test T1

- App: Data Quality Studio (`/dashboard/apps/data-ai/data-quality-studio`)
- Wave / position: Wave 2, #33, the last app of the wave (Senior Testing Programme)
- Build tested: main plus Wave 2 PRs #655 to #660
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: Great Expectations / Monte Carlo data checks, Techlog log QC, NIST/SEMATECH e-Handbook
- Coverage before T1: D1 build (engine against NIST goldens and library pins, Ekene fixtures)

## How it was tested

A new harness, `/dev/data-quality-studio`, runs the app on the in-memory
Supabase double with a stand-in user. I uploaded a 120-day production
table (oil, water, hours on) with planted defects:

| Defect | Where |
| --- | --- |
| Threefold spikes | days 30, 61, 95 |
| Frozen oil run | days 70 to 76 |
| Negative rates | days 40, 41 |
| Blanks | days 50 to 52 |
| 30-hour days | days 20, 88 |

Apart from those two days, hours on is a clean 24 every day. I ran the
default profile at 1366 x 768 across the three tabs.

## Verdict

**Not Demo-ready before T1: two S2; now Demo-ready.**

The engine found every planted defect:

- missing run 50 to 52
- range and negative-rate flags on days 40 and 41
- above-maximum on days 20 and 88
- the oil frozen run 70 to 76
- z-score, modified z and Tukey on all three spikes

Two defects remained:

- **Frozen-run false alarm.** The search flagged the clean hours column as
  three "frozen runs" covering 118 of 120 days. That pulled Consistency to
  0.65 and the headline score to 0.90. A producing well on 24 hours a day
  is normal operation, not a stuck gauge.
- **Charts without axes.** None of the Charts tab plots drew an axis. They
  had no dates, no values and no titles.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| DQ-T1-001 | S2 | Frozen-run search flagged a clean 24-hour hours-on column (118 of 120 days), taking Consistency to 0.65 | The hours-on channel is left out by default, with a toggle to include it. The screen says why. The score on the test table goes from 0.9027 to 0.9828, and Consistency fails only the 7 planted samples. |
| DQ-T1-002 | S2 | Every chart on the Charts tab had no axes: the axes were wrapped in custom components, which Recharts never draws | Axis factories called in place. A Suite-wide guard test fails on any wrapped axis (negative control: fails on the old file). |
| DQ-T1-003 | S3 | Flag table dates wrapped ("2026-02-" / "20") | Channel, date and rule cells no longer wrap |
| DQ-T1-E1 | Enhancement | No harness | `/dev/data-quality-studio` |

## Tests

- `e2e/data-quality-t1.spec.js`: planted defects found, no frozen call on
  hours, axes drawn.
- `qcProfile.ekene.test.js` gains the hours-on case, with its negative
  control.
- `src/components/charts/__tests__/wrappedAxes.test.js`.
- Data & AI jest: 272 pass, plus the new cases.
