# Petroleum Economics Studio (EPE): senior test T1

- App: Petroleum Economics Studio (`/dashboard/apps/economics/epe/cases`)
- Wave / position: Wave 1, #10 (Senior Testing Programme)
- Build tested: main after EC7 (#632, PIA 2021 / NTA 2025 compliance)
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: PetroVR, Palantir Cash, Wood Mackenzie GEM report exhibits
- Coverage before T1: audit waves A to F, EC7 (101-check validation), Ekene demo episode 26

## How it was tested

EPE computes in Edge Functions against `epe_*` tables, so there was no way
to walk it without auth and a database. T1 added a dev harness
(`/dev/epe/runs/r1`) that serves the Ekene demo run, computed in Node by the
same engines cash flow from the demo kit's case sheet (NPV10 USD
1,980,235.48, the golden the demo tests pin), through an in-memory table
set while mounted. The Results Viewer, every analysis view and the exports
were then walked at 1366 x 900.

## Verdict

**Demo-ready after T1.** The numbers are right (engine and golden agree).
The presentation undersold or misstated them: the headline NPV read "$2M"
for USD 1.98 MM, charts were titled "PIA 2021" on a run computed under the
NTA from 2026, the cumulative line on a second axis looked negative, sunk
history was unmarked, the waterfall opened on a sunk year, and the PDF
report embedded only the charts of the open tab.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| EPE-T1-001 | S2 | Chart titles and PDF heading "(PIA 2021)" on a PIA-then-NTA run | `frameworkLabel` in every title; the waterfall names its own year's framework |
| EPE-T1-002 | S2 | Headline KPIs rounded to whole millions ("$2M" for 1.98) | Three significant figures |
| EPE-T1-003 | S2 | Cumulative CF on a second axis whose zero sat at the bottom while the flows' zero sat mid-height | Cumulative on the flows' axis |
| EPE-T1-004 | S3 | Sunk history years (2020 to 2025) not marked on the profile | Shaded "History: sunk, not valued" |
| EPE-T1-005 | S3 | Waterfall opened on 2020, a sunk year | Opens on the first valued year |
| EPE-T1-006 | S2 | PDF report embedded only the open tab's charts | Export opens each chart tab, captures after drawing, restores the tab |
| EPE-T1-007 | S3 | EPE-STATUS said "PR open, migration held" after merge and apply | Corrected; Fiscal default-regime item closed |
| EPE-T1-E1 | Enhancement | Harness with a real engine run | Built |
| EPE-T1-E2 | Enhancement | Associated gas split, fiscal-price top-up, PSC terms in the cash flow engine (EC7 open list) | After NAPE |

Note for testers: recharts draws with a 1.5 s animation; an early screenshot
shows an empty chart. The Annual Cash Flow view looked blank for that reason
and is not a defect.

## Tests

`e2e/epe-t1.spec.js` (3, including the PDF page count from a non-chart tab);
EPE jest 41 and the economics smoke tests.
