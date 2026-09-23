# Seismolord: Tops to Horizons (well-driven horizon framework and automatic fault picking)

Plan of record. Owner idea and authority 2026-09-23 ("make meaningful decisions on my behalf at decision gates, merge PRs, continue to the end"). Status: BUILT, see "Delivered" at the end.

## Context
The owner's idea: in a field that already has wells with formation tops, the
interpreter spends days tying each top to a seismic event at every well, deciding
which event to map, then tracking and naming horizons. Seismolord should do that
matching, picking and naming automatically. The owner also named the known failure
modes:
- **Thin intervals:** tops too close together to each have their own event (today
  the fix is a manual bulk shift).
- **Faults:** amplitude-following trackers lose the horizon across faults because
  they "do not do real geology".

The goal is not a black-box autotracker. It is an **assistant that proposes a
complete, named, well-tied horizon framework with a confidence and a reason for
every decision**, which the interpreter reviews and accepts. It should also go
further than the idea in four ways:
- **Faults:** the whole framework of horizons is used to carry picks across faults
  (the geology), not just one horizon's amplitude.
- **Accuracy:** a leave-one-well-out score says how good the framework actually is.
- **Depth:** the accepted framework feeds straight into depth conversion and the
  shared surfaces registry.
- **New wells:** the same machinery predicts the tops of a planned well
  (prognosis).

### What already exists (exploration)
- **Tops:**
  - `geo_wells_tops` holds `name`, `md_m`, and the ST0 typed fields
    (`surface_type` incl. SU/unconformity, `unit_id`, `confidence`, `age_ma`,
    `hiatus_to_ma`).
  - The ordered column is in `geo_strat_units`, with `orderedUnits` in
    `engines/stratigraphy/column.js:76`.
  - Seismolord currently strips tops to `{name, md}` (`services/wellsService.js:27`
    `legacyTops`).
- **Time-depth:**
  - `makeTvdssToTwt` (`engine/wellSection.js:36`) uses checkshots, else the
    velocity model.
  - `buildWellLatticePath` (`wellSection.js:104`) already gives every top's
    (il, xl, fractional TWT sample) along a deviated path.
  - `effectiveCheckshots` (`services/wellsService.js:86`) returns the tie-derived
    set in preference to the imported one.
- **Tie tools, all one well at a time, anchors placed by hand in
  `SyntheticsPanel.jsx`:**
  - Synthetics: `buildSynthetic` / `reflectivity` / `extractStatisticalWavelet` /
    `suggestBulkShift` (`synthetics.js`).
  - Phase and QC: `estimatePhaseRotation` / `windowedTieQc` / `makeTieWarp`
    (`tieWarp.js`).
- **Velocity calibration:** `buildTiePoints` / `fitWellTie` (`wellTie.js:87,184`).
  Its top-to-horizon pairings are chosen by hand and never saved
  (`WellTiePanel.jsx:32`).
- **Tracking:**
  - `snapPick` (peak / trough / zero_pos / zero_neg, sub-sample), `correlatePick`
    (NCC), `regionGrow3D` (`horizonTrack.js:156,82,291`).
  - `regionGrow3D` already takes `opts.seeds` (multi-seed), `initialPicks` and
    `barriers`.
  - It runs in `workers/horizon.worker.js` through `services/trackerRunner.js`.
- **Faults:**
  - Fault barriers are built at one time level only and are off by default:
    `barriersFromFaults` (`lib/faultObjectsExport.js:113`).
  - `buildFaultBlocks` / `labelBlocks` (`faultBarriers.js:183,152`).
  - Throw is computed but used only for export: `horizonFaultCutoff` gives
    throw / heave (`faultObjects.js:184`), and `faultHorizonIntersection` does
    too (:270).
- **Saving:**
  - `saveHorizon` (`services/horizonsService.js:40`) writes a `seismic_horizons`
    row. Its `params` jsonb has no link to a top.
  - Undo is `pushNewHorizonUndo` (ViewerPanel ~2019).
- **Downstream:**
  - `makeSurfaceFromHorizon` (`services/makeSurface.js`, fault-block aware
    gridding) writes to `geo_surfaces`.
  - `makeDepthConverter` (`velocityModel.js:187`) does depth conversion.
