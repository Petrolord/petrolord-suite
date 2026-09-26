# ReservoirCalc Pro: senior test T1

- App: ReservoirCalc Pro (`/dashboard/apps/geoscience/reservoircalc-pro`)
- Wave / position: Wave 1, #5 (Senior Testing Programme)
- Build tested: main after Risked Reserves T1 (#635)
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: Petrel volume calculation (contacts, volume against contact), SPE PRMS terminology, GeoX / REP for the risking handoff
- Coverage before T1: RC0 to RC3 readiness, volumetrics standards audit (2026-07-31), owner E2E of the unit and project fixes

## Verdict

**Not Demo-ready before T1; two S1 defects fixed.** The simple method and
the Monte Carlo core are sound. But the structural methods mishandled units
whenever the surface was in a different unit from the workspace, which is
the normal case for a Mapping or Seismolord surface (metres) in a field
workspace: the gross thickness was read in the surface's unit (GRV 3.28
times too large) and the fluid contacts were read in the surface's unit (an
OWC typed in feet sat 3.28 times deeper and cut nothing). A NAPE visitor
importing the demo dome and typing a contact would have seen a volume that
ignored the contact. Around those, the Monte Carlo never reached Prospect
Risking, volumes crossed to Risked Reserves Valuation without a unit, the
triangle inputs and result cards used the wrong names, and the split map
view distorted the structure.

## Scorecard (before, after)

| Dimension | Before | After | Why |
| --- | --- | --- | --- |
| Technical correctness | 2 | 5 | Two unit defects on mixed-unit structural runs; now tested with negative controls |
| Industry parity | 3 | 4 | Volume against contact curve added; PRMS low/best/high |
| Workflow and UX | 3 | 4 | MC to risking to valuation is one path; split view readable |
| Data interoperability | 3 | 4 | Registry surfaces in metres now give right volumes; stated units to RRV |
| Outputs and reporting | 4 | 4 | Reports relabelled |
| Robustness | 3 | 4 | Contact above the crest gives zero (was ignored) |
| Performance | 4 | 4 | Sweep reuses the hypsometry |
| Learnability | 3 | 4 | Guides corrected (triangle fields, P labels) |

## What was run

1. Existing suites: RCP jest (14 suites), `e2e/reservoircalc-pro.spec.js`, `e2e/prospect-risking.spec.js`.
2. UI walk at 1366 x 768 on `/dev/reservoircalc-pro`: simple case by hand (7758 x 5000 x 50 x 0.2 x 0.7 / 1.2 = 226.3 MMSTB, matches), registry dome import, hybrid with a contact, probabilistic wizard and run, Tools, Prospect Risking, full results.
3. Code review of `ContactVolumetricsEngine`, `MapGenerationEngine`, `FluidContactManager`, `WorkspaceToolsHub`, `HeatmapCanvas`; each finding confirmed in production code.

## Findings

### S1 blockers

**RCP-T1-001 Hybrid gross thickness read in the surface's unit.** `_buildCells`
added the thickness (workspace ft) to native depths (m) before converting:
50 ft became 50 m. Bulk 243,214 ac-ft over 1,483 acres (164 ft average on a
50 ft interval). Same defect in `MapGenerationEngine`, which also ignored the
surface unit and sign altogether.

**RCP-T1-011 Contacts read in the surface's unit.** `FluidContactManager`
stores contacts in workspace units; the engine converted them as if native.
On a metre surface in a field workspace an OWC of -5600 ft was used as
-5600 m. The RC2 e2e passed only because both entry units converted to the
same wrong number. Hypsometry (Monte Carlo) and the 3D contact planes
shared the error.

### S2 majors

**RCP-T1-002 Monte Carlo never reached Prospect Risking.** `pickUnrisked`
looked for `probResults.stooip`; the run is `{raw, stats: {stooip}}`. The
panel always asked the user to retype volumes.

**RCP-T1-003 Prospect volumes had no unit.** Raw STB, MMSTB or Bscf went into
`rcp_prospects` unlabelled; Risked Reserves Valuation reads MMbbl.

**RCP-T1-004 Triangle inputs labelled P90 (Min), P50 (Mode), P10 (Max).** A
triangle's minimum is not its P90; for Sw the low value is the high-volume
case.

**RCP-T1-005 In-place volumes labelled Proven, Probable, Possible.** Those are
PRMS reserves categories; in-place and prospective volumes take low, best and
high estimate.

**RCP-T1-006 Split view distorted the map.** The heatmap stretched to the pane
(a round dome drew as a tall ellipse), contour labels piled at the left edge,
the 2D toolbar ran into the 3D view and covered its legend, and colour-bar
ends printed -1500.61.

### S3 minors

**RCP-T1-007** Surface card Min Z and Max Z had no unit.
**RCP-T1-008** Em dash copy in the risking panel and drawing hint.
**RCP-T1-009** Prospect Risking is buried in Tools with no path onward to valuation.
**RCP-T1-010** Cell seams showed as hairlines in the map fill.

### Enhancements beyond parity

| ID | Idea | Outcome |
| --- | --- | --- |
| E1 | STOIIP (GIIP) against the contact, from the Monte Carlo hypsometry | Built, in the Detailed results |
| E2 | Shared map kit (Mapping `mapPainter`) in RCP | After NAPE |

## Outcomes (all batches built, 2026-09-26)

| Finding | Outcome |
| --- | --- |
| 001, 011 | Fixed in `ContactVolumetricsEngine` and `MapGenerationEngine`; 3D planes converted; jest with negative controls; e2e contact above the crest gives zero |
| 002, 003 | `services/prospectVolumes.js`: run stats scaled to MMSTB / Bscf / MMsm³ / Bsm³ with the unit saved; RRV converts to MMboe (6 Mscf per boe) and reads legacy raw STB |
| 004, 005 | Min / Most likely / Max; P90 low, P50 best, P10 high estimate across cards, slides, PDF and guides |
| 006, 010 | Equal-aspect map, diagonal label placement, wrapping toolbar, compact 3D legend, whole-unit colour bar, seamless fill |
| 007, 008, 009 | Units on the card; copy fixed; link to Risked Reserves Valuation after adding a prospect |
| E1 | `ContactVolumetricsEngine.contactSweep` + `ContactSweepChart` |
