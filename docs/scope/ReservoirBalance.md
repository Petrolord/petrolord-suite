# Reservoir Balance

**Scope document maintained at:** `docs/scope/ReservoirBalance.md`

**Last meaningful update:** 2026-05-15 (Phase 3 + Capsule 4A + 4B close — Fetkovich aquifer benchmarked against Pletcher Table 9, Carter-Tracy implemented at Published-method tier, validation tier system live)

**Status:** Phase 1 + Phase 2 + Phase 3 + Capsule 4A + Capsule 4B complete. Phase 5 (Carter-Tracy benchmark, oil-with-gas-cap validation, remaining oil paths) pending. Phase 4 PVT correlation library is the largest remaining Phase 4 scope.

---

## 1. What this app will be

Reservoir Balance is a material balance (MBAL) analysis tool for petroleum engineers performing tank-model reservoir analyses. It will compute Original Oil In Place (OOIP) and Original Gas In Place (OGIP) from production and pressure history via Havlena-Odeh regression, diagnose drive mechanisms via plots and drive indices, model aquifer support via Fetkovich and Carter-Tracy methods, and forecast future production by combining MBAL outputs with decline curve analysis.

**Target users:** Reservoir engineers performing material balance studies for Nigerian operators — typically as a screening tool before going to heavyweight commercial packages (MBAL by IPM, Topaze), and as an audit/sanity-check tool for results coming from those packages.

**The bar for credibility:** A senior reservoir engineer must be able to look at this tool and recognize the math as legitimate. That means: Havlena-Odeh formulation (not toy pressure calculations), proper PVT correlations (not one Standing-only stub), full drive index decomposition, diagnostic plots (Havlena-Odeh F vs Et, p/z, Campbell, Cole), aquifer history matching (not parameter input). The EPE rebuild set the standard; this app must match it.

**What it is not:** It is not a 3D simulator. It is not a multi-well flow model. It is not a substitute for commercial MBAL packages — it is a complementary tool with a specific niche (Nigerian-context, integrated with the Petrolord ecosystem, fast screening + audit use).

**Note on name change (2026-05-13):** Renamed from "Reservoir Balance Surveillance" to "Reservoir Balance." The shorter name is sufficient and avoids the unnecessary specificity of "surveillance" (which suggested a single use case among many).

---

## 1.5 Phase history

| Phase | Status | Date closed | Key outcome |
|---|---|---|---|
| Phase 1 — Foundation | ✓ DONE | 2026-05-13 | Math engine validated against Pletcher SPE 75354. OGIP within 0.13% of true; aquifer W within 7.8%; drive indices match to 3 decimal places. One bug found and fixed during validation: rock+water effective compressibility was `Swi·(cw+cf)/(1-Swi)` instead of correct `(Swi·cw + cf)/(1-Swi)`. Regression gate now in place. |
| Phase 2 — Plumbing | ✓ DONE | 2026-05-13 | End-to-end flow live. Case list → case detail → run MBAL → results renders for gas case. 6 artifacts shipped + one RLS hotfix migration. Gate met (plumbing-only smoke test; oil math validation explicitly deferred to Phase 5 per scope decision). |
| Phase 3 Capsule 3A — Case detail wiring | ✓ DONE | 2026-05-14 | PvtRock, AquiferModel, DataHub fully wired through engine + UI + Edge Function. Oil pot aquifer math added to engine and validated to 0.13% OOIP error against Pletcher SPE 75354 Tables 10-13. Two-case validation gate (gas + oil). 9 main artifacts + ~5 mid-capsule fix bundles. Engine bug found and fixed: per-row lab Bg was silently ignored; now respected with consistent Bgi handling. |
| Phase 3 Capsule 3B — Diagnostic plots | ✓ DONE | 2026-05-15 | Five diagnostic plots wired to engine output and rendered in a new Plots tab. Havlena-Odeh F vs Et (both fluid systems), p/z and Cole (gas), Campbell (oil), drive indices stacked bar (both). Petrolord chart conventions followed (bg-white wrapper, ChartLogo, chartTheme tokens). 3 main artifacts (Edge Function extension, RbDiagnosticPlots component, RbCaseDetail patch). Pressure history match plot deferred to Phase 6 (needs forecast math). |
| Phase 4 Capsule 4A — Fetkovich + Carter-Tracy engine math | ✓ DONE | 2026-05-15 | Fetkovich aquifer math validated against Pletcher SPE 75354 Tables 9 / Fig. 8 — OGIP 0.76% error vs truth. Carter-Tracy implementation activated (math was pre-existing scaffolding from Phase 1) at Published-method tier. New validation tier system in engine API: `validation_tier`, `validation_reference`, `validation_tolerance_pct`. Three-case validation gate (gas+pot, oil+pot, gas+Fetkovich), 16/16 assertions pass. New helper functions: `extractTimedeltasDays` (Δt extraction with hard precondition check), `computeFetkovichWe` (marching scheme), `resolveValidationTier` (single source of truth for tier mapping). |
| Phase 4 Capsule 4B — Aquifer UI + tier badges | ✓ DONE | 2026-05-15 | All four aquifer models now selectable in AquiferModel.jsx (Fetkovich/Carter-Tracy parameter inputs added). New shared component ValidationTierBadge.jsx renders the engine's tier with constructive language ("Benchmark verified" / "Published method" / "Engineering basis") and full reference text in tooltip. Badge surfaces in two places (Overview Last-result tile, Run-tab result card). Backward compatible with legacy pre-Capsule-4A result rows. 3 main artifacts (ValidationTierBadge new, AquiferModel rewrite, RbCaseDetail tier patch). |
| Phase 4 Capsule 4C — PVT correlation library | Pending | — | Vasquez-Beggs, Glaso, Beal-Standing oil correlations; Lee-Gonzalez-Eakin gas viscosity; Beggs-Robinson live oil viscosity; Dranchuk-Abou-Kassem z-factor; standalone PVT lab table upload. Engine-side and UI-side. The largest single Phase 4 remaining piece. |
| Phase 5 — Carter-Tracy benchmark + remaining oil paths | Pending | — | Source a published Carter-Tracy worked example (Dake, Lee-Wattenbarger, additional Pletcher cases) and add Case 4 to the validation gate to promote oil/gas Carter-Tracy to Benchmark verified. Validate oil-with-gas-cap, oil with no aquifer. Refine Carter-Tracy r_R and μ_w from current hardcoded defaults to derived values. |
| Phase 6 — Volumetric reconciliation + DCA + pressure history match | Pending | — | Pressure history match plot (needs forecast math); MBAL-recoverable reconciliation with DCA forecasts; ContactsTracker and ForecastScenarios sub-components wired. |
| Phase 7 — Report generation + help | Pending | — | — |
| Phase 8 — Polish | Pending | — | — |

---

## 2. Diagnostic findings (2026-05-13)

### 2.1 What exists on disk

Sub-components (UI shells) at `src/components/reservoirbalance/`:

| Component | Lines | Role |
|---|---|---|
| EnergyBalance.jsx | 218 | Core MBAL engine UI |
| PvtRock.jsx | 347 | PVT correlation UI |
| ReportsExport.jsx | 247 | Report generation UI |
| DataHub.jsx | 224 | CSV upload + alias mapping |
| ForecastScenarios.jsx | 158 | DCA forecasting UI |
| AquiferModel.jsx | 152 | Aquifer parameter UI |
| ContactsTracker.jsx | 151 | OWC/GOC tracking UI |
| LoadProjectDialog.jsx | 97 | Project loader |
| HelpGuideDialog.jsx | 92 | Contextual help |

Total: ~1,700 lines of UI shells with sophisticated reservoir engineering thinking baked in.

Routing entry: `src/pages/dashboard/reservoirengineering.jsx` (41 lines, currently a placeholder header).

App.jsx routes pointing at the (missing) main container:
- `apps/reservoir/reservoir-balance`
- `apps/reservoir/reservoir-balance-pro`
- `apps/reservoir/reservoir-balance-surveillance` (legacy alias — preserved)
- `apps/reservoir/material-balance-studio`

### 2.2 What is MISSING (stripped during Horizons migration)

- **Main container** `src/pages/apps/ReservoirBalanceSurveillance.jsx` (referenced in App.jsx line 88, file does not exist on disk). Was documented as 1,200+ lines. **Note:** the component will be created as `ReservoirBalance.jsx` (matching the new shorter name); App.jsx routes will be updated to reference the new component name.
- **All math files** — `src/utils/mbalCalculations.js`, `aquiferCalculations.js`, `pvtCalculations.js`, `dcaCalculations.js`, `contactsCalculations.js`. Documented as 600-1000 lines each, "Very High" complexity.
- **Services layer** — `src/services/reservoirbalance/reservoirBalanceService.js`, `reportGenerationService.js`.
- **Edge Functions** — `calculate-mbal`, `generate-report`, `validate-data`. None deployed.
- **Database schema** — `reservoir_balance_projects`, `reservoir_balance_production_data`, `reservoir_balance_calculations`, `reservoir_balance_reports`, `reservoir_balance_scenarios`. Not deployed.
- **Havlena-Odeh chart in EnergyBalance.jsx** — explicitly stripped to placeholder text "Chart removed" by the migration.

### 2.3 What this means

When a user navigates to any of the four reservoir-balance routes today, the lazy-loaded import fails because the target file doesn't exist. The page never loads. Calculation buttons can't be clicked because there is no page to click them on. The DevTools silence is because lazy-load failures with React.lazy() can be swallowed depending on error boundary configuration.

**The app isn't broken. It was never assembled after migration.** The UI shells survived but the connecting tissue (main container, math engine, persistence, Edge Functions, schema) was stripped.

### 2.4 What the existing UI commits us to

The sub-component code reveals what the original architects intended, and this thinking is sound:

- **Havlena-Odeh approach** — EnergyBalance.jsx references `results.plotData` with `F, Et, Eo, Eg, Ef` fields. These are the standard Havlena-Odeh energy decomposition terms (total fluid expansion = oil + dissolved gas + gas cap + connate water + rock + aquifer). The original UI was built around this rigorous MBAL formulation.
- **Drive indices** — EnergyBalance references `DDI` (depletion drive), `GDI` (gas cap drive), `WDI` (water drive). Standard three-component decomposition.
- **Regression-based OOIP** — `results.ooip` and `results.rSquared` show OOIP is solved via regression, not user-input. This is the correct inverse-problem framing.
- **PVT dual-mode** — PvtRock.jsx distinguishes "uploaded lab PVT table" from "correlated PVT". Both modes will be needed (lab data when available, correlations when not).
- **PVT correlation choices** — UI hardcoded to `pb_rs_bo: 'standing'` and `viscosity: 'beal_cook_spillman'`. The structure supports multiple correlations.
- **Aquifer parameterization** — AquiferModel.jsx uses `raReRatio`, `theta`, `aquiferPerm`, `wei` for Fetkovich and `aquiferThickness`, `aquiferPorosity` for Carter-Tracy. Industry-standard parameterization.
- **DataHub alias mapping** — `findColumnByAlias` resolves "Bo", "Oil FVF", "formation volume factor" to the same field. The right pattern for real-world CSV variability.