- **Gaps:**
  - No top-to-event matching.
  - No saved top ↔ horizon link.
  - The UI never uses multi-seed tracking.
  - No per-top trace along a deviated path.
  - No field-wide batch tie.
  - No mistie table between tops and horizons.
  - No tracking across faults.

## The workflow the interpreter sees
1. **Open:** in a volume, open **Tops to Horizons**. It lists the field's wells,
   their tops in stratigraphic order (from the column, else by MD), and each
   well's time source and tie quality.
2. **Tie the field in one pass:**
   - Each well with a sonic and density gets an automatic synthetic, a bulk shift,
     a phase estimate and a correlation score.
   - Wells without logs use their checkshots or the velocity model, with a wider
     uncertainty.
   - One field polarity and phase convention is inferred from all wells and shown.
3. **Review board:** a grid of tops × wells. Each cell shows:
   - the proposed event (peak, trough or zero crossing), its TWT and a score;
   - a thumbnail of the well's traces with the top, the candidates and the
     synthetic.
   Tops that can't be resolved are grouped and flagged as "below tuning:
   11 m apart, tuning ≈ 18 m". One click changes a choice, and the rest of that
   top's row re-scores.
4. **Accept:** for each accepted top, one multi-seed 3D track is seeded at every
   well, and the horizon is named after the top.
   - Horizons are tracked in stratigraphic order, most reliable first. Each one
     is bounded by the horizons already tracked, so they never cross.
   - Each horizon gets a confidence map.
   - Unresolvable tops become **conformable horizons**: the mapped neighbour plus
     an isochron gridded from the wells (the bulk shift, made consistent across
     the field).
5. **Faults:**
   - Faults are picked automatically first (TP3F): a fault-likelihood volume
     gives proposed fault sticks and surfaces, which are reviewed like horizons.
   - Fault blocks that contain a well are seeded by that well.
   - Blocks without a well are reached by a **fault jump**: the throw is chosen by
     correlating the character of the whole framework across the fault. It must
     match the fault's sense of movement and change smoothly with depth.
   - Jumped picks are flagged for review.
6. **QC:**
   - A mistie table of top vs horizon at every well, in time and after depth
     conversion.
   - A **leave-one-well-out** score: track without well W, then predict W's top.
     This gives an honest accuracy figure for each horizon.
7. **Downstream:**
   - One click calibrates the velocity model on the accepted pairings (the
     existing `fitWellTie`, now paired automatically).
   - It writes depth surfaces named after each top and unit to the shared
     registry.
   - For a planned well, the same machinery predicts its tops with an uncertainty
     band (prognosis).

Nothing is saved without Accept. Every automatic decision records why it was made
(scores, source, shift) in the horizon's `params`, so it can be audited and undone
(existing undo commands).

## Phases (engines first, validation first, per CLAUDE.md)

### TP0: Plan and validation data
- **Docs:** `docs/scope/Seismolord-TOPS-TO-HORIZONS-PLAN.md`, plus a
  Seismolord-STATUS entry.
- **Known-truth datasets:**
  - **Synthetic generator** (engines test-data): a layered model with thin beds
    below tuning, an unconformity, normal faults with known throw, and deviated
    wells with exact tops and checkshots. The oracle is exact by construction.
  - **One real public field with published horizons and well markers:** F3
    Netherlands (OpendTect) or Volve (Equinor). The licence must be checked before
    vendoring any file.
- **Gate:** each engine function below is tested against these datasets, with a
  negative control.

### TP1: Engine, matching tops to events (`engines/seismolord/topsToEvents.js`, new)
- `topTwtWithUncertainty(well, top, timeConv, tie)`: the top's TWT at its own
  (il, xl), taken along the deviated path. The uncertainty depends on the time
  source: tie-derived checkshots are tightest, then imported checkshots, then the
  model.
- `traceAtTop(getTrace, well, top)`: the trace at each top's own lattice cell,
  plus a small neighbourhood for lateral coherence.
