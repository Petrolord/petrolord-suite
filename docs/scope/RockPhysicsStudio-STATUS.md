# Rock Physics Studio — STATUS

Plan of record: docs/scope/RockPhysicsStudio-PLAN.md (**approved with
owner sign-off 2026-07-13**, all four open questions answered at
drafting). Roadmap slot: Geoscience-ROADMAP.md Phase G6 — the first
advanced-tier app after the core loop closed at G5. Slug
`rock-physics-studio` — **SHIPPED 2026-07-14, tile Active**.
Phase G6 complete (G6.0–G6.5). Live at
`/dashboard/apps/geoscience/rock-physics-studio`.

Prod build upload: **DONE 2026-07-14** — prod is current (main
`e84f8a181`).

## Phase status

| Phase | Status | Landed |
|---|---|---|
| G6.0 oracle + goldens | **DONE** | f9167ee28 — tools/validation/rockphysics/ (stdlib-only Python, written from primary published definitions, never from JS); self-asserted anchors (Gassmann round-trips, BW brine→pure-water at S=0, Zoeppritz θ=0 identity, Shuey(0)=A, Rutherford-Williams class cases); goldens committed to test-data/rockphysics/ |
| G6.1 engine | **DONE** | 1013dedbe — engine/{fluids,minerals,gassmann,vsEstimate,avo}.js validated vs goldens (exact where closed-form, documented tolerance elsewhere); NaN-not-silent-defaults (unphysical inputs THROW); malformed-input fuzz |
| G6.2 rp_projects migration | **DONE** | 8b897598e — migration 20260714100000 **applied live** (owner-only RLS, petro_projects pattern); pentest block 14 live green; MIGRATIONS.md row |
| G6.3 waveform extraction | **DONE** | 463793603 — isGap/rickerWavelet/convolveSame → src/lib/waveform.js at the second consumer (G4 gridding precedent); Seismolord re-exports, synthetics jest goldens stayed green untouched; engine/wedge.js (wedgeTrace/wedgePanel/tuningCurve) vs oracle wedge goldens |
| G6.4 workstation UI | **DONE** | this branch — RockWorkstation on shared WorkspaceShell + injected backends (registryBackend / inMemoryBackend seeded FROM the oracle anchor cases); Fluids & Gassmann, AVO (exact-Zoeppritz vs Shuey/Aki-Richards + I-G crossplot with class bands), Wedge (variable-area canvas + tuning curve) — white chartTheme + ChartLogo; estimated-Vs provenance badge; /dev/rock-physics-studio harness; services jest reproduces the log_domain golden THROUGH the glue; 5 e2e asserting oracle numbers off the UI |
| G6.5 close-out | **DONE** | this branch — rp_projects persistence (save/restore scenario+rock+avo+wedge), page + route apps/geoscience/rock-physics-studio, tile seed 20260714110000 **applied live** (%ROWTYPE copy, Active), dead src/services/petro/rockPhysicsService.js deleted (zero importers), e2e route smoke |

## Key facts

- Engine is client-side and SI-internal (m/s, kg/m³, Pa); unit
  conversions live at the UI edge in `services/prep.js` (lasImport
  precedent). US/F sonic, g/cc density and percent fraction logs are
  converted on load.
- Vs provenance discipline (plan decision 2): measured DTS wins;
  otherwise Greenberg-Castagna on the VSH sand/shale split, and the
  whole model is badged `Vs estimated` — sources never silently mixed.
- Fluids are full Batzle-Wang 1992 (decision 1); mixed saturations via
  Wood/Reuss; manual K_fl/ρ_fl override remains available in the
  scenario panel (type over the pre-fill).
- Outputs: display, `rp_projects` save, and since RP1 (2026-09-06) the
  fluid-substituted case published to the well as VP_SUB / VS_SUB /
  RHOB_SUB in `geo_wells_logs` (overwrite-own per project, full
  provenance). No Seismolord export yet.
