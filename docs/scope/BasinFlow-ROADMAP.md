# Basin & Charge Modeling (BasinFlow Genesis), BF series (Petrel and PetroMod tester readiness, 2026-09)

Status: **planned 2026-09-06**, the next door after Pore Pressure Studio in
the Geoscience tester-readiness program (owner's standing instruction:
continue the waves from one Geoscience app to the next). Decisions are
v1 defaults the owner may override. The G7 build is BasinFlow-PLAN.md
and its state BasinFlow-STATUS.md.

## Why this app, and why now

The engines are oracle-locked (G7: decompaction, implicit heat,
Easy%Ro, kinetics, expulsion, erosion phantoms, piecewise heat flow,
byte-identical goldens, a full reference basin). What a PetroMod or
Petrel user meets is the shell around them, and a walk through it on
2026-09-06 found the shell far behind the engine:

| Area | Today | A tester expects |
|---|---|---|
| Erosion | The guided wizard's Erosion step is silently dropped before the run (the commit passes stratigraphy and heat flow only); Expert mode shows "Erosion event manager coming in Phase 2"; erosion events and the surface temperature are never saved or reloaded | Erosion events and the surface temperature edited, run, saved and reloaded like every other input |
| Heat flow history | Expert mode: "Future updates will allow time-variant heat flow" although the engine takes a piecewise history; the wizard's preview reads "Chart removed" | A heat-flow history table and chart |
| Calibration | The Calibration tab has no way to enter Ro or temperature points; Auto-Fit answers "Add calibration points" | Ro and BHT tables, typed or imported, in the display units |
| Import | The Import tab is a mock: a 1.5 s wait, hardcoded points dispatched under an action the reducer does not handle, and a toast claiming "24 checkshot points" | Real parsers for calibration and formation-top files, or no Import tab |
| Harness | Only an auth-gate e2e; no way to drive the whole app without the database | A dev harness whose seeded well is the oracle's reference basin, and an e2e that reproduces the golden off the screen |
| Units | Metres and Celsius only (`settings.unitSystem` exists and is read nowhere) | Depth in the account's unit, temperature in C or F |
| Links and help | No launchers; an in-app help sheet with Admin and Developer categories | Open the tied registry well; a help guide that describes the app as it is |

## Program

| Wave | Theme | One line |
|---|---|---|
| BF0 Harness and persistence | backend object, harness, honest persistence | One `backend` (bf_wells) with an in-memory twin seeded with the reference basin; `/dev/basinflow-genesis`; erosion events and settings saved, reloaded and passed by the wizard; the run dialog without fake delays; e2e reproduces the golden's present-day source Ro |
| BF1 History editors | Expert mode heat flow, erosion, surface temperature | Piecewise heat-flow history table and chart, erosion events table, surface temperature; the wizard's custom erosion is real and its preview chart is back |
| BF2 Calibration and import | real inputs | Ro and BHT point tables in the Calibration tab; Import parses calibration and formation-top CSVs (LAS and checkshot mocks removed); a registry well's tops as the stratigraphy skeleton |
| BF3 Units, links and help | display units at the edge, launchers, guide, status | Depth in the account's unit and temperature in C or F on tables, charts, CSVs and inputs; Well data and Open in for a registry-tied well; help guide on the shared shell; STATUS |

## Recorded decisions (v1 defaults, 2026-09-06)

- The engines and the goldens are untouched; every wave converts at
  the UI edge (`services/units.js`) and the e2e derives expectations
  from `test-data/basinflow/goldens.json`.
- `bf_wells` gains `erosion_events jsonb` and `settings jsonb`
  (migration 20260906150000, product-prefixed, applied to the shared
  project). Nothing else in the schema changes.
- The in-memory backend seeds the oracle's reference basin as a saved
  well so the harness lands on a verifiable state; the registry backend
  keeps the one-implicit-first-well behaviour.

## Wave log

- **BF0 (2026-09-06), branch `feat/bf0-harness-backend`.** One backend
  object (`services/backend.js`): the registry backend wraps bf_wells;
  the in-memory backend keeps the same row shape, seeds the oracle's
  reference basin as a saved well and persists in sessionStorage.
  `MultiWellProvider` takes `backend`; `BasinFlowShell` mounts the app
  on it; `/dev/basinflow-genesis` is the harness. Persistence made
  honest: erosion events and the model settings (surface temperature)
  are in app state, carried by LOAD_PROJECT, the auto-save, the well
  switch and the wizard's commit, and stored in the new bf_wells
  columns (migration 20260906150000 APPLIED). The run dialog lost its
  1.8 s of staged fake delays. The results summary gained a present-day
  table per layer (top, base, temperature, Ro) and its canned
  "working petroleum system" recommendation now reads from the result.
  Test ids `bf-*` across the shell. e2e: Expert mode on the seeded well,
  Simulate, every layer's present-day Ro equals the last sample of the
  golden series to 3 decimals; a reload keeps the erosion event (the
  no-erosion golden differs).
  Found and fixed: the guided wizard's Erosion step never reached the
  engine (the commit passed stratigraphy and heat flow only); erosion
  and the surface temperature were dropped on every save; a canned
  recommendation was shown regardless of the result.
