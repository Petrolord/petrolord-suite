# Petrolord Midstream & Downstream Module — Roadmap

Status: **APPROVED — owner sign-off 2026-08-29** (decisions in §7)
Scope: a NEW module — the Suite's 8th internal module (9th Dashboard
tile counting the external HSE portal). Module value/slug:
`midstream-downstream` (routes are built as
`/dashboard/apps/${module}/${slug}` by useAppsFromDatabase).
This file is the plan of record. Executes AFTER the Facilities program
and the Economics E series, per the 2026-08-29 owner execution order.

A full repo sweep (2026-08-29) confirms this is pure greenfield: zero
refining, blending, crude-assay, LPG, CNG, terminal, depot, emissions,
or carbon code exists anywhere in the repo (the only "downstream" hits
are dataflow-sense variable names in choke/nodal code). Nothing to
migrate, nothing to rename.

---

## 1. Positioning — not replication

The incumbent stack (Aspen PIMS / Unified PIMS, Haverly GRTMPS,
Honeywell RPMS, AVEVA Spiral Plan for LP planning; HYSYS Petroleum
Refining / Petro-SIM for simulation; Aspen Blend / H-COMET for
blending; Solomon EII benchmarking; Western terminal-automation
systems) serves large integrated refiners at enterprise price points.
It does NOT serve the segment exploding in Petrolord's home market:

- **The modular-refinery wave:** NMDPRA has issued 9 LTE / 7 LTC /
  4 LTO modular licenses, with ~$10.7B investment targeted by 2030.
- **Deregulated fuel pricing:** import-parity build-ups, the incoming
  15% PMS/AGO import duty, daily landed-cost work.
- **The CNG/LPG rollout:** PCNGI; MDGIF funding 500 CNG stations over
  three years plus LPG infrastructure.
- **Flare-gas commercialization:** NGFCP-style bids screened today in
  ad-hoc spreadsheets.

Layered on top is the green mandate: energy efficiency, carbon
intensity, and abatement economics are now daily downstream work, and
the tooling is either enterprise-consulting-grade or Excel.

Petrolord's play: validated, browser-based studios for this
underserved segment, with the Suite's unique advantage — every
economic result flows through the canonical `epe-engine.ts` fiscal
engine with Monte Carlo and provenance, subsurface to forecourt.

## 2. Design doctrine — the four incumbent gaps (owner-directed, binding on every app)

1. **Modular-scale-first (the price/scale mismatch).** Every incumbent
   tool is architected for a 300,000 bpd complex refinery with an FCC
   and a hydrocracker, priced and complicated accordingly. A
   10,000 bpd topping or hydroskimming plant in Imo State has
   completely different needs and none of the budget. Every app
   defaults to modular/small-plant presets (1-30 kbpd, no cracking
   units required to get a result), is usable by a plant engineer
   without a simulation specialist, and complex-refinery capability is
   the extension, never the entry point.
2. **One data model for plan, schedule, and actuals (the
   planning-scheduling gap).** In the incumbent world the LP plan and
   the schedule live in separate products with separate data models,
   the schedule diverges from the plan immediately, and nobody can
   attribute the variance — unsolved for thirty years because the
   vendors sell the two separately. Petrolord's planning app carries
   plan → schedule → actuals in ONE data model, so plan-vs-actual
   variance decomposes automatically (price vs yield vs timing vs
   downtime). At modular scale this is fully tractable; it is App 3's
   headline feature, not an add-on.
3. **Carbon native, not bolted on.** Incumbent emissions live in a
   separate ESG system reconciled annually from spreadsheets; nobody
   computes CO2e/bbl from the same stream data that computes
   margin/bbl. This module has a single stream/fuel data model, and
   every economic result in every app renders a dual ledger — $/bbl
   beside kgCO2e/bbl — computed from the same inputs in the same run.
   The Carbon & Abatement Studio is the roll-up view of figures the
   other apps already produce, not a separate data silo.