- The harness wells ARE the goldens' anchor cases: the brine sand
  substitutes to the gassmann `log_domain` numbers, the shale/gas-sand
  interface is the `class3_gas_sand` AVO case, and the default wedge
  parameters are the wedge golden (tuning 16 ms). The e2e derives every
  expected value from `test-data/rockphysics/goldens.json`, never
  hardcoded literals (G2 fixture-v2 lesson).
- Shared waveform primitives live at `src/lib/waveform.js`; Seismolord
  synthetics re-export them, and its jest goldens are the extraction
  tripwire.
- `rp_projects` is app-private (owner-only RLS) — no shared-table
  review bar was triggered; v1 keeps one implicit project per user
  (first save creates it).

## 2026-09-06: RP series (Petrel tester readiness) RP0 + RP1

Plan of record: docs/scope/RockPhysicsStudio-ROADMAP.md. RP0 display
units (velocity or slowness, density, depth defaulting to the account's
Geoscience depth unit) convert at the UI edge; the engine, the goldens
and every stored value stay SI. RP1 publishes the substituted case back
to the well registry as VP_SUB / VS_SUB / RHOB_SUB with the overwrite-own
contract Pore Pressure Studio uses, on both backends, and the explorer
shows what this app has written. RP2 adds the Well data and Open in
launchers for the selected well, and the in-app help guide at
`/dashboard/apps/geoscience/rock-physics-studio/help`. RP0 to RP2 are
merged; the series is closed.

## 2026-09-26: Senior test T1 (Wave 1 #7)

Report: docs/testing/RockPhysicsStudio-T1.md. Velocity log plot reads
depth downward; gas Vp shown; legends clear of the axis titles. New: fluid
replacement AVO (the lower rock with fluid B beside the in situ interface:
curve, A/B, class, crossplot point; `services/scenario.substitutedHalfspace`)
and the tuning thickness in depth from a wedge Vp (`DEFAULT_WEDGE.vpWedge`).
Engines untouched.

## 2026-09-28: Design system rollout w4d

- `RockWorkstation` wraps itself in `<ThemedApp>` (test id `rp-theme-scope`),
  so the route page and the `/dev/rock-physics-studio` harness share one
  scope: light grey panel by default, dark per user through the ribbon
  toggle. The help guide has its own scope (`rp-help-theme-scope`). The
  route prefix is registered in `src/design/rollout/w4d.js`.
- Ribbon, explorer, dock, fields and tables on pl-* roles; the Vs estimated
  badge and warnings on the warning roles, published curves on the success
  roles; cyan and emerald accents removed. Ribbon labels no longer wrap.
- The Fluids, AVO and Wedge charts stay white (`data-canvas="chart"`); the
  wedge synthetic sits on a dark canvas (`data-canvas="dark"`) with its
  pixels unchanged.
- No engine or calculation change. Theme test:
  `src/pages/apps/RockPhysicsStudio/__tests__/RockPhysicsStudio.theme.test.jsx`.

## 2026-10-01: Upgrade U1 (practitioner lens), app #10 of the Geoscience programme

Doc: docs/upgrade/RockPhysicsStudio-UPGRADE.md (branch `feat/rp-u1`). 21
findings, 18 fixed, no S1 or S2 open.

- Save had never worked on the registry: it wrote a `scenario` column the
  table does not have (`scenarios`); the live table held 0 rows. The save
  now writes real columns, keeps the well (`well_ids`, carried by `.pld`)
  and the zone, and a tolerant reader opens every shape
  (`services/projectState.js`).
- Curves read through the shared door: shared aliases (RHOZ, TDEP...),
  `normalizeInputCurve` for sonic and density (a unitless us/ft sonic was
  read as us/m, Vp 3.28x; the DT range rule is shared with Petrophysics),
  shear in the unit giving a physical Vp/Vs, percent fractions by range;
  every reading is listed under the curve inventory.