- **BF1 (2026-09-06), branch `feat/bf1-history-editors`.** Expert
  mode's Global History dock is real: the heat-flow model is constant
  or a piecewise history edited as an age/value table with a chart
  (`components/history/`, helpers in `services/history.js`, tested),
  the surface temperature is an input, and erosion events are a table
  (age, metres removed) with problems flagged against the basin age.
  The unused Subsidence tab and the two "coming in Phase 2" notes are
  gone. The wizard's Heat Flow step previews the chosen model on the
  same chart (it read "Chart removed") and its custom erosion has age
  and amount inputs (it said "not fully implemented" and could only
  fail validation). Three dead wizard files deleted
  (HeatFlowTemplateStep, ErosionOptionStep, ReviewStep). The
  calibration slider edits the present-day value of a history by
  shifting it. e2e: removing the seeded event gives the golden's
  no-erosion Ro; a constant 60 mW/m2 gives the constant-Q golden; the
  surface temperature changes the answer.
  Found and fixed: the run dialog started a run only from its idle
  state, so every Simulate after the first showed the stale "Complete"
  and never recomputed the edited model.
- **BF2 (2026-09-06), branch `feat/bf2-calibration-import`.** The
  Calibration tab has a points editor (Ro and temperature tables, typed,
  dispatched to state so the auto-save keeps them; misfit live). The
  Import tab is real (`services/calibrationImport.js`, pure and
  tested, on the shared delimited-text reader): a calibration file
  (depth with Ro and/or temperature columns) previews with the rows it
  could not read and applies by replace or append; a formation-tops
  file (name, depth) previews the layers it would make (thickness from
  the gaps, an optional total depth for the last, a lithology guess
  from the name, placeholder ages flagged on the layer cards until
  typed) and replaces the stratigraphy; a registry well (Well Data
  Manager tops, `backend.listRegistryWells`, seeded KETA-1 in the
  harness) does the same and is remembered in `settings.registryWellId`
  as the model's tie. The LAS and checkshot mocks are gone (a 1D basin
  model has no consumer for them). e2e: typed points move the misfit;
  a file with a bad row previews 2 + 2 points and one problem and
  replaces the table; a tops file makes 3 flagged layers; KETA-1 makes 4
  and ties the model.
- **BF3 (2026-09-06), branch `feat/bf3-units-links-help`.** Display
  units (`services/units.js`, pure): depth m or ft with the account's
  Geoscience unit as the default through `backend.getDepthUnit`,
  temperature C or F, chosen in a Units bar in the Expert header and
  the wizard and remembered in the browser. They convert the layer
  thickness cards and total (both modes), the erosion amounts, the
  surface temperature, the calibration point tables, the profile and
  residual plots, the calibration CSV and PDF, the summary table and
  its maximum temperature, the burial and temperature history plots
  and the import previews; the import tabs take the file's depth unit.
  The results CSV keeps its SI columns and adds display-unit columns.
  Launchers: Well data (the tied registry well on its tops) and Open
  in appear once a model is built from a registry well; Help (and F1)
  opens the new full-page guide (`BasinFlowHelpGuide.jsx` on the
  shared HelpGuideLayout, route
  `/dashboard/apps/geoscience/basinflow-genesis/help`, guarded by
  `__tests__/helpGuide.test.jsx` including the no-em-dash rule); the
  in-app help sheet and its articles (lithology mixing the engine
  ignores, an API, keyboard shortcuts) are deleted with the dead
  VisualizationPanel. Two dead buttons were wired or removed: the
  guided dashboard's Export opens the export dialog (Share is gone)
  and the results panel's Download Data downloads the CSV. e2e: 1600 m
  reads 5249.34 ft, 15 C reads 59 F, the erosion amount 1968.5 ft, the
  summary row converts the golden's present-day values, a point typed
  in ft and F reads back 1000 m and 100 C, KETA-1 brings the launchers,
  the choice survives a reload, the guide route is gated.

**BF0 to BF3 CLOSED 2026-09-06.** Open for Basin & Charge Modeling: a
tester walk on staging; the G7 follow-ons in BasinFlow-STATUS.md
(max-burial hysteresis, layer-cake velocity, orphan bf_* tables) stay
unscheduled. The wizard's PetroleumSystem step still names lithology
mixing the engine ignores; a follow-on may remove it.
