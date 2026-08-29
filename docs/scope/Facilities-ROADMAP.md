# Petrolord Facilities Engineering Module — Roadmap

Status: **APPROVED — owner sign-off 2026-08-29** (decisions in §6)
Scope: the entire Facilities Engineering module
This file is the plan of record. Per-app plans are written per phase
against this roadmap. Proposal artifact: the 2026-08-29 three-module
deep dive (Facilities / Economics / Midstream & Downstream), full-code
audit of all 11 routed facilities apps.

Execution order note (owner directive 2026-08-29): Facilities executes
first, then the Economics E series (Economics-ROADMAP.md), then the
Midstream & Downstream bring-up (MidstreamDownstream-ROADMAP.md).

---

## 1. The honest baseline

A facilities engineer's daily loop is: **characterize the fluids →
size the separation train → size the lines and check erosional limits →
size pumps and compressors → protect everything (relief, flare,
venting) → condition the gas (dehydrate, sweeten, dew point) → move
heat → store and measure the product → treat the water → keep the
steel alive (corrosion).** The commercial toolkit for that loop is
HYSYS/UniSim/ProMax for process, PIPESIM/OLGA for hydraulics and flow
assurance, Flaresim and the API 520/521/2000 canon for safety systems,
HTRI for exchangers, AFT Fathom for pump networks, and the GPSA
Engineering Data Book everywhere in between. Most of the daily
calculations are actually done in unvalidated Excel sheets.

Petrolord currently covers this loop with 11 routed apps, of which
four are real, four are partial, and three are shells — one of them
gated and sellable while returning hardcoded fake numbers.

Audited state of every routed app (2026-08-29, full code sweep):

| App | State | Verdict |
|---|---|---|
| Facility Network Hydraulics | Best app in the module: line sizing, Beggs & Brill multiphase with flow-pattern map, Barlow/ASME B31 wall thickness, pigging check (`src/utils/facilityNetworkHydraulicsCalculations.js` + 870 LOC of components). Already de-fictioned once at Production P0. No persistence, no tests, no help. | **CONSOLIDATE** into the Pipeline & Line Sizing flagship (F1) |
| Relief & Blowdown Sizer | Real API 520 gas + liquid PSV sizing with proper C-from-k and the orifice table, depressuring curve, radiation check. But Kb/Kc hardcoded 1.0, no API 521 fire case, and `saved_relief_projects` has no repo DDL. | **UPGRADE** (F2) |
| Heat Exchanger Sizer | Real LMTD with F-correction and cross-over guard, real ε-NTU, air-cooler duty — 573 LOC all inline on the page. No tests, no help. | **UPGRADE** (F4) |
| Gas Treating & Dehydration | Amine mole-balance sizing is sound. The TEG side is hardcoded rules of thumb (4 gal/lb H2O, 750 Btu/gal) with no contactor sizing and no water-content correlation despite the tile advertising both. | **UPGRADE** (F3) |
| Separator & Slug Catcher Designer | Real Souders-Brown core, but line 117 reads the *previous render's* results to compute gas velocity (first calc always reports 0), Z is hardcoded 0.85, and there is no 3-phase interface sizing. | **REBUILD** (F5; the stale-render bug is fixed at F0) |
| Corrosion Rate Predictor | Genuine de Waard-Milliams CO2 model + NACE MR0175 SSC screen, but only 76 LOC: flat fudge factors, no velocity/shear term, no remaining-life output. | **UPGRADE** (F6) |
| Facility Layout Mapper | Genuinely working Leaflet drafting tool (1,013 LOC: draw equipment + pipe runs, DXF/KML/SVG/GeoJSON/PDF export, Supabase persistence) with zero engineering math — no safety-spacing rules despite the tile advertising them. | **KEEP as utility tile** (spacing checks at F8) |
| Produced Water Treatment | Multiplies canned removal-efficiency constants; temperature and TDS inputs are collected and never used; Save/Export are toast stubs. | **REBUILD** with real physics (F7) |
| Pipeline Sizer | Gated and sellable, yet calls a `pipeline-sizer-engine` edge function that DOES NOT EXIST and silently falls back to `mockResult` — every user gets 10 in / 145.2 psi regardless of input, and it saves those numbers. A real orphaned engine (`src/utils/pipelineSizerCalculations.js`, Colebrook-White, imported by nothing) sits beside it. | **RETIRE at F0** (folded into F1; the orphaned engine is recovered) |
| Pipeline Designer | `setTimeout(1500)` then five hardcoded literals; the chart is a div reading "Placeholder"; Save toasts "Not Implemented". Third duplicate of pipeline sizing. | **DELETE at F0** |
| Compressor & Pump Pack | 50 LOC of static HTML printing literal results ("Power: 1250 hp"). The emptiest tile in the module. | **DELETE at F0** (scope rebuilt properly as F9/F10) |