- PHIE and PHIT separate with the basis shown (pre-PT9a PHIE is total);
  clay from VSH in K_min; fluid A Sw from the SW log; Gassmann limits
  (VSH, porosity) with samples outside left in situ and counted
  (`services/scenario.substituteZone`).
- AI, Vp/Vs and Poisson's ratio (`services/elastic.js`); dock conditions,
  GOR and salinity in profile units; wedge Vp in the velocity unit.
- Publish adds DT_SUB (us/m, pipeline `rp-1.1.0`); Seismolord's synthetics
  list DT_SUB and RHOB_SUB by provenance (`src/lib/rockPhysicsCurves.js`).
- CSV with a reviewer header; typed inputs keep their text; AVO manual mode
  reachable without a well; critical angle stated; the unit note moved to
  the status bar.
- Harness flags `?hostile=1` and `?long=1`; e2e
  `e2e/rock-physics-upgrade.spec.js`; the older RP e2e (red since #830) fixed.
- Engines untouched. No migration.


## 2026-10-01: Upgrade U2 (Step 2 batches A, B and C), app #10 of the Geoscience programme

Doc: docs/upgrade/RockPhysicsStudio-UPGRADE.md (branch `feat/rp-u2`). 11 of
16 backlog items built, 5 deferred by the programme lead's decision. No
migration.

- Engines first: Petrolord/petrolord-engines PR #296 (angle gather, fluid
  line, iterative Vs and a bit-identical fast Greenberg-Castagna path,
  template lines, pseudo-sonic, Voigt mix) with an independent Python
  oracle (`oracle_u2.py`, `goldens.u2.json`). Merged by the programme lead
  (engines main 96e5963); the Suite is pinned there with no recorded
  deviations.
- New views: Crossplot (impedance against Vp/Vs with critical-porosity and
  mudrock template lines) and Gather (angle gather in situ and substituted,
  Zoeppritz or Aki-Richards, a Ricker or the Seismolord tie wavelet, AVO
  picked off the gather).
- AVO: the wet background trend fitted to the well (or Castagna's line when
  the well cannot give a fit) and each interface's distance from it.
- PDF report with the reviewer header, the interval table, the zone-top AVO
  and three vector plots (`services/report.js`); one header for CSV and PDF.
- Shear: iterative Vs in hydrocarbon samples when there is no shear log
  (closes RP-U1-018). One sampler (`scenario.makeSampler`) reads each
  sample's fluid, mineral modulus and limits for every consumer.
- Wells with no sonic open on an estimated Vp (Gardner inverse or Faust),
  marked estimated everywhere and publishable as DT_EST (closes RP-U1-019).
  Checked against the two live wells with a sonic: Gardner RMS 16 and 25
  percent, Faust 17 and 70 percent, little sample correlation. Screening
  only.
- Inputs from other apps: K_min per sample from the Petrophysics mineral
  model, pore pressure from Pore Pressure Studio's PP curve, fluid B Sw
  from a SCAL Studio saturation-height function through Petrophysics'
  reader (`services/petroInputs.js`).
- Seismolord: the gather is published through the `rock-physics-gather`
  contract (`src/lib/rockPhysicsGather.js`, in `rp_projects.avo`) and shown
  in the synthetics window; the canvas is shared
  (`src/components/charts/AngleGatherCanvas.jsx`). Second half of Seismolord
  U2-020.
- Patchy saturation (Voigt bound) beside Wood.
- Long wells: min/max chart decimation; Greenberg-Castagna 15 times faster
  on the 32,809 sample well.
- Publish pipeline `rp-1.2.0` (vp_source, vs_method, kmin_source,
  fluid_mixing, pore_pressure_source, sw_b_from_saturation_height).
- Harness flags `?trend=1`, `?nosonic=1`, `?minerals=1`, `?pp=1`; e2e
  `e2e/rock-physics-u2.spec.js`.
