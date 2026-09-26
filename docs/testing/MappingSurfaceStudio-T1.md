# Mapping & Surface Studio: senior test T1

- App: Mapping & Surface Studio (`/dashboard/apps/geoscience/mapping-surface-studio`)
- Wave / position: Wave 1, #1 (Senior Testing Programme, 2026-09-26)
- Build tested: main `32441f242` (Mapping code identical on `8a6c9d838`)
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: Petrel mapping, Surfer, Kingdom
- Coverage before T1: Readiness (MS0 to MS5), no human walk

## Verdict

**Not Demo-ready.** The gridding engine is exact: it reproduces an analytic
cone to 0.04 % in GRV with dense control, and the TVDSS placement, unit
handling and file formats are solid. But the Quick GRV readout gives
confident numbers that are wrong by 40 to 100 % or more in ordinary
situations, with no warning. A geoscientist at NAPE who types a contact
below the mapped area gets 2.5 billion m³ with no caveat. Fixing the two
S1 and seven S2 findings makes it Demo-ready.

## Scorecard

| Dimension | Score (0 to 5) | Why |
| --- | --- | --- |
| Technical correctness | 3 | Engine exact; GRV, sidetrack and MD-sign defects around it |
| Industry parity | 2 | No minimum curvature, no extrapolation control, no well-based depth conversion |
| Workflow and UX | 3 | Clear dock and status line; one-click delete; negative-only depth display |
| Data interoperability | 4 | XYZ, CPS-3, ZMAP+, Irap in and out; deep links; registry convention |
| Outputs and reporting | 2 | Dark PNG only; no print layout; logo overlaps a label |
| Robustness | 2 | Bad cell sizes refused well; GRV and duplicates fail silently |
| Performance | 3 | 2,000 picks on a 401 x 401 grid in about 1 s, on the main thread |
| Learnability | 3 | Good help guide and status text; no sample project for a cold start |

## What was run

1. Unit suites: 17 suites, 101 tests, all pass (Mapping, `src/lib/gridding`, `src/components/maps`, surface convention).
2. e2e: `e2e/mapping-surface-studio.spec.js`, 8 of 8 pass (after the staging fix in P01).
3. Engine probes calling the real engine with the workstation's own options (`maxExtrapolation: 1e9`, 2-cell pad), script in `docs/testing/probes/mapping-t1-probes.mjs`:
   - Analytic cone z = -1800 - 0.1 r (m), contact -1900 m, true GRV = π·1000²·100/3 = 104.7 million m³.
   - Dense control (3,721 points, 50 m): GRV 104.68 million m³, error -0.04 %.
   - Seven appraisal wells inside the closure: GRV 62.9 million m³ (60 % of true), mapped area 1.07 km² against a 3.14 km² closure. No warning.
   - Five wells: 51 % of true.
   - Two identical domes 3 km apart: GRV 2.00 x one closure.
   - Pilot and sidetrack 5 m apart, tops 3 m different: false crest 13 m above the true crest.
   - Two wells at the same x, y: "Gridding system is singular", no well named, no map.
   - Kriging with 7 wells: fits (3 lag bins) and grids.
4. UI walk at 1366 x 768 on the `/dev` harness: empty state, grid, display settings, PNG export, Quick GRV at -4900, -5100, -9999 ft, cell sizes 0, -50, abc, 5.
5. Code review of the workstation, surface engine, GRV service and gridding engine.

## Findings

### S1 blockers

**MAP-T1-001 Quick GRV reports volumes for closures that are not closed on the map.**
The GRV sums every node above the contact inside whatever area was mapped.
When the contact contour runs off the mapped area, the closure is open and
the number is a meaningless minimum, but it is reported plainly. On the
harness: contact -5100 ft (below every node) returns 92.55 million m³;
-9999 ft returns 2,545 million m³, both with the same 1.64 km² area and no
warning. With seven appraisal wells on a known cone the readout is 60 % of
the true volume.
*Fix:* detect when the contact area touches the map edge or the null mask and
say "closure open at the map edge: this is a minimum" (or refuse); report
the spill point and closing contour.

**MAP-T1-002 Quick GRV counts separate structures together.**
Two identical domes on one map give 2.00 x the volume of one. A trap
volume must belong to one closure.
*Fix:* closure-aware GRV: flood-fill from the crest (or a clicked point) at
the contact and report each closure separately.

### S2 majors