Cross-cutting defects:

- **No Facilities catalog migration exists at all.** Every other module
  has an honest-catalog migration
  (`20260827220000_p0_production_honest_catalog.sql` et al.);
  Facilities' live tile list is undocumented in-repo. F0 creates it.
- **Schema not in code.** `saved_relief_projects`,
  `saved_pipeline_sizer_projects`, `saved_heat_exchanger_projects`,
  `facility_layouts` exist only in the live DB (referenced from
  `src/database/functions/get_all_my_projects.sql`); RLS posture
  unverifiable from the repo. Fixed at F0.
- **Entitlement gating: 2 of 11** routes wrapped in
  `ProtectedAppRoute` — and one of the two gated apps is the mock
  Pipeline Sizer.
- **Zero tests, zero help guides, zero studio-kit adoption** across
  the module.
- Dead code: two orphan hub pages (`FacilitiesEngineering.jsx`,
  `FacilitiesAndInfrastructure.jsx`), 33 fictional facilities apps in
  `src/data/hubApps.js` (file has zero importers), four near-empty
  repo-root dev-prompt stubs.
- Stale docs: `docs/PETROLORD_APPLICATION_CATALOG.md` §6 claims 9
  "Complete" + 4 "Coming Soon" apps, several with zero code behind
  them.

Cross-module commitments that bind this roadmap (from
Production-ROADMAP.md, owner-locked 2026-08-27):

- Production owns the gathering-network solver. **Facilities keeps
  single-line sizing only.**
- Pigging Scheduler was archived in Production and declared
  Facilities' scope — an inbound obligation, honored as the pigging
  tab of the F1 flagship.
- Flow Assurance Studio (hydrates, wax, cooldown) lives in Production.
  Facilities does not rebuild it; the F1 app may show a hydrate-margin
  flag reusing the validated `hydrateInhibition` engine.
- `src/components/facilitynetworkhydraulics/` fed the Production
  Network Studio build; consolidation at F1 must not break what P11
  reused (P11 took the DATA into the engine package, so the constraint
  is historical, but verify).

## 2. What we build on (reuse, never rebuild)

| Asset | Where | Feeds |
|---|---|---|
| Validated multiphase + friction stack | `src/utils/nodal/` (golden-tested Beggs & Brill, Gray, Hagedorn-Brown, Colebrook friction, units) | F1 flagship hydraulics — replaces the untested twin in `facilityNetworkHydraulicsCalculations.js` |
| Orphaned single-phase engine | `src/utils/pipelineSizerCalculations.js` (Colebrook-White, 325 LOC, imported by nothing) | Recovered at F1 |
| Fluid EOS / flash / PVT | `packages/engines/engines/fluid/` (pr78, flash, separator multi-stage, blackOil, envelope, transport) + `src/utils/fluidstudio/eos/` mirrors | Separator feed characterization (F5), dew-point control (F3), gas properties everywhere |
| Gas properties (Z, density, viscosity) | `packages/engines/engines/production/gasProperties.js` | Kills the hardcoded Z=0.85 (F5), compressor k/Z (F9) |
| ANSI pipe schedule data | `packages/engines/engines/production/pipeSchedule.js` | F1 (replaces the 29-LOC stub) |
| Flowline thermal / U-values | `packages/engines/engines/production/flowlineThermal.js` | F4 exchanger work |
| Hydrate inhibition | `packages/engines/engines/production/hydrateInhibition.js` | F1 hydrate-margin flag only (Production owns the full workflow) |
| Choke performance | `packages/engines/engines/production/chokePerformance.js` | F11 Control Valve & Choke Sizing |
| Studio kit + persistence | `src/components/studio/` + `saved_*_projects` convention | Every app shell |
| Chart standard | white chartTheme + ChartFrame + 40px ChartLogo | Every chart |
| Unit conversion | `src/utils/unitConverter.js`, `src/utils/nodal/units.js` | Everywhere |
| Launch playbook | `docs/scope/Production-ROADMAP.md` + `Drilling-ROADMAP.md` | The whole program |

## 3. The locked 12-app portfolio

Twelve engineering studios plus one retained utility tile.