- `candidateEvents(trace, twt, windowMs)`: every peak, trough and zero crossing in
  the window, via the existing `snapPick` primitives.
- `scoreCandidate`, combining:
  1. time closeness (Gaussian on the uncertainty);
  2. expected polarity from the synthetic's reflection coefficient at the top,
     under the field polarity convention;
  3. lateral coherence (NCC with neighbouring traces, `correlatePick`);
  4. amplitude strength relative to the trace RMS.
- `assignTops(wellTops, candidatesByTop)`: dynamic programming per well, so the
  chosen events keep the tops' order in time and never share an event. Then a
  field-wide vote so each top keeps one event type across wells.
- `resolutionGroups(tops, dominantFreqHz, intervalVel)`: tops closer than tuning
  (λ/4) are grouped. The group's representative is the stronger contrast; the
  others are marked `conformable`, with per-well offsets.
- Reuses `snapPick`, `correlatePick`, `buildWellLatticePath`, `makeTvdssToTwt`,
  `reflectivity`, and the stratigraphy `orderedUnits`.

### TP2: Engine plus Suite, field-wide automatic tie
- `autoTieWell` runs `buildSynthetic` → `suggestBulkShift` →
  `estimatePhaseRotation` → `windowedTieQc` in one pass per well. It returns the
  shift, phase, correlation and wavelet.
- `fieldTieConvention(ties)` infers one polarity and phase for the field and
  reports any well that disagrees.
- Suite: batch runner in `workers/synthetics.worker.js`, and `wellsService` stops
  stripping the typed top fields (a read-only change to `legacyTops` /
  `listWellsWithTops`).

### TP3: Suite, review board and framework tracking
- New `components/TopsToHorizonsPanel.jsx` (workspace dialog):
  - matrix of tops × wells, candidate thumbnails, score breakdown, overrides;
  - calls the engine through a worker so the UI stays responsive.
- `services/framework.js`:
  - tracks the accepted tops in stratigraphic order with `regionGrow3D`, using
    `opts.seeds` = one seed per well;
  - uses the horizon above and the horizon below as bounds (non-crossing,
    post-clip plus a barrier on violation);
  - saves through `saveHorizon`, with `params.source = 'well_tops'` plus
    `top_name`, `unit_id`, `seeds[]`, `scores`, `tie`;
  - wraps the whole accept in one undo entry (`pushNewHorizonUndo` per horizon,
    grouped).
- No DDL: the top ↔ horizon link lives in `seismic_horizons.params`. A proper
  link column would be a later, reviewed migration if other apps need to query it.

### TP3F: Automatic fault picking (before TP4, so tracking has faults to respect)
- **Engine: `faultDetect.js` (new)**
  - **Fault likelihood:** from the existing semblance variance
    (`discontinuity.js`). Smooth it along the local strike, then thin it with
    non-maximum suppression across strike, per time slice and per line, so each
    fault is one cell wide.
  - **Hysteresis threshold,** then 3D connected components with an orientation
    check. The result is fault patches with strike, dip and area. Tiny patches
    and noise are dropped by minimum-area and minimum-height rules.
  - **Patch to sticks:** on every Nth line across the strike, the patch's trace
    becomes a polyline (il, xl, s), in the same shape as `seismic_faults.sticks`.
    Surfaces are lofted with the existing `loftFaultSurface`.
- **Suite**
  - Runs as a neighbourhood job through `runNeighborhoodJob` /
    `volumeJob.worker`, with progress and cancel.
  - Saves a fault-likelihood attribute volume, so it can be viewed and checked.
  - Proposed faults are saved through `saveFault`, with `source: 'auto'`, a
    confidence, and the patch statistics.
  - A review list lets the interpreter accept, merge, split or delete. Faults
    stay editable with the existing stick tools and undo.
- **Throw:** once horizons exist, `horizonFaultCutoff` gives each accepted fault
  its throw and its sense (normal or reverse), which TP4 uses.
- **Gates:** synthetic volume with known fault planes. Fault location must be
  within 2 cells, and strike and dip within tolerance. Precision and recall are
  reported. Negative control: an unfaulted volume must propose no faults above
  the confidence floor.