**MAP-T1-003 Sidetracks break or distort the map.**
Two wells at the same location (pilot hole and sidetrack sharing a slot,
top above the kick-off point) make the whole grid fail with "Gridding
system is singular", without naming the wells. Wells a few metres apart
with slightly different tops create a bullseye: a 3 m difference produced
a false crest 13 m above the truth. Sidetracks are routine in Niger Delta
fields.
*Fix:* merge control points closer than half a cell (mean value), list the
merged wells in the status, and name the wells in any solver error.

**MAP-T1-004 A contact typed as positive depth returns zero silently.**
The contact must be typed as negative elevation. A user typing 4900 for
4,900 ft TVDSS gets "GRV 0 acre-ft ... 0 nodes".
*Fix:* when the typed sign is outside the map's range and its negative is
inside, ask or accept depth-positive input explicitly.

**MAP-T1-005 One click deletes a surface permanently.**
The row trash icon deletes at once, with no confirmation and no undo, even
when Earth Modeling stacks or ReservoirCalc imports point at that surface.
*Fix:* confirmation dialog naming known consumers; keep a restorable trash
for a period.

**MAP-T1-006 MD maps are published as elevation with the wrong sign.**
With depth reference MD the engine returns positive MD values, but the
workstation publishes every structure with `z_convention: 'elevation'`
(negative down). ReservoirCalc Pro and Earth Modeling will read the MD map
upside down.
*Fix:* publish MD maps with their own convention (or negate and label), and
have readers refuse an MD structure as a depth surface.

**MAP-T1-007 The map stops at the outermost wells.**
Gridding is masked to the convex hull of the control points with a 2-cell
pad. In exploration and appraisal, the flanks and spill point lie beyond
the wells, so the map cannot show the closure it is meant to show. The
MS0 note promised a distance control; it was not built.
*Fix:* grid extent control (to a boundary polygon, a rectangle, or a
distance beyond the wells), with extrapolated areas visibly marked.

**MAP-T1-008 No tension or smoothing in the gridding (corrected).**
*Correction during the fix:* the thin-plate spline the Studio grids with is
itself the continuous minimum-curvature surface (Sandwell 1987 shows
Briggs' minimum-curvature grid discretises the biharmonic spline), so the
original wording "no minimum-curvature gridding" was wrong. What Petrel,
Surfer and Kingdom users actually reach for, and what was missing, is
TENSION (to stop overshoot between close wells, MAP-T1-003, and runaway
extrapolation) and SMOOTHING (to stop forcing the surface through noisy
values).
*Fix:* a Green's-function spline in tension with smoothing (Wessel &
Bercovici 1998).

**MAP-T1-009 Depth conversion lacks the well-based method.**
Time-to-depth accepts only a linear V0 + kZ model from a Seismolord
volume. The routine Niger Delta workflow is average velocity from TWT at
the wells and the well tops, gridded, then a residual correction to the
tops. Earth Modeling already has a residual engine.
*Fix:* "Tie to wells": velocity from wells, residual map and residual table,
reusing the Earth Modeling engine.

### S3 minors

**MAP-T1-010 The PNG export is not report-ready.** Dark map body, which
prints poorly and breaks the white chart standard; the Petrolord logo
overlaps the "CI 50 ft" label; no print layout (title block, coordinate
grid, well legend, scale ratio).

**MAP-T1-011 The map looks coarse.** Staircase, blurred edges at the null
mask; colour-bar ticks at odd values (-4790.0, -4855.6, -4921.3); a single
contour label on the demo map.

**MAP-T1-012 Posted values sit at the wellhead for deviated wells.** KETA-5's
value is drawn at the wellhead while its control point is at the borehole
intersection, so the reader attributes the value to the wrong place.

**MAP-T1-013 Depth is shown only as negative elevation.** Many Nigerian
geoscientists read structure maps as positive ft TVDSS. A display toggle
(storage unchanged) would remove a common misreading.

**MAP-T1-014 WITHDRAWN (false positive).** Culture import (GeoJSON and
shapefile) is present in the production app. The UI walk ran on the `/dev`
harness, whose in-memory backend switches the import off. Lesson recorded
for the protocol: confirm every "missing feature" finding against the
production backend, not only the harness.

**MAP-T1-015 Well symbology is partial (narrowed).** The painter already
draws planned wells as rings and dry or plugged wells as crosses, but
`geo_wells` has no status column to drive it, so every well shows as a
plain dot, and there is no oil, gas or injector symbol and no symbol
legend. (The harness wells carry no status, which is why the walk saw one
symbol.)