| # | App | Industry counterpart | Scope and engine basis |
|---|---|---|---|
| 1 | Pipeline & Line Sizing Studio | PIPESIM single-branch | The flagship, consolidating FNH + Pipeline Sizer + Pipeline Designer. Single-phase liquid (Colebrook-White, recovering the orphaned engine), single-phase gas (Weymouth, Panhandle A/B, AGA), multiphase via the validated `nodal/beggsBrill`, API RP 14E erosional velocity, elevation profile with hydraulic-gradient chart, wall thickness B31.4/B31.8, real ANSI schedule data, and the pigging tab (pig selection, liquid slug on arrival, frequency) honoring the Production hand-off. Single-line only per the network-ownership decision. |
| 2 | Relief & Flare Studio | Flaresim / Aspen Flare System Analyzer | Complete API 520 (gas with real Kb back-pressure correction, liquid, steam, fire case per API 521 wetted area), orifice selection, flare KO drum sizing, stack height from radiation (API 521), blowdown/depressuring. Keeps the existing engine and adds the missing halves. |
| 3 | Gas Processing Studio | ProMax / GLYCalc / AMSIM | One app, three units (owner decision #1): water-content correlation (Bukacek/McKetta fit) + TEG dehydration with real contactor sizing, circulation, reboiler, stripping gas and achievable dew point; amine sweetening (keeping the sound mole-balance core, adding contactor sizing); hydrocarbon dew point / JT screening on the EOS flash + envelope. |
| 4 | Heat Exchanger & Cooling Studio | HTRI (rating tier) | Keep the LMTD/ε-NTU/air-cooler engine; add TEMA-style geometry, fouling factors, tube-count estimation, weather-derated air-cooler design; decompose the inline page onto the studio kit. |
| 5 | Separator & Slug Catcher Studio | HYSYS + Sivalls/GPSA methods | 2-phase and 3-phase sizing per API 12J/GPSA: Souders-Brown with proper K selection and pressure derating, retention-time liquid sizing, water/oil interface, L/D optimization, real Z-factor, stage-flash feed characterization on `fluid/separator.js` + `blackOil`; slug catcher (vessel + finger) sizing from slug volume. |
| 6 | Corrosion & Integrity Predictor | ECE / Predict / NORSOK sheets | de Waard-Milliams with velocity/shear term (NORSOK M-506 class), inhibitor efficiency/availability, corrosion allowance vs remaining life, NACE MR0175 sour-service screen, material-selection guidance. |
| 7 | Produced Water Treatment Designer | no desktop standard exists | Real separation physics replacing the canned constants: Stokes-law droplet settling, API 421 separator sizing, hydrocyclone d50/migration probability, gas flotation, train builder to a target oil-in-water discharge spec, with temperature and salinity actually used. |
| 8 | Facility Layout Mapper (utility tile) | plot-plan drafting | Kept as-is (owner decision #2) plus the advertised safety-spacing distance checks from typical inter-equipment spacing tables. |
| 9 | Compressor Station Designer | GPSA Ch.13 / vendor tools | Polytropic and isentropic head, power, discharge temperature, multi-stage with intercooling and optimal stage split, recip vs centrifugal screening, fuel-gas estimate, surge-margin awareness. |
| 10 | Pump Station Designer | AFT Fathom | Centrifugal pump hydraulics: system curve vs pump curve, duty point, NPSHa vs NPSHr, affinity-law speed/trim, HI viscosity correction, series/parallel, power and motor sizing. |
| 11 | Control Valve & Choke Sizing | vendor Cv tools | ISA 75.01 Cv for liquid (cavitation/flashing checks via FL) and gas (choked flow, expansion factor), valve style screening, noise estimate; surface choke sizing on the validated `chokePerformance`. |
| 12 | Storage Tank & Venting Designer | TANK / API spreadsheet canon | API 650 shell-course thickness (1-foot method), capacity/working volume, API 2000 normal + emergency venting, breathing/working/flash losses, blanketing gas estimate. |
| 13 | Flow Metering Designer | AGA calc packages | AGA-3 orifice plate sizing (beta ratio, DP for target flow, bore), AGA-7 turbine/ultrasonic check, meter-run requirements, measurement-uncertainty estimate. |

(#8 is the utility tile; #1-#7 and #9-#13 are the twelve engineering
studios.)

Explicitly NOT built (module boundaries): gathering-network solver
(Production), hydrate/wax flow assurance (Production), downhole lift
(Production), full process/dynamic simulation (out of niche), power
generation / HVAC / fire protection / digital twin (the `hubApps.js`
fiction stays dead).

## 4. Architecture principles (inherited from the Drilling/Production launches)

- **F0 honest catalog first:** an
  `..._f0_facilities_honest_catalog.sql` migration archives the shell
  tiles, sets honest statuses, and creates the first in-repo record of
  the Facilities catalog. Logged in MIGRATIONS.md, staging-first.
- **Validation-first engines:** every new engine lands in
  `packages/engines/engines/facilities/` via engine PRs, with
  committed goldens against published worked examples (GPSA Data Book,
  API 520/521 examples, Sivalls, HI charts, ISA 75.01, AGA-3), then
  vendored via the established subtree-shim pattern. Literature gates
  ship ARMED where the source is a copyrighted PDF, exactly like the
  drilling L-gates and production PL-gates. No new edge functions:
  the repo precedent is client-side engines.
- **One shell, one chart language:** studio kit (StudioLayout +
  StudioProjectManager + StudioAutoSave + StudioHelp), white
  chartTheme + 40px ChartLogo everywhere, per-app help guide, no em
  dashes in user-facing copy.
- **Every route gated** with `ProtectedAppRoute`; every slug in
  `allApps`.
- **Repo DDL + RLS** for all persistence tables, including retroactive
  capture of the four orphan tables.
- Per-app `docs/scope/<App>-STATUS.md` at each phase's completion;
  conventional commits; branch + PR per phase; stage by path, never
  `git add -A` (shared-worktree rule).

## 5. Phasing

| Phase | Delivers | Notes |
|---|---|---|
| **F0** | Hygiene + honest catalog | Delete Compressor & Pump Pack, Pipeline Designer, both orphan hub pages, `facilitiesApps` fiction, dev-prompt stubs; retire Pipeline Sizer (route alias → F1 slug; its saved-projects table archived or migrated); gate all routes; F0 catalog migration; retro-DDL + RLS for the four orphan tables; fix the separator stale-render bug (one-line correctness fix, ships immediately). |
| **F1** | Pipeline & Line Sizing Studio | The flagship consolidation on the validated nodal stack + recovered Colebrook engine + engine-package pipe schedules; pigging tab honors the Production hand-off. |
| **F2** | Relief & Flare Studio | Kb, fire case, KO drum, stack height on the kept engine. |
| **F3** | Gas Processing Studio | Water content correlation, TEG contactor sizing, amine contactor, JT screening. |
| **F4** | Heat Exchanger & Cooling Studio | TEMA geometry, fouling, tube count, studio-kit decomposition. |
| **F5** | Separator & Slug Catcher Studio | 3-phase, real Z, stage flash, slug catcher. |
| **F6** | Corrosion & Integrity Predictor | Velocity/shear, inhibitor, remaining life. |
| **F7** | Produced Water Treatment Designer | Stokes/API 421/hydrocyclone physics rebuild. |
| **F8** | Layout Mapper spacing rules | Safety-distance checks on the kept drafting tool. |
| **F9** | Compressor Station Designer | New build (GPSA Ch.13). |
| **F10** | Pump Station Designer | New build (system/pump curves, NPSH, HI). |
| **F11** | Control Valve & Choke Sizing | New build (ISA 75.01 + chokePerformance). |
| **F12** | Storage Tank & Venting + Flow Metering + launch pack | Two smaller builds; tile activation migrations applied with the launch upload; MIGRATIONS.md clean. |

Launch gate mirrors Drilling/Production: all tiles honest, migrations
applied and logged, staging E2E, one prod zip.

## 6. Locked decisions (owner sign-off 2026-08-29)

1. **Gas conditioning is ONE combined Gas Processing Studio** (TEG +
   amine + dew-point tabs), not two apps.
2. **Facility Layout Mapper is KEPT as a 13th utility tile** (safety
   spacing added at F8); the twelve engineering studios stand as
   listed.
3. **Produced Water Treatment is REBUILT with real physics**, not
   archived.
4. **Pipeline consolidation:** Pipeline Sizer and Pipeline Designer
   retire at F0; one flagship (F1) owns line sizing, with route
   aliases preserving old links.

## 7. Phase status

| Phase | Status | Landed |
|---|---|---|
| F0 | **SHIPPED 2026-08-29** (PR #295, branch feat/facilities-f0) | Three shells deleted (Compressor & Pump Pack, Pipeline Designer, Pipeline Sizer — retired routes redirect, pipeline slugs land on Facility Network Hydraulics); every facilities route gated + allApps synced (produced-water-treatment added, archived slugs dropped); Separator stale-render gas-velocity bug fixed (now computed from the vessel just sized); Fluid Studio's Send-to-Pipeline-Sizer hand-off removed (it fed the mock; F1 restores a real one); orphan hub pages + zero-importer hubApps.js (33 fictional tiles) + 4 dev-prompt stubs deleted; applications.js and Solutions.jsx made honest. Migrations BOTH APPLIED live 2026-08-29 and logged: 20260829500000 honest catalog (post-state verified 7 Active / 1 Coming Soon / 32 Archived — the first facilities catalog migration ever) + 20260829510000 DDL backfill for the four Horizons-era tables (all four verified live with RLS enabled + owner policies, so a pure no-op capture). Build clean; full jest 358 suites green (one render test updated to assert the F0 state). The orphaned real engine pipelineSizerCalculations.js deliberately kept for F1. |
| F1 | **SHIPPED 2026-08-29** (branch feat/facilities-f1) | Engines PR #77 opened the package's `facilities` domain (line hydraulics vs an independent SI-form oracle: Menon constants against the GPSA field constants, two published routes meeting; 15 gates, engines 1835 green) and was subtree-pulled. Suite: composition layer `src/utils/facilities/lineSizing.js` (13 gates incl. nodal-Moody vs engine-Colebrook cross-check), the studio on the kit (sweep table + chart with per-row RP 14E verdicts, profile gradient marched in the active mode's physics, Barlow+MAOP, pigging fed by the computed holdup), persistence `saved_linesizing_projects` APPLIED live, Fluid Studio hand-off restored, FNH tree + both mock-era engines deleted. Tile RENAME migration 20260829530000 HELD for the upload (P9 precedent: the slug carries entitlements). Full jest 361 suites / 5170 green; build clean. Detail: PipelineLineSizing-STATUS.md. |
| F2 | **SHIPPED 2026-08-29** (branch feat/facilities-f2) | Engines PR #78: API 520 both branches (proven to meet at the critical ratio), Kv iterated through Reynolds, Napier with range refusal, API 521 fire chain at the ACTUAL relieving pressure (the old engine hardcoded 100 psig), KO-drum C-Re settling, radiation solved both ways, blowdown march; first-principles SI-nozzle oracle so 520/735 are checked, not repeated (15 gates, engines 1851 green). Suite: Relief & Flare Studio on the kit (slug relief-blowdown-sizer kept), 4 tabs, help guide, smoke test; saved_relief_projects brought onto the shared service (updated_at migration APPLIED); old reliefCalculations.js deleted; tile RENAME 20260829550000 HELD. Chart factors (Kb/Kw/KSH/insulation) typed by design, gates ARMED. Jest 363/5187 green; build clean. Detail: ReliefFlare-STATUS.md. |
| F3 | **SHIPPED 2026-08-29** (branch feat/facilities-f3) | Engines PR #79: the module's rule is the inverse of the predecessor's hidden constants (4 gal/lb, 750 Btu/gal, 15 percent BTEX) — every design choice is a named input, everything computable is computed. Ideal-VLE water content honest about the McKetta-Wehe correction past 1000 psia; Kremser both ways gated against a brute-force stage cascade; TEG duty assembled from named parts; amine mole balance with customary limits offered and a corrosion warning; Souders-Brown contactor on the validated DAK z; JT coefficient DERIVED from the z-factor's temperature derivative (reproduces the 7 F/100 psi rule; correctly finite at low pressure, which corrected a wrong test assumption). 12 gates, engines 1864 green. Suite: Gas Processing Studio on the kit (slug kept), 3 tabs, help guide, smoke test; saved_gasprocessing_projects APPLIED; tile RENAME 20260829570000 HELD. Jest 365/5201 green; build clean. Detail: GasProcessing-STATUS.md. |
| F4 | **SHIPPED 2026-08-29** (branch feat/facilities-f4) | Engines PR #80. **The oracle caught a real bug**: the R=1 limit of Bowman's F carries -1-R = -2 inside the logarithm, and writing -1 there is a silent 20 percent error in F at P=0.5; the independent eps-NTU-identity route disagreed and it was fixed before shipping. Engine: energy balance refusing crossed streams, F COMPUTED (the predecessor made users type an Ft) with multi-shell conversion and refusal past a configuration's reach, eps-NTU both ways with each arrangement's ceiling named, U assembled from named resistances with the controlling one identified, Dittus-Boelter/Sieder-Tate film with the transition band REFUSED not interpolated, TEMA bundle geometry, air cooler with the hot-day derate. Independent routes: eps-NTU by RK4 ODE march (6-decimal agreement), LMTD by numerical integration, SI re-derivations. 19 gates, engines 1884 green. Suite: studio on the kit replacing the 573-LOC inline sheet (slug kept), 3 tabs, help guide, smoke test; saved_heat_exchanger_projects brought onto the shared service (updated_at APPLIED); tile RENAME 20260829590000 HELD. Jest 367/5222 green; build clean. Detail: HeatExchanger-STATUS.md. |
| F5-F12 | not started | |