The rebuild will preserve all of this thinking. The work is filling in what was stripped, not rethinking the architecture.

---

## 3. Architectural decisions (committed before code)

These choices shape the codebase. They should be revisited only with deliberate intent.

1. **Havlena-Odeh as the MBAL formulation.** Not "calculate pressure from inputs" but "estimate OOIP and drive mechanism via regression on F vs Et plot." This is the mathematically rigorous approach and matches what the existing UI assumes.

2. **Single tank for v1, multi-tank deferred.** First deployable version models one reservoir tank. Multi-tank (compartmentalized) modeling is a v2 enhancement after v1 ships and gets user feedback. **CONFIRMED 2026-05-13.**

3. **Gas reservoir support in v1.** Dry gas via p/z plot must be supported in the first release. The math is genuinely different from oil (volumetric vs depletion mechanism, p/z linearity diagnostic) and Nigerian gas projects matter increasingly. Wet gas and retrograde condensate can be v2. **CONFIRMED 2026-05-13.**

4. **Both correlated and lab-data PVT modes.** Users with lab measurements should upload tables. Users without should use correlations. The engine treats them identically downstream — only the source differs.

5. **PVT correlation suite (industry minimum):**
   - **Bubble point, Bo, Rs:** Standing (default), Vasquez-Beggs, Glaso (heavy Nigerian crude)
   - **Oil viscosity:** Beggs-Robinson (default), Beal-Standing (above Pb), Beal-Cook-Spillman (carried from existing UI)
   - **Gas z-factor:** Hall-Yarborough (default), Dranchuk-Abou-Kassem
   - **Water Bw and viscosity:** McCain (salinity-aware)
   - **Gas viscosity:** Lee-Gonzalez-Eakin

6. **Aquifer history matching, not just calculation.** Aquifer parameters (size, transmissibility, time constant) are unknowns that must be fit by minimizing residuals between observed and predicted pressure. The UI should let users either fix parameters (compute mode) or solve for them (history-match mode). **CONFIRMED 2026-05-13 as optional mode in v1; default is compute mode.**

7. **Diagnostic plots are mandatory, not optional.** The first release must include:
   - **Havlena-Odeh F vs Et** plot (the deleted chart, restored)
   - **p/z plot** for gas reservoirs
   - **Campbell plot** (F/Et vs cumulative) for water-drive diagnosis
   - **Cole plot** (alternative water-drive diagnostic)
   - **Drive indices bar chart** (DDI/GDI/WDI/SDI per timestep)
   - **Pressure history match plot** (observed vs predicted pressure)

8. **Shared engine library pattern.** Mirror the EPE architecture: `supabase/functions/_shared/mbal-engine.ts` is the math source of truth, imported by `calculate-mbal` Edge Function and (later) any batch/sensitivity endpoint.

9. **Volumetric reconciliation as first-class output.** Users should enter volumetric OOIP estimate (from geomodel). The MBAL output should show MBAL-OOIP vs Volumetric-OOIP and the discrepancy ratio. This is what makes MBAL useful — the discrepancy IS the analysis.

10. **Brand consistency with EPE.** White background charts, slate axes, Petrolord watermark via shared `ChartLogo`, theme tokens from `chartTheme.js`. Tabbed results layout mirroring EPE's structure.

11. **Integration with DCA module.** MBAL recoverable estimate (OOIP × recovery factor) should be reconcilable with DCA cumulative forecast. A simple comparison view sufficies for v1. **CONFIRMED 2026-05-13.**

12. **CSV-based data ingestion (v1).** Same pattern as EPE — production CSV, pressure CSV, PVT lab data CSV (optional). Future: integration with operating systems (OFM, ProductionManager) is a v3 ambition.

