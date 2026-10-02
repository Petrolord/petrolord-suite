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
- Deferred: Xu-White and soft/stiff sand models, modelled AVO against
  Seismolord attribute volumes, scenario Monte Carlo, several projects per
  user, log editing.