### TP4: Faults that behave like geology
- Barriers per horizon at the horizon's own local time level:
  `barriersFromFaults` evaluated along a coarse first pass, not at the seed's
  single level. Barriers turn on automatically when faults exist.
- Seeding by fault block: blocks with a well are seeded from that well
  (`buildFaultBlocks`).
- `faultJump` (engine, new `faultJump.js`), for blocks without a well:
  - candidate throws come from the cutoffs of horizons already carried across the
    same fault (`horizonFaultCutoff`);
  - each candidate is scored by the NCC of a multi-horizon vertical window across
    the fault;
  - the throw must have the fault's sense (normal / reverse from the dip and the
    other horizons) and change smoothly with depth and along strike;
  - jumped picks carry a separate confidence flag.

### TP5: Thin beds, QC and accuracy
- Conformable horizons for grouped tops: an isochron from the well offsets,
  gridded with the existing gridding (`src/lib/gridding`), added to the
  representative horizon, and labelled as derived.
- Mistie table (tops vs horizons, in time and depth). Leave-one-well-out
  validation, reported per horizon and per well.

### TP6: Depth, registry and prognosis
- Automatic pairings go into `buildTiePoints` / `fitWellTie`, then the calibrated
  model, then `makeSurfaceFromHorizon` into `geo_surfaces`, named after the top
  and unit.
- `predictTops(plannedWell)`: the horizons plus the velocity model give the
  predicted MD / TVDSS of each top, with a band from the mistie statistics.

## Honest limits (stated in the UI and the docs)
- **Too few wells:** with one or two wells, event choice rests on the tie and on
  polarity. The board says so, and the leave-one-well-out score is unavailable.
- **Poor data:** below-tuning tops and poor data (multiples, noise) are flagged,
  never forced.
- **Fault jumps:** a jump is a proposal with a confidence, not an answer.
  Interpreter review is required for blocks with no well.
- **Scope:** there is no machine-learning model in this plan. It is explainable
  scoring built on existing, tested engine functions. ML (for example fault
  likelihood) is a possible later layer.

## Verification
- **Engine gates (engines repo, jest), on the synthetic generator's exact truth:**
  - correct event per top;
  - order preserved;
  - tuning groups found;
  - fault throw recovered within one sample;
  - negative controls (wrong polarity, shuffled tops, a fault with the opposite
    sense) must fail.
- **Real data:** on F3 or Volve, the auto-picked horizons are compared against
  the published interpretation (mean and P90 time difference). The
  leave-one-well-out error is reported.
- **Suite:**
  - jest for `framework.js` (non-crossing, naming, `params` link, grouped undo);
  - Playwright on the synthetic volume: open the board, Accept, get N named
    horizons with confidence, then a mistie table;
  - `vite build`; the no-undef lint check on Seismolord; the vendored-engines
    check.
- **Owner staging walk:** a real field with tops, compared against their manual
  interpretation.

## Critical files
- **New:**
  - `packages/engines/engines/seismolord/topsToEvents.js`, `faultJump.js`
    (engines repo first, then re-vendored)
  - `src/pages/apps/Seismolord/components/TopsToHorizonsPanel.jsx`
  - `services/framework.js`
- **Changed:**
  - `services/wellsService.js` (typed tops)
  - `workers/synthetics.worker.js` (batch tie)
  - `components/ViewerPanel.jsx` (wiring, multi-seed `runTracker`)
  - `lib/faultObjectsExport.js` (per-horizon barriers)
  - `components/WellTiePanel.jsx` (automatic pairings)
  - `docs/scope/Seismolord-STATUS.md`


## Decisions taken under the owner's authority (2026-09-23)