- Deferred: modelled AVO against Seismolord attribute volumes, scenario
  Monte Carlo, several projects per user, log editing. (Xu-White and the
  soft/stiff sand models shipped 2026-10-06, below.)

## 2026-10-02 Organisation sharing (built; migration NOT APPLIED, owner-run)

The project can be shared with the organisation from the ribbon, which also shows its published gather to colleagues in Seismolord; projects colleagues shared are offered in a project list. Tests: `__tests__/orgSharing.test.jsx`.

Design, rules, proof and the apply commands: `docs/scope/OrgSharing-DESIGN-AND-STATUS.md`. Until the migration is applied the control is a short note and saving works as before.

## 2026-10-02: the well datum model (WDM U2-007, PR #848)

The TVD used to place the published pore pressure comes from the shared
depth frame (`makeWellFrame`); no KB arithmetic remains in the app.

## 2026-10-06: rock physics models on the crossplot (QI Q2 / A1, closes U2-006)

- **Rock model choice:** the crossplot's template lines can follow any of five rock models:
  - critical porosity (the default, unchanged);
  - soft sand and stiff sand (Hertz-Mindlin pack with modified Hashin-Shtrikman bounds);
  - constant cement (Avseth, Dvorkin-Nur contact cement);
  - Xu-White (differential effective medium with sand and clay pores).
