# Decline Curve Analysis — status

App: `src/pages/apps/DeclineCurveAnalysis.jsx` (Reservoir module), on the
shared Studio shell since W5. Context: `src/contexts/DeclineCurveContext.jsx`;
panels in `src/components/declineCurve/`; engine vendored at
`packages/engines/engines/dca/` behind the `src/utils/declineCurve/dcaEngine.js`
shim (edits to engine math go to Petrolord/petrolord-engines, not here).

## History (pointers)

- Original DCA layout was the template the Studio kit (W1) was generalized
  from; the app re-adopted the kit in W5.
- Engine extraction runway step: Arps/MC/type-curve/rollup math moved to
  @petrolord/engines (Suite PR #165), oracle + literature gates in
  `src/utils/declineCurve/__tests__/`.
- Multi-stream fix PR #169 (prod 2026-08-14): gas/water tabs no longer
  silently fit the oil stream.

## Bugfix round 2026-08-14 (user-reported production issues)

All five reported issues traced and fixed, plus several discovered en route:

1. **"Phase 1 confidence intervals required for probabilistic mode"** —
   dev-phase jargon shown whenever a fit carries no usable confidence
   intervals (common on noisy gas/water fits: the engine's delta-method CI
   reasonableness check flags them off). Reworded to plain user copy in
   `DCAForecastEngine.jsx`; behavior (switch disabled) unchanged.
2. **Chart clipped when KPI cards grow** — the analysis main column was a
   fixed-height flex with `overflow-hidden` downstream, so the 10-card
   probabilistic KPI grid squeezed the plot below its 400px minimum and the
   card's own `overflow-hidden` cut off the axis/legend (also truncating the
   PNG export, which captures that element). Main column now scrolls
   (`overflow-y-auto`) with a guaranteed `min-h-[480px]` chart region; PNG
   export uses scrollWidth/scrollHeight + white background + 2x scale.
3. **P10/P50/P90 one color** — the envelope boundaries reused the stream
   forecast color. STREAM_PALETTES in `src/utils/chartTheme.js` now carries
   per-stream `p10`/`p90` roles (oil/water: fuchsia-700/rose-800; gas:
   cyan-600/rose-800), validated all-pairs for CVD + normal-vision
   separation against each stream's existing hues on the white surface.
   KPI cards and Forecast Results cards use distinct accents too
   (P10 emerald / P50 sky / P90 amber on the dark cards).
4. **Fit succeeds (R² 99%+) but chart doesn't update** — with a fit window
   narrower than the data, points before the window get model t < 0, the
   engine returns rate 0, and a single 0 on the default log axis produced an
   invalid SVG path that killed the entire fitted line. `DCABasePlots` now
   nulls fitted values for t < 0 and log-guards every plotted series
   (history/forecast/p10/p90) so log scale gaps instead of dying.
5. **Add well silently does nothing** — `addWell` wrote the well into the
   context `wells` dict, but the selector listed `currentProject.wellIds`,
   which nothing ever populated, so new wells never appeared. Selector now
   lists from the `wells` dict (which is exactly the open project's wells);
   `addWell` notifies on success and on the no-project case; the dialog's
   Add button disables on empty names and Enter submits.

Discovered and fixed in the same pass:

- **Forecast Results bottom panel was dead** — it read
  `streamState[..].probabilisticResults` and `.data`, keys that are never
  written (`runForecast` stores `forecastResults.probabilistic` and
  `.rates`), so the forecast table, CSV export, P10/50/90 EUR cards and the
  EUR distribution histogram never rendered. Keys corrected; the table's
  cumulative column read `row.cum` vs the engine's `cumulative` (fixed, and
  `exportForecastToCSV` accepts both row shapes).
- **"undefined fit completed"** — `getFitQuality` returns `{tier}` but the
  context read `quality.label`/`quality.level`. Now uses `tier` mapped to a
  notification level, and a no-converge stub result (`modelType 'None'`,
  qi 0) is reported as a failure instead of a "fit".
- **Unimplemented "Segmented (Hyp-Exp)" model option removed** — the engine
  has no Segmented branch, so selecting it always produced the dead stub fit.
  Re-add only alongside real segmented fitting
  (`src/utils/dcaSegmentDetection.js` exists but is not wired; the
  DCASegmentsPanel gotcha of reading a never-populated productionData shape
  still stands).
- **Gas units** — KPI cards showed bbl/d / bbl for gas; now Mscf/d / Mscf
  consistently (chart Y-axis already said Mscf/d).

Verification: jest dca/declineCurve suites green (8 suites, 94 passed),
`npm run build` green, `/dev/dca` staging harness loads with no console
errors.

## Layout round 2026-08-14 (user-reported display limitations)