1. **No DDL.** The top to horizon link lives in `seismic_horizons.params` (`source: 'well_tops'`, `top_name`, `role`, `representative`, `seeds`, `jumps`, `stats`, `lowo`, `tie_convention`); automatic faults in `seismic_faults.params` (`source: 'auto'`, `confidence`, `stats`, `aoi`). A real link column waits until another app needs to query it (a shared-table change needs a second engineer).
2. **Typed tops reach Seismolord read-only.** `listWellsWithTops` selects the ST0 columns (`surface_type`, `unit_id`, `confidence`), applied since 2026-09-06; other apps see optional extra keys.
3. **Stratigraphic order:** the column (`geo_strat_units` through `orderedUnits`) where tops carry a unit, else the mean MD across wells.
4. **Time uncertainty by source:** tie-derived 4 ms, checkshots 8 ms, velocity model 24 ms (1 sigma).
5. **Tuning:** 1 / (2.31 fp) from the data's own peak frequency (Kallweit and Wood). A pair is grouped field-wide when tuned at the majority of wells where both exist; a local pinch-out is flagged at that well and its seed dropped when other wells can seed the top.
6. **Tuned-group representative** is judged at 1 sample (its composite event is physically biased by the doublet); isolated tops at 0.5 sample.
7. **Well tie:** shift and constant phase are searched jointly (a quarter-period shift no longer hides a 90 degree wavelet); polarity is the phase's half-plane; ties rated poor do not vote.
8. **Automatic fault picking runs on an area of interest** capped at 24 million samples (the likelihood lives in memory, about 12 bytes a sample: about 290 MB). The default area is the wells' box plus 30 cells and 60 samples, shrunk to fit.
9. **Fault jump:** pairs 5 to 9 cells either side of the barrier along the dip direction (a window beside a dipping fault straddles it), a +-20 sample window, the fault's sense (hanging wall on the dip side, down for a normal fault), a gentle prior from the same fault's throw on other horizons, accepted at mean correlation 0.3 with a 0.05 margin over any distinct throw.
10. **Leave-one-well-out** is on by default up to 250,000 traces (it re-tracks each horizon once per well); a toggle otherwise.
11. **Undo:** each saved horizon is its own undo entry (the viewer's existing create command).
12. **Synthetic truth uses rigid-body faults.** The first generator displaced each interface on its own, which put false time steps on deeper horizons under every shallower fault cut; the hanging wall now moves as one block and interfaces in the gap are cut out.
13. **Real-data validation deferred:** F3 or Volve were not vendored (licence check and a multi-GB download); the gates run on exact synthetic truth, and the owner's staging walk on a real field is the real-data check.
14. **Velocity calibration** pairs each top with the horizon made from it automatically in the Well Tie panel (mapped horizons only; the interpreter's own choice wins).

## Delivered (2026-09-23)

Engines (Petrolord/petrolord-engines): #239 (syntheticField, topsToEvents, autoTie) and #240 (faultDetect, framework, faultJump, rigid-body synthetic faults), both merged; vendored at e93a16d.

Suite: `services/topsToHorizonsPipeline.js` (runFieldMatch, runFrameworkTrack, runFaultDetect, applyChoices, defaultAoi), `workers/framework.worker.js`, `services/frameworkRunner.js`, `services/topsToHorizons.js` (wells, logs, order, saving), `components/workspace/dialogs/TopsToHorizonsDialog.jsx` (Interpretation ribbon: Tops to horizons), `WellTiePanel` automatic pairs.

Measured on the synthetic truth (70 x 60 x 420, 4 ms, 30 Hz, five wells, one deviated):
- every mapped top on its true event within 0.5 sample at every well (1 for the tuned representative); a 10 ms bad tie and 10 percent noise recovered;
- ties recover a 12 ms checkshot error, reversed and 90 degree volumes recognised;
- automatic faults: 98.8 percent of stick points within 2 cells of the true plane, recall 1.0, strike within 0.5 degrees, crossing faults kept apart, nothing in unfaulted data (clean or noisy);
- tracked horizons above 97 percent within a sample outside tuned cells, no crossing, the thin bed within 1.5 samples, misties and leave-one-well-out under a sample; detected faults work as barriers as well as the true fault;
- a hanging wall no well reaches filled on the true horizon (above 95 percent) with the right throw.

Open: fault picking in noisy data (signal to noise 3 to 6) misses the fault at default thresholds (amplitude-weighted variance is the likely fix); real-field validation (owner staging walk); prognosis for a planned well without checkshots uses the nearest well's relation when there is no velocity model.