13. **Fluid-system aware from day one (added 2026-05-13).** The engine math library supports both oil and gas reservoirs from the first commit — same MBE solver with a `fluid_system` discriminator, same PVT module covering both. Phase 1 validates only the gas code paths (against Pletcher's two-cell gas simulation). Phase 2-5 add UI for oil and validate the oil code paths separately. This is more efficient than building oil-only and refactoring later.

---

## 4. Build plan — Option 3 (industry-grade)

Total estimated effort: **70-90 hours over 10-14 working days.** Can start incrementally; major gates between phases.

### Phase 1 — Foundation (12-15 hours) — ✓ DONE 2026-05-13

**Deliverable:** Database schema deployed. Math engine library exists. Pletcher-style validation harness in place. Nothing user-visible yet.

**Steps:**
1. Database schema migration (5 tables, RLS policies, indexes). Tables: `rb_cases`, `rb_run_configs`, `rb_runs`, `rb_results`, `rb_production_data`. Pattern matches EPE.
2. Shared math library `_shared/mbal-engine.ts` with:
   - PVT correlation suite (Standing, Vasquez-Beggs, Glaso, Beggs-Robinson, Hall-Yarborough, McCain water)
   - Havlena-Odeh F and Et computation (oil)
   - Drive index decomposition (DDI/GDI/WDI/SDI for oil; gas-drive/cf-drive/water-drive for gas)
   - Aquifer models (Pot, Fetkovich, Carter-Tracy)
   - Linear regression solver for OOIP/OGIP estimation
   - p/z computation for gas
3. Validation harness mirroring EPE's pattern.

**Artifacts shipped:**

| File | Path | Lines | MD5 |
|---|---|---|---|
| Schema migration (applied) | `supabase/migrations/2026-05-13_reservoir_balance_phase1_schema.sql` | 440 | `25720259a396142c865bdd1143f4d0ee` |
| Math engine | `supabase/functions/_shared/mbal-engine.ts` | 920 | `a3050562c363afe482f89bf117567aad` |
| Validation harness | `tools/validation/mbal-validation.ts` | 369 | `ce6e4ce8034d7f011675ce1a2e30a060` |

**Validation case:** Pletcher SPE 75354 "Two-Cell Gas-Simulation Model" — gas reservoir with weak pot aquifer. Validation source: Pletcher, J.L. (2002), "Improvements to Reservoir Material-Balance Methods," *SPE Reservoir Evaluation & Engineering* 5(1):49-59, DOI 10.2118/75354-PA.

Known true values for validation:
- True OGIP: **100.8 Bcf**
- True aquifer original water in place: **74.5 MM res bbl**
- True final-year (Year 10) cumulative water influx: **2,359,460 STB** (= ~2,494,000 res bbl per Pletcher)
- Expected drive indices at Year 10 (pot aquifer solution): IGD ≈ 0.942, IWD ≈ 0.033, ICD ≈ 0.026, sum ≈ 1.001

**Validation tolerance:**
- OGIP estimate: within ±2% of true (Pletcher reports 0.2% error at 54% recovery)
- Aquifer W: within ±10% of true (Pletcher reports 7% error)
- Drive index sum: 1.00 ± 0.05

**Actual validation result:**
- OGIP: 100.93 Bcf (0.13% from truth)
- Aquifer W: 68.7 MM res bbl (7.84% from truth)
- Cumulative We at Year 10: 2,331,482 res bbl (6.5% from simulator)
- Drive indices: IGD=0.941, IWD=0.033, ICD=0.026, sum=1.0004
- All four assertions passed.

**Bug discovered and fixed during Phase 1 validation:** First validation run reported aquifer W = 110 MM res bbl (47% high). Diagnosis revealed the rock+water effective compressibility formula in Eq. 4 (and the W slope decomposition in Eq. 14) had been transcribed from the source as `Swi·(cw+cf)/(1-Swi)` when the correct form is `(Swi·cw + cf)/(1-Swi)`. Physically: connate water expansion scales with the water-filled fraction Swi, but rock compaction affects all pore volume regardless of saturation. Fixed in three places (gas Efw, gas W solver, oil Efw). After fix, all assertions passed. This is exactly the bug class the validation harness is designed to catch.

**Gate:** Validation harness produces output within tolerances. ✓ MET.

**Regression gate:** Any subsequent change to `mbal-engine.ts` must preserve `mbal-validation.ts` passing. This is the safety net for all future engine changes.

**Note on oil validation:** The engine math supports oil from day one, but Phase 1 only validated gas paths (Pletcher's two-cell gas simulation). Oil validation is explicitly deferred to Phase 5. The engine emits a warning in oil-mode results documenting this status.

### Phase 2 — Plumbing: case management + single-run engine endpoint (10-12 hours) — ✓ DONE 2026-05-13

**Deliverable:** End-to-end flow from case creation → production data entry → MBAL run → results visible in the UI. Gas case smoke-tests pass. Oil math reachable but flagged as unvalidated.

**Architecture that emerged (different from original scope):**

The original Phase 2 scope said "reconstruct main container." During Phase 2 diagnostic I found that EPE's pattern is multiple sibling pages, not one monolithic container. Reservoir Balance now follows the same:

- `src/pages/apps/reservoir-balance/ReservoirBalance.jsx` — case list page (entry point that App.jsx imports)
- `src/pages/apps/reservoir-balance/RbCaseDetail.jsx` — tabbed case detail page (Overview / Data / Run / Advanced)
- `src/pages/apps/reservoir-balance/lib/api.js` — co-located API helper (case CRUD, run invocation, results fetch)

The existing sub-components (PvtRock, AquiferModel, ContactsTracker, etc.) are **not mounted** in Phase 2. They appear as "Phase 3 preview" placeholder cards in the Advanced tab. Phase 3 wires them properly.

**Artifacts shipped (6):**

| # | File | Path | Lines | MD5 |
|---|---|---|---|---|
| 1 | Edge Function | `supabase/functions/calculate-mbal/index.ts` | 382 | `63c816cf4f6b93049ac7204e344e9969` |
| 2 | API helper | `src/pages/apps/reservoir-balance/lib/api.js` | 416 | `99ae2dee60c6ffe5e81f84eee0757948` |
| 3 | Case list page | `src/pages/apps/reservoir-balance/ReservoirBalance.jsx` | 563 | `8d48fbaf1b358aeaa86bebf8a07bc3e8` |
| 4 | Case detail page | `src/pages/apps/reservoir-balance/RbCaseDetail.jsx` | 879 | `9932417b04b31195b86f520fd0ec11d7` |
| 5 | App.jsx routing patch | `tools/patches/2026-05-13_app_jsx_rb_routes.cjs` | 370 | `02e0ea688f345018b55f2c5051fa25f1` |
| 6 | EnergyBalance.jsx neutralization patch | `tools/patches/2026-05-13_energy_balance_neutralize.cjs` | 380 | `0ef44dea2a987289f762c9d8031e8a81` |

**Plus one migration applied directly via Supabase SQL editor:**

```sql
-- RLS hotfix discovered during Phase 2 smoke test
ALTER TABLE rb_cases ALTER COLUMN user_id SET DEFAULT auth.uid();
```

Originally `rb_cases.user_id` had no default; client INSERTs failed RLS check because the column came in null. Belt-and-suspenders fix went DB-side (default) rather than client-side (stamping) to protect any future code path that inserts.

**Routes after App.jsx patch (8 total):**

| Route | Element |
|---|---|
| `apps/reservoir/reservoir-balance` | `<ReservoirBalance />` (case list) |
| `apps/reservoir/reservoir-balance/cases/:caseId` | `<RbCaseDetail />` |
| `apps/reservoir/reservoir-balance-pro` | `<ReservoirBalance />` |
| `apps/reservoir/reservoir-balance-pro/cases/:caseId` | `<RbCaseDetail />` |
| `apps/reservoir/reservoir-balance-surveillance` | `<ReservoirBalance />` |
| `apps/reservoir/reservoir-balance-surveillance/cases/:caseId` | `<RbCaseDetail />` |
| `apps/reservoir/material-balance-studio` | `<ReservoirBalance />` |
| `apps/reservoir/material-balance-studio/cases/:caseId` | `<RbCaseDetail />` |

4 case-list aliases + 4 case-detail siblings. The aliases preserve back-compat with various database slugs that exist in the dashboard tile registry.

**Gate (revised from original scope):** The original scope wrote: *"Submitting an oil reservoir validation case via the UI produces the expected OOIP."* Revised mid-Phase per scope-decision-of-record: gate is **plumbing-only smoke test with a gas case; oil math validation deferred to Phase 5**. Rationale: we don't have a published oil worked example available at Phase 2 time, so a "validation" gate for oil math would be empty ceremony. The Phase 5 gate will validate oil math properly when we have Pletcher Table 9 or Tarek Ahmed accessible.

**Smoke test outcome:** Gas case end-to-end flow verified — create case → add production data → save → run MBAL → result panel renders with OGIP, drive indices, R². ✓ MET.

**Honest limitations of Phase 2:**

- No CSV upload yet (Phase 3 wires DataHub.jsx)
- No user-configurable PVT correlations yet (Phase 3 wires PvtRock.jsx; Phase 2 uses Standing/Hall-Yarborough defaults)
- No user-configurable aquifer model yet (Phase 3 wires AquiferModel.jsx; Phase 2 uses pot aquifer if `has_aquifer=true`)
- No diagnostic plots yet (Phase 4 builds six)
- Existing sub-components (PvtRock, AquiferModel, ContactsTracker, ForecastScenarios, DataHub, ReportsExport) shown as Phase 3 preview placeholders
- Oil math is reachable but emits an "unvalidated" warning in every result; a banner appears in the UI for oil/oil-with-gas-cap cases

### Phase 3 — Full UI integration

Split into two capsules.

#### Capsule 3A — Case detail wiring (PVT, Aquifer, DataHub) — ✓ DONE 2026-05-14

**Deliverable:** PvtRock, AquiferModel, and DataHub fully wired through engine + UI + Edge Function. Case detail page has six functional tabs (Overview / Data / PVT / Aquifer / Run / Advanced). Engine extended to support oil pot aquifer math. Validation harness extended to a two-case regime (gas + oil), both passing Pletcher SPE 75354 to publication accuracy.

**Validation results (two-case regression gate at capsule close):**

| Case | Quantity | Engine | Pletcher reference | Error |
|---|---|---|---|---|
| Gas (Tables 1-3) | OGIP | 100.99 Bcf | 100.8 truth, 101.0 paper | 0.19% |
| Gas (Tables 1-3) | Aquifer W | 69.0 MM rb | 74.5 truth | 7.4% |
| Gas (Tables 1-3) | We at Year 10 | 2,344,383 rb | 2,494,000 simulator | 6.0% |
| Oil (Tables 10-13) | OOIP | 20.27 MM STB | 20.3 paper | 0.13% |
| Oil (Tables 10-13) | Aquifer W | 78.9 MM rb | 79 paper, 80 truth | 0.10% |
| Oil (Tables 10-13) | IDD / IWD / ICD | 0.586 / 0.288 / 0.114 | 0.592 / 0.290 / 0.115 | within 0.02 each |

11 of 11 assertions pass. Validation gate is now two cases, run together.

**Artifacts shipped (9 main + ~5 mid-capsule fix bundles):**

| # | File | Path | Lines | MD5 |
|---|---|---|---|---|
| 1 | Engine public export of `generatePvtTable` + extension for oil pot aquifer + Bg lab-PVT respect | `supabase/functions/_shared/mbal-engine.ts` | 1257 | `95da0a0e6693144fc21d81d7aa8d9a30` |
| 2 | Edge Function for PVT preview (browser-callable) | `supabase/functions/generate-pvt-preview/index.ts` | 186 | `68965d605050722ae5476896b5e3976e` |
| 3 | API helper extensions (`getPvtPreview`, `getCaseDefaultConfig`, `upsertCaseDefaultConfig`, `savePvtConfig`) | `src/pages/apps/reservoir-balance/lib/api.js` | 636 | `9b7a1180a33e5f673f6bf54927853745` |
| 4 | PvtRock.jsx rewrite | `src/components/reservoirbalance/PvtRock.jsx` | 831 | `57f24eb90efaee1860bd9889187eb443` |
| 5 | RbCaseDetail.jsx PVT tab patch (`.cjs`) | `tools/patches/2026-05-14_rb_case_detail_pvt_tab.cjs` | — | `bee09c2986645eea18fee2175e09baf3` |
| 6 | AquiferModel.jsx rewrite | `src/components/reservoirbalance/AquiferModel.jsx` | 399 | `964d708afbb39c3198ff536fa8010d12` |
| 7 | RbCaseDetail.jsx Aquifer tab patch (`.cjs`) | `tools/patches/2026-05-14_rb_case_detail_aquifer_tab.cjs` | 300 | `e6610cd2b690b5f442bf1ea1fcf29de0` |
| 8 | DataHub.jsx rewrite | `src/components/reservoirbalance/DataHub.jsx` | 771 | `45641d9ba29185da72505caf6d05393d` |
| 9 | RbCaseDetail.jsx full rewrite (DataHub mount + state cleanup) | `src/pages/apps/reservoir-balance/RbCaseDetail.jsx` | 680 | `998269c57d3afa6c78324ad8256b93a4` |

**Plus validation harness extension:**

| File | Path | Lines | MD5 |
|---|---|---|---|
| Validation harness (two-case: gas + oil) | `tools/validation/mbal-validation.ts` | 600 | `4ed8b3a17753731564c3f56b681be937` |

**Plus one schema migration applied directly via Supabase SQL editor:**

```sql
-- final_cdi column was missing from Phase 1 schema; fixed in place during Capsule 3A
ALTER TABLE rb_results ADD COLUMN IF NOT EXISTS final_cdi double precision;
```

**Mid-capsule fix bundles (latent bugs surfaced and fixed):**

- `calculate-mbal` Edge Function was 404-missing from Supabase deployment; redeployed and `auth.getUser(token)` bug fixed
- `generate-pvt-preview` Edge Function had the same `auth.getUser()` (no args) bug class; fixed during PVT arc
- Engine bug: per-row lab Bg (`bg_rb_mscf`) was silently ignored; engine always recomputed from z-correlation. Found while reviewing the rb_production_data schema during DataHub design. Fixed on both gas and oil paths. Also fixed corresponding Bgi handling so initial-state PVT uses the same source as per-row PVT (otherwise `Eg = Bg - Bgi` mixes correlation-derived and lab-derived values). Oil OOIP error improved from 1.79% → 0.13%; oil W from 4.10% → 0.10%.
- Engine bug: oil pot aquifer regression initially used Et (= Eo + Efw) as denominator; should use Eo only per Pletcher's derivation. Caught during validation.
- OCR'd Pletcher Table 11 column order was misread as Np-Gp-Wp; actual order is Np-Wp-Gp. Detected via Rp = Gp/Np ≈ Rsi sanity check above bubble point. ~45 min debugging spent on a regression bug that was actually a data-ingestion error.

**Architecture: case detail tab structure after Capsule 3A**

```
RbCaseDetail.jsx
├── Overview tab     (case metadata, last run summary, production count from server)
├── Data tab         (<DataHub />: CSV upload, alias mapping, unit detection, schema validation)
├── PVT tab          (<PvtRock />: correlation selection, lab-table mode, preview via Edge Function)
├── Aquifer tab      (<AquiferModel />: none / pot selectable; Fetkovich, Carter-Tracy disabled Phase 4)
├── Run tab          (handleRun inherits PVT + aquifer + rock settings from case-default config)
└── Advanced tab     (3 remaining Phase 4 preview placeholders: Contacts tracker, Forecast scenarios, Diagnostic plots)
```

**Gate met:** Six tabs working, CSV-to-results end-to-end functional, oil + pot aquifer validated against published worked example. The "two engines diverging" problem that Capsule 3A was started to address is genuinely resolved: the engine the suite ships is the engine that's validated. ✓

**Honest limitations after Capsule 3A:**

- Diagnostic plots not yet rendered (Capsule 3B)
- PVT correlation library is Standing + Hall-Yarborough only (Phase 4 adds Vasquez-Beggs, Glaso, Beal-Standing, Lee-Gonzalez-Eakin, Beggs-Robinson)
- Fetkovich and Carter-Tracy aquifers not yet implemented in engine (Phase 4)
- Oil without aquifer, oil with gas cap, gas with strong waterdrive paths exist in engine but lack published-example validation (each phase will add its own validation case as worked examples are sourced)
- Standalone PVT lab table upload not yet wired (per-row PVT in DataHub works; a separate full-table upload to `pvt_lab_table` is Phase 4)
- Atomic `rb_run_configs` default-config upsert via Postgres RPC is still non-atomic (read-then-write); race-condition tolerable for single-user case work, target Phase 4

#### Capsule 3B — Diagnostic plots — ✓ DONE 2026-05-15

**Deliverable:** Five diagnostic plots rendered in a new Plots tab on the case detail page (between Run and Advanced). Case detail goes from 6 tabs to 7. Plots are conditionally rendered by fluid system. Petrolord chart conventions followed: bg-white wrappers, ChartLogo watermarks, chartTheme tokens for typography and grid/tooltip styling. Pressure history match deferred to Phase 6 (it needs forecast math we don't have yet — the engine consumes pressures as inputs, doesn't predict them).

**Plots shipped (5):**

| # | Plot | Y-axis | X-axis | Shows for | Diagnostic value |
|---|---|---|---|---|---|
| 1 | Havlena-Odeh F vs Et | F (res bbl) | Et (RB/STB or RB/Mscf) | Both | Slope/intercept gives OOIP/OGIP; R² shows regression quality |
| 2 | p/z | p/z (psia) | Gp (Bcf) | Gas only | Linear extrapolation to p/z=0 vs MBAL OGIP shows aquifer overestimation |
| 3 | Cole | F/Eg (Bcf) | Gp (Bcf) | Gas only | Pletcher's signature — negative slope reveals weak waterdrive |
| 4 | Campbell | F/Et (MM STB) | F (res bbl) | Oil only | Oil-side equivalent of Cole; same diagnostic shapes |
| 5 | Drive indices stacked bar | Index value | Timestep | Both | Visual sanity check that drive indices sum to ~1.0 per timestep |

Gas case shows 4 plots (F vs Et, p/z, Cole, drive indices). Oil case shows 3 (F vs Et, Campbell, drive indices). Both include F vs Et and drive indices as the foundational Havlena-Odeh visualizations.

**Pressure history match deferred to Phase 6.** The engine takes pressures as input and computes F, OOIP, etc. as output. A real pressure history match plot requires solving the MBE inverse: given N (or G) from regression, solve `F(p) = N·Et(p) + (cw+cf)·W·(pi-p)` for predicted p at each timestep via Newton iteration. That's ~50-100 lines of new engine math plus a new persisted field. It belongs with forecast work, not with the diagnostic plotting capsule.

**Artifacts shipped (3 main):**

| # | File | Path | Lines | MD5 |
|---|---|---|---|---|
| 1 | Edge Function extension: `cum_oil_stb`, `cum_gas_scf`, `cum_water_stb`, `point_in_fit` added to `plot_data` JSONB | `supabase/functions/calculate-mbal/index.ts` | 415 | `82cf499261553d36f9f5e4cb4e5d5f90` |
| 2 | RbDiagnosticPlots.jsx — master component with 5 sub-plots | `src/components/reservoirbalance/RbDiagnosticPlots.jsx` | 1023 | `84bb8f0c94bcf66bae4779b6ecfa2d7f` |
| 3 | RbCaseDetail.jsx Plots tab patch (`.cjs`) | `tools/patches/2026-05-15_rb_case_detail_plots_tab.cjs` | 263 | `22d2e156f59f92f946bc4fe5dd7bee67` |

**Notable design decisions:**

- **Excluded points rendered as hollow circles**, in-fit points as filled. Uses two separate `Scatter` series (`F_included` and `F_excluded` columns) to make Recharts render different shapes. Directly mirrors how Pletcher's Fig. 4 and Fig. 12 distinguish early-time vs late-time data.
- **Annotation boxes top-right of each plot** — lightweight absolute-positioned divs showing R², slope, OOIP/OGIP, or p/z extrapolation vs MBAL comparison. The validation story (numbers) lives next to the visualization (shapes).
- **Reference lines on Cole and Campbell** showing MBAL-derived OOIP/OGIP. The reader visually sees whether apparent-from-plot values are migrating toward the MBAL value as Pletcher's "weak waterdrive" pattern predicts.
- **Drive indices Y-axis clamped to [0, 1.2]** with dashed red `ReferenceLine` at y=1.0 labeled "Sum = 1.0 (correct MBE)". Pletcher's MBE-correctness check is now visible at a glance.
- **No engine changes.** All plot data comes from existing engine output (Phase 1) plus 4 fields added to the Edge Function plot_data construction (passthrough from inputs + one derived boolean). The engine remains validated and untouched.
- **No DB migration.** `plot_data` is a JSONB column; new keys appear additively.

**Architecture: case detail tab structure after Capsule 3B**

```
RbCaseDetail.jsx
├── Overview tab     (case metadata, last run summary)
├── Data tab         (<DataHub />: CSV upload, alias mapping, validation)
├── PVT tab          (<PvtRock />: correlation selection, preview)
├── Aquifer tab      (<AquiferModel />: none / pot selectable)
├── Run tab          (handleRun, last result card)
├── Plots tab        (<RbDiagnosticPlots />: 5 plots, conditional by fluid system)   ← NEW IN 3B
└── Advanced tab     (3 Phase 4-6 preview placeholders)
```

**Gate met:** All five plots render correctly for both Pletcher validation cases. Visual inspection: gas case F vs Et shows the expected straight-line fit with R²=0.9999; gas case p/z plot extrapolates to ~105 Bcf (matching Pletcher's modified p/z over-estimation); gas case Cole plot shows the signature negative slope Pletcher describes; oil case Campbell plot shows the same negative slope migrating toward MBAL OOIP. Drive indices for both cases sum to ~1.0 per timestep. ✓

**Honest limitations after Capsule 3B:**

- Pressure history match plot missing (Phase 6)
- Plot export-as-image button not wired (DCA uses `exportChartAsImage` from `@/utils/declineCurve/dcaExport`; would need to either generalize that helper or add an MBAL-specific one; deferred to polish)
- Plots auto-refresh manually via the Refresh button; no live update when a new run completes in another tab
- No drill-down: clicking a plot point doesn't surface that timestep's data (Phase 4-5 polish)
- Modified p/z (Ramagost-Farshad correction for high-cf reservoirs) not separately plotted; the engine internally computes the cf-corrected p/z but the plot shows the raw p/z. For abnormally pressured gas reservoirs the difference matters; add the modified curve as a dashed overlay in Phase 4 PVT work.


### Phase 4 — Aquifer models + tier system + PVT correlations

Split into three capsules. 4A and 4B closed in single sprint on 2026-05-15; 4C (PVT correlations) deferred.

#### Capsule 4A — Fetkovich + Carter-Tracy engine math + tier system — ✓ DONE 2026-05-15

**Deliverable:** Fetkovich and Carter-Tracy aquifer paths activated in the engine (both fluid systems). Validation tier system introduced. Three-case validation gate.

**Validation results (three-case regression gate at capsule close):**

| Case | Quantity | Engine | Pletcher reference | Error |
|---|---|---|---|---|
| Gas + pot aquifer (Tables 1-3) | OGIP | 100.99 Bcf | 100.8 truth, 101.0 paper | 0.19% |
| Gas + pot aquifer | Aquifer W | 69.0 MM rb | 74.5 MM rb truth | 7.4% |
| Oil + pot aquifer (Tables 10-13) | OOIP | 20.27 MM STB | 20.3 MM STB paper | 0.13% |
| Oil + pot aquifer | Aquifer W | 78.9 MM rb | 79 MM rb paper | 0.10% |
| **Gas + Fetkovich (Tables 9 / Fig. 8)** | **OGIP** | **101.57 Bcf** | **100.8 truth, 101.5 paper** | **0.76%** |
| Gas + Fetkovich | R² | 1.0000 | (Pletcher Fig. 8 strong linearity) | — |
| Gas + Fetkovich | WDI final | 0.270 | (strong waterdrive expected) | — |
| Gas + Fetkovich | Drive sum | 0.986 | 1.000 ± 0.050 | within tolerance |

**16 of 16 assertions pass** across all three cases. The validation gate is now three cases.

**Engine artifacts:**

| # | File | Path | Lines | MD5 |
|---|---|---|---|---|
| Engine math + tier system | `supabase/functions/_shared/mbal-engine.ts` | 1733 | `523e6b949296af9cef5642bbdde1a193` |
| Validation harness (Case 3 added) | `tools/validation/mbal-validation.ts` | 830 | `9c801aa46a826f960288a71bbecb093a` |

**New engine features:**

- `validation_tier: 'benchmark_verified' | 'published_method' | 'engineering_basis'` field added to `MBALResult`
- `validation_reference?: string` — human-readable published reference for the method
- `validation_tolerance_pct?: number` — measured tolerance for benchmark-verified paths
- `observation_date?: string` field added to `ProductionDataPoint` — required for time-marching aquifer models
- `extractTimedeltasDays()` helper — parses ISO dates, returns Δt array, throws clear errors if dates missing/malformed/non-monotonic
- `computeFetkovichWe()` helper — marching scheme: `ΔWe[n] = (Wei/pi) · (p̄_aq[n-1] − p_wf[n]) · (1 − exp(−J·pi·Δt/Wei))`. Uses midpoint p_wf convention.
- `resolveValidationTier()` helper — single source of truth for tier mapping, takes (fluid_system, aquifer_model, has_gas_cap) and returns tier + reference text + measured tolerance

**Discovery during chunk b:** Engine math for Carter-Tracy (`computeCarterTracyWe`) and explicit gas/oil aquifer-model branching were pre-existing as scaffolding from Phase 1, sitting unused. Chunk (a) added the missing infrastructure (Δt extraction, tier system) that activated those existing code paths. Lesson captured for process patterns.

#### Capsule 4B — Aquifer UI + tier badges — ✓ DONE 2026-05-15

**Deliverable:** All four aquifer models selectable in the UI with appropriate parameter inputs. Validation tier system surfaces visually via a new shared badge component.

**UI artifacts:**

| # | File | Path | Lines | MD5 |
|---|---|---|---|---|
| ValidationTierBadge (new shared component) | `src/components/reservoirbalance/ValidationTierBadge.jsx` | 141 | `59ae0e1627feb919bc3eaac278f6cbfe` |
| AquiferModel rewrite | `src/components/reservoirbalance/AquiferModel.jsx` | 647 | `995881b3e37122e48fbe4b37728c50bb` |
| RbCaseDetail tier-badge patch | `tools/patches/2026-05-15_rb_case_detail_tier_badge.cjs` | 293 | `5c57a90c9c24350dadac02f3333b1492` |

**UI features added:**

- **AquiferModel.jsx** — Fetkovich and Carter-Tracy now enabled. Fetkovich shows real parameter inputs (W in MM rb, J in rb/D/psi, optional ct). Carter-Tracy shows parameter inputs (k, h, φ, θ, optional radius_ratio, optional ct). Validation enforced before save. Observation_date precondition warning when time-marching model is selected. Honest disclosure of Carter-Tracy's hardcoded assumptions (r_R = 2980 ft, μ_w = 0.5 cP) in the parameter card itself.
- **ValidationTierBadge.jsx** — Reusable component rendering the engine's tier with three visual treatments. Constructive language ("Benchmark verified" / "Published method" / "Engineering basis") with full reference text in tooltip. Two sizes (sm for compact contexts, md for primary surfaces).
- **RbCaseDetail.jsx** — Tier badge surfaces in Overview-tab "Last result" tile and in Run-tab result card header. Legacy pre-Capsule-4A result rows fall back to the original green CheckCircle2 (graceful backward compatibility, no DB migration required).

**Honest limitations after Capsule 4A + 4B:**

- Carter-Tracy is shipping at Published-method tier (not Benchmark verified) because we haven't sourced a published Carter-Tracy worked example for end-to-end comparison. Phase 5 will close this.
- Carter-Tracy hardcoded defaults: `r_R = 2980 ft` (640-acre single-cell convention) and `μ_w = 0.5 cP`. Disclosed to the user in the AquiferModel parameter card. Phase 5 will refine: r_R derived from reservoir geometry, μ_w computed from temperature and salinity.
- Oil with gas cap (m > 0) is Published-method tier. Phase 5 will source a worked example to elevate to Benchmark verified.
- Engineering_basis tier exists in the type system but nothing emits it today. Reserved for future paths (e.g. PVT correlations tuned for Nigerian crude families, fault-bounded compartment aquifers).
- `r_R` and `μ_w` aren't yet exposed as user inputs even though they affect Carter-Tracy results. Phase 5 polish.
- Tier mapping is duplicated between engine (`resolveValidationTier`) and UI (`AQUIFER_MODEL_OPTIONS` in AquiferModel.jsx). Phase 7 polish: consolidate via a `/tier-info` Edge Function.

### Phase 4 Capsule 4C — PVT correlation library (12-15 hours) — Pending

**Deliverable:** Production-grade PVT correlation library with multiple options. The largest single Phase 4 remaining piece. Was originally planned as part of Phase 4 alongside aquifer work; aquifers shipped first because the placeholder UI labels (which 4B closed) were the most visible Phase 3 deferrals.

**PVT correlations to add:**
1. Vasquez-Beggs (oil Rs/Bo — alternative to Standing for high-API oils)
2. Glaso (oil Rs/Bo — North Sea / Nigeria-relevant lighter crudes)
3. Beal-Standing-Cook-Spillman (dead oil and undersaturated oil viscosity)
4. Beggs-Robinson (saturated/live oil viscosity)
5. Lee-Gonzalez-Eakin (gas viscosity)
6. Dranchuk-Abou-Kassem (gas z-factor — alternative to Hall-Yarborough at low Tpr)
7. McCain (water FVF improvement over current linear approximation)

**Standalone PVT lab table upload:**
- Separate `pvt_lab_table` JSON column on `rb_run_configs` with full lab-measured PVT at multiple pressures
- Engine looks up PVT by interpolation rather than per-row override
- UI: separate upload card in DataHub or PvtRock for the lab table

**Gate:** Each new correlation passes a published-example validation case (or `engineering_basis` tier if no suitable case exists for a Nigerian-tuned variant). Validation harness gains one new assertion block per correlation tier promotion.

### Phase 5 — Carter-Tracy benchmark + remaining oil paths (8-10 hours)

**Deliverable:** Promote Carter-Tracy from Published-method to Benchmark-verified. Validate oil-with-gas-cap. Validate oil with no aquifer. Refine hardcoded Carter-Tracy assumptions.

**Carter-Tracy benchmark:**
- Source a published Carter-Tracy worked example. Candidates: Dake's *Practice of Reservoir Engineering* (Section 9), Lee & Wattenbarger's *Gas Reservoir Engineering* (SPE Textbook 5, Section 9.5), Carter & Tracy's original 1960 paper. Several Pletcher cases mention Carter-Tracy in passing; full-data versions worth investigating.
- Once located, add Case 4 to the validation gate with assertion block. On pass, update `resolveValidationTier` to promote both gas+CT and oil+CT to `benchmark_verified` with the measured tolerance.

**Oil paths:**
- Source worked examples for: oil + gas cap, oil + no aquifer
- Candidates: Tarek Ahmed handbook, Craft-Hawkins-Terry, additional Pletcher cases
- Extend validation gate to Cases 5, 6 (or whatever's needed)

**Hardcoded refinement:**
- Replace `r_R = 2980 ft` with derivation from reservoir geometry (typically `r_R = √(A / π)` where A is the drainage area)
- Replace `μ_w = 0.5 cP` with computation from reservoir temperature and water salinity (McCain correlation already in engine for Bw — extend for μ_w)
- Surface both as inputs in PvtRock UI for user override

**Gate:** All eight engine paths (gas {none, pot, Fetkovich, CT} × oil {none, pot, Fetkovich, CT}) have either Benchmark-verified or Published-method tier with full documented basis. Validation gate has ≥5 cases.

### Phase 6 — Volumetric reconciliation + DCA + pressure history match (6-8 hours)

**Deliverable:** Pressure history match plot (needs forecast math); MBAL-recoverable reconciliation with DCA forecasts; ContactsTracker and ForecastScenarios sub-components wired.

**Pressure history match:** The diagnostic Capsule 3B deferred. Requires the engine to solve the inverse MBE: given N (or G) from regression, solve `F(p) = N·Et(p) + (cw+cf)·W·(pi−p)` for predicted p at each timestep via Newton iteration. ~50-100 lines new engine math + new persisted field. Sixth plot lands in the Plots tab.

### Phase 7 — Report generation + scenarios (8-10 hours)

**Deliverable:** PDF and CSV export. Scenario save/load/compare. Help guide written. Dashboard tile rename ("Reservoir Balance Surveillance" → "Reservoir Balance") in tile registry. `EnergyBalance.jsx` file deletion. Tier-mapping consolidation via `/tier-info` Edge Function.

### Phase 8 — Polish + testing (6-8 hours)

**Deliverable:** Robust error handling. Empty-state UX. Loading states. Performance check with realistic 50-100-point dataset. Final visual polish.

---

## 4.5 Validation tier vocabulary (Capsule 4A reference)

The engine emits a `validation_tier` field on every result. The vocabulary is used identically by the engine, the UI badge, the scope doc, and any future report-generation surface. Keep this section in sync with `resolveValidationTier()` in `mbal-engine.ts`.

| Tier (internal) | UI badge text | Definition |
|---|---|---|
| `benchmark_verified` | **Benchmark verified** | Implementation has been tested against a published worked example and matches within the stated tolerance. The reference case is recorded for traceability. |
| `published_method` | **Published method** | Implementation follows a recognized peer-reviewed or industry-standard formulation. The workflow includes documented assumptions, internal checks, and calculation traceability. |
| `engineering_basis` | **Engineering basis** | Implementation follows established reservoir engineering principles where a suitable public worked example is not available. The method is documented, traceable, and ready for engineering use within stated assumptions. |

### Tier mapping as of Capsule 4B close

| Engine path | Tier | Reference |
|---|---|---|
| Gas + pot aquifer | **Benchmark verified** (0.19%) | Pletcher SPE 75354 Tables 1-3 |
| Gas + Fetkovich | **Benchmark verified** (0.76%) | Pletcher SPE 75354 Tables 9 / Fig. 8 |
| Gas + Carter-Tracy | Published method | Carter-Tracy 1960 + Lee-Wattenbarger pD/pD′ polynomial |
| Gas + no aquifer | Published method | Standard p/z (Havlena-Odeh 1963) |
| Oil + pot, no gas cap | **Benchmark verified** (0.13%) | Pletcher SPE 75354 Tables 10-13 |
| Oil + pot, with gas cap | Published method | Havlena-Odeh 1963 generalized to m>0 |
| Oil + Fetkovich | Published method | Standard Fetkovich SPE 2603 applied to oil MBE |
| Oil + Carter-Tracy | Published method | Carter-Tracy 1960 applied to oil MBE |
| Oil + no aquifer | Published method | Standard oil material balance (Havlena-Odeh 1963) |

**Three paths Benchmark verified. Six paths Published method. Engineering basis slot reserved for future paths.**

The user-facing wording on these tiers was refined collaboratively during Capsule 4A planning. Earlier drafts used "Standard formulation" and "Preliminary"; the final vocabulary frames each tier as legitimate engineering practice differentiated by *what evidence supports it*, not by *how much we trust our own work*. A reservoir engineer reading the badge gets a precise epistemic claim, not a hedge.



---

## 5. Validation strategy

### 5.1 Phase 1 validation case (CONFIRMED 2026-05-13)

**Source:** Pletcher, J.L. (2002), "Improvements to Reservoir Material-Balance Methods," *SPE Reservoir Evaluation & Engineering* 5(1):49-59, DOI 10.2118/75354-PA.

**Specific case:** Two-Cell Gas-Simulation Model (Tables 1-3 in the paper). Gas reservoir with weak pot aquifer. 10-year production history with full PVT and water influx data.

**Why this case:** Peer-reviewed primary source (SPE journal). Complete numerical data available. Validates: gas MBE, p/z method, modified Cole plot, pot aquifer model, drive indices, OGIP regression. Exercises the same engine architecture (PVT, F, Et, drive indices, regression, aquifer) that oil reservoirs use, just with gas-specific terms.

### 5.2 Why not Tarek Ahmed (as originally planned)

The original scope (2026-05-13 morning) committed to "Tarek Ahmed water-drive case" as the validation reference. During Phase 1 setup, the specific worked example's numerical data could not be reliably extracted from publicly available web sources without risk of reconstruction error. Pletcher SPE 75354 was chosen as the substitute because:

- Pletcher is a peer-reviewed primary source (SPE journal); Tarek Ahmed is a textbook that itself cites SPE papers
- Complete numerical data for the Pletcher case is in our context
- The gas case exercises ~80% of the engine architecture that the oil case would

Tarek Ahmed remains the preferred reference for oil validation in Phase 5.

### 5.3 Validation tolerances (Phase 1 + Capsule 3A + Capsule 4A three-case regime)

**Case 1 — Gas + pot aquifer (Pletcher Tables 1-3, Year 10 at 54% recovery):**
- OGIP estimate: within ±2% of true value (100.8 Bcf)
- Aquifer original water in place: within ±10% of true value (74.5 MM res bbl)
- Cumulative water influx at Year 10: within ±10% of simulator value
- Drive index sum: 1.00 ± 0.05

**Case 2 — Oil + pot aquifer (Pletcher Tables 10-13, Day 3,595 at 21% recovery):**
- OOIP estimate: within ±5% of Pletcher's 20.3 MM STB
- Aquifer original water in place: within ±10% of Pletcher's 79 MM res bbl
- Individual drive indices (IDD, IWD, ICD): within ±0.03 of Pletcher's reported values
- Drive index sum: 1.00 ± 0.05

**Case 3 — Gas + Fetkovich aquifer (Pletcher Table 9 / Fig. 8, Year 10):**
- OGIP estimate: within ±5% of Pletcher's 100.8 Bcf truth (engine achieves 0.76%)
- Regression R²: > 0.99 (engine achieves 1.0000)
- Final WDI: > 0.20 (engine achieves 0.270, strong waterdrive)
- Drive index sum: 1.00 ± 0.05 (engine achieves 0.986)
- Validation tier emitted by engine: `benchmark_verified`

### 5.4 Regression gate

Once Phase 1's validation harness was built, every subsequent engine change must preserve all validation case outputs. After Capsule 4A, the gate is three cases (gas+pot, oil+pot, gas+Fetkovich), all run on every change. This is the safety net.

Validation gate is invoked via:
```
cd /opt/petrolord-studio/workspaces/dev1/projects/petrolord-suite
npx tsx tools/validation/mbal-validation.ts
```

Expected exit code: 0. Expected last line: `Phase 1 + Phase 3 + Capsule 4A validation gate: PASSED`. Total: 16/16 assertions pass across 3 cases.

### 5.5 Beyond Capsule 4A

**Phase 4 Capsule 4C** (PVT correlations) won't add new validation cases per se — the existing 3 cases exercise both lab-PVT and correlation paths. Instead, each new PVT correlation will be assertion-block-extended against the existing cases: "does the engine match Pletcher when using Vasquez-Beggs instead of Standing?"

**Phase 5** will add new validation cases:
- Case 4 — Gas/Oil + Carter-Tracy — promotes both CT paths from Published-method to Benchmark-verified. Validation case TBD; Dake *Practice of Reservoir Engineering* Section 9 is the most likely source.
- Case 5 — Oil + gas cap (m > 0) — validation case TBD; Tarek Ahmed handbook, Craft-Hawkins-Terry, or additional Pletcher cases.
- Case 6 — Oil + no aquifer — any volumetric depletion-drive case in the literature.

Total validation gate target by end of Phase 5: 5-6 assertion blocks across 5-6 reservoir cases.

In future, we can extend validation to a real-world Nigerian field with published audit (rare but valuable).

---

## 6. Open decisions — RESOLVED

| Decision | Resolution | When |
|---|---|---|
| Validation worked example | Pletcher SPE 75354 gas example for Phase 1; oil validation deferred to Phase 5 | 2026-05-13 |
| Multi-tank in v1 | NO — deferred to v2 | 2026-05-13 |
| Aquifer history matching in v1 | YES as optional mode (default is compute mode with fixed parameters) | 2026-05-13 |
| Wet gas / condensate in v1 | NO — deferred to v2 | 2026-05-13 |
| DCA integration | YES — MBAL recoverable as reference line on DCA forecast | 2026-05-13 |
| Phase 2 capsule sizing | Single capsule shipping all 6 artifacts together (rather than two sub-capsules) | 2026-05-13 |
| Phase 2 gate scope | Plumbing-only smoke test (gas case); oil math validation deferred to Phase 5 | 2026-05-13 |
| Phase 2 architecture | Two-page pattern (case list + case detail) mirroring EPE, not single monolithic container | 2026-05-13 |
| EnergyBalance.jsx treatment in Phase 2 | Neutralize the dead `mbalCalculations` import with placeholder body. Phase 3 rebuilds with async Edge Function call. | 2026-05-13 |
| PVT preview mechanism | Unify via Edge Function (Option b). Engine generates PVT table server-side; UI fetches via REST. Single source of truth, no two-engine drift risk. | 2026-05-14 |
| Capsule 3A scope on AquiferModel UI | Honest minimum — only expose what engine supports today. Fetkovich/Carter-Tracy disabled with "Phase 4" labels. | 2026-05-14 |
| Capsule 3A scope on oil aquifer math | Bring forward (was Phase 5). Engine extension + validation harness completed in 3A; oil + pot aquifer validated to 0.13% OOIP / 0.10% W against Pletcher SPE 75354 Tables 10-13. | 2026-05-14 |
| Oil aquifer math validation path | Path A — published worked example. Pletcher Tables 10-13 had complete numerical data (Tables 10, 11, 12, 13 cover properties, performance, PVT, drive indices). | 2026-05-14 |
| DataHub scope | Single CSV upload card replacing 3 cards. Schema-aware with column-alias and unit auto-detection. Standalone PVT lab-table upload deferred to Phase 4. | 2026-05-14 |
| Full-file rewrite vs `.cjs` patch for RbCaseDetail Artifact 9 | Full-file rewrite with MD5 pre-flight check. 10 distinct changes is past the comfort threshold for byte-exact `.cjs` patching. | 2026-05-14 |
| Capsule 4A Carter-Tracy validation strategy | Ship Carter-Tracy at Published-method tier alongside benchmark-verified Fetkovich. Defer end-to-end benchmark to Phase 5 once a worked example is sourced. Earlier proposal to defer CT entirely was overridden — shipping it under a transparent tier (with the engine emitting that tier label and the UI surfacing it) is more useful than withholding it. | 2026-05-15 |
| Validation tier vocabulary | Three tiers: `benchmark_verified` / `published_method` / `engineering_basis`. Refined collaboratively from earlier proposals ("benchmarked / standard_formulation / preliminary"). All three tiers framed as legitimate engineering practice differentiated by what evidence supports them. | 2026-05-15 |
| Time delta precondition for Fetkovich/CT | Hard precondition check at engine layer: if aquifer_model is fetkovich/carter_tracy and any observation_date is null, throw a clear error. UI flags the requirement upfront. Soft fallback (assume uniform Δt) explicitly rejected as dishonest. | 2026-05-15 |
| Capsule 4A delivery sizing | Three chunks: (a) types + Δt helper + Fetkovich math + tier system; (b) wire chunks to gas/oil branches; (c) Pletcher Table 9 validation case + tier promotion. Chunk (b) finished without writing math (pre-existing scaffolding discovered). | 2026-05-15 |
| Tier mapping between engine and UI | Mirrored in two places: `resolveValidationTier()` in engine + `AQUIFER_MODEL_OPTIONS` in AquiferModel.jsx. Phase 7 polish: consolidate via `/tier-info` Edge Function. Acceptable duplication for shipping speed in Capsule 4B. | 2026-05-15 |

---

## 6.5 Carry-forward items

Items deferred from the phase where they surfaced. None block a current phase gate; they batch opportunistically into later phases or polish passes.

### Closed during Capsule 3A

| Item | Surfaced in | Closed | Notes |
|---|---|---|---|
| Oil reservoir validation case sourcing | Phase 1 | Capsule 3A (2026-05-14) | Pletcher Tables 10-13 used. OOIP within 0.13%, W within 0.10% of Pletcher's reported values. |
| Production data UI: CSV upload | Phase 2 | Capsule 3A (2026-05-14) | DataHub.jsx rewrite with column-alias + unit auto-detection + pre-save validation. |
| Existing sub-components not yet wired (PvtRock, AquiferModel, DataHub) | Phase 2 | Capsule 3A (2026-05-14) | All three wired through engine + Edge Function + UI. ContactsTracker, ForecastScenarios, ReportsExport remain as Phase 4-6 work. |
| `aquiferCalculations` dead import in AquiferModel.jsx | Phase 2 diagnostic | Capsule 3A (2026-05-14) | Resolved naturally during AquiferModel rewrite — file's entire import block reconstructed. |
| EnergyBalance.jsx component wired | Phase 2 | Capsule 3A (2026-05-14) | Component remains neutralized; its responsibilities are now distributed across PvtRock + AquiferModel + Run tab in RbCaseDetail. EnergyBalance.jsx itself can be deleted in Phase 7 polish. |

### Closed during Capsule 3B

| Item | Surfaced in | Closed | Notes |
|---|---|---|---|
| Diagnostic plots — F vs Et, p/z, Cole, Campbell, drive indices | Phase 2 scope | Capsule 3B (2026-05-15) | Five plots wired to engine output. Conditional rendering by fluid system. Petrolord chart conventions followed (bg-white, ChartLogo, chartTheme tokens). |
| Plot data persistence on results row | Phase 1 design | Capsule 3B (2026-05-15) | Edge Function `plot_data` JSONB column extended with `cum_oil_stb`, `cum_gas_scf`, `cum_water_stb`, `point_in_fit` so plots are pure data binding with no client-side reservoir engineering math. |
| Excluded-point visualization on Havlena-Odeh plot | Capsule 3A reflection | Capsule 3B (2026-05-15) | Hollow vs filled circles distinguish points in the regression fit from those excluded (typically early-time noise). Matches Pletcher Fig. 4 / Fig. 12 conventions. |

### Closed during Capsule 4A

| Item | Surfaced in | Closed | Notes |
|---|---|---|---|
| Fetkovich aquifer engine math + validation | Capsule 3A (UI labels deferred to Phase 4) | Capsule 4A (2026-05-15) | Fetkovich math activated, validated against Pletcher SPE 75354 Tables 9 / Fig. 8 to OGIP 0.76% error. Engine now emits `benchmark_verified` tier for gas+Fetkovich. |
| Carter-Tracy aquifer engine math | Capsule 3A (UI labels deferred to Phase 4) | Capsule 4A (2026-05-15) | CT math activated (was pre-existing Phase 1 scaffolding). Emits `published_method` tier with Lee-Wattenbarger reference. End-to-end benchmark deferred to Phase 5. |
| Validation tier system (engine-side) | Capsule 4A planning | Capsule 4A (2026-05-15) | `validation_tier`, `validation_reference`, `validation_tolerance_pct` fields on `MBALResult`. Three-tier vocabulary: `benchmark_verified` / `published_method` / `engineering_basis`. Single source of truth in `resolveValidationTier()`. |
| Three-case validation gate | Capsule 4A scope | Capsule 4A (2026-05-15) | Pletcher Table 9 added as Case 3. 16/16 assertions pass. Validation harness extended from 600 → 830 lines. |

### Closed during Capsule 4B

| Item | Surfaced in | Closed | Notes |
|---|---|---|---|
| Fetkovich + Carter-Tracy UI enablement | Capsule 3A (UI labels disabled with "Phase 4" placeholder) | Capsule 4B (2026-05-15) | All four aquifer models now selectable. Fetkovich/CT parameter inputs are real, validated, and saved. The "Phase 4" placeholder labels are gone. |
| Validation tier system (UI-side) | Capsule 4A planning | Capsule 4B (2026-05-15) | ValidationTierBadge.jsx renders the tier with constructive language and full reference text in tooltip. Surfaces in two places (Overview Last-result tile, Run-tab result card). Backward compatible with legacy result rows. |
| Stale "0.13% OGIP error" copy in AquiferModel | Capsule 4A reflection | Capsule 4B (2026-05-15) | Corrected to "0.19% OGIP error for gas (Tables 1-3) and 0.13% OOIP error for oil (Tables 10-13)" — the original was a misattribution that conflated gas and oil case errors. |
| AquiferModel "selecting it will fall back to none" copy | Capsule 3A (honest placeholder) | Capsule 4B (2026-05-15) | Removed; Fetkovich and CT now actually do what the dropdown says. |

### Still open

| Item | Surfaced in | Target | Notes |
|---|---|---|---|
| Dashboard tile rename: "Reservoir Balance Surveillance" → "Reservoir Balance" | Phase 2 close (2026-05-13) | Phase 7 polish, or opportunistic earlier | Internal component, routes, and DB tables are already renamed. This is purely the display string in the Reservoir Engineering dashboard tile. Source location TBD — trace when next patching the dashboard module. |
| Aquifer FVF correction in Bw approximation | Phase 1 engine | Phase 4C | Current `bwApprox` is linear; McCain correlation deferred. Acceptable for current validation cases (Bw varies ~1% over Pletcher's pressure range). |
| Atomic `rb_run_configs` default-config upsert via Postgres RPC | Capsule 3A (PvtRock save flow) | Phase 4C | Current `upsertCaseDefaultConfig` is non-atomic read-then-write. Race-condition tolerable for single-user case work but should become an RPC-backed atomic upsert. |
| Standalone PVT lab table upload (full-table to `pvt_lab_table`) | Capsule 3A (DataHub design) | Phase 4C | Per-row PVT in DataHub works; engine respects per-row lab Bg/Rs/Bo. Separate full-table-by-pressure-points upload to `rb_run_configs.pvt_lab_table` with interpolation lookup is later. |
| Phase 4C PVT correlations | Capsule 3A | Phase 4C | Vasquez-Beggs, Glaso, Beal-Standing-Cook-Spillman, Beggs-Robinson, Lee-Gonzalez-Eakin, Dranchuk-Abou-Kassem. |
| Carter-Tracy benchmark verification | Capsule 4A (shipped at Published-method tier) | Phase 5 | Source Dake, Lee-Wattenbarger, or additional Pletcher worked example. Add Case 4 to validation gate. On pass, promote both gas+CT and oil+CT to Benchmark verified. |
| Carter-Tracy hardcoded r_R = 2980 ft | Capsule 4A | Phase 5 | Derive r_R from reservoir geometry (typically `r_R = √(A/π)`). Surface as user-overridable input in PvtRock. |
| Carter-Tracy hardcoded μ_w = 0.5 cP | Capsule 4A | Phase 5 | Compute from temperature and salinity (extend McCain correlation already present for Bw). |
| Oil + gas cap (m > 0) validation | Phase 5 scope | Phase 5 | Engine implements at Published-method tier. Need worked example. Tarek Ahmed handbook, Craft-Hawkins-Terry candidates. |
| Oil + no aquifer validation | Phase 5 scope | Phase 5 | Engine implements at Published-method tier. Any volumetric depletion-drive case from Tarek Ahmed, Craft-Hawkins, or additional Pletcher cases. |
| Tier-mapping consolidation (engine + UI) | Capsule 4B | Phase 7 polish | Duplication between `resolveValidationTier()` and `AQUIFER_MODEL_OPTIONS`. Consolidate via `/tier-info` Edge Function endpoint that returns engine's mapping at runtime. |
| `EnergyBalance.jsx` file deletion | Phase 2 neutralization | Phase 7 polish | Component is neutralized to a placeholder; file itself can be removed once we're confident no other module imports it. |
| Pressure history match plot | Capsule 3B scope (deferred) | Phase 6 | Real history match requires solving the MBE inverse: given N from regression, solve `F(p) = N·Et(p) + (cw+cf)·W·(pi-p)` for predicted p via Newton iteration. ~50-100 lines new engine math + new persisted field. Belongs with forecast work, not diagnostic plotting. |
| Plot export-as-image button | Capsule 3B (DCA pattern hint) | Phase 4 or polish | DCA uses `exportChartAsImage` from `@/utils/declineCurve/dcaExport`. Either generalize that helper to support MBAL or write an MBAL-specific one. Each plot has an `id="rb-plot-..."` attribute ready for capture. |
| Modified p/z plot overlay (Ramagost-Farshad correction) | Capsule 3B (Pletcher p/z handling) | Phase 4C PVT work | Engine internally computes the cf-corrected p/z but the plot shows the raw p/z. For abnormally pressured gas reservoirs (cf significant) the difference is material. Add as a dashed overlay on the p/z plot. |
| Auto-refresh plots when new run completes | Capsule 3B UX | Phase 4 polish | Plots tab has a manual Refresh button. Could subscribe to `rb_runs` changes for the case and auto-refresh; or listen for the Run tab's success event. |
| Drill-down on plot points (click to inspect timestep) | Capsule 3B UX | Phase 4-5 polish | Recharts `onClick` on Scatter could surface the timestep's pressure, F, Et, drive indices in a side panel. Useful for engineers debugging outlier points. |

### Process patterns established (institutional knowledge)

These aren't scoped work items — they're the engineering process learnings from this work. Each one prevents a real failure we hit during Phase 1-Capsule 3A.

| Pattern | Surfaced in | What it prevents |
|---|---|---|
| Validation-first engine development | Phase 1 (Efw bug found by Pletcher mismatch) | Engine math errors shipping to production. The two-case validation gate now catches regressions across both fluid systems. |
| Edge Function deployment is a 2-step process | Capsule 3A (calculate-mbal was 404-missing) | Repo file changes are not deployment. Step 1: update file in repo. Step 2: deploy to Supabase via Studio or CLI. |
| `.cjs` patches for incremental edits to patched files | Capsule 3A (UX-bundle-wipes-Artifact-5 incident) | Full-file `nano` paste wipes prior patches if the source file was built on the wrong baseline. Use byte-exact `.cjs` patches with idempotency sentinels for incremental edits. |
| MD5 pre-flight check for full-file rewrites | Capsule 3A (Artifact 9) | When `.cjs` patches aren't viable due to size, the rewrite must verify the user's file MD5 matches the expected pre-state before nano. Refuses to proceed on drift. |
| Prerequisite-check sentinel for dependent patches | Capsule 3A Artifact 7 | A patch that depends on a prior patch's changes (e.g. Artifact 7 needs Artifact 5's PvtRock import) must check for that prior patch's sentinel BEFORE attempting to apply. Caught the UX-bundle-wipe issue when Artifact 7 ran. |
| Babel parser for JSX validation (not homebrew brace counter) | Capsule 3A (AquiferModel paren-balance false positive) | The homebrew brace/paren counter is unreliable on JSX. Install `@babel/parser` and use `parser.parse(src, { plugins: ['jsx'] })` for syntactic validation. |
| Physical sanity-check OCR'd tabular data | Capsule 3A (Pletcher Table 11 column-order bug) | When ingesting tabular data from a PDF, OCR can scramble column order. Compute a simple physical ratio (Rp = Gp/Np ≈ Rsi above bubble point is a perfect example) before trusting the data. Caught a 45-minute debugging detour where engine math was being "wrong" but was actually correctly computing from miscolumned input. |
| Inputs and PVT must come from the same source per timestep | Capsule 3A (Bg lab-PVT silently ignored bug) | When accepting user PVT overrides per row, the **initial** PVT (Bgi, Boi, Rsi) must come from the same source as the per-row PVT. Mixing correlation-derived Bgi with lab-derived Bg breaks `Eg = Bg - Bgi` internal consistency. |
| Verify shared-component conventions before consuming them | Capsule 3B (initially intended to guess at the chart wrapper) | Before referencing a shared component (`ChartLogo`, `chartTheme` tokens, etc.) across multiple new files, request the canonical file content and a representative consumer. The chart pattern is consumed in 5 places in RbDiagnosticPlots; one wrong import path or wrong prop signature multiplies into 5 copy-pasted breakages. Pause-to-verify always beats guess-then-debug. |
| Persist plot-ready quantities in Edge Function, not engine | Capsule 3B Artifact 1 | When a UI plot needs a quantity that's not in the engine's per-timestep output but is in the input or trivially derived, extend the Edge Function's `plot_data` construction rather than the engine. Keeps the engine focused on validated math; keeps data-shaping concerns at the persistence layer. Reserve engine extensions for cases where the math itself is changing. |
| Honestly drop features rather than build dishonest placeholders | Capsule 3B (pressure history match) | When a planned feature requires math not yet implemented, drop it from scope rather than build a placeholder that visibly lies (e.g., "predicted = observed" overlapping lines). Document the deferral; ship the honest minimum. A 5-plot capsule that's all defensible beats a 6-plot capsule with one plot a senior engineer would call out at AETC. |
| Engine math sometimes pre-exists as scaffolding from earlier phases — check before re-implementing | Capsule 4A chunk b discovery | Phase 1 scaffolding sometimes goes deeper than the activated code path. Before assuming a function needs to be written, grep for it. Capsule 4A planned to write `computeCarterTracyWe` and the gas/oil aquifer branching in chunk (b); it turned out both were already in the engine, just unused. Chunk (a)'s additions (`extractTimedeltasDays`, `computeFetkovichWe`, tier system) activated them. A grep would have caught this 30 minutes earlier. |
| Transparency-as-feature beats warning-as-shield | Capsule 4A tier vocabulary refinement | When shipping a method that hasn't been end-to-end benchmarked, a single-word warning ("UNVALIDATED") tells the user less than a structured tier with documented basis. The three-tier vocabulary (`benchmark_verified` / `published_method` / `engineering_basis`) gives a senior reservoir engineer a precise epistemic claim and points them to alternatives. Defensive labels can erode credibility more than informative ones build it. |
| Tier vocabulary lives in a single source of truth at the engine layer | Capsule 4A `resolveValidationTier()` | The tier mapping for every (fluid_system, aquifer_model, has_gas_cap) combination is one function. Engine result emits the tier label; UI reads it. UI mirrors the mapping only for pre-run badge display (Phase 7 polish will consolidate). The single function is the contract — change it once, everything downstream sees the new tier. |
| User-supplied params get a "current assumptions you inherit" disclosure | Capsule 4B AquiferModel Carter-Tracy section | When the engine has hardcoded defaults that materially affect results (Carter-Tracy: r_R = 2980 ft, μ_w = 0.5 cP), the UI's parameter card should state those defaults explicitly so the user knows what they're inheriting. Don't hide them in the engine code. The honest disclosure is also an itemized roadmap of what Phase 5 will refine. |
| Backward compatibility via conditional rendering, not migration | Capsule 4B RbCaseDetail tier-badge patch | When adding a new result field (`validation_tier`), legacy rows in the DB lack it. The badge component returns null for missing tier; the Run-tab card conditionally falls back to the original visual (green CheckCircle2). No DB migration. New runs accumulate the field; old runs remain readable. Migration becomes a Phase 8 cleanup if needed, not a blocker. |


---

## 7. What we will NOT build in v1 (deliberately)

To prevent scope creep, the following are explicitly out of v1 and parked for future versions:

- **Multi-tank / compartmentalized modeling.** Single tank only.
- **Wet gas, retrograde condensate, volatile oil PVT.** Dry gas + black oil only.
- **EOR forecasting.** Primary production only.
- **Direct integration with operating systems (OFM, ProductionManager).** CSV upload only.
- **Monte Carlo / probabilistic OOIP estimation.** Deterministic regression only.
- **Aquifer optimization beyond Fetkovich/Carter-Tracy.** No Van Everdingen-Hurst with superposition (defer to v2).
- **Real-time pressure data streaming.** Static CSV upload only.
- **Multi-user collaboration on a single project.** Standard project ownership.
- **Comparison with 3D simulator output.** Out of scope entirely.

---

## 8. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Phase 1 gas validation passes but oil math has latent bug not caught until Phase 5 | Medium | Engine code paths for oil and gas share the same PVT, F, Et, regression, aquifer machinery; only the MBE terms differ. Risk is partial but not catastrophic. Phase 2 smoke test (oil reservoir depletion drive) catches gross errors early. |
| Aquifer history matching is non-convex and gives multiple local minima | Medium | Start with constrained search, document limitations clearly, allow user override |
| Reconstructing main container from sub-component interfaces produces a brittle/awkward orchestration | Low-medium | Read each sub-component's prop interface carefully before writing; mirror EPE's container structure |
| Diagnostic plots have Recharts limitations we don't anticipate | Low | Have HTML/SVG fallback in mind for any chart Recharts can't handle |
| User uploads production data without pressure data | High | Pressure data is mandatory for MBAL; clear error message and UX |
| Real users have data quality issues (gaps, outliers) we don't handle | Medium | Phase 8 polish includes empty-state and bad-data UX |
| Oil validation case cannot be sourced for Phase 5 | Low-medium | If Pletcher Table 9 cannot be cleanly extracted, fall back to Craft & Hawkins, Tarek Ahmed (if book available), or peer-reviewed SPE alternatives |

---

## 9. When to revisit this document

- After each phase gate
- When validation against a worked example fails (defines failure)
- When user feedback identifies a feature that should move from v2 to v1 (or vice versa)
- When a new published worked example becomes available
- Quarterly review minimum, even if no active work

---

## 10. Quick orientation for future-us

If you're picking up Reservoir Balance work:

1. Read this document end-to-end (~25 minutes)
2. Read section 1.5 (Phase history) to see what's done and where to pick up
3. Read `src/pages/apps/reservoir-balance/RbCaseDetail.jsx` (~712 lines) for the case detail page structure — **seven tabs** (Overview / Data / PVT / Aquifer / Run / Plots / Advanced)
4. **Engine source of truth:** `supabase/functions/_shared/mbal-engine.ts` (~1733 lines). Every change must keep `tools/validation/mbal-validation.ts` (~830 lines) passing across all three cases. Run with `npx tsx tools/validation/mbal-validation.ts` from the suite root. Expected last line: `Phase 1 + Phase 3 + Capsule 4A validation gate: PASSED`.
5. **Validation references:**
   - Case 1 — Gas + pot aquifer: Pletcher SPE 75354 (2002) Tables 1-3, two-cell gas simulation. True OGIP=100.8 Bcf, true aquifer W=74.5 MM res bbl. Engine: 0.19% OGIP error.
   - Case 2 — Oil + pot aquifer: Pletcher SPE 75354 (2002) Tables 10-13, multicell undersaturated oil with pot aquifer. True OOIP≈20 MM STB, true aquifer W≈80 MM res bbl. Engine: 0.13% OOIP error, 0.10% W error.
   - Case 3 — Gas + Fetkovich aquifer: Pletcher SPE 75354 (2002) Tables 9 / Fig. 8, single-cell gas with finite-aquifer Fetkovich support. True OGIP=100.8 Bcf (Pletcher modified Roach reported 101.5 Bcf). Engine: 0.76% OGIP error.
   - Tolerances in section 5.3.
6. **API helper layer:** `src/pages/apps/reservoir-balance/lib/api.js` (~636 lines). Includes `getCaseDefaultConfig` / `upsertCaseDefaultConfig` for the per-case PVT/aquifer config that survives across runs, and `getPvtPreview` for the Edge-Function-backed PVT table preview.
7. **Edge Functions:**
   - `supabase/functions/calculate-mbal/index.ts` — main MBAL invocation
   - `supabase/functions/generate-pvt-preview/index.ts` — PVT table preview (used by PvtRock UI)
   Both share `supabase/functions/_shared/mbal-engine.ts`. Re-deploy any Edge Function whose engine import changed.
8. **Validation tier system:** every `MBALResult` has `validation_tier` ∈ {`benchmark_verified`, `published_method`, `engineering_basis`}, plus `validation_reference` (text) and `validation_tolerance_pct` (number, for benchmark_verified only). Single source of truth is `resolveValidationTier()` in the engine. UI surfaces via `<ValidationTierBadge />` (shared component). Vocabulary defined in Section 4.5.
9. **Time-marching aquifer models need observation_date.** Fetkovich and Carter-Tracy require ISO dates on every `production_data` row. The engine throws a clear error at runtime if any date is missing. The AquiferModel UI flags the requirement upfront when those models are selected.
10. **Patch convention:** byte-exact `.cjs` patches for incremental edits to already-patched files (with prerequisite-check sentinels). Full-file rewrites only with MD5 pre-flight check (see Section 6.5 / Process patterns). See `tools/patches/` for examples.
11. **Reference document for MBAL theory:** Pletcher SPE 75354 (PDF in user uploads). Also Dake's *Practice of Reservoir Engineering* and Tarek Ahmed's *Reservoir Engineering Handbook* for Phase 5 worked examples (Carter-Tracy benchmark, oil-with-gas-cap, oil-no-aquifer).

---

## 11. Why this matters

Petrolord's strategic positioning depends on a few apps being credibly excellent rather than many apps being mediocre. Reservoir Balance is a foundational module — it informs DCA forecasting, it feeds into EPE volume estimates, it's how engineers explain reservoir behavior to non-engineers (drive indices) and to themselves (Havlena-Odeh diagnostics).

A Reservoir Balance that produces wrong OOIP estimates or misses drive mechanisms is worse than no Reservoir Balance at all — it actively misleads users. The Option 3 build is therefore not optional polish; it is the minimum credible bar.

As of Capsule 4A + 4B close (2026-05-15), the app meets that bar for the validated paths, makes the validation visible, AND tells the user honestly what evidence supports each result:

- **Three benchmark-verified engine paths** (matched within stated tolerance against Pletcher SPE 75354):
  - Gas + pot aquifer: OGIP 0.19% error vs published truth
  - Oil + pot aquifer: OOIP 0.13% error, W 0.10% error vs published values
  - Gas + Fetkovich aquifer: OGIP 0.76% error vs published truth (and 0.06% error vs Pletcher's reported modified Roach result of 101.5 Bcf)
- **Six published-method engine paths** (Carter-Tracy gas/oil, Fetkovich oil, oil with gas cap, oil with no aquifer, gas with no aquifer) — math follows recognized peer-reviewed formulations with documented assumptions and traceability
- **Three-case validation gate** with 16/16 assertions passing, run on every engine change as a regression safety net
- **Five diagnostic plots** (F vs Et, p/z, Cole, Campbell, drive indices) render directly from validated engine output
- **Validation tier badges** on every result tell the user which evidence supports their number — a senior reservoir engineer reads "Benchmark verified (0.13%)" and knows the analysis is anchored in a published worked example; reads "Published method" and knows it follows a peer-reviewed formulation with documented assumptions

When a Nigerian operator looking at Petrolord sees the Reservoir Balance app, they see:
- Validated against published SPE worked examples (three cases, three benchmark-verified paths)
- Honest tier labels on every result — no hand-waving, no warning stickers, just structured evidence claims
- Diagnostic plots that match Pletcher's published figures
- A transparent path from raw production data to defensible OOIP/OGIP estimates

When this app is complete, the ecosystem story is:
- EPE: validated against PIA worked example, NTA 2025 aware
- Reservoir Balance: validated against published SPE worked examples (3-case gate), Havlena-Odeh rigorous, diagnostic plots matching Pletcher, tier-transparent on every result
- DCA: forecasts reconciled with MBAL recoverable
- HSE: [see HSE.md scope document]

That's the ecosystem story we can tell with confidence.

---

_Document maintained by the active development team. Last full review: 2026-05-15 (Phase 3 + Capsule 4A + 4B close)._
