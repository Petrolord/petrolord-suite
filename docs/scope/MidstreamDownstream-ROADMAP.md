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
| DS0 | **SHIPPED 2026-08-29** (branch feat/downstream-ds0) | **Module bring-up.** **A live defect found first**: the DS0 instruction to verify the live schema before seeding turned up three apps carrying the WRONG `module_id`, which is the UUID entitlements actually resolve by. **FDP Accelerator, Active and sold, carried Geoscience's id**, so buying Geoscience granted a paid Economics app and buying Economics did not grant it; two Archived Drilling apps were wrong the same way. Fixed and APPLIED (20260829840000); every module_id now matches its module. **Module registered** end to end: `allModules` and all ten app slugs in SupabaseAuthContext, dashboard tile, sidebar item, `MidstreamDownstreamHub` on the ApplicationsGrid pattern (filtering on the module NAME, since useAppsFromDatabase compares `master_apps.module`, not the slug), lazy hub route in App.jsx, adminHelpers name mapping and module list, SuperAdminConsole fallback. **Catalog seed written and HELD** (20260829850000): the `modules` row plus ten tiles, all **Coming Soon**, setting both `module` and `module_id`; each goes Active in the migration that ships its own build. **Pricing deliberately NOT added** to the three module price tables, with the reason written into each: every app is Coming Soon, and a purchasable module with nothing in it is what the honest-catalog rule exists to prevent. It joins them when DS1 ships. The "seven modules" marketing copy is held for the same reason. **LP kernel built** (`packages/engines/lib/lp/simplex.js`), the roadmap's one genuine repo gap: two-phase bounded-variable simplex, bounds handled as bounds rather than as extra rows, **Bland's rule** because blending problems are degenerate constantly and a cycling solver on a user's screen is worse than a slightly slower one; reports optimal, infeasible or unbounded plus shadow prices. 18 tests: the Wyndor product-mix LP with its published duals (0, 1.5, 1), a diet-shape minimisation, equalities, **Beale's cycling example**, an infeasible blend, and the shadow price checked by re-solving with the row relaxed. **Shared stream/fuel data model built** (`packages/engines/engines/downstream/streamModel.js`), which is what makes doctrines 2 and 3 structural: plan, schedule and actual events are the SAME SHAPE distinguished by a `ledger`, so variance is a subtraction rather than a project, and every event carries both its cost and its emissions so the two ledgers cannot disagree. 20 tests, the key one being that volume plus price variance equals the total EXACTLY, since a decomposition with a residual is a reconciliation and not an attribution. Missing costs and unattributed emissions are counted, never treated as free or clean. Jest 397 suites / 5634 green; build clean. Detail: MidstreamDownstream-DS0-STATUS.md. |
| DS1 | **SHIPPED 2026-08-29** (branch feat/downstream-ds1) | **Crude Assay & Blending Studio**, the module's first app and the first of its ten tiles to leave Coming Soon. **Engine** `packages/engines/engines/downstream/crudeAssay.js` with 47 tests. The core of it is that **each property blends on its own basis and the code enforces it**, because averaging the wrong quantity on the wrong basis is silent: density on VOLUME, sulfur/TAN/nitrogen/metals on MASS (fractions derived from the densities), viscosity through the **Refutas** index on mass, and **API gravity never averaged at all** - it is a hyperbola in density, so a 50/50 of 20 and 40 API is **29.38, not 30**, six tenths of a degree that is the difference between two grades on a price sheet. That case is a test, and writing it caught a wrong remembered number in the test itself (28.62), which the derived assertion beside it did not accept. **Stability screening** uses the **colloidal instability index** (saturates + asphaltenes over aromatics + resins) when SARA is supplied for every crude, and falls back to a gravity-contrast heuristic when it is not, **naming which it used**, because a screening result whose basis is unstated invites more confidence than it has earned. **Cut yields** interpolate the TBP curve and clamp rather than extrapolate (extrapolating a distillation curve invents yield); a cut set that does not cover the curve is REPORTED as not closing rather than scaled to 100. The blend's curve is built by mixing component YIELDS at each temperature, the additive quantity, not by averaging temperatures. **Netback** values the barrel by its own yields times cut prices less losses, processing and freight, with every term shown and any unpriced cut NAMED rather than counted as free. **Deliberately absent, and said so**: D86-to-TBP conversion and pour-point blending, because both rest on published coefficient tables this package will not reproduce from memory (the relief-chart-factor precedent). The D86 function ships with the mechanism and NO default coefficients, so it refuses until the caller supplies the table; a crude assay is a TBP distillation anyway. **App**: studio kit, persistence (20260829860000 APPLIED), ChartFrame curves and yields, help guide, 9 smoke tests. **A general routing defect fixed**: ApplicationsGrid derived a route from the module DISPLAY NAME, which worked only because every module until now was one lowercase word; 'Midstream & Downstream' would have produced a URL with a space and an ampersand matching nothing. The segment is slugified now, a no-op for the existing seven. **DS0's two deferred items picked up**: the module is priced in all three tables and the marketing copy moves to eight modules, with the showcase count at **1 of 10 - what is built, not what is planned**. Tile activation 20260829870000 HELD for the DS1 upload. Jest 399 suites / 5693 green; build clean. Detail: MidstreamDownstream-DS1-STATUS.md. |
| DS2 | **SHIPPED 2026-08-29** (branch feat/downstream-ds2) | **Product Blending Optimizer**, the module's second app and the **first consumer of the DS0 LP kernel**. Least-cost recipe as a linear programme: minimise component cost subject to the volume required, component floors and ceilings as BOUNDS, and every specification as a row. **Every spec declares how its property blends and the code enforces it**: volume, MASS for anything per unit mass (sulfur in ppm - using volume there reports a blend on-spec when it is not), or through a stated INDEX for RVP and viscosity, which do not mix linearly at all. All three stay linear in the volumes, which is what keeps it an LP. **Reports what a blender actually needs**: which specs BIND (what is stopping the blend getting cheaper), the **quality giveaway** (how far inside each limit it sits - half an octane point over a month is real money and invisible unless measured), and the **shadow price of every constraint**, which is the argument for a waiver or a different crude. An infeasible blend is reported as one, not returned as a recipe that misses. **Refuses to guess**: octane does not truly blend linearly (a component's effective octane depends on its pool), and published index methods are coefficient tables, so a supplied blending octane number is used as given while neat octane is blended linearly and **LABELLED as the approximation**; ASTM D4737 cetane index is not implemented for the same reason. RVP's index exponent is a **named, overridable parameter** rather than a constant buried in the code. **A REAL DEFECT FOUND IN THE DS0 LP KERNEL**: the shadow-price reader recomputed column offsets from the count of constraint rows, but finite upper bounds add their own rows which take slack columns too, so with any bounded variable the offset landed past the real column and **every equality row priced at zero** - the marginal cost of a barrel read as nothing. Fixed at source (columns are now recorded when the tableau is built, not recomputed) and pinned with 3 regression tests in the kernel's own suite. It was caught by asserting a shadow price against the objective change from actually re-solving, which is the only check that would have caught it. Spec templates ship as editable starting points that say on every one that **the regulation in force governs, not the template**. 29 engine tests, 10 page tests. Persistence 20260829880000 APPLIED; tile activation 20260829890000 HELD. Jest 401 suites / 5736 green; build clean. Detail: MidstreamDownstream-DS2-STATUS.md. |
| DS3 | **SHIPPED 2026-08-29** (branch feat/downstream-ds3) | **Refinery Planning & Scheduling Studio** - doctrine 2's headline app, and the first place the shared stream model earns its keep. **Plan, schedule and actuals are the SAME EVENTS in the same shape**, distinguished only by ledger, so variance is a SUBTRACTION rather than the spreadsheet reconciliation every incumbent leaves you to do weeks after the month is over. **The plan** is a configuration-level LP on the DS0 kernel: maximise margin over crude runs and unit rates, subject to a material balance on every stream, capacities and availability as bounds, and demand floors and ceilings. **Yields are DATA, not predictions** - every planning system in the industry carries them as inputs and this one says so; DS1 is where straight-run yields come from. **The balance is an INEQUALITY on purpose**: a refinery can leave a stream unplaced (fuel, storage, sold as is) and forcing equality would make plans infeasible for the wrong reason, so surplus is reported as the real planning output it is. **The cascade** turns the month into dated cargoes, weekly unit runs and lifts, and a test asserts the calendar ADDS UP to the plan it came from. **The reconciliation** splits the cost gap exactly into volume and price, lists unmatched movements rather than folding them into a price effect, and reports each unit against plan WITHOUT guessing that a shortfall was downtime. **A sign convention caught by a test**: the solver returns d(objective)/d(RHS), but a planner asking what another barrel of a stream is worth means the opposite direction, so the marginal value is negated and the reason is written down - a marginal value reported with the wrong sign is silent and expensive. 24 engine tests, 9 page tests. Persistence 20260829900000 APPLIED; tile 20260829910000 HELD. Jest 403 suites / 5770 green; build clean. Detail: MidstreamDownstream-DS3-STATUS.md. |
| DS4 | **SHIPPED 2026-08-29** (branch feat/downstream-ds4) | **Modular Refinery Feasibility Studio** - doctrine 1's app, built around the comparison the incumbent tools bury. **Stick-built capital follows the six-tenths rule** (doubling capacity costs ~1.5x), and that single relationship is why the industry believes small refineries cannot work. **A modular plant does not scale that way**: capacity is added by replicating TRAINS, not by building bigger vessels, so cost is close to linear and the economy of scale largely disappears. Both curves are drawn side by side because burying that comparison inside one number would be the wrong service, and **it cuts both ways honestly** - the small plant loses far less to scale than the rule implies AND the big one gains far less. Both exponents are named, overridable inputs rather than constants in the code, because a real study uses vendor quotations. Three configurations (topping, hydroskimming, conversion) with screening-default yields that say a real study takes them from the crude's own assay (DS1). **Crude supply sits on the input panel beside the capacity**, because a modular refinery in a producing country is rarely defeated by its engineering and usually defeated by supply; the three cases are **named futures, not probabilities**, since attaching invented likelihoods would not be honest. **The engine deliberately stops at the streams** and the valuation runs through the Suite's SANCTIONED screening economics engine - the Economics module spent a whole phase removing a fifth and sixth NPV implementation and this app does not add a seventh, so an NPV here means what an NPV means everywhere else; full fiscal belongs to EPE and the app says so. Licensing tracked as **an aid and not legal advice**, with an out-of-order tick flagged as the data-entry slip it is. 28 engine tests, 11 page tests, both green first pass. Persistence 20260829920000 APPLIED; tile 20260829930000 HELD. Jest 405 suites / 5810 green; build clean. |
| DS5 | **SHIPPED 2026-08-29** (branch feat/downstream-ds5) | **Terminal & Depot Studio** - doctrine 4's app, and Track B's first. **Uninstrumented first**: terminal automation systems assume meters on every arm and automatic gauging; most terminals in these markets have a dip tape, a strapping table and a spreadsheet, and that is the case this app is BUILT for rather than a lesser one waiting to be upgraded. Everything starts from a dip. Strapping tables interpolate but are **never extrapolated** (that invents capacity the tank does not have), and free water is subtracted because it is not product. **The VCF is refused, not guessed**: API MPMS Ch 11.1 coefficients are a published table, so the FORM is implemented with the coefficient row as a required input and no default, and a terminal can type a VCF off its own tables instead; without either, gross observed volume is reported and said to be. **The reconciliation NAMES the gap** rather than balancing itself - gain and loss is what the operator is judged on - with tolerance on THROUGHPUT not stock, because measurement error scales with what moved. Trending separates one day of noise from a run worth investigating. **The rack is a queue** (Erlang C derived from first principles, no chart to reproduce): a rack at 85 percent utilisation does not have 15 percent spare, and when arrivals exceed capacity the app says the queue grows without limit rather than reporting a meaningless average. Working capacity is net of the heel. Money and carbon from the same volumes, with the emission factor an input and its absence stated. **A REAL BUG FOUND AND FIXED ACROSS ALL SIX DOWNSTREAM ENGINES**: `Number(null)` and `Number('')` are 0, so the obvious numeric coercion turned a MISSING value into a real zero - a dip nobody read became an empty tank, an emission factor nobody supplied became zero carbon. Every downstream engine now uses a strict coercion where missing stays missing, pinned by its own tests. 39 engine tests, 11 page tests. Persistence 20260829940000 APPLIED; tile 20260829950000 HELD. Jest 407 suites / 5861 green; build clean. |
| DS6 | **SHIPPED 2026-08-29** (branch feat/downstream-ds6) | **Fuel Pricing & Supply Chain Studio** - the cargo-to-nozzle build-up. **THE RATES ARE NOT SHIPPED, AND THAT IS THE DESIGN**: duties, levies and regulated margins are set by regulation, differ by market and change, so a number baked into the app would be read as authority and go stale in silence. The templates carry the LINE ITEMS, which are stable, with the rates required; an incomplete build-up is reported as a **FLOOR, not a cost**, because an understated landed cost is the error that loses the cargo. **The order of the build-up is part of the answer**: a charge levied on CIF depends on what CIF already is, so stages are walked FOB to C&F to CIF to landed with each line declaring its base, and same-stage charges cannot inflate each other's base. **Ocean loss DIVIDES rather than adds** - you pay for the bill-of-lading quantity and sell the outturn, so cost per sellable litre rises by 1/(1-L), not by (1+L); the same identity runs on the truck. The **margin waterfall** groups by recipient (the question actually asked in public), leaving unlabelled elements **unattributed rather than guessed**. A regulated cap below the chain is named as a **shortfall somebody is absorbing** rather than quietly capping the number, and the **exchange rate at which the cap breaks is solved for by bisection - with no crossing reported as no crossing** instead of an endpoint dressed up as a breakeven. Lane economics **derive trips per truck from the cycle** rather than assuming them (so a slow lane correctly carries more capital per trip); fleet size **rounds up** and reports the spare the rounding bought; station sizing **calls DS5's rack queue rather than writing a second Erlang C**, and checks the **ullage at the reorder level against the delivery payload** - the arithmetic nobody does until a full truck has been turned away twice. **A REAL BUG FOUND AND FIXED**: the route was wired at `fuel-pricing-studio` against the DS0 seed's `fuel-pricing-supply-chain`, which would have shipped a dashboard tile linking into a 404 - invisible to every existing test, since the app mounts, its own tests pass and the build is clean. Fixed, and a **new guard test** (`downstreamRoutes.test.js`) now asserts every routed slug and appId matches a seeded tile; it was verified to fail on the real bug. 58 engine tests, 15 page tests, 4 route guards. Persistence 20260829960000 APPLIED; tile 20260829970000 HELD. Jest 410 suites / 5939 green; build clean. |
| DS7 | **SHIPPED 2026-08-29** (branch feat/downstream-ds7) | **LPG & CNG Rollout Studio** - two fuels that share more structure than they look like they do. **ONE FLEET MODEL, AND IT NAMES ITSELF**: a cylinder in circulation and a CNG trailer shuttling to a daughter station are the same problem, so both run through one `assetFloat` that is explicitly Little's Law - operators guess the cylinder float LOW because the cylinders at customers' houses are invisible and are most of the fleet, so the dominant stage is named (nearly always the customer, the only term they can negotiate). Bottling carousel and CNG forecourt both call **DS5's rack queue** rather than a third Erlang C. **THE LPG FILL RATIO IS REFUSED, NOT DEFAULTED**: it is a safety code limit and a vessel filled liquid-full ruptures hydraulically, so the app implements the arithmetic and requires the limit; the vapour space is then reported as a figure in its own right rather than as a subtraction. Every blend property declares volume/mass/mole basis, and a property missing on any component is missing for the blend rather than averaged over the rest. **CNG IS A REAL GAS**: at 250 bar Z is about 0.82, so a bank holds ~23 percent more than ideal and a cascade sized on ideal gas is wrong by a fifth; this calls the SAME Dranchuk-Abou-Kassem correlation the Facilities compression app uses, shows the Z, and **states when the correlation is being extrapolated**. The cascade sequences from the lowest bank upward, reports gas below the vehicle target as **stranded rather than inventory**, and does not count a part fill as a fill. Compression **is not reimplemented** - it calls `compressorTrain` from Facilities F9 and converts units (bar/kg to psia/MMscfd and back), verified against it at ~0.26 kWh/kg. The conversion case compares **per kilometre, not per unit sold**, derives an unmeasured consumption from an **explicit efficiency ratio on screen**, labels simple payback undiscounted and hands the cash flow to the sanctioned engine, and **will report a switch that saves money while adding carbon** because cheaper and cleaner are separate questions. **A REAL BUG FOUND AND FIXED IN THE CASCADE**: a bank drained to exactly the target pressure still tested as usable (bisection lands a hair above), so it was picked forever at zero yield and the third bank was never reached - 7 fills reported where 10 were available. Fixed by judging exhaustion on **deliverable mass** rather than on pressure, and pinned by a conservation test (delivered + leftover = what the banks held above target, exactly) plus a leftover-under-one-fill test. Found by sanity-checking the numbers, not by a test, so both tests exist now. 67 engine tests, 17 page tests. Persistence 20260829980000 APPLIED; tile 20260829990000 HELD. Jest 412 suites / 6024 green; build clean. |
| DS8 | **SHIPPED 2026-08-29** (branch feat/downstream-ds8) | **Energy & Utilities Efficiency Studio**, and Track C's opener. **DOCTRINE 3 AS ARITHMETIC**: every saving priced in money AND tCO2e from the SAME energy in the SAME run, so the two ledgers cannot disagree; abatement cost per tonne is computed and handed to DS9 to rank rather than ranked twice. **Combustion is an atom balance from the user's own fuel analysis** - air, flue gas and excess air all fall out of C/H/O/S and the oxygen content of air (0.20946, not 0.21); fuel inerts are carried through because they still have to be heated up the stack; excess air is SOLVED from the measured stack O2 rather than taken off the shortcut formula, and the guard test puts the oxygen back and checks it comes out the same. Verified independently: **AFR 17.04 kg/kg and 15.0% excess air at 3% O2**, both where a combustion engineer expects them. **EVERY EFFICIENCY DECLARES ITS BASIS** - LHV and HHV differ by ~9 points on the same heater (verified 89.88 vs 81.07), the moisture loss is computed differently on each with the reason stated, and the app REFUSES to compare across bases. **THREE REFUSALS**: the radiation loss (published chart), the minimum safe stack O2 (burner-specific; the app blocks a target below it rather than clamping), and a failed trap's discharge coefficient. Trap loss is **choked** flow (upstream pressure only, not downstream) and scales with area not diameter. Condensate is valued on fuel + water + **treatment**, the term routinely left out, and the value is a floor until it is supplied. Energy intensity is the plant's own and states plainly it is **NOT the proprietary Solomon EII**. **Pinch by the Problem Table Algorithm**, first principles: energy balance closes to zero at every approach, utilities monotone in dTmin, Qh-Qc invariant, cascade never negative and touching zero exactly at the pinch, threshold problems reported as such rather than given an invented pinch. **Literature anchor: the published four-stream problem returns Qh=107.5 kW, Qc=40 kW, pinch 90/70 C at dTmin=20** - reached independently, and flagged in the tests as the one remembered number rather than an identity. **A REAL CORRECTION**: the engine comment claimed subtracting efficiency percentages *overstates* the fuel saving. It UNDERSTATES it - the saving is the gap over the TARGET efficiency, and the target is below 100 - so a tuning project gets turned down on a business case that was never right. Caught by the test, comment and method string both fixed. 63 engine tests, 17 page tests. Persistence 20260830000000 APPLIED; tile 20260830010000 HELD. Jest 414 suites / 6105 green; build clean. **Open: L-gate - the four-stream pinch anchor wants a citation against its published source.** |
| DS9-DS10 | not started | |
