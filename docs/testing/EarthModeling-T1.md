# Earth Modeling: senior test T1

- App: Earth Modeling (`/dashboard/apps/geoscience/earth-modeling`)
- Wave / position: Wave 1, #2 (Senior Testing Programme)
- Build tested: main with the Mapping T1 map-kit changes (`fix/mapping-t1-parity` 7725b320e)
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: Petrel structural and property modelling, SKUA-GOCAD, RMS
- Coverage before T1: Readiness (EM0 to EM6), no human walk

## Verdict

**Not Demo-ready.** The framework, well adjustment, derived horizons,
section and 3D window work and are oracle-validated, and the unit
handling is correct. But the volume table's hydrocarbon pore volume
ignores fluid contacts: every zone is counted as hydrocarbon from top to
base, so any zone that crosses a water contact is overstated, and there is
no way to state a contact or reach in-place volumes. That is the number a
NAPE visitor will look at first. Around it, several quality items (silent
property fallbacks, unflagged mis-ties and clamps, odd contour intervals,
a clipped section) are below the standard set in Mapping.

## Scorecard

| Dimension | Score (0 to 5) | Why |
| --- | --- | --- |
| Technical correctness | 3 | Engines oracle-validated; HCPV without contacts is misleading |
| Industry parity | 2 | No contacts or in-place volumes, vertical fault polygons only, one layer per zone |
| Workflow and UX | 3 | Clear builder dock and QC tables; fallbacks and clamps are quiet |
| Data interoperability | 4 | Registry surfaces in, layers out, links to Mapping and ReservoirCalc Pro |
| Outputs and reporting | 3 | Volumes CSV, section and 3D PNG; map intervals not round |
| Robustness | 3 | Clamps and fallbacks recorded, not surfaced |
| Performance | 4 | 25 x 20 builds instantly; 3D smooth |
| Learnability | 3 | Help guide present; no sample mode |

## What was run

1. Existing suites: Earth Modeling jest and `e2e/earth-modeling.spec.js` (green in the Mapping T1 runs).
2. UI walk at 1366 x 768 on the `/dev/earth-modeling` harness: stack TopA, TopB, BaseB, build, map, section, QC and volumes, 3D.
3. Code review of `volumes.js`, `properties.js`, the workstation, the map adapter and the QC panel; each finding confirmed in code, not only on the harness (the Mapping T1 lesson).

## Findings

### S2 majors

**EM-T1-001 Hydrocarbon pore volume ignores fluid contacts.** `zoneVolumes`
sums pore x (1 - Sw) over the whole zone. There is no GOC or OWC input, so
a zone crossing a water contact reports its water leg as hydrocarbon, and
there is no STOIIP or GIIP. The help guide says contacts live in
ReservoirCalc Pro, but that app works on one surface and loses the
multi-zone model. *Fix:* contacts per zone (optionally per block), gas cap
and oil leg split, STOIIP and GIIP from Bo and Bg.

**EM-T1-002 Property population falls back silently.** A requested kriging
that cannot solve drops to a trend, then to a constant; the only trace is a
small provenance line under the volume table. *Fix:* name every fallback
in the build status and badge it in the QC table.

**EM-T1-003 Large well mis-ties are not flagged.** The harness build shows
tie residuals up to 148 ft with "adjust surfaces to the well tops" off by
default, and nothing warns. *Fix:* the build status counts ties beyond a
threshold and points to the adjustment.

**EM-T1-004 Clamped nodes are counted, not shown.** 180 nodes where BaseB
sits above TopB were clamped to zero thickness; the status gives the count
only. *Fix:* mark clamped nodes on the map.

### S3 minors

**EM-T1-005 Map contour interval and colour-bar ticks are not round in the
display unit** (CI 32.8 ft, labels 4986.9, 5019.7). The Mapping T1 display
plan fixes this. The map is also a fixed 480 px tall, leaving the lower
canvas empty on a laptop.

**EM-T1-006 Section: the last well's log column is clipped at the right
edge, tie labels overlap the surface labels, and depth ticks are not round.**

**EM-T1-007 Provenance text runs together and is cryptic**
("constant(4w)sw: block 0 constant(4w)").

**EM-T1-008 3D depth labels pile up in one corner.**

**EM-T1-009 Depth sign differs from Mapping.** Earth Modeling shows positive
TVDSS; Mapping shows negative elevation by default. The same surface reads
with opposite signs in consecutive apps. *Fix:* follow Mapping's depth
display preference.

**EM-T1-010 Faults are vertical polygons only.** Seismolord fault sticks and
throws cannot be used. Parity gap against a Petrel structural framework;
recorded as a known limit for after NAPE.

### Enhancements beyond parity

| ID | Idea | Value |
| --- | --- | --- |
| EM-T1-E1 | Volume range (P90/P50/P10) from the property kriging variance | Probabilistic volumes from the same model |
| EM-T1-E2 | Sw from a saturation-height function (SCAL Studio) above the OWC | Replaces interpolated zone averages; after NAPE |
| EM-T1-E3 | Sample mode, as in Mapping | Cold-start visitors see a model in one click |

## Proposed batches (all to be built, per the owner's Wave 1 directive)

| Batch | Findings |
| --- | --- |
| A | 001 (engines #263), 002, 003, 004 |
| B | 005, 006, 007, 008, 009 |
| C | E1, E3; 010 and E2 recorded for after NAPE |

## Outcomes (2026-09-26)

| Finding | Outcome |
| --- | --- |
| 001 | Fixed: contacts and FVF per zone, gas and oil HCPV, STOIIP and GIIP (engines #263) |
| 002, 003, 004 | Fixed: fallbacks and mis-ties in the build status, clamped nodes marked |
| 005 | Fixed: round interval and ticks, full-height map |
| 006, 007, 008 | Fixed: section layout and ticks, readable provenance, 3D ticks |
| 009 | Fixed: depth sign shared with Mapping |
| 010 | Recorded for after NAPE |
| E1 | Built: P90/P50/P10 HCPV and STOIIP from kriging variance |
| E2 | Recorded for after NAPE |
| E3 | Built: `?sample=1` |
