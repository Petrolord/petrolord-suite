# Petrophysics Studio — STATUS

Plan of record: docs/scope/PetrophysicsStudio-PLAN.md (**approved as
drafted 2026-07-13**, all five §8 questions confirmed). Roadmap slot:
Geoscience-ROADMAP.md Phase G2 — the flagship. Slug `petrophysics-studio` — **SHIPPED 2026-07-13, tile Active**.
Phase G2 complete (G2.0–G2.6). Live at
`/dashboard/apps/geoscience/petrophysics-studio`.

**Upgrade program PS1–PS10 approved 2026-09-01** (senior-petrophysicist
parity vs Techlog/IP/PowerLog): see
docs/scope/PetrophysicsStudio-ROADMAP.md. **PS1 (signature visuals)
DONE 2026-09-01**: crossover/threshold track fills + density-neutron
overlay track, z-colored interactive crossplots (colorbar, zoom/pan,
identify), Buckles plot (engines PR #92), mock LogDataQCViz retired.
**PS2 (deliverables) DONE 2026-09-01**: curves + zone CSV, round-trip
gated LAS 2.0 writer (engines PR #93), branded PDF summary report with
engine citations, no-depth empty state (audit A1/C2/C3 closed).
**PS3 (interpretations + per-zone params) DONE 2026-09-02**: named
interpretations CRUD, per-zone override patches through the zoned
pipeline (engines PR #94, PIPELINE_VERSION 2), migration
20260901120000 applied live (audit A2/B1 closed).
**PS4 (track builder) DONE 2026-09-02**: layout templates in
petro_projects.layouts (clone-on-edit built-ins, portable curve
addresses), LayoutPanel editor, header-click editing, ft display
toggle, track plot PNG export.
**PS5 (temperature + shaly-sand Sw) DONE 2026-09-02**: linear
BHT temperature model with Rw(T), Waxman-Smits/dual-water/modified
Simandoux (engines PR #95, PIPELINE_VERSION 3, oracle-gated with
exact Archie reductions), SP + Arps Rw tools wired; Bateman-Konen
stays gated (B5).
**PS6 (permeability) DONE 2026-09-02**: Timur/Tixier/Coates/
Wyllie-Rose + Buckles BVW (engines PR #96, PIPELINE_VERSION 4, mD
units exception documented), zone k geometric means, k log track,
KPERM published (audit B2 closed).
**PS7 (histograms) DONE 2026-09-02**: Histograms center view with
cumulative frequency, P10/50/90, zone filters, draggable cutoffs
writing back to params, multi-well overlays, GR normalization fits
(engines PR #97; apply lands with PS8 conditioning).
**PS8 (conditioning) DONE 2026-09-02**: Hampel despike, smoothing,
block depth-shift, bad-hole repair, normalization apply (engines PR
#98); results save as KEY_CND with operation provenance, raw curves
untouched, explicit input picker in the explorer (audit B3 closed,
D1b satisfied in-app).
**PS9 (field view) DONE 2026-09-02**: up to 8 wells side by side with
per-well zoned compute, flatten-on-top datum (wellcorrelation
engine), cross-well zone summary table, shared decimating curve
renderer with a static + overlay canvas split (audit C1 closed).
**PS10 (close-out) DONE 2026-09-02 — PROGRAM COMPLETE**: Hingle plot
with Rw fit, split view + selection brush, TVD axis labels
(deviation-gated), zone boundary drag, matrix-ID quicklooks +
Thomas-Stieber (engines PR #99); Elan-class solver stays a recorded
deferral. See the ROADMAP close-out for merge order and open items.
**Help guide DONE 2026-09-02**: full-page in-app guide on the shared
HelpGuideLayout shell at `/dashboard/apps/geoscience/petrophysics-studio/help`
(19 sections: workspace, quick start, curve mapping, tracks + layouts,
every Vsh/porosity/Sw/permeability method with defaults, zones, interpretations,
crossplots, histograms, conditioning, Rw tools, field view, publish/batch/
digitize, exports, units/provenance, validation basis, pitfalls, glossary).
Ribbon Help link added; guard test pins section anchors, the live curve
alias table, the recorded deferrals and the no-em-dash copy rule (which also
caught and fixed the Batch dialog title).

Production note: **RESOLVED 2026-07-14** — prod is current (source zip
from main `e84f8a181` uploaded to Hostinger); the tile, route and the
five legacy-route redirects are all live on petrolord.com.

## Phase status

| Phase | Status | Landed |
|---|---|---|
| G2.0 oracle + goldens | **DONE** | PR #59 — independent stdlib Python oracle, analytic 201-sample type well (exact Archie round-trip anchors), byte-identical goldens, README numeric contract |
| G2.1 engines | **DONE** | PR #59 — engine/{vsh,porosity,rw,sw,netpay}.js ported from the proven legacy core + hardened; 32 jest tests vs goldens at 1e-12 |
| G2.2 schema + pentest | **DONE** | migration 20260713220000 **applied live 2026-07-13**; pentest blocks 8–9 executed, 6/6 green |
| G2.3 workstation core | **DONE** | this branch — workstation on the shared shell, canvas TrackViewer (zoom/pan/crosshair, zone bands, tops), draft-and-apply ParameterPanel, ZoneManager w/ live oracle-verified summaries, engine/pipeline.js, /dev/petrophysics-studio harness seeded with the analytic type well; e2e asserts the ORACLE numbers off the UI (SAND A net 18.0 m, SAND B 5.5 m per the goldens; this row said 2.5 m until 2026-10-07) |
| G2.4 crossplots + facies + Pickett | **DONE** | this branch — white-chartTheme ND + Pickett crossplot canvas (ChartLogo), polygon facies tagging + FACIES strip track, depth-windowed Pickett water-line fit writing m/Rw back; fixture v2 (clean sands + porosity trend, self-asserting anchors) after the fit exposed v1's vacuous clean-rock checks |
| G2.5 write-back + batch | **DONE** | this branch — publish computed curves (overwrite-own provenance contract) + zone summaries to the registry, multi-well batch dialog, petro_projects params/facies persistence; live smoke: computed curve inserts under RLS with provenance intact |
| G2.6 digitizer + close-out | **DONE** | this branch — raster digitizer wizard, 5 superseded apps + exclusive subtrees deleted (shared crossplot kept for subsurface-studio), routes redirect to the new app, tile Active (migration 20260713230000, **applied live**) + route in this PR |

## Key facts

- Registry-native: all well/curve/top data via `src/lib/wellsRegistry.js`
  (G1 tables). Computed curves publish as ordinary `geo_wells_logs`
  rows with `provenance.computed` — no schema change.
- Validation: dual implementation vs `tools/validation/petrophysics/`
  (independence rule — the oracle is never written from the legacy or
  engine JS). Numeric contract in test-data/petrophysics/README.md.
- Bateman-Konen Rwe→Rw was OUT of v1 (no verifiable open source for the
  coefficients); shipped in PT11a (2026-09-10) once the owner supplied
  the equation with citations.
- The legacy `src/utils/petrophysicsCalculations.js` stays untouched
  until its consumers die at G2.6 (PetrophysicsEstimator still uses it).

## 2026-09-03 owner findings from the staging E2E

- **White tracks.** `TrackViewer` (single well and Split), `MultiWellTracks`
  (Field) and the PNG export header now paint on white with slate grid,
  frames and axis text (the Suite chart standard in
  `src/utils/chartTheme.js`); tops, zone bands, crosshair and scale
  labels moved to darker members of the same hues. The built-in layout
  defaults (`layout/layoutSchema.js`) and the Layout panel's new-curve
  colours were darkened to carry on white (GR emerald-600, RT/RHOB
  red-600, NPHI blue-500 dashed, φe cyan-600, Sw blue-600, k pink-600,
  pay green-600, DT violet-600). Layouts users already saved keep their
  own colours. Verified on the staging harness (canvas centre pixel
  255,255,255; Tracks and Field screenshots).
- **One well name per registry.** Raised here because the explorer lists
  wells by name; the rule lives in the shared registry
  (`src/lib/wellsRegistry.js` saveWell/updateWell) so every door obeys it:
  Well Data Manager add and LAS import, Seismolord well creation, Well
  Planning publish. Match is case- and whitespace-insensitive across the
  wells the caller can see (own + teammates' shared); rename to itself is
  allowed. Server backstop `20260903120000_geo_wells_unique_name_per_owner.sql`
  (same-owner half) applied 2026-09-03 after the owner took the
  shared-table review; duplicate probe was 0 groups.
- **Any mnemonic on a track; several of one type together.** Owner
  finding: only alias-recognised curves displayed. Three changes.
  (1) `services/curveMap.js` alias table widened (resistivity now covers
  RES/RESD/ILD/LLD/RLA*/AT*/AF*/A16H…A40H/P16H…P40H/M2R*/HLLD…; GR, RHOB,
  NPHI, DT, CAL, DRHO, PEF likewise) and `candidatesFor` also offers
  curves whose LAS description names the measurement (`DESCRIPTION_HINTS`),
  picker only, never auto-bound. (2) New layout address `log:<MNEMONIC>`
  (`layout/resolveTracks.js`): the workstation and the field-view cache
  now download EVERY curve of a well (`wellData.logs` keyed by mnemonic,
  inputs are views onto them), so Track layout's curve picker lists every
  mnemonic in the selected well and a track can hold any number of them.
  (3) Explorer shows "Also in this well: …" for curves no input took.
  Help guide's alias table now renders from the live list (the test
  that pins it caught the stale hand-written copy). Tests: curveMap.test.js,
  layout.test.js (log: addresses + crossover fill on two raw curves).

## PT0 foundations (2026-09-03)

The tester-findings program (ROADMAP "PT series") starts with a
no-visible-change wave: the checkshot conventions engine and its
closed-form goldens (engines PR #102), shared viewer math
(`src/components/wells/depthNavMath.js`), a deterministic top palette
shared with Well Correlation (`topColors.js`), pure hit tests
(`viewer/hitTest.js`: a top is only hit in its right-edge tag zone, zone
edges anywhere), `trackGeometry`, display-unit helpers, and the
TrackViewer redraw split (static picture cached offscreen, cursor layer
composited per move). All three vertical viewers accept a controlled
`view` prop for the PT5 navigator. Zone drag and move statuses now print
in the display unit.

## PT1 (2026-09-03)

Well Data Manager gained Petrel-style checkshot entry and editable well
data (see WellDataManager-STATUS). In this app: the explorer's selected
own well shows an "Edit well data" link into Well Data Manager
(`?well=<id>&tab=checkshots`; the harness points at its own harness
route).

## PT2 exports honour units (2026-09-03)

Testers saw metres in files exported from a feet session. The Export
dialog now has a depth options strip: unit (metres or feet, initialised
from the workstation toggle), which depth columns travel (MD, TVD,
TVDSS) and which one is `DEPT`. Curves CSV, zone CSV, LAS and the PDF
report all follow it; defaults reproduce the previous bytes exactly. TVD
is below KB (the axis label's definition), TVDSS = TVD minus `kb_m`,
both through the same depth frame the checkshot door uses
(`makeDepthFrame`: minimum curvature on the survey, vertical when there
is none, final tangent past the last station, each noted in the dialog
and in the LAS `~Parameter` block as `DEPTREF`, `EKB`, `DEPTHSRC`). Feet
write the LAS unit `F`, which the reader maps back to metres. The zone
panel types and shows depths in the display unit, and the field-view net
line and zone statuses follow it. Tests: `petroExport.test.js` (feet CSV,
TVD from the survey, LAS feet round trip, TVD primary, zone CSV columns,
defaults byte-identical); e2e PS2 downloads a feet + TVDSS CSV.

## PT3 tops in the Studio (2026-09-03)

Tops uploaded in Well Data Manager were drawn but could not be toggled,
coloured or edited here. Now: a Tops dock panel (show all, per-top
visibility and colour, depths in the display unit), deterministic colours
by name shared with Well Correlation (`src/components/wells/topColors.js`),
and on own wells a pick mode (click in the log area, name it inline),
drag on the right-edge name tag, rename and delete. The rows are the
registry's `geo_wells_tops`, so Well Correlation sees every change. The
harness seeds Top Shale exactly on the SAND A zone base; zone edges keep
winning mid-plot, tops are only hit inside their tag (`viewer/hitTest.js`).
Preferences persist with the interpretation in `layouts.topStyles` (no
migration). The Field view honours the same visibility and colours and
has its own Tops checkbox. This amends the PS-era recorded decision that
tops were read-only here.

## PT4 zones from tops or clicks (2026-09-03)

Zones were typed only. The Zones panel now has three modes: Typed
(unit-aware since PT2), Between tops (a pair picker naming after the
upper top, plus "Zones between consecutive tops" that creates one zone per
adjacent pair and skips names that already have a zone), and Pick on
track (two clicks in the log area through the PT3 pick machinery, name
box suggests the nearest top above). Pure planning in
`services/zonePlanner.js` (`validateZoneWindow`, `planZoneFromTops`,
`planZonesBetweenConsecutiveTops`, `defaultZoneNameAt`) with tests;
statuses print in the display unit.

## PT5 depth navigator (2026-09-03)

Testers asked for a scroll picker beside the track to scroll and to
squeeze or stretch the vertical scale. `src/components/wells/DepthNavigator.jsx`
(two canvases, ~64 px) shows the whole well in miniature with tops ticks
and zone bands and the visible window as a band with handles: drag the
band to scroll, drag a handle to change the scale, click outside to jump,
wheel to zoom, double-click for the full well, keyboard when focused. It
is mounted as a flex sibling of the canvas in TrackViewer, MultiWellTracks
and Well Correlation's CrossSection through the PT0 controlled `view`, so
every canvas-relative e2e coordinate still holds (the canvas only narrows
by 64 px; hidden under 460 px). Root exposes `data-view-top/base` in the
display unit for tests. Well Correlation now colours tops from the shared
palette. All view arithmetic is `depthNavMath.js` (unit-tested in PT0).

## PT6 fills and the density-neutron presentation (2026-09-03)

Layout schema v2 (stamp-only migration; v1 templates resolve unchanged):
`threshold` fills gain an optional `color2` for the other side (the GR
cut-off: sand one colour below a number the user picks, shale another
above it), and a new `ramp` mode colours a track by one curve's value
between stops (`viewer/fills.js makeRamp` on the exported
`colorMaps.interpolate`, `rampStrips` decimated per pixel row like the
curves). The Layout panel gets colour pickers on every fill, an opacity
slider, `fillTo` and stop editors for ramps, and a `ramp` mode. Built-ins:
the density-neutron crossover now uses the global standard colours (gas
yellow `#facc15` where density plots left of neutron, shale gray
`#9ca3af` where neutron plots left of density, opacity 0.35; the scales
1.95 to 2.95 and 0.45 to -0.15 were already standard) on both existing
templates; a third built-in, Lithology quicklook, carries the GR cut-off
fill at 75 API and a lithology ramp from pale yellow (15 API) to dark
brown (150 API). A `grCutoff` pipeline parameter is out of scope
(DEFAULT_PARAMS is in the vendored engine), so the cut-off is a fixed,
editable value in the fill row. Tests: layout.test (lithology resolves,
ramp drop rules, v1 threshold without color2, migrate stamps v2 and keeps
a fork byte-identical, t-dn colours) and fills.test (makeRamp,
rampStrips, density-neutron pos/neg semantics); e2e PS4 template count
moved from 3 to 4 and a PT6 pixel test on the lithology track.

## PT7 digitizer automatic mode (2026-09-03)

Finding 10. The digitizer is rebuilt around a natural-pixel frame:
calibrate (four Pick rows with inline values in the session depth unit;
no more window.prompt), trace (automatic colour trace inside a dragged
box via the new engine `petrophysics/scanTrace.js`, engines PR #103, a
pure JS port of the retired OpenCV routine with an achromatic path for
black curves; Shift-click seeds the colour, tolerance 0.5 to 3; or by
hand), review (drag, add, Alt-click or right-click remove, undo, live
preview of samples, depth range and value range), save. Every save is a
NEW row named `<MNEM>_DIG`, `_DIG:2`... (`digitizedCurveName`, derived
again in the workstation against the registry's current mnemonics), and
the scan plus calibration stay open for the next curve. Provenance:
`{mode, roi, tolerance, seed_color_hex, trace_stats, edited_points,
ai_calibration, image_px, calibration, depth_unit_entered}` merged under
`digitized:true`.

`Read this scan (AI)` calls the new edge function
`supabase/functions/petro-scan-read` (seismolord-ai skeleton: user JWT,
OPENAI_API_KEY project-wide, OPENAI_MODEL default gpt-4o-mini, vision
`image_url` detail high, `response_format json_object`, temperature 0,
413 over 1600 px or ~1.5 MB, versioned prompt `PROMPT_VERSION 1` whose
key list is mirrored in `services/scanProposal.js PROPOSAL_KEYS`). The
reply is a PROPOSAL card (editable); Accept fills the form with pixels
assumed at the image edges and says so; the reader never traces or
saves. Client: `services/scanImage.js` (downscale to 1600 px, PNG then
JPEG under 1.5 MB), `services/scanRead.js` (status to kind mapping),
backends `readScan` (registry: the function; harness: a canned proposal
the e2e synthetic scan is built to). `curveMap.candidatesFor` offers
`KEY_DIG` explicitly, never auto-mapped. Retired dead files:
`src/lib/autoDigitizeSafe.js`, `src/hooks/useLogDigitizer.jsx`,
`src/utils/digitizerApi.js` (`src/utils/digitizerOpenCv.js` stays: the
Contour Map Digitizer still imports it).

**Owner deploy after merge:** `supabase functions deploy petro-scan-read`
(secrets already project-wide). Cost note: one gpt-4o-mini vision call
per press of the button, high detail, about 1 to 3k tokens; there is no
per-user cap yet (follow-up if testers lean on it).

Tests: engines `petrophysics.scanTrace.test` (18, hand-built images),
Suite `scanProposal` (3), `scanImage` (2), `scanRead` (3), `curveMap`
(+1 `_DIG` candidate), `digitizer` (+1 provenance merge), `helpGuide`
(+3 pins); e2e: the manual digitizer scenario rewritten without
`page.on('dialog')` and a PT7 scenario on a synthetic PNG written by
`e2e/helpers/syntheticScan.js` (AI read, accept, whole-image trace,
values 30 to 120 within 1.5, save `GR_DIG` then `GR_DIG:2`).

Follow-ups (not in PT7): wrapped or backup-scale curves, black curves on
black grids, skewed scans, a per-user daily cap on AI reads, an ROI that
follows the proposal's scale ends instead of the image edges.

## PT series close-out (2026-09-03)

All eight waves merged to main in order (#364 PT0, #365 PT1, #366 PT2,
#367 PT3, #368 PT4, #369 PT5, #370 PT6, #371 PT7), plus the .pld importer
clash fix #363. Held migration `20260904090000_geo_wells_checkshots_provenance`
APPLIED live (dry run, apply, probe). Edge function `petro-scan-read`
DEPLOYED (v1 ACTIVE; unauthenticated call returns 401). Prod zip cut from
main e3cf0195a with build-info.json: `/root/suite-upload-20260903-e3cf0195a-slim.zip`.
Remaining: owner upload + cache purge, staging walk of the tester
scenarios in PetrophysicsStudio-ROADMAP.md (PT series, verification).

## 2026-09-03: cross-app navigation

- Ribbon starts with the shared `ModuleHomeLink` to the Geoscience
  dashboard (`petro-home`).
- `?well=<id>` (from Well Data Manager's "Open in" launchers) selects the
  well once the registry list has loaded; an unknown id reports "The
  linked well is not in your registry."
- The explorer's inventory block gained "Open in Well Correlation"
  (`petro-open-correlation`, `?wells=<id>`) beside "Edit well data";
  the harness routes both to `/dev/*`.
- e2e: `petrophysics-studio.spec.js` "cross-app" test.

## 2026-09-03: shared track painter (WC series, wave 1)

The pure viewer modules moved to the shared wells kit so Well Correlation
and Well Data Manager paint logs the way this studio does:
`src/components/wells/{fills,trackRender,hitTest,depthModes,curveMap,
useWellCurvesCache,plotPng}.js` and `layout/{layoutSchema,resolveTracks}.js`.
One-line re-export shims stay at the old paths, so nothing here changed
its imports. New `src/components/wells/trackPainter.js` holds the track
primitives extracted from `TrackViewer` (depth axis, header scale rows,
strip tracks, fills, curves, cursor readouts, top tags) with the same
constants and draw order; `TrackViewer` and the Field view's
`MultiWellTracks` delegate to it, and the Field view gains the fills it
never had. Petrophysics e2e: 23 passed unchanged, PT6 pixel samples
included.
- Wave 2 of the WC series moved `LayoutPanel.jsx` to
  `src/components/wells/LayoutPanel.jsx` (shim left in place) so Well
  Correlation offers the same track layout editor.

## 2026-09-05: PT8, five tester findings

Branch `pt8/tester-fixes` off main 8362af800. Jest 395 pass across
`components/wells`, Petrophysics, Well Correlation and Well Data
Manager; e2e 37 pass against the dev harness on 8201.

**1. Surface X and Y editable (Well Data Manager).** The finding was
filed against Petrophysics but the well Header tab is Well Data
Manager's — Petrophysics links there to edit a header. `WellDetail`'s
Header edit mode now includes both coordinates beside KB and TD,
validated as finite numbers and carried in the same Save payload
(`updateWellData` in `lib/wellsRegistry.js` and the harness backend).
They are world coordinates already in the well's CRS, so nothing is
transformed and the m/ft selector — a depth unit — does not touch them;
the field labels name the frame. A blank coordinate clears it, so
`WellsMap` now fits its extent over wells that have a location rather
than reading a null as zero.

**2. Top depths editable, and zones follow.** Two doors onto one move:
an editable depth field in the Tops panel, and dragging a top anywhere
along its line on the track (PT3 could only drag the name tag at the far
right edge, which no tester found). Optional snap to the nearest logged
sample. `hitTest.hitTrackDragAt` states the precedence in one
unit-tested place: the tag grabs its top, a zone edge wins mid-plot, and
past both the top's line is a handle.

Moving a top re-cuts every zone that references it, so net, gross, NTG
and the average porosity, Sw and Vsh recompute against the new interval.
"References" is `zonePlanner.planZonesAfterTopMove`: by recorded
provenance where a zone was created from tops (zones now store which
tops drew their edges in `properties.from_tops`), else by an edge
sitting on the top's old depth, which carries zones that predate the
link. A zone that records provenance is judged by that alone. A move
that would put a base above its top is reported and skipped. The
publish path carries `from_tops` forward instead of replacing it with
the summary snapshot.

**3. PNG button in the toolbar.** Exports the visible depth window and
current track set at a fixed 2x, captioned with the well, that range and
the datum. Reuses the Well Correlation composer
(`components/wells/plotPng.js`), which gained the caption line and an
explicit `scale` — an offscreen canvas reports `clientWidth` 0 and would
otherwise band a 2x image at 1x. `TrackViewer`'s static layer is now one
function painting in CSS coordinates with the caller setting the
transform, so screen and export draw the same picture at different
scales. The Export dialog's entry asks the viewer for that same render
instead of reaching into the DOM, so there is one composer, not two.

**4. Pickett zone filter.** A multi-select over the well's zones,
defaulting to all of them; two or more selected colours the points by
zone with a swatch key. Rules in pure `services/zoneFilter.js`: "all
zones" means every sample including depths in no zone, overlaps resolve
first-by-top as the zoned pipeline does, and a selection naming only
deleted zones falls back to no filter rather than blanking the plot. The
brush now acts on the filtered points. Every crossplot gained a PNG
button — the filter had to be carried into an image export and there was
none — and the Pickett caption records the zones.

**5. Depth navigator left; MD/TVD/TVDSS columns.** The PT5 navigator
moved from the far right to the left, against the depth scale it
scrolls. The gutter takes one column per depth reference, picked in the
status bar, through the canonical welldata frame (`makeDepthFrame`) the
checkshot door and the LAS/CSV depth columns already use. Plotting stays
MD-linear; the columns label the same rows in their own reference.
`paintDepthAxis` gained `drawGrid`/`gridLeft`, defaults unchanged, so
Well Correlation and the Field view paint exactly as before.

**Retired.** The PS10 `axis: MD/TVD` toggle (TVD values on MD spacing,
caveated in its own axis title) and its `makeTvdLookup` helper — real
side-by-side columns replace them.

**Also.** The ribbon now wraps as a whole: eleven controls plus the new
PNG button had pushed Help and Parameters off the right edge at 1440 and
wrapped the subtitle to five lines.

Open: owner staging walk, prod zip + upload.

## 2026-09-05: Map this top (Mapping MS4)
The Tops panel rows carry a map icon (`petro-map-top-<name>`) linking to
Mapping & Surface Studio, which grids the top across every well carrying
it on arrival. `PetroWorkstation` takes `mappingPath`.

## Tester fix: range boxes accept a minus sign and decimals (2026-09-07)

A tester setting a log scale range in the Layout panel could not type a
negative number or a decimal: the Range, Width, curve min/max, threshold
and ramp-stop boxes in the shared `src/components/wells/LayoutPanel.jsx`
were controlled inputs that parsed every keystroke and fell back to the old
value, so a lone "-" or a trailing "." was discarded before the next digit
arrived. They are now a `NumText` box that keeps the text while typing and
commits the parsed value only when the text is a complete number (an empty
curve override clears back to the track range); the box resyncs from the
layout on blur. Well Correlation shares the panel and gets the same fix.
Jest: `src/components/wells/__tests__/layoutPanelNumeric.test.jsx` (3 gates).

## 2026-09-07: PT9a, PHIT as read, shale-corrected PHIE, permeability on by default

Second tester pass triage (see ROADMAP "PT9 series"). Two findings were
defects in what the Studio already had.

**Permeability "not showing".** The model defaulted to `none`, which
computed no KPERM, hid the k track of the built-in template outright and
left the zone card without a k line, with nothing on screen saying why.
Once a model was picked the track and the golden zone mean were correct.
Owner decision: permeability is never off by default. Timur is now the
default; `none` is an explicit choice. The curves CSV and LAS had also
hard-coded their outputs to VSH, PHIE, SW, PAY, so KPERM and BVW never
exported; the zone CSV and PDF had no k column. All fixed.

**PHIE was PHIT.** The pipeline never applied the engine's shale
correction; the curve published as "Effective porosity" was the transform
as read. Owner decision: rename it PHIT, add a real PHIE. Pipeline v5
(engines #155): PHIE = PHIT - Vsh * phi shale with a new `phiShale`
parameter (Porosity section, default 0.06); Archie-family Sw, cutoffs, k
and BVW run on PHIE, Waxman-Smits and dual water on PHIT; without GR the
Studio says Sw, cutoffs and k fell back to PHIT. Fixture v3 adds the
EFFECTIVE golden block (pre-existing keys byte-identical) with an exact
linear-Vsh anchor. Publish now writes six curves (VSH, PHIT, PHIE, SW,
PAY, KPERM). Old published PHIE rows are overwritten by the corrected
curve on the next Publish; the help guide carries the note.

Also from the triage: per-zone parameters already exist (Scope selector,
every parameter including methods); only Pickett has the zone filter;
facies exist as crossplot polygons only; there is no curve calculator,
no low/mid/high, and salinity plays no direct role (Rw is typed, fitted
or from SP; Arps assumes NaCl). Those are PT9b to PT9g in the ROADMAP.

Jest: 41 suites (Petrophysics, Well Data Manager, shared wells) green;
engines `__tests__/petrophysics.pipeline.test.js` 7 green; e2e 26/26.

## 2026-09-07: PT9b, zones on every crossplot

"Let all crossplots display by zone": the PT8 filter was Pickett-only.
One zone selection now filters and colours Density-Neutron, Buckles and
Hingle as well, is shared across the four plots, travels into every PNG
caption and saves with the interpretation as `crossplots.zones`. Help
guide gained "Zones on every crossplot".

## 2026-09-07: PT9c, zone parameter table

"A workflow manager for each zone so we can vary the parameters used in
different zones": the PS3 scope picker already did this one zone at a
time and testers did not find it. The new Zone parameter table (Parameters
panel, "Zone parameter table…") shows every parameter by every zone on one
screen, edits in place (models included), copies between zones, and
applies through the same override model, so the two views never disagree.

## 2026-09-07: PT9d, Rw from salinity

"What role does salinity play?" None directly, until now: Rw was typed,
fitted or taken from the SP. Rw tools gained a third card, Rw from NaCl
ppm and temperature (Bateman and Konen 1977 fit to the Gen-9 chart, a
labelled approximation within about 10 percent), with the inverse shown
for the current Rw. The help guide now answers the question in one
paragraph. The Rwe to Rw (SP) Bateman-Konen conversion stays deferred.

## 2026-09-07: PT9e, facies by rules

"We need to generate facies logs too": until now facies came only from
polygons drawn on the density-neutron crossplot. The ribbon's Rules…
dialog classifies every sample by an ordered list of cutoff classes on
any curve (Vsh, PHIE, Sw, k, GR, RT, ...), previews the thickness each
class takes, draws the result as a Rule facies strip on the active
layout and publishes it as electrofacies intervals in the registry. The
rules save with the interpretation.

## 2026-09-07: PT9f, curve calculator

"How does one create a new derived log?" Until now only the pipeline,
conditioning, the digitizer and LAS import made curves. The ribbon's
Calc… dialog evaluates an expression over any curve on the well
(inputs, outputs, registry curves), previews it, and saves it as a new
registry row with the expression in provenance. The tester's own example
(PHIT from PHIE) is one of the picker's examples, and after PT9a both
porosities come out of the pipeline anyway.

## 2026-09-07: PT9g, low, mid, high cases

"We need to generate low, mid and high petrophysical logs and summary":
the ribbon's Low/High… dialog runs three deterministic parameter cases
(mid = current; low and high edited in a grid, defaults pessimistic and
optimistic), shows net, NTG, porosity, Sw and k per zone and case as you
type, draws the band between the cases around the mid curve on a "Low,
mid, high" layout, exports the summary CSV and publishes the twelve
_LOW/_HIGH twins with the case patch in provenance. Deterministic by
design; the Suite's Monte Carlo is not duplicated here.

## PT9 series close-out (2026-09-07)

Seven waves for the second tester pass, all as stacked PRs with base
main: PT9a #439, PT9b #440, PT9c #441, PT9d #442, PT9e #443, PT9f #444,
PT9g (this). Engines #155 and #156 merged and subtree-pulled. Every wave
carries its jest gates and an e2e walk on the dev harness.

## 2026-09-09: PT10a, permeability and temperature tracks

Third tester pass: "permeability does not display, even on an added
track". Live data showed why: the testers' shared interpretation, saved
2026-09-04 before PT9a, stores `permMethod: none`, and the workstation
merged it over the new Timur default on every open. Three fixes:

- The `petro-project` state kind is at version 2. A version-1 row
  storing `none` for a model whose code default is not `none` opens
  with the default (Timur), once, with a status line that says so and
  how to put it back; the change is recorded in the interpretation's
  provenance (date, old value, new value; visible under Provenance in
  the interpretation menu). The step covers the temperature model too,
  and is a no-op there while its default stays `none`. A `none` chosen
  in Parameters is stored with `params.deliberateNone`, which the
  migration skips, so a future default change never guesses. The
  in-memory backend opens rows through the same step; a regression
  fixture in the pre-PT9a shape is under `__tests__/fixtures`.
- A track whose every curve resolves to nothing is kept with a note
  down its body saying why (Petrophysics single-well only; Well
  Correlation and the Field view keep dropping it). The layout panel
  marks such a source "(not computed)"; the Parameters panel warns
  under Permeability when the model is none.
- A "New track" takes the picked source's standard scale (KPERM log
  0.01 to 10000, TEMP 0 to 150, and the rest) unless the user already
  scaled it.

Testers: reopen the shared interpretation and confirm the k track is
there before doing anything else. Owner decisions 1 and 2 (percentile
labels, the migration) are recorded in the ROADMAP.

## 2026-09-09: PT10b, depth density crossplot

Tester note: a curve-versus-depth density plot beside the density-neutron
and Pickett plots. The scatter could not bin, so this is a new canvas
component sharing the scatter's scale and tick helpers (now in
`crossplotScales.js`). `viewer/depthDensity.js` is the pure math: a 2D
histogram normalised to its fullest cell, depth bins of 25 m or 100 ft by
the display unit, log X for RT and KPERM, a depth range, a zone mask, and
`envelopeOutline` for a second well binned on the same edges. The panel's
fifth button, "Depth density", offers any input, output or raw registry
curve against MD, TVD or TVDSS (through `makeDepthAxes`, so TVD is the real
frame, with unplaced samples counted in the caption), an overlay well through
the curves cache (a computed output runs the current parameters on that
well), the shared zone chips, PNG, and a `crossplots.density` config that
persists with the interpretation. Jest gates on the math and the shared
scales; e2e walk on the harness.

## 2026-09-09: PT10c, probabilistic engine (engines-first)

`engines/petrophysics/probabilistic.js` (engines #158, subtree-pulled):
seeded parameter draws through the same zoned pipeline, per-sample
percentile curves (`_Q10/_Q50/_Q90` for PHIE, PHIT, VSH, SW, BVW, KPERM),
`PAY_PROB`, per-zone outcome cases (net, NTG as P90/P50/P10 under the
SPE PRMS exceedance meaning) and parameter statistics (10th/50th/90th
percentile), and a net-pay sensitivity. Every random-number,
distribution, quantile and sensitivity primitive comes from the
engines' `lib/stats`, the module ReservoirCalc Pro's Monte Carlo
delegates to. The oracle gained an exact lognormal quantile, and because
Sw is monotone in Rw the golden percentile curves and zone net cases are
exact rather than sampled; the engine at N = 20000 lands within 1
percent. Suite side: the re-export shim and
`src/lib/percentileConventions.js`, the one place the Suite's P-label
words live (owner decision 1), with the two gates the decision asked
for: no P-label on any parameter output, and P90 <= P50 <= P10 on every
published outcome case.

## 2026-09-09: PT10d, probabilistic Studio

The ribbon's Probabilistic… dialog: tick the parameters to vary, give
each a distribution (triangular from its 10th/50th/90th percentiles,
uniform, normal or lognormal; defaults come from the PT9g low and high
cases so the two features agree by construction), pick draws and a seed,
and run in a Web Worker with a progress bar and Cancel. Results: a zone
table whose net pay reads P90 / P50 / P10 under the SPE PRMS exceedance
meaning and whose porosity, Sw and k read as 10th / 50th / 90th
percentiles; a net-pay tornado per zone; Apply to tracks (a "Low, best,
high cases" layout whose band labels say the direction, "Low case Sw
(high value)", plus a pay probability track); Export CSV; Publish (the
18 percentile curves and PAY_PROB, with the spec, draws, seed and the
exceedance sentence in provenance). The run spec persists with the
interpretation. The zone CSV, the PDF report and the zone cards carry
the probabilistic block; the histogram's percentile readout no longer
says P10/P50/P90. In Chromium the type well runs 1000 realisations in
under a second.

## PT10 series close-out (2026-09-09)

Five waves for the third tester pass, each one branch and one PR with
base main: PT10a #453 (permeability and temperature tracks, state
version 2), PT10b #454 (depth density crossplot), PT10c #455 (engines
#158 probabilistic engine, subtree-pulled, plus the Suite percentile
conventions), PT10d #456 (probabilistic Studio), PT10e (this). Both
owner decisions of 2026-09-09 are recorded in the ROADMAP: exceedance
P-labels on outcomes only, and the one-time migration of a stored
`none`. The help guide states the convention in one sentence with the
Sw example. Testers: reopen the shared interpretation first and confirm
the k track before anything else.

## 2026-09-10: PT11a, Bateman-Konen Rwe to Rw (audit B5 closed)

The SP route in Rw tools is now the whole chain: Rmf with the
temperature it was measured at, Arps to formation temperature, Rmfe by
the 0.85 rule (Rmf at 75 °F above 0.1 ohm·m) or the Bateman-Konen
inverse, Rwe from SSP and K, and Rw from Rwe by the Bateman and Konen
(1977, The Log Analyst 18(5) p. 3-11) fit to chart SP-2, as the owner
supplied it on 2026-09-10 with its check point (150 °F, Rwe 0.050 gives
Rw 0.0564). The value applied is Rw; every intermediate is shown and
the correction is labelled. Beyond the chart (denominator at or below
zero, roughly above 2 ohm·m; at or below 50.8 °F) the card refuses
with the reason and Apply is disabled; nothing is extrapolated. Every
apply from any Rw tool writes `params.rwMethod` (a hint under Rw in the
parameter panel, a row in the PDF parameter table) and a provenance
entry with who and when into the interpretation; retyping Rw clears
the method. Engines #159 (oracle written from the paper, nine gates,
`chart_points.json` waiting for six SP-2 readings that gate acceptance,
not the build). The help guide's limitation paragraph now says the SP
route applies the fit on both sides and assumes NaCl waters.

## 2026-09-10: chart SP-2 read, Bateman-Konen band narrowed (engines #163)

The owner read 31 points off chart SP-2 (printed range 75 to 500 °F):
28 on the fresh side (Rw 1.0 to 5.0 ohm·m at all seven temperatures)
and 3 near NaCl saturation at 75 °F. Every reading has Rw above Rweq.
The Bateman-Konen fit is 36 to 92 percent low on every fresh reading
and 13 to 24 percent high on the saline three; only its 75 °F
saturation asymptote and the owner's 150 °F check point hold. The
engine therefore accepts the fit only for Rwe 0.02 ohm·m (at 75 °F,
Arps to formation T) to 0.1 ohm·m at formation T, inside 75 to 500 °F,
and refuses with the reason elsewhere (`rweBand`, `rwToRweProblem`);
the SP card states the band and refuses on the filtrate side with its
own sentence. `chart_points.json` carries the readings; gate 2 refuses
every reading outside the band. Later the same day five label-anchored
75 °F readings inside the band (Rweq 0.02 to 0.06) put the fit within
10 percent of the chart (+9.3 to -4.2 percent; no correction would be
23 to 57 percent low), so the fit is accepted there to that declared
residual (engines #164, `RWE_TO_RW_DOMAIN.fitResidual`, stated in the
SP card and help guide); gate 2 pins the worst residual and warns that
the other six temperatures are unread inside the band. Open: the same
column at 150 and 300 °F (ROADMAP recorded decision 6).

## 2026-09-10: PT11b, resizable Split divider

The Split view's divider drags (react-resizable-panels through the
shared `resizable.jsx`), 60/40 to start with a 25 percent minimum on
either side, and double-click resets it. The position is remembered per
user on this browser through the Studio's first preferences store,
`services/studioPrefs.js` (one JSON blob per user id, the first key is
the split). No engine change. Gates: `studioPrefs.test.js` (round trip,
per-user isolation, corrupt blob) and an e2e walk (drag, reload,
double-click).

## 2026-09-10: PT11c, stretch and squeeze depth shifting

The new `Depth shift` view puts a reference curve and the curve to move
side by side on one depth axis with a shift-versus-depth track. Press
Place ties and click the reference track then the target track at the
same feature; drag a mark to adjust; edit, delete or add ties in the
list; undo; Reset to raw. Between ties the shift is linear, beyond the
outermost ties constant, and resampling is the block shift's bracketing
linear interpolation with nulls never bridged (engines #160:
`tiePointWarp`, `depthShiftTiePoints`, `shiftCurve`; crossing ties are
refused with a sentence). Save writes `<KEY>_DS`, a new registry row
whose provenance carries the shift as a first-class object (reference,
source, pairs, interpolation, beyond, and an edit list with who and when
from `backend.whoAmI`); the raw curve is never written. Reopening the
view reads the pairs back from the row, re-applies them to the raw
curve and reports any mismatch with the stored samples (the round-trip
gate pins zero). The explorer offers `_DS` beside `_CND` and never swaps
it in by itself. In passing: ConditioningDialog now writes `project_id`
so a re-saved `_CND` replaces its row instead of duplicating. The help
guide's limitation paragraph now says depth shifting is per curve,
block or by tie points, and keeps its closing sentence.

## 2026-09-10: PT11d, multi-mineral solver (stage one)

`Mineral model…` on the ribbon solves density, neutron and PEF together
for three mineral fractions and porosity with a fixed fluid, one 4 by 4
linear system per sample with U = Pe × ρe so the photoelectric term
mixes by volume (engines #161, `engines/petrophysics/mineral.js`, the
elimination shared from `lib/linalg/solveDense`). The endpoint table
ships with published defaults (Schlumberger chart-book minerals, Doveton
1994; neutron endpoints in limestone units shared with the
density-neutron plot) and is editable per well with Reset to published;
the model persists with the interpretation and every run is a
provenance entry. A sample whose fractions leave zero to one is refused
and flagged with the excursion as the residual, a set the tools cannot
separate is refused as singular, nothing is clamped. Apply to tracks
adds the Mineral model layout (stacked lithology, solved porosity beside
the pipeline porosity, residual); Publish writes `V_<MINERAL>` per
mineral plus `PHI_MM`, `MM_RES` and `MM_FLAG` with the whole model in
provenance; the CSV carries them. The solved porosity reaches the
pipeline only through the explicit φt source `mineral` (PIPELINE_VERSION
6), with a hint and a provenance entry on the change; with no run there
is no PHIT, never a fallback. The type well gained a PEF curve from its
own quartz + clay + fluid construction, so the golden recovers
`phi_true` and the shale fraction off the gas zone and refuses the gas
zone. The help guide gains a Mineral model section whose "not suited to"
list is the dialog's own words, and the limitation paragraph now names
the probabilistic stage two as the remaining gap.

## PT11 series close-out (2026-09-10)

Four waves for the help guide's four stated gaps, planned and approved
the same day: PT11a #458 (Bateman-Konen on both sides of the SP chain,
audit B5 closed, engines #159), PT11b + PT11c #459 (resizable Split
divider with per-user preferences; tie-point stretch and squeeze with
the shift as a first-class object on the `_DS` row, engines #160), PT11d
(this; engines #161). The limitation paragraph keeps its closing
sentence: none of this is hidden behind a setting, every capability is
visible in the UI, recorded in provenance, and never a silent default.
Still owed by the owner: the Bateman-Konen equation page verified in
the copy in hand, the chart's printed temperature range, six SP-2 chart
readings for `chart_points.json` (the acceptance gate for PT11a), and
whether Studio preferences should move to a table for cross-device use.
Stage two of the solver (PT11e) waits for a customer request.

## 2026-09-28: design system rollout W1C (light default, dark per user)

The Studio, its dev harness and its help guide each wrap themselves in
`ThemedApp` (App.jsx is untouched), so the app opens on the grey panel
light theme and the ribbon's new toggle (at the right, beside Help and
"Parameters & zones") switches to dark and back, stored per user. The
route prefix `/dashboard/apps/geoscience/petrophysics-studio` (the help
guide is a sub-path) is registered in `src/design/rollout/w1c.js` for
the themed cold-load loaders.

- Chrome on roles: the ribbon, explorer, dock panels, status bar, the
  views' toolbars and all eleven dialogs moved from slate, cyan and
  emerald to `pl-*` roles. Selected view buttons and
  chips use the primary tint; the publish buttons lost their decorative
  emerald; warnings, errors, the low and high case words and "saved"
  messages use the status roles. The AI scan proposal is an info
  callout. Overrides on `DialogContent` and on primary and outline
  `Button`s were removed so the themed defaults apply.
- Plots unchanged: the log tracks, field view tracks, crossplots,
  depth density plot and histograms keep their canvas palettes and sit
  in `data-canvas="chart"` (white paper in both themes, their hover
  tooltips too). The depth navigator stays the light canvas. Curve, fill,
  zone, top and mineral colours are data and are unchanged.
- Layout fixes found in the screenshot walk: the dock content now takes
  the dock width, so an open track row in the track layout editor (the
  shared LayoutPanel curve row, wider than a 280px dock) scrolls sideways
  on its own and no longer pushes every parameter field out of view (it
  did in the legacy look too); below about 1300px the ribbon's tool
  group wraps onto a second row, so Save no longer runs off the right edge.
- Tests: new `__tests__/PetrophysicsStudio.theme.test.jsx` (the shared
  `describeAppTheme` checks on the real workstation, plus a loaded well in
  light and dark, every view, ten dialogs and the help guide). The e2e
  selected-well check now reads `text-pl-primary-text`. No calculation,
  LAS, export or plotting change.

## 2026-09-29: upgrade programme Step 1 (practitioner lens) and Step 2 analysis

App #2 of the Geoscience upgrade programme. Full record, findings and the
ranked Step 2 backlog: `docs/upgrade/PetrophysicsStudio-UPGRADE.md`
(branch `feat/petro-u1`). All twelve checks run; 33 findings, 17 fixed
(1 S1, 8 S2, 4 S3, 4 S4), 15 open (12 S3, 3 S4), none S1 or S2.

- **S1, chain:** ReservoirCalc Pro's Wells tab fed a zone's net pay into
  its gross thickness and also set NTG, so NTG applied twice. Thickness is
  now the published gross (vertical when present).
- **Zone numbers a volumetrics input can use** (`services/zoneAverages.js`):
  Sw pore-volume weighted so net x phi x (1 - Sw) is HCPV (the engine's
  thickness-weighted value kept as `sw_avg_h`); Waxman-Smits and dual
  water keep PHIT (1 - Swt); net reservoir; true vertical thickness through
  the survey; HCPV. Card, CSV, PDF, Field view, Low/High and publish all
  use it. A zone publish used the base cutoffs; it now uses the zone's own.
- **Inputs in the engines' units** (`src/components/wells/curveUnits.js`):
  NPHI in PU or % (or in percent labelled v/v), RHOB in kg/m3 and DT in
  us/ft convert as read; -999 and below in the physical inputs is null;
  the status line says so. Applies to the Studio, the shared curves cache
  (Field view, Well Correlation, Earth Modeling) and batch runs.
- **Report:** header block (company, field, analyst in the Export dialog,
  remembered per user; well, UWI, location and CRS, datum, interpretation,
  units, build), every applied parameter, zone overrides, net reservoir,
  TVT and HCPV; Latin-1 safe.
- **Batch** publishes zone summaries too and has an All toggle; the zone
  card says whether its published row matches; Split view works at 1280
  and 1366 (two e2e specs had been red on main); crossplot labels and
  watermarks stay inside their plots; Mineral Apply closes its dialog;
  missing values print `n/a` in the shared track painter.
- **WDM door:** core plugs merged into a well keep their measured values
  (nearest sample, no interpolation).
- **Kits:** hostile set `e2e/fixtures/petro/hostile/` (one well in six
  vendor spellings, core, zonation), saved-state fixtures per release
  `e2e/fixtures/petro/saved/`, harness `?scaleWell=1&extraWells=n`,
  `e2e/petrophysics-upgrade.spec.js`.
- **PL10:** 20,000 ft at 0.5 ft with 30 curves opens in 1.3 s (longest
  main-thread task 0.49 s); a 23-well batch in 1.4 s; probabilistic 100
  draws on that well 53.5 s in the worker (open, U2-011).
- **Open for the owner:** Step 2 batch choice (A: cutoff sensitivity, CPI
  page, unit doors, zone import, unit family table); whether to republish
  or flag PHIE rows published before PT9a (PETRO-U1-026); phone support
  for workstation apps (shared with WDM-U1-023).

## 2026-09-29: upgrade programme Step 2 built (batches A, B, C)

Branch `feat/petro-u2`, one commit per item; details and proving tests in
`docs/upgrade/PetrophysicsStudio-UPGRADE.md` (Batch decision and Step 2 build log).

- **A.** Cutoff sensitivity per zone on screen and in the PDF (U2-005); a log plot (CPI) page per zone in the PDF (U2-003); parameter entry in us/ft, degF and ft with an exact round trip (U2-002); zonation import from Techlog, IP, Petrel or a paste, hostile-file tested (U2-004); a shared unit-family table with an Input units door and the NEU / RES_DEEP aliases (U2-001, closes PETRO-U1-030).
- **B.** Engines-first: BVW = PHIT x Swt and SWT for total-porosity models, pore-volume zone Sw and HCPV outcomes in the probabilistic run (U2-012, engines PR #285, PIPELINE_VERSION 7); a one-pass probabilistic engine split by depth across up to four workers (U2-011, engines PR #286; 100 draws on the 20,000 ft well 53.5 s to 30.3 s on a loaded host, the 10 s target still open). Stale badges on published curves and facies (U2-009); pre-PT9a PHIE rows flagged in the Studio, Well Data Manager, Rock Physics, Data AI and Earth Modeling with an owner Republish (U2-013); HCPV and net pay as named Mapping sources (U2-008); core plugs on the tracks and a per-zone poro-perm transform (U2-007); saturation-height from SCAL Studio projects beside the log Sw (U2-010); Data AI electrofacies on the Studio tracks with a crosstab against rule facies (U2-006).
- **C.** Parameter checks against the well's own logs (U2-015); a 25-per-day scan-read cap logged in `dai_llm_calls` (no migration) and backup-scale unwrapping in the digitizer (U2-018).
- **Deferred:** U2-014 multi-mineral stage two, U2-016 preferences table (migration), U2-017 useProjectState extraction.
- **Owner items:** merge engines PRs #285 and #286 (the Suite pins their commits; the merge was refused to this session as unreviewed); deploy `petro-scan-read`; Bateman-Konen 150/300 F chart readings; the equation page check. PETRO-U1-028 decided: the workstation stays desktop-first at 390 px (readable, no page scroll).

## 2026-10-02: the well datum model (WDM U2-007, PR #848)

Depth columns, exports, the report header, zone thickness and saturation
height take the well's depth frame from `src/lib/wellDatum.js`. On a well with
no reference elevation TVDSS is empty with the reason (exports, the depth
note) and saturation height is refused (it is measured from the free-water
level in TVDSS); MD and TVD are unaffected.

## 2026-10-04: depth density bin box keeps a typed decimal (fix/shared-unit-draft)

The Depth bin box re-rendered the stored metres rounded on every key, so
"2." showed as "2", "0.5" could not be started and "13.7" was stored as
137. It uses the shared `src/hooks/useUnitDraft.js` now; text that is not
a positive number yet stores nothing. Gate:
`__tests__/depthBinTyping.test.jsx` (7 tests, all failed on the old code).

## 2026-10-07: fixes from the user manual (PETRO-M-001 to 008)

The user manual (`/root/PetrophysicsStudio-UserManual-20261007.docx`) was
written against the code, and the type-well numbers in it came from running
the app's own services. That work found the defects below; the owner asked
for them fixed, along with any further upgrades found on the way.

| ID | Severity | Defect | Fix | Gate |
|---|---|---|---|---|
| M-001 | S2 | Probabilistic zone outcomes ignored the zone's overrides (cutoffs, Sw model): SAND B with cutSw 0.7 read 10.5 m on the card, 5.5 m in the run | engines #340: the zone sums use the zone's merged set (vendored f5bfcfd) | engines gate 2b, with a negative control; gate 2 had encoded the bug |
| M-002 | S2 | A zone override froze a varied parameter in that zone (Q10 = Q50 = Q90) | engines #340: the zone keeps its own value and moves with the draw (a ratio for scale parameters such as Rw, an offset for the rest) | engines gate 2c and its control; the u2011 reference updated |
| M-003 | S2 | The default Low case raised GR clean, so it read less Vsh than Mid | The clean line now moves down in Low and up in High; comment corrected (a lighter matrix, fresher water) | `scenarios.test.js`: sample by sample, Low is never below Mid and High never above |
| M-004 | S2 | Pickett and Hingle Apply kept the previous Rw tool's label. With the temperature model on, the zone's Rw (already at formation temperature) kept the old reference temperature, so it was corrected twice (Sw optimistic) | Apply records `pickett` or `hingle`, and sets `rwRefTempC` to the water zone's temperature | `waterLineApply.test.jsx` |
| M-005 | S3 | Depth boxes read metres in a feet session: the Pickett and Hingle water zone, the depth-shift tie table and messages, and the block shift | Typed and shown in the session unit, stored in metres; a blur with no edit no longer moves a tie by the display rounding | `waterLineApply`, `depthShiftPanel`, `conditioningNormFit` tests, each with a metres-in-feet negative control |
| M-006 | S2 | The histogram normalization fit (overlay mapped onto the open well) was prefilled on whichever well was open | Offered only on the fitted well; elsewhere the dialog names the well to open; the prefill refreshes each time the dialog opens | `conditioningNormFit.test.jsx` |
| M-007 | S3 | Scenario zone summaries took no vertical thickness (TVT = MD on deviated wells) | `scenarioSummaries(..., { vth })` from the workstation | `scenarios.test.js` and its control |
| M-008 | S3 | A batch run ignored the open well's explorer curve picks, and under porosity source 'mineral' ran without the mineral model | The picks apply to the open well. Each well runs the interpretation's mineral model, or reports why it cannot | `batchZones.test.jsx` |

Help and copy now match the code:
- PEF is read by the mineral model;
- the full ribbon list, and the Depth shift view;
- PNG export from Split as well;
- four dock panels;
- depth-track checkboxes (MD, TVD, TVDSS) in place of an MD/TVD toggle;
- Sw averages are pore-volume weighted (help and export note);
- Publish writes SWT, not BVW;
- the k track is kept with a note;
- interpretations belong to the user;
- histogram markers at the 10th, 50th and 90th percentiles;
- PHIT is in the histogram list;
- stretch and squeeze lives in the Depth shift view;
- split runs agree to rounding in the zone sums.

The STATUS G2.3 row and the e2e header now read SAND B 5.5 m (the goldens).

## 2026-10-08: water-line fits leave shaly samples out (demo videos)

Found on the Ekene demo data while preparing the AI-narrated demo videos.
Ekene-1's water leg (5118 to 5184 ft MD, truth m 2 and Rw 0.0775 ohm·m at
182 degF) holds shale beds. The Pickett fit regressed every sample in the
typed window and returned m 0.610, a·Rw 0.708; the shales' low porosity and
low resistivity flattened the line.

- Engines PR #341 (vendored at 3e1f868): `pickettFitDepthWindow` and
  `hingleFitDepthWindow` take an optional Vsh curve and clean-sand limit,
  leave samples above the limit out and count them (`nWindow`, `nShaly`).
- Crossplots: a **Clean if Vsh ≤** box on Pickett and Hingle, default 0.10,
  saved with the crossplot config; the result reads "· N shaly left out".
  Blank fits every sample.
- Ekene-1 with the default: m 1.843, a·Rw 0.0916 (high by clay
  conductivity, as the demo kit documents).
- Tests: engine gates (synthetic Archie sand with shale beds, negative
  control with the shales in) and `pickettCleanFilter.test.jsx`.
- Help guide: the step and the fitting paragraph describe the limit and use
  the session depth unit.

## 2026-10-08: Rw tools and Low, mid, high in the session's units

Found while preparing the demo videos (oilfield session, feet).

- **Rw tools**: temperatures are typed and shown in °F in a field session
  (°C in SI); the applied reference temperature stays in °C. With no
  temperature model the current Rw is at formation temperature, so the
  implied salinity is read at the formation temperature typed in the
  salinity card. It used to read the stored 25 °C reference: Ekene-1's
  Pickett Rw of 0.092 ohm·m showed "about 74,100 ppm"; at 182 °F it is
  about 29,000 ppm.
- **Low, mid, high**: slowness, temperatures and the BHT depth show in the
  session's system (it showed °C, m and µs/m in an oilfield session); a value
  typed in field units is applied in engine units. Same pattern as the zone
  parameter table (PETRO-U2-002).
- **Probabilistic**: the parameter labels, the Current column and the
  distribution values show in the session's system; the run and the saved
  spec are SI (`specToDisplay` / `specFromDisplay`; a standard deviation
  takes the scale only).
- Tests: three new Rw tools cases (with an SI negative control),
  `scenariosFieldUnits.test.jsx` and `probabilisticFieldUnits.test.js`.

## 2026-10-08: crossplot colours that carry information

Owner review of the demo videos: people respond to bright colours, and
better still when the colour means something.

- Crossplots colour by shale volume by default when it is computed and no
  facies are drawn (a saved choice wins): on a Pickett plot the clean sand
  and the shale separate at a glance.
- A **Colours** picker (Turbo, Viridis, Plasma, Magma, Jet), Turbo by
  default, saved with the crossplot config. Turbo added to the shared colour
  maps (Mikhailov 2019 polynomial), so the mapping studio lists it too.
- Depth colouring reads in the session's unit (it said "Depth (m MD)" in a
  feet session); friendlier labels (Vsh, φe, Sw).
- Test: `crossplotColour.test.jsx` (default, saved choice negative control,
  map ordering).
## 2026-10-08: Borehole QC layout

For the log quality control lesson: a built-in **Borehole QC** track layout
(GR, caliper, DRHO with |DRHO| above 0.05 g/cc shaded, density-neutron,
deep resistivity), so washouts and the readings they spoil sit side by side.
Existing saved layouts gain it through the normal built-in migration. Tests:
layout.test.js (tracks, the 0.05 threshold, a well without CAL/DRHO drops
those tracks); the two e2e template counts are now 4 built-ins plus a fork.

## 2026-10-08: Lessons, Module B (shale and lithology)

Storyboards `tools/demo-video/storyboards/lessons/petro-b5..b7.mjs` on Ekene-1
(kit v2, feet): B5 shale volume (histogram end points, calibrated 18/125, five
Vsh models; Ekene Sand linear 0.205 against truth 0.203, Larionov Tertiary
0.063), B6 lithology (density-neutron crossplot coloured by Vsh then PEF; the
PEF, caliper and DRHO colour options came in #940), B7 gas effect (Oboro Sand
φe density 0.221, neutron-density gas form 0.200, truth 0.195; the shaly
Ekene oil sand reads 0.228 with the same form). Every spoken figure is
asserted on screen with `expectText`. Rendered to /root/demo-videos/lesson-b5..b7.

## 2026-10-08: Wyllie compaction factor (Bcp)

Vendors engines 1367f9c (PR #342): `sonicCp` passes through computeWell to the
time average (default 1, results unchanged). The parameter panel gains
"Bcp (compaction)" under Wyllie, and a QC hint suggests shale Δt / 100 when
porosity comes from sonic and the well's shales read slower than 100 µs/ft
(Hilchie 1978). For the sonic porosity lesson on Ekene-9, whose sands carry a
compaction factor of 1.45 by design. Tests: engine (default overreads by Bcp,
Bcp recovers porosity, RHG unaffected, < 1 refused); paramQc (hint, no hint at
the suggested value, RHG or density, error below 1).