**MAP-T1-016 No contours-over-attribute display.** Structure contours of one
surface over the colours of another (amplitude, net sand) is the standard
prospect map.

**MAP-T1-017 No undo for grid, re-grid or arithmetic.** Re-grid in place
overwrites the values; only the old frame is kept in history.

**MAP-T1-018 Gridding runs on the main thread.** About 1 s for 2,000 picks
at 401 x 401 in Node; longer in a browser, freezing the page.

### Platform finding

**MAP-T1-P01 Staging served a crash page on this app.** "Cannot read
properties of null (reading 'useId')": the known stale Vite dependency
cache (served `?v=` hashes differed from `_metadata.json`). Fixed during
T1 with the documented cache clear and container restart; all 8 e2e tests
then passed. Recommend clearing the cache automatically at container start.

### Enhancements beyond parity

| ID | Idea | Value |
| --- | --- | --- |
| MAP-T1-E1 | Area-depth and GRV-versus-contact curves with the spill point marked | Instant closure QC; builds on the MAP-T1-001/002 fix |
| MAP-T1-E2 | Structural uncertainty: P10/P50/P90 surfaces from kriging variance or velocity uncertainty, GRV distribution sent to ReservoirCalc Pro | Links Wave 1 apps into one probabilistic chain |
| MAP-T1-E3 | Prospect card: one click from a closure to a one-page summary (crest, spill, area, GRV range) for Risked Reserves Valuation | The NAPE demo moment |
| MAP-T1-E4 | "Open the Ekene sample" button in the empty state | Cold-start visitors see a real map in one click |
| MAP-T1-E5 | Map-versus-well residual table after kriging, guide points or contour edits | QC every serious mapper expects |

## What is good

- The engine is exact where it should be (0.04 % GRV on dense analytic control; TPS reproduces planes).
- Tops are placed at the borehole in TVDSS through the survey and KB, with skip reasons named.
- One registry convention (elevation, `z_unit`) with conversion at every door.
- Four industry grid formats in and out, round-trip tested; CRS declared and reprojected.
- Deep links in from Well Correlation, Petrophysics and Well Data Manager; launchers out.
- Invalid cell sizes are refused with a clear message; the status line always says what happened.

## Proposed action batches

| Batch | Findings | Rationale |
| --- | --- | --- |
| A, before NAPE | 001, 002, 003, 004, 005, 006, E1, 010, 011, 012, 013 | Removes every wrong-number risk and makes the map presentable |
| B, before NAPE if time allows | 007, 008, 009 | Benchmark parity a Petrel user will look for (014 withdrawn) |
| C, after NAPE | 015, 016, 017, 018, E2, E3, E4, E5 | Depth and polish |

## Outcomes (2026-09-26)

All batches (A, B, C) built and merged; owner chose all three.

| Finding | Outcome |
| --- | --- |
| 001, 002, E1 | Fixed: one-closure GRV, open flag, spill, merges, others listed, curve |
| 003 | Fixed: merge within half a cell, wells named |
| 004 | Fixed: positive contact read as depth |
| 005 | Fixed: confirm, 10 s undo |
| 006 | Fixed: MD maps as attributes |
| 007 | Fixed: map beyond the wells, hull drawn (kriging refuses, stated) |
| 008 | Fixed as reframed: spline in tension with smoothing |
| 009 | Fixed: average velocity from wells; linear model corrected to a top |
| 010, 011, 012, 013 | Fixed: print theme, round ticks, labels, smooth raster and edge, borehole posting, depth-positive toggle |
| 014 | Withdrawn (false positive) |
| 015 | Fixed in app; `geo_wells.status` migration HELD for the owner |
| 016 | Fixed: contours from another surface |
| 017 | Fixed: preview undo, restore the previous grid |
| 018 | Fixed: gridding in a worker |
| E2 | Built: P90/P50/P10 GRV from kriging variance (fully correlated) |
| E3 | Built: prospect card PNG |
| E4 | Built: `?sample=1` sample-data mode |
| E5 | Built: residual table |

Found while fixing: a discrete minimum-curvature solver was prototyped and
dropped (accurate only at 37 s to 2.5 min per grid); the tension kernel
needed the opposite smoothing sign; K0 needed a cancellation-free series
at low tension; hull-masked maps left edge wells off the map.