- **Parameters:** each model's parameters are editable under the plot: coordination number, effective pressure, critical and cemented porosity, clay pore share and pore aspect ratios.
- **Fitting:** "Fit n to wet samples" fits the soft- or stiff-sand coordination number to the zone's water-bearing samples (Sw 0.9 or more). It reports the RMS misfit, and warns when the best fit sits at the end of the searched range.
- **Engines:** the models live in the engines repo (`rockphysics/granular.js`, `inclusion.js`, `templates.js`; engines #313-#315, vendored at 8e02b59). Each is validated against an independent oracle and agrees with rockphypy to about 1e-15. Two rockphypy defects were found and documented.
- **Tests:** `__tests__/qiRockModels.test.jsx` (12), plus 50 engine gates.

## 2026-10-06: Elastic logs and the local shear trend (QI A2)

- **Elastic logs view:**
  - Zone means of AI, SI, Vp/Vs, Poisson's ratio, K, mu, λρ and μρ (Goodway 1997), and EEI at a typed χ (Whitcombe et al. 2002).
  - K and the reference values come from the zone, so EEI(0) is AI.
  - Any of these can be drawn as a depth track, on a white chart with ChartLogo.
- **Local shear trend:**
  - On a well with a measured shear log, Vs is regressed on Vp (linear or quadratic) over the zone's water-bearing samples (Sw 0.9 or more), with the 90 percent prediction interval drawn.
  - "Use this trend" saves it in the project (`rock.localVs`).
  - Wells with no shear log then take Vs from the trend in place of Greenberg-Castagna, including the brine trend of the hydrocarbon iteration (engines `iterativeVs` `brineVs`). They also carry a sigma curve.
  - The shear note names the trend, and counts samples outside its calibrated Vp range.
- **Engines:** `rockphysics/elasticSet.js` (engines #316, vendored at 8c95c91). The oracle reproduces the published t table; numpy and scipy agree to 1.5e-12.
- **Tests:** `__tests__/qiElasticLogs.test.jsx` (7). On the TREND RP-5 harness well, the local trend recovers the true gas-bed shear more closely than Greenberg-Castagna.

## 2026-10-06: Multi-well crossplot workbench (QI A2)

- **Multi-well view:**
  - Any two of 14 logs and elastic properties, for every ticked well, over every sample or a zone the wells share.
  - **Every sample is drawn.** The 1,500-point cap stays only on the single-zone crossplot. The shared canvas batches clouds above 20,000 points into one path per colour.
  - **Colour** by well, fluid (Sw < 0.7), lithology (VSH < 0.5) or a third property, with a colour bar.
  - **EEI** uses one K and one set of references across the wells.
- **Statistics:** per-well and pooled statistics (pooled within-well SD). A pooling warning appears when a well's mean sits more than one within-well SD from the pooled mean.
- **Facies polygons:** counted per well; first polygon wins, as in Petrophysics Studio.
- **Decision:** the canvas is Petrophysics Studio's analytic Crossplot, with the same drawing, zoom, pan and identify, and batched rendering for large clouds. It is not a new WebGL renderer: canvas batching stays smooth at the sizes a multi-well study produces, and it keeps one crossplot tool across the two apps.
- **Facies write-back:** "Write facies to the wells" publishes RP_FACIES on the plotted wells the user owns: 1..n by polygon, 0 inside none, null where a value is missing. Shared wells are skipped as read-only. The provenance carries the codes, the polygons, the axes, the units and the EEI settings. The pipeline version is rp-1.3.0.
- **Provenance fix:** a well whose Vs came from the local shear trend now publishes vs_method local-trend and the trend. It used to say Greenberg-Castagna.
- **Next:** density and histogram views.
- **Tests:** `__tests__/qiWorkbench.test.jsx` (9).

## U2-008 closed (QI programme Q7b, 2026-10-07)
- Modelled against observed intercept and gradient at the wells now live in QI Studio (AVO tab, At the wells). It reads this app's published gather per well (the `rock-physics-gather` contract) and the AVO volumes at the well's trace and zone-top time, scales them with one least-squares factor, and compares classes and misfit. There is no change in Rock Physics Studio itself.

## Unit changes keep typed values (2026-10-09)
- Changing any unit in Scenario & rock (temperature, pressure, salinity, GOR, depth) used to rebuild the draft from the last applied scenario, so a temperature typed but not yet applied went back to its old value when the salinity unit was changed. Found while recording the QI videos. A unit change now converts the typed values (`redisplayDraft`); a new scenario or rock still resets the draft.
- **Tests:** `__tests__/unitChangeDraft.test.jsx` (3; the two behaviour tests fail on the old panel).

## One published gather per well (2026-10-09)
- Rock Physics Studio keeps one project per user. Publishing a zone gather for a second well replaced the first (`avo.published_gather`, and `well_ids` held only the well on screen). QI Studio's AVO at the wells, and Seismolord's synthetics window, therefore found a gather for the last well published only. Found preparing the QI videos (Ekene-1 to Ekene-4).
- The project now keeps `avo.published_gathers[well_id]` beside the latest `published_gather`, and its `well_ids` lists every well with a gather. `loadGatherForWell` reads the well's own entry first; older projects still read as before.
- A .pld import remaps the map's keys (geoscienceSpec `avo.published_gathers{keys}`). Save a copy of a colleague's project leaves their gathers behind, as it already did.
- **Tests:** `src/lib/__tests__/rockPhysicsGather.test.js` (3 new; 2 fail on the old code, plus an old-shape negative control).

## 2026-10-10: the pore-fluids table with Sw from the SW log

- With "Sw from the SW log" on, the table computed fluid A at the typed Sw (default 1), so it read "A (in situ) brine" beside "B (substitute) brine", although the substitution mixed live oil per sample. Found while scripting the QI lessons.
- `fluidTable` (FluidsPanel) now shows two rows in that case: "A (in situ), water" (brine) and "A (in situ), hydrocarbon" (the end member the log mixes), each labelled "mixed per sample by the SW log". Without an SW curve, or with the box unticked, the table keeps the typed Sw.
- Hydrocarbon labels read "live oil" and "dead oil" in place of the codes `oil-live` and `oil-dead`.
- **Tests:** `fluidsDepthTicks.test.js` (both end members shown; no SW curve and the box unticked as negative controls).
