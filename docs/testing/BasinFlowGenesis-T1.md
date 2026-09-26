# Basin & Charge Modeling (BasinFlow Genesis): senior test T1

- App: Basin & Charge Modeling (`/dashboard/apps/geoscience/basinflow-genesis`)
- Wave / position: Wave 1, #6 (Senior Testing Programme)
- Build tested: main after Risked Reserves T1 (#635)
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: PetroMod 1D and Petrel petroleum systems; Magoon and Dow events chart; Tissot and Welte maturity windows
- Coverage before T1: G7 oracle-locked engines (Sweeney-Burnham Easy%Ro, Athy decompaction, implicit heat), BF0 to BF3 readiness

## Verdict

**Demo-ready after T1.** The physics is sound and oracle-locked; the
present-day table reproduces the goldens. The defects were in how the
results are read. The time plots ran with the present on the left and spaced
time unevenly, the reverse of every basin-modelling package a NAPE visitor
knows. The maturity windows were non-standard and unlabelled. The events
chart showed one unlabelled bar where a geologist expects the petroleum
system elements and the critical moment.

## Scorecard (before, after)

| Dimension | Before | After | Why |
| --- | --- | --- | --- |
| Technical correctness | 5 | 5 | Engines oracle-locked; untouched |
| Industry parity | 2 | 4 | Events chart, isolines and isotherms, TR plot; 1D only (no migration or traps) |
| Workflow and UX | 3 | 4 | Plots read the industry way; summary names the critical moment |
| Data interoperability | 4 | 4 | Registry wells in, launchers out |
| Outputs and reporting | 3 | 4 | Labelled windows and events chart print cleanly |
| Robustness | 4 | 4 | Maturity axis no longer clips above 3 %Ro |
| Performance | 5 | 5 | Reference basin runs in about a second |
| Learnability | 3 | 4 | Guide rows describe what the plots now show |

## What was run

1. Existing suites: Basin jest (engines, analysis, calibration import, help guide, history) and `e2e/basinflow.spec.js` (BF0 to BF3, goldens).
2. UI walk at 1366 x 768 on `/dev/basinflow-genesis`: Expert mode, reference basin, simulate, every results tab.
3. Code review of the plots, `resultsView.js`, the summary and the engine's results contract.

## Findings

### S2 majors

**BF-T1-001 Time axis reversed and uneven.** Burial, Thermal, Maturity and
Expulsion plotted age on a category axis with `reversed` over data already
oldest first: present on the left, ticks 0, 2, 4, 6, 8, 11, 15 spaced
evenly. The Timing plot used a numeric oldest-left axis, so the tabs
disagreed.

**BF-T1-002 Maturity windows non-standard and unlabelled.** Bands at 0.5 to
1.0, 1.0 to 1.3 and 1.3 to 2.6 %Ro with no labels or key; the axis was fixed
at 0 to 3 %Ro and would clip an overmature section.

**BF-T1-003 Events chart incomplete.** One unlabelled bar (generation) and
dot (peak rate) per source layer; no source, reservoir, seal or overburden
rows, no expulsion, no critical moment, and its own time domain.

### S3 minors

**BF-T1-004** Summary copy "1 layer(s) reached generation window".
**BF-T1-005** Harness well card read "TD: 0m" and in metres whatever the display unit.

### Enhancements beyond parity

| ID | Idea | Outcome |
| --- | --- | --- |
| E1 | %Ro isolines and isotherms on the burial history | Built (overlay select) |
| E2 | Transformation ratio against time | Built, in the Expulsion tab |
| E3 | Phantom eroded section drawn on the burial history | After NAPE |

## Outcomes (all batches built, 2026-09-26)

| Finding | Outcome |
| --- | --- |
| 001 | `ageAxisProps`: numeric axis, oldest left, round ticks, shared domain on every time plot |
| 002 | `MATURITY_WINDOWS` 0.55 / 1.3 / 2.0 %Ro, labelled bands and key, axis grows with the data |
| 003 | `eventsChartRows` + HTML events chart: element rows from layer roles, generation and expulsion windows, critical moment; trap formation stated as not modelled |
| 004, 005 | Copy fixed and critical moment in the summary guidance; TD from the stratigraphy in the display unit |
| E1, E2 | `isoline` (extended to surface and base) on a ComposedChart; `TransformationRatioPlot` |

Engine meta carries no deposition ages or source flag; `withLayerRoles`
takes them from the model's stratigraphy (fallback: the series), so no
engines change was needed.
