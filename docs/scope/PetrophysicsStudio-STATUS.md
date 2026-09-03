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
| G2.3 workstation core | **DONE** | this branch — workstation on the shared shell, canvas TrackViewer (zoom/pan/crosshair, zone bands, tops), draft-and-apply ParameterPanel, ZoneManager w/ live oracle-verified summaries, engine/pipeline.js, /dev/petrophysics-studio harness seeded with the analytic type well; e2e asserts the ORACLE numbers off the UI (SAND A net 18.0 m, SAND B 2.5 m) |
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
- Bateman-Konen Rwe→Rw is deliberately OUT of v1 (no verifiable open
  source for the coefficients); the SP chain is the documented
  quicklook approximation.
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
