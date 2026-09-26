# Pore Pressure Studio: senior test T1

- App: Pore Pressure Studio (`/dashboard/apps/geoscience/pore-pressure-studio`)
- Wave / position: Wave 1, #8 (Senior Testing Programme)
- Build tested: main after Risked Reserves T1 (#635)
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: Petrel and Drillworks / Predict pore pressure; drilling well planning (mud weight window)
- Coverage before T1: P0 to P4 oracle-locked engines (hydrostatic, OBG, NCT fit, Eaton, Bowers, FG), PP0 and PP1

## Verdict

**Not Demo-ready before T1; now Demo-ready.** The engines reproduce the
goldens. But the prognosis, the one chart the app exists for, drew depth
increasing upward: a pore pressure plot upside down is the first thing a
drilling engineer at NAPE would notice. Calibration points typed in the
dock were never drawn (a Scatter does not plot in a vertical-layout chart),
and the dock's placeholder looked like two entered points. The drilling
window, the reason a pore pressure prognosis is made, was not shown.

## Scorecard (before, after)

| Dimension | Before | After | Why |
| --- | --- | --- | --- |
| Technical correctness | 5 | 5 | Oracle-locked; untouched |
| Industry parity | 3 | 4 | Drilling window shaded and quantified; resistivity Eaton still open |
| Workflow and UX | 2 | 4 | Chart reads the right way; calibration visible; ribbon fits a laptop |
| Data interoperability | 4 | 4 | Registry logs and seismic velocity in, PP/FP/OBG published |
| Outputs and reporting | 3 | 4 | Prognosis chart usable in a well plan |
| Robustness | 4 | 4 | Unchanged |
| Performance | 5 | 5 | Instant |
| Learnability | 3 | 4 | Placeholder reads as an example; guide covers the window |

## Findings

### S2 majors

**PP-T1-001 Prognosis drew depth increasing upward** (vertical layout plus `reversed`).
**PP-T1-002 Calibration points were never drawn** (Scatter in a vertical-layout ComposedChart).

### S3 minors

**PP-T1-003** Ribbon overflowed at 1366 px; Save was cut off; the subtitle wrapped the title over four lines.
**PP-T1-004** The calibration placeholder ("3000, 34.5 / 3600, 45.2") read like data; the legend listed Calibration with no points.

### Enhancements beyond parity

| ID | Idea | Outcome |
| --- | --- | --- |
| E1 | Drilling window (PP to FG) shaded, narrowest window in ppg EMW with depth, flagged under 0.5 ppg | Built |
| E2 | Trip and kick margins, casing seat suggestion | After NAPE |
| E3 | Resistivity Eaton | After NAPE (open since P4) |

## Outcomes (all batches built, 2026-09-26)

| Finding | Outcome |
| --- | --- |
| 001, 002 | Axis fixed; calibration as a dot-only Line; e2e types two points and counts two dots |
| 003, 004 | Ribbon wraps, subtitle only on wide screens; placeholder reads "one point per line, e.g."; legend entry only with points |
| E1 | `services/drillingWindow.js` (below the top 300 m, the conductor section) and the Area band |
