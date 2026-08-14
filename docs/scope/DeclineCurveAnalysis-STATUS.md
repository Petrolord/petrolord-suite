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

Verification: DCA smoke test green, `npm run build` green.

## Known gaps / next

- Segmented decline fitting: detection util exists, no engine branch, no UI.
- DCASegmentsPanel + DCAForecastSettings + DCAParametersPanel are unmounted
  legacy panels; prune or wire them deliberately.
- Probabilistic chart envelope is the analytic 1.28σ band from fit CIs; the
  Monte Carlo sample curves are computed but not plotted.
