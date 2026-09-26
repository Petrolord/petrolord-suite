# Stratigraphy Studio: senior test T1

- App: Stratigraphy Studio (`/dashboard/apps/geoscience/stratigraphy-studio`)
- Wave / position: Wave 1, #3
- Build tested: main with the Mapping and Earth Modeling T1 branches
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: Petrel well tops and stratigraphic charts, StrataBugs
- Coverage before T1: None (ST0 to ST5 built and internally gated)

## Verdict

**Demo-ready after the fixes below.** The engines are sound: the ICS
2023/09 timescale matches the published chart on every stage checked
(Maastrichtian base 72.1, Langhian 15.98, Priabonian 37.71, Messinian
7.246, Gelasian 2.58), sequence-stratigraphic vocabulary follows Catuneanu
and Exxon with honest fallbacks, and the section, Wheeler and age-depth
views work. The gaps were presentation and one workflow: biozones had to be
dated by hand, which is the backbone of Niger Delta correlation.

## Scorecard

| Dimension | Score (0 to 5) | Why |
| --- | --- | --- |
| Technical correctness | 4 | Timescale verified; engines gated |
| Industry parity | 3 | No zone schemes, no graphic column (both fixed) |
| Workflow and UX | 3 | Per-well views opened empty; column editor clipped |
| Data interoperability | 4 | Typed tops shared with Petrophysics, Well Correlation, Basin |
| Outputs and reporting | 3 | Wheeler low contrast, no legend |
| Robustness | 4 | Clear refusals ("not placed: only one dated surface") |
| Performance | 4 | Instant on the harness |
| Learnability | 4 | Glossary and help guide |

## Findings

**ST-T1-001 (S2) Biozones are dated by hand.** A biozone interval carries a
scheme and code but its ages are typed per interval; there is no scheme to
date from. *Fix:* import the company's zone scheme (CSV with scheme, zone,
top and base ages and a source) and date matching intervals in one click;
each dated interval records its source. The Studio ships no zone ages of
its own: calibrations differ by timescale and operator, and no citable
table was reachable during the test.

**ST-T1-002 (S2) The column editor was clipped on a laptop.** The Save button
and rank selects ran off the pane at 1366 px (the scroll area grew to the
table's width).

**ST-T1-003 (S3) Ages, Intervals, Core and Tops opened on "Pick a well"** even
with wells listed. *Fix:* open on the first well.

**ST-T1-004 (S3) Wheeler chart.** Interval labels were dark on dark, there
was no legend, and a well's undated range looked the same as empty chart.

**ST-T1-005 (S3) No graphic column.** Petrel and StrataBugs users read a
column as a chart; the Studio had only the table.

**ST-T1-E1 (after NAPE)** Shared zone schemes (organisation-wide, needs a
table) and Wheeler columns spaced by distance along the section.

## Outcomes (2026-09-26)

| Finding | Outcome |
| --- | --- |
| 001 | Built: zone scheme import (CSV with source), date biozones from the scheme |
| 002 | Fixed: editor in a plain scrolling pane, header wraps |
| 003 | Fixed: per-well views open on the first well |
| 004 | Fixed: readable labels, legend, dashed "undated" band |
| 005 | Built: graphic column with ICS stage band and rank lanes |
| E1 | Recorded for after NAPE |
