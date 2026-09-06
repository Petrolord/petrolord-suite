# Well Correlation — STATUS

Plan of record: docs/scope/WellCorrelation-PLAN.md (**approved as
drafted 2026-07-13**, all four §7 questions confirmed). Roadmap slot:
Geoscience-ROADMAP.md Phase G3. Slug `well-correlation` — **SHIPPED 2026-07-13, tile Active**. Phase G3
complete (G3.0–G3.3). Live at
`/dashboard/apps/geoscience/well-correlation`; the legacy
`well-correlation-tool` route redirects to it.

Production note: **RESOLVED 2026-07-14** — prod is current (source zip
from main `e84f8a181` uploaded to Hostinger); tile route and legacy
redirect are live on petrolord.com.

## Phase status

| Phase | Status | Landed |
|---|---|---|
| G3.0 section engine + goldens | **DONE** | PR #60 — engine/section.js (datum flattening, correlation lines, zone spans), deterministic 3-well sampleSection, 13 analytic tests, no-oracle rationale documented |
| G3.1 tops CRUD + section table + pentest | **DONE** | this branch — saveTop/updateTop/deleteTop/propagateTop in wellsRegistry; migration 20260713240000 **applied live**; pentest blocks 10–11 green |
| G3.2 cross-section workstation | **DONE** | this branch — CrossSection canvas (per-well GR tracks, correlation lines, zone fills, datum flattening, draggable top handles), map + list section-path picker, datum/tops/zone/propagate controls, /dev/well-correlation harness on the 3-well section; 20 jest + e2e (order 3, drag Top Dome, flatten, propagate) |
| G3.3 cross-app + close-out | **DONE** | this branch — cross-app smoke (a correlation top is returned by Seismolord's exact embed); 76-file orphaned cluster + WellCorrelationProvider deleted; app page + route; tile Active (migration 20260713250000, **applied live**); legacy slug redirects |

## Key facts

- Registry-native: wells/curves/tops/zones via `src/lib/wellsRegistry.js`
  (G1/G2 tables). **Tops picked here are `geo_wells_tops` rows** — edits
  reach Seismolord well-ties and G4 Mapping with no re-import (the G3
  acceptance criterion).
- Per-top writes are owner-only via the existing `geo_wells_tops` RLS
  (no policy change); 0-row writes surface as owner-only errors. Section
  state is owner-only in `geo_correlation_sections`.
- Datum flattening is exact closed-form arithmetic — validated by
  analytic jest cases, not a Python oracle (see
  src/pages/apps/WellCorrelation/services/README.md).
- Top propagation v1 is MANUAL (same-MD seed + user drag); auto-
  correlation is out of v1 scope.

## 2026-09-03: PT0 groundwork

`CrossSection` accepts a controlled `view`/`onViewChange` (for the PT5
depth navigator) and uses the shared `depthNavMath` zoom/pan, which adds
data-extent clamping to the wheel and pan. Tops will share the
`src/components/wells/topColors.js` palette from PT3.

## 2026-09-03: tops are also edited in Petrophysics Studio (PT3)

Petrophysics now creates, moves, renames and deletes `geo_wells_tops`
rows on own wells (same rows this app draws and propagates). Reload a
section to see changes made there. Top colours come from the shared
`topColors.js` palette from PT5 onwards.

## 2026-09-03: depth navigator and shared top colours (PT5)

The section gets the same DepthNavigator strip as Petrophysics (drag to
scroll, handles to rescale, wheel, double-click fit) and its top colours
now come from `src/components/wells/topColors.js`, so a top has the same
hue here (dark variant) and in Petrophysics.

## 2026-09-03: cross-app navigation (WC series, wave 0)

Petrel testers take this app on 2026-09-04; the WC series
(`/root/.claude/plans/kind-sniffing-frog.md`, waves 0 to 4) brings it up
to the Petrophysics Studio tester fixes and Petrel Well Section Window
expectations. Wave 0:

- Ribbon starts with the shared `ModuleHomeLink` to the Geoscience
  dashboard (`corr-home`).
- `?wells=<id,id,...>` (from Well Data Manager's "Open in" launcher or
  Petrophysics' "Open in Well Correlation") appends those wells to the
  section after any saved section is restored; unknown ids are skipped
  and reported.
- Own wells in the ordered list link to Well Data Manager on the tops
  tab (`corr-edit-well-data-<name>`), the Petrophysics parity link.
- e2e: `well-correlation.spec.js` "cross-app" test.

## WC series (Petrel tester readiness, 2026-09-03)

Petrel-expert testers take this app on 2026-09-04. The PT series fixed
their Petrophysics findings inside Petrophysics Studio; this app would
have re-triggered most of them on the first click (dark GR-only strip,
four GR aliases, metres MD only, tops created by typing an MD, one zone
band, no export). Plan of record: `/root/.claude/plans/kind-sniffing-frog.md`.

| Wave | PR | What |
|---|---|---|
| 0 navigation | #375 | Geoscience home link in every Geoscience ribbon; Well Data Manager "Open in" launchers; `?well=` / `?wells=` deep links; reverse links; white Well Data Manager log tracks |
| 1 shared painter | #376 | Petrophysics viewer modules moved to `src/components/wells` with shims; `trackPainter.js` extracted from TrackViewer; Field view gains fills |
| 2 multi-track section | this PR | everything below |
| 3 follow-ups | later | named sections, tops/zones CSV with MD/TVD/TVDSS, ghost curve, horizon flattening, TWT reference, fixed-width columns with horizontal scroll under proportional spacing, upstream `sectionFrame.js` to petrolord-engines, legacy doc cleanup |

**The section now (wave 2).**
- One real multi-track column per well from the active layout template
  (`src/components/wells/layout`), resolved against every curve of the
  well through the Petrophysics curves cache and alias table, so GR,
  resistivity (log scale), density-neutron with the standard gas/shale
  crossover, the lithology quicklook ramp and GR cut-off, and any raw
  mnemonic (`log:<MNEMONIC>`) all draw. Parameter-bound fills read fixed
  values (`CORR_PARAMS`: GR clean 30, clay 120, porosity 0.08, Vsh 0.4,
  Sw 0.6). Template picker and the shared track layout editor sit in the
  dock; the layout persists in `geo_correlation_sections.track_layout`
  with unit, reference, spacing, zone mode and shown tops (no migration,
  the column existed unused).
- White printed-log palette, header scale rows, synchronized crosshair
  with per-track readouts and each well's own MD (and TVDSS) at the
  cursor, m or ft display.
- Depth reference MD, TVD or TVDSS plotted (not label-swapped) through
  the registry depth frame (`welldata/checkshots.js makeDepthFrame`); tops
  and the datum follow. A well whose reference is not monotonic (a
  horizontal reach) falls back to MD and says so in its header.
- Spacing equal or proportional to surface distance along the path, the
  distance printed in each gap.
- Tops: dragged on the right-edge name tag, picked by click with the
  shared name popover, renamed and deleted from the tops list (every own
  well carrying the name; shared wells stay and the status says so),
  propagated as before, reloaded on demand after edits in Petrophysics
  or Well Data Manager. Same `geo_wells_tops` rows, owner-only.
- Zones: bands between consecutive shown tops (coloured by the upper
  top), one chosen pair, or none.
- PNG export of the section with the title band and watermark.
- Geometry: `engine/sectionFrame.js` (pure, analytic tests) beside the
  untouched vendored `engine/section.js`; the sample section carries RT,
  RHOB and NPHI and KETA-2 builds 0 to 30 degrees below 1400 m.
- e2e reads geometry from the section's data attributes
  (`data-axis-w`, `data-plot-top`, `data-plot-h`, `data-col-x`,
  `data-col-w`, `data-view-top/base`) instead of hard-coded constants.

**Known limits.** Proportional spacing narrows columns to 70% of the
equal width, so four-track templates get tight on three or more wells
(fixed-width columns with horizontal scroll are a follow-up). Rename and
delete act by name across the section's own wells, not per well (drag
for per-well edits). TVD-referenced picks on an uphill well are refused
with a message.

## 2026-09-05: Map this top (Mapping MS4)
Each top row in the dock carries a map icon (`corr-map-top-<name>`)
linking to Mapping & Surface Studio with the top and the section wells
that carry it (`mapTopHref`); the map grids it in TVDSS on arrival.
`CorrelationWorkstation` takes `mappingPath` (harness:
`/dev/mapping-surface-studio`).