- **Single Well Analysis results now tabbed** — the middle column no longer
  splits vertically between the fit chart and the forecast results panel
  (each got about half the height, so both were cramped). The main area is
  now a Model Fit / Forecast Results tab pair (local `resultsTab` state in
  `DeclineCurveAnalysis.jsx`); each view gets the full column height. The
  StudioLayout `bottom` slot is no longer used by DCA;
  `DCAForecastResults.jsx` itself is unchanged.
- **Type Curve page scrolls** — the tab's content was locked to viewport
  height (`h-full` + `min-h-0` + `overflow-hidden` cards), clipping the
  stats row and the Apply To Well panel unless the user zoomed the browser
  out. The page wrapper is now `overflow-y-auto` and `DCATypeCurve.jsx`
  uses `min-h-full` so it grows past the viewport; the well-selection list
  keeps a 200px floor so its ScrollArea can't collapse now that card
  heights are content-driven.

Follow-ups in the same round (PR #179, merged 10956d0e1):

- **Recharts height gotcha** — `ResponsiveContainer height="100%"` resolves
  percentage heights, so it collapses to zero under a `min-h`-only ancestor
  chain. The Model Fit tab content is a definite `h-full` scroll column
  (the pre-tab structure, now inside the tab), and the Type Curve plot sits
  in an `absolute inset-0` wrapper within its card (card floor raised to
  480px to match the Model Fit chart). Keep any future chart under a
  definite-height or absolutely positioned ancestor.
- **EUR Distribution histogram full-size** — was a deliberate h-24
  sparkline (axes hidden) from the bottom-slot era; now h-64 with real
  X/Y axes (compact EUR bin ticks + run count) on chartTheme tokens.

Verification: DCA smoke test green, `npm run build` green, user confirmed
all three charts render on staging.

## Bugfix round 2026-08-26 (user-reported)

Three issues reported by the owner, all fixed:

1. **Oversized chart watermark** — the 2026-08-16 2.5x watermark enlargement
   (commit 7645705fb, `CHART_LOGO_STYLE` default 180px) spilled the logo into
   the plot area of every chart that drops `<ChartLogo />` bare (DCA,
   Petrophysics Crossplot, BasinFlow plots, RockPhysics panels, PorePressure,
   Risked Reserves). Default rolled back to 40px — the size MBAL's charts
   settled on — and the enlargement's companions rolled back with it
   (ChartFrame band default 96 → 40px, decision-tree TreeDiagram 96 → 40px).
   40px is now the suite-standard watermark size.
2. **"Scattered" chart after tab switches until refit** — Recharts mount
   animations freeze mid-interpolation when chart content remounts (in-app
   tab switch) or the browser tab is backgrounded (throttled rAF), leaving
   points at interpolated positions until the next data change (i.e. the next
   fit). The probabilistic overlays already disabled animation; now every
   series in the DCA charts does (`isAnimationActive={false}` on the
   Historical scatter, fitted/forecast lines, type-curve cloud, EUR
   histogram). Keep it false on any series added later.
3. **No undo for project/well deletion** — deletes are now recoverable via
   an Undo action on the toast (Studio kit extension: `addNotification`
   accepts `{ duration, action: { label, onClick } }`, backward compatible;
   `StudioNotifications` renders the button). Project delete removes the row
   from the DB only after the 10s undo window closes — Undo cancels the
   pending delete and reloads the untouched row, and a mid-window app close
   means the delete never lands (fails safe, project survives). Well delete
   holds the removed well in the Undo closure and restores it into state.
   The well Remove button also gained a confirm (it had none).

## Known gaps / next

- Segmented decline fitting: detection util exists, no engine branch, no UI.
- DCASegmentsPanel + DCAForecastSettings + DCAParametersPanel are unmounted
  legacy panels; prune or wire them deliberately.
- Probabilistic chart envelope is the analytic 1.28σ band from fit CIs; the
  Monte Carlo sample curves are computed but not plotted.

## 2026-08-27 — help guide refresh (branch `docs/reservoir-help-refresh`)

Guide was frozen at the W5 shell adoption (2026-07-18) while eight
feature and fix commits shipped through 2026-08-26. Corrected:

- **Removed the Keyboard Shortcuts panel.** It advertised Ctrl+S / Ctrl+Z
  / Ctrl+Y / Ctrl+E. None are wired: `useKeyboardShortcuts` is imported
  and never invoked, and `createUndoRedoManager()` is instantiated and
  never pushed to. Replaced with an accurate "Saving your work" panel
  covering autosave, the header save button and the ten-second undo
  toast on project and well deletion.
- **CSV section rewritten**: multi-stream files (`oilRate` / `gasRate` /
  `waterRate`) instead of the old two-column `date,rate` claim.
- Added: Production Stream selector, well metadata editor, the Model Fit
  vs Forecast Results tab split, the Forecast Results tab contents (EUR
  cards, forecast table, Export CSV, EUR histogram), well grouping, well
  filters, group rollup, and the Integration panel handoff to NPV &
  Economics and FDP Accelerator.
- 12 em dashes removed (owner copy rule).