4. **Built for the uninstrumented terminal (the emerging-market depot
   gap).** Terminal automation systems are expensive Western products
   assuming a fully instrumented site. The Terminal & Depot Studio
   works from what an African depot actually has — manual tank dips
   plus strapping tables, ambient-temperature VCF correction, truck
   loadouts without flow computers — and delivers reconciliation, loss
   control, and throughput analytics from that sparse data.
   Instrumented-site import is the upgrade path, not the prerequisite.

## 3. The 10-app portfolio

Ten apps in three tracks — the number is what is real, deliberately
not forced to twelve. A petrochemicals/steam-cracker app and a
shortcut-distillation designer were considered and excluded: the first
is outside the serviceable market, the second belongs to Facilities'
process-equipment family if ever built.

### Track A — Refining core (builds first, owner decision)

| # | App | Scope | Validation anchors | Analogue |
|---|---|---|---|---|
| 1 | Crude Assay & Blending Studio | Assay library (TBP/D86 interconversion, cut-yield curves), crude blend property prediction (API, sulfur, viscosity index blending, TAN), crude compatibility screening (reuse the asphaltene-compatibility kernel behind `src/components/fluidstudio/BlendingResultsCard.jsx` + `packages/engines/engines/fluid/`), value-per-barrel netback vs marker crude. | API/Riazi correlations; published public assay sheets as goldens; Gary & Handwerk worked examples. | Haverly H/CAMS, Spiral Crude |
| 2 | Product Blending Optimizer | Min-cost gasoline/diesel/fuel-oil recipe LP: octane blending indices (RON/MON), RVP index blending, sulfur mass balance, cetane index, flash/distillation constraints; quality-giveaway quantification; spec templates (Nigerian NMDPRA, ECOWAS/AFRI 50 ppm sulfur, Euro-V). Fuel-quality toolkit tab (ASTM correlations: D86-TBP, cetane index D4737, viscosity blending). | Chevron/Ethyl blending indices; LP over the new solver kernel; blending textbook examples as goldens. | Aspen Blend, H/COMET |
| 3 | Refinery Planning & Scheduling Studio | Configuration-level LP plan (crude purchases, unit capacity/yield vectors — topping/hydroskimming first, cracking presets as extension; product demands/specs, GRM, crack spreads, netbacks, shadow prices) PLUS, on the SAME data model, the schedule and the actuals: the monthly plan cascades to a calendar of crude receipts, tank batches, unit runs and blend events; recorded actuals reconcile back with automatic variance attribution (price vs yield vs timing vs downtime). Doctrine #2's headline app. Dual-ledger output per plan case (doctrine #3). | Successive LP on the solver kernel; published hydroskimming/cracking margin examples; variance identities hand-derived as goldens. | PIMS + Petroleum Scheduler, sold separately by incumbents; unified nowhere |
| 4 | Modular Refinery Feasibility Studio | The flagship differentiator. End-to-end feasibility for a modular refinery: configuration selector, yields from a chosen crude (links App 1), capex/opex scaling curves by train size, product slate valued at local market prices (links App 6), full fiscal cash flow + Monte Carlo through `epe-engine.ts`/`epe-mc.ts`, NMDPRA licensing-stage checklist (LTE→LTC→LTO), crude-supply risk scenario (the sector's known killer constraint). | EPE oracle harness extended with a refinery case; cost curves from published modular-refinery studies. | None exists |

### Track B — Commercial & logistics

| # | App | Scope | Analogue |
|---|---|---|---|
| 5 | Terminal & Depot Studio | Uninstrumented-first (doctrine #4): manual dips against strapping tables → standard volumes via ASTM D1250 VCF, daily stock reconciliation and gain/loss trending from dips alone, evaporation/handling loss accounting (reuses Facilities' API 2000 venting math), receipt and loading-rack throughput and queueing, tank-farm capacity/turnover planning, throughput economics per product with CO2e per throughput tonne. Instrumented-data import is the upgrade path. | Terminal automation systems all assume full instrumentation; none serve this layer |
| 6 | Fuel Pricing & Supply Chain Studio | Import-parity landed-cost and pump-price build-up (FOB + freight + losses + duties incl. the 15% import duty + regulatory margins), margin waterfall by product (PMS/AGO/DPK/LPG), depot-to-station bridging/trucking economics, station network throughput sizing. Template-driven so build-ups survive regulatory change. | None — uniquely Nigerian/African need |
| 7 | LPG & CNG Rollout Studio | LPG: bottling-plant and storage sizing, cylinder-fleet logistics, vaporizer sizing. CNG: mother/daughter station design (compression power reusing the Facilities compressor math, cascade storage sizing, dispensing capacity), vehicle/generator conversion economics vs PMS/diesel with payback, emissions avoided per conversion. | None at this tier |

### Track C — Green & energy transition

| # | App | Scope | Analogue |
|---|---|---|---|
| 8 | Energy & Utilities Efficiency Studio | Fired-heater/boiler efficiency by the indirect stack-loss method (API 560), excess-air optimization with quantified fuel savings, steam-system screening, EII-style energy-intensity benchmark per unit, pinch-lite heat-integration targeting (composite curves from a user stream table). Every recommendation priced in $ AND tCO2 avoided. | Solomon EII + Aspen Energy Analyzer (screening tier) |
| 9 | Carbon Footprint & Abatement Studio | The roll-up view of the module's native dual ledger (doctrine #3): Scope 1/2 GHG inventory assembled from the SAME stream/fuel data the other apps hold (combustion, flaring, venting/fugitives; API Compendium + IPCC emission factors as versioned data). Carbon intensity per tonne of product and per bbl throughput, MACC builder ($/tCO2 abatement ranking), decarbonization roadmap export. Positioned as the quantitative engine feeding Assurance's regulatory-compliance register — NOT a second compliance register. | Enterprise ESG platforms: bolted-on, spreadsheet-fed, consulting-priced |
| 10 | Flare Gas to Value Studio | Flared/associated-gas volume → monetization screening: CNG, mini-LNG, LPG extraction, gas-to-power/gas-to-wire matched to gas volume/composition, capex/opex, full economics via epe-engine, emissions abated + carbon-credit sensitivity. NGFCP-style bid support. The upstream-to-downstream bridge app (consumes Production/Facilities gas data). | None — NGFCP bidders use ad-hoc spreadsheets |

Green challenges solved concretely: flare reduction monetized (#10),
clean-fuel transition economics (#7), energy waste found and priced
(#8), carbon accounting + abatement planning made accessible (#9),
quality giveaway and product losses cut (#2, #5).

## 4. Technical foundations

- **New LP solver kernel — the one genuine repo gap.** No simplex/LP
  exists anywhere (confirmed; the portfolio knapsack DP and the
  bounded-LM regression kernel do not do blend recipes or planning
  LPs). Build `packages/engines/lib/lp/`: a small dense
  bounded-variable simplex (revised simplex, Bland's rule), validated
  against published LP textbook solutions plus degenerate/unbounded
  edge cases, shared by Apps 2 and 3 — following the precedent of
  `lib/welltest/` hosting the shared LM kernel.
- **Shared stream/fuel data model (carrier of doctrines #2 and #3):**
  one typed schema for streams, tanks, fuels and events, defined once
  in the engines domain and used by plan, schedule, actuals AND
  emissions calculations. This is what makes variance attribution and
  native CO2e/bbl structurally possible rather than a reconciliation
  exercise. Designed at DS0, before any app.
- **New engines domain:** `packages/engines/engines/downstream/` +
  `test-data/downstream/` + `tools/validation/downstream/` (matching
  the 17 existing domains). Validation-first: assay math vs published
  assays, blending indices vs Gary & Handwerk/GPSA examples, VCF vs
  ASTM D1250 tables, emission factors vs API Compendium tables, an
  EPE refinery case in the oracle harness. Literature gates ARMED
  where sources are copyrighted PDFs, per the drilling/production
  pattern.
- **Reuse:** `epe-engine.ts` + `epe-mc.ts` (all economics),
  `src/lib/monteCarlo.js`, `decisionTree.js`, `portfolioOptimizer.js`,
  studio kit, ChartFrame/ChartLogo, `pdfBrand.js`, `unitConverter.js`,
  Facilities compressor/venting math (Apps 5, 7), the fluidstudio
  blending kernel (App 1).

## 5. Module registration (the DS0 checklist, from the 2026-08-29 repo sweep)

- `master_apps.module` is free text (`'midstream-downstream'`) BUT the
  entitlement path also groups by a `module_id` uuid
  (`get-user-entitlements/index.ts:55-135` matching
  `purchased_modules.module_uuid`) — the seed migration must set both;
  verify the live schema first (neither `master_apps` nor a `modules`
  table has in-repo DDL).
- `src/contexts/SupabaseAuthContext.jsx:29-31`: add
  `'midstream-downstream'` to the hardcoded 7-module `allModules`
  list; add every new slug to `allApps`.
- Nav/hub: `src/pages/Dashboard.jsx:21-39` tile,
  `src/components/DashboardSidebar.jsx` item, new
  `src/pages/dashboard/MidstreamDownstreamHub.jsx` copying the
  FacilitiesEngineeringHub pattern (NOT the dead orphan hub files),
  `src/App.jsx` lazy import + hub route + catch-all + per-app
  `ProtectedAppRoute` routes.
- Pricing: THREE divergent module price tables
  (`src/data/pricingModels.js:38-46`, `src/pages/GetQuote.jsx:27-35`,
  `QuoteEditor.jsx:11-19`) plus a per-app price migration (pattern of
  `20260613130000`). Reconciling the divergence is a flagged side-fix.
- Misc enumerations: `src/utils/adminHelpers.js:38-68`,
  `SuperAdminConsole.jsx:69-78` fallback, `src/data/applications.js`
  registry entries.
- Marketing: "Seven modules" copy is hardcoded in `Solutions.jsx`
  (including the h1), `ModulesShowcase.jsx`, `Home.jsx` stats
  (`value: '7'`), and asserted in `e2e/homepage.spec.js` — all four
  move to eight.

## 6. Phasing

| Phase | Delivers |
|---|---|
| **DS0** | Module bring-up: full registration checklist, hub live, catalog seed migration (all 10 tiles honest — Coming Soon until each ships), LP kernel + validation harness skeleton, shared stream/fuel data model design. |
| **DS1-DS4** | Track A in dependency order: Crude Assay & Blending → Product Blending Optimizer → Refinery Planning & Scheduling → Modular Refinery Feasibility (the flagship, consuming 1 + 3 + EPE). |
| **DS5-DS7** | Track B: Terminal & Depot → Fuel Pricing & Supply Chain → LPG & CNG Rollout. |
| **DS8-DS10** | Track C: Energy Efficiency → Carbon & Abatement → Flare Gas to Value. |

Launch gate per module convention: honest tiles, migrations applied
and logged, staging E2E, prod zip.

## 7. Locked decisions (owner sign-off 2026-08-29)

1. Module name: **Midstream & Downstream** (tile label; module/slug
   value `midstream-downstream`).
2. Build order after DS0: **refining core first** (DS1-DS4), then
   commercial (DS5-DS7), then green (DS8-DS10).
3. Portfolio is **10 apps** — not forced to twelve; petrochemicals and
   shortcut-distillation deliberately excluded.
4. The four-gap design doctrine (§2) is owner-directed and **binding
   on every app** in the module.

## 8. Phase status

| Phase | Status | Landed |
|---|---|---|
| DS0-DS10 | not started (executes after Facilities and the Economics E series) | |
