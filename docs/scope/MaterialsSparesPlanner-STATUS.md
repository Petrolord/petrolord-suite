# Materials & Spares Planner: status

Supply Chain SC3 (catalogue programme, owner 2026-09-27 "continue non-stop"; plan
`docs/scope/NextGen-Catalog-Regroup-PLAN.md` section 5, course 3). An APP COURSE:
engine first (petrolord-engines PR #281, merged 3e058f2), then this Suite app, then
the NextGen course "Materials, Spares & Inventory Management" (`materials`).

## State (2026-09-27): built, on branch `feat/materials-spares-planner`, NOT live

| item | value |
|---|---|
| module | Midstream & Downstream (`midstream-downstream`) |
| route | `/dashboard/apps/midstream-downstream/materials-spares-planner` |
| slug | `materials-spares-planner` (in `allApps`) |
| page | `src/pages/apps/MaterialsSparesPlanner.jsx` |
| state | `src/contexts/MaterialsSparesContext.jsx` |
| adapters | `src/utils/supplychain/materialsAdapters.js` |
| engine shim | `src/utils/supplychain/engine/inventory.js` (re-exports `packages/engines/engines/supplychain/inventory.js`) |
| views | `src/components/materials/` |
| persistence | `scm_materials_projects` (saved-projects convention, owner RLS) |
| catalogue | `src/data/suiteCatalog.js` counts it: 103 apps, 10 modules |
| price | master_apps.price 299 in the held seed, owner-confirmed 2026-09-27 |

### Module decision

Placed in Midstream & Downstream beside the Terminal & Depot Studio and the Fuel
Pricing & Supply Chain Studio, the module that already holds the Suite's supply-chain
apps. The Suite has no Supply Chain module; making one for a single app would need a
modules row, a module price in `pricing_config.module_pricing`, admin and entitlement
registration and a hub. If a Supply Chain module is created later (SC4 Marine Logistics
Planner is the next candidate), the tile can be re-homed by updating `module` and
`module_id` together with the route.

## What the app does

Seven views, every figure from the vendored inventory engine:

1. **Register**: the Ekene demo (the engines fixture
   `test-data/supplychain/ekene-materials/register.json`, 18 synthetic items with the
   stated policy and one case per calculation), or a pasted CSV or JSON register. A
   column or key the planner does not read is refused by name.
2. **Criticality & ABC**: `criticality` (criteria, weights, classes, top-class
   override) and `abcClassification` (cut-offs, boundary rule); bar chart of weighted
   scores with class minima, Pareto chart.
3. **EOQ & discounts**: `eoq` (holding as a rate times unit cost, or a cost per unit a
   year; stated rounding) and `quantityDiscount` (bands, all-units or incremental).
4. **Safety stock**: `safetyStock` (normal; cycle service or fill rate; k rounding and
   floor stated) and `poissonStock` (slow movers; cumulative probability chart).
5. **Insurance spares**: `insuranceSpares`; holding and expected downtime stacked by
   spares held.
6. **Lead-time risk**: `leadTimeRisk`, the engine's seeded Monte Carlo (lib/stats
   mulberry32 and triInvCDF; no Monte Carlo in the app). P-labels per
   `lib/conventions/percentile.js`: P90 shown as "low, the 10th percentile", P10 as
   "high, the 90th percentile", low to high.
7. **Slow-moving**: `slowMoving` (bands, write-down %, excess cover).

Rules held: a new study is blank and every engine input is a visible control (choices
start unselected); a blank control reaches the engine as absent and its refusal is
printed word for word with the input it names. "Copy figures" copies an item's register
values into visible fields. Charts use the white `chartTheme` and `ChartFrame` (with
`ChartLogo`). Help guide in the header (`MaterialsSparesHelpGuide.jsx`), sources cited.

## Engine vendoring

`packages/engines` moved a844abe to 3e058f2 (engines #272 to #281): 36 canonical paths,
file by file, manifest regenerated, guard clean (1088 paths). Besides inventory.js this
brings EC10 `farmout.js`, EC11 `prms.js` and EC9 `jointVenture.js` wording (not imported
by the Suite). Data & AI `ENGINE_COMMIT` / `ENGINE_VERSION` pins moved with it (dataai
engines unchanged in the range).

## Tests

- `src/utils/supplychain/__tests__/materialsAdapters.test.js`: the Ekene demo reaches
  the engine exactly as the fixture states each case and the policy; blank inputs are
  refused by the engine by name; refusals verbatim; CSV and JSON import and refusal;
  CSV round trip gives equal engine results; saved payload round trip.
- `src/pages/apps/__tests__/materialsSparesPlanner.test.jsx`: one test per view that
  the Ekene demo renders values equal to DIRECT engine calls on the fixture read from
  disk; refusal and rerun on edit; page mount, demo load, import refusal; help copy rule.
- `src/__tests__/materialsSparesRegistration.test.js`: allApps, route, table, catalogue,
  migrations (both module and module_id, Coming Soon, deploy gate, no transaction
  control, M&D module price rule with the new app), MIGRATIONS.md rows.
- `src/data/__tests__/suiteCatalog.test.js`: count 103.

## Owner steps (in order)

1. Price: done. The a la carte price 299 in
   `20260928110000_sc3_seed_materials_spares_tile.sql` was owner-confirmed 2026-09-27.
2. Apply `20260928100000_sc3_scm_materials_projects.sql` (safe any time).
3. Apply `20260928110000_sc3_seed_materials_spares_tile.sql` (Coming Soon tile).
4. Merge, build from main (`NODE_OPTIONS=--experimental-global-webcrypto npm run build`
   on Node 18), cut and upload the zip; verify the route is served.
5. Only then apply `20260928120000_sc3_activate_materials_spares_tile.sql`.
6. Note: `20260927120000_suite_pricing_2026_09.sql` (applied) guards on exactly 102
   live apps; do not re-run it after step 5 without adding this slug.

## Open

- Browser walk on staging not done in this wave (views are covered by jsdom tests).
- Done with SC4: `scm_materials_projects` joined the Project Portability `apps` family
  (`src/lib/portability/familiesCore.js`).
- NextGen course `materials` follows in `/root/wt-sc3-nextgen`.

## Live (2026-09-27)

Suite zip ef6b02403 uploaded and verified (version.json sha ef6b02403; the planner chunk loads). The table, the Coming Soon seed and the activation migrations are applied to production; the tile is Active, built, at USD 299 (owner-confirmed). Browser walk on staging is still open.
