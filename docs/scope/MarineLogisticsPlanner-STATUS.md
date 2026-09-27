# Marine Logistics Planner: status

Supply Chain SC4 (catalogue programme, owner 2026-09-27 "continue non-stop"; plan
`docs/scope/NextGen-Catalog-Regroup-PLAN.md` section 5, course 4). An APP COURSE:
engine first (petrolord-engines PR #282, merged 00b7aaa; FINDINGS #283, 110f0a0),
then this Suite app, then the NextGen course "Offshore & Marine Logistics" (`marine`).

## State (2026-09-27): built, on branch `feat/marine-logistics-planner`, NOT live

| item | value |
|---|---|
| module | Midstream & Downstream (`midstream-downstream`), beside the Materials & Spares Planner (SC3) |
| route | `/dashboard/apps/midstream-downstream/marine-logistics-planner` (behind `ProtectedAppRoute`) |
| slug | `marine-logistics-planner` (in `allApps`) |
| page | `src/pages/apps/MarineLogisticsPlanner.jsx` |
| state | `src/contexts/MarineLogisticsContext.jsx` |
| adapters | `src/utils/supplychain/marineAdapters.js` |
| engine shim | `src/utils/supplychain/engine/marineLogistics.js` (re-exports `packages/engines/engines/supplychain/marineLogistics.js`) |
| views | `src/components/marine/` |
| persistence | `scm_marine_projects` (saved-projects convention, owner RLS; payload carries `engine`, the petrolord-engines commit) |
| catalogue | `src/data/suiteCatalog.js` counts it: 104 apps, 10 modules (with SC3) |
| price | master_apps.price 299 in the held seed (as SC3), owner-confirmed 2026-09-27 |
| icon | `Waves` (in `iconRegistry`) |

### Module decision

Same as SC3: the Suite has no Supply Chain module, so the planner sits in Midstream &
Downstream with the other supply-chain apps. If a Supply Chain module is created, the
SC3 and SC4 tiles re-home together (`module` and `module_id` with the routes).

## What the app does

Six tabs, every figure from the vendored marine logistics engine:

1. **Installations & demand**: the Ekene demo (the engines fixture
   `test-data/supplychain/ekene-marine/marine.json`: four synthetic installations, a PSV
   and an AHTS, six bulk products, the milk run, one voyage of deck cargo, the supply
   base), a pasted JSON data set in the fixture's shape, or installations pasted as
   CSV. Products, vessels (every tank and fuel rate), installations (demand over the
   period and one voyage's cargo) and the milk run's stops and legs are editable. A key
   or column the planner does not read is refused by name.
2. **Voyage plan**: `voyagePlan`; the binding constraint named with its utilisation,
   utilisation per constraint (deck area x usable fraction, deck load, deadweight, each
   tank) in a table and a chart with the capacity line, overloads named, leg and
   activity hours, fuel and its cost.
3. **Fleet sizing**: `fleetSize`; the voyage and vessel rounding rules are stated
   controls (up / none; up / nearest with halves up / none), each voyage set names what
   drove its count (a constraint, minimum visits or no demand), spare or short
   vessel-days, average utilisation per constraint.
4. **Fleet variability**: `fleetVariability`, the engine's seeded Monte Carlo (lib/stats
   mulberry32 and triInvCDF; no Monte Carlo in the app). P90 shown as "low, the 10th
   percentile", P10 as "high, the 90th percentile", low to high; probability short with
   the planned vessels, expected short vessel-days, the distribution of whole vessels.
   "Copy the fleet sizing inputs" copies into visible fields.
5. **Deck plan**: `deckPlan` run twice, first-fit decreasing by area beside first fit in
   the booked order; every unit left behind is named with the engine's reason, which
   names the limit that stops it (usable area, deck load or both); units no voyage can
   carry (`neverFit`) are listed apart and tagged in the overflow list; the lower bound
   counts only units that fit an empty voyage; a vessel's deck figures can be copied
   into the visible deck fields.
6. **Shore base**: `shoreBase`; M/M/c (Erlang C) or M/D/c labelled approximate
   (Cosmetatos, no probability of waiting); the berth target search reason printed as
   the engine wrote it; a mean-wait curve by berth count, each point an engine call
   with only `berths` changed.

Rules held: a new study is blank and every engine input is a visible control (choices
start unselected, activity ticks unticked); a blank control reaches the engine as absent
and its refusal is printed word for word with the input it names. The Ekene demo also
states the choices the fixture leaves open (PSV, milk run, rounding up, one deck voyage,
M/M/c, a one-hour target), the engine's own Ekene golden cases, each shown in its
control. Charts use the white `chartTheme` and `ChartFrame` (with `ChartLogo`). Help
guide in the header (`MarineLogisticsHelpGuide.jsx`), sources cited.

## Engine vendoring

`packages/engines` moved 3e058f2 to 110f0a0 (engines #282, #283): 11 canonical paths,
all new, file by file, manifest regenerated, guard clean (1099 paths). Data & AI
`ENGINE_COMMIT` / `ENGINE_VERSION` pins moved with it (dataai engines unchanged).

2026-09-27: moved 110f0a0 to e67e7ba (engines #284, deckPlan overflow reasons name the
stopping limit, lowerBound over units that fit an empty voyage, new `neverFit`): 6
canonical paths, all modified, file by file, manifest regenerated, guard clean (1099
paths); Data & AI pins moved with it (dataai engines unchanged). The deck plan view
shows `neverFit` and the help text states the new bound.

## Portability

`scm_materials_projects` (SC3) and `scm_marine_projects` (SC4) are in the Project
Portability `apps` family (`src/lib/portability/familiesCore.js`), so saved studies of
both planners travel in a `.pld` package and appear in the export picker.

## Tests

- `src/utils/supplychain/__tests__/marineAdapters.test.js`: the Ekene demo reaches the
  engine exactly as the engine's Ekene goldens state (`ekene-voyage-milk-run-psv`,
  `ekene-fleet-psv-milk-run`, `ekene-fleet-psv-dedicated`, `ekene-variability-psv-milk-run`,
  `ekene-deck-one-voyage-ffd`, `ekene-deck-one-voyage-first-fit`,
  `ekene-base-mmc-target-one-hour`); blank inputs refused by the engine by name; every
  unstated choice absent; JSON and CSV import and refusal; CSV round trip gives equal
  engine results; berth curve equals direct calls; saved payload round trip.
- `src/pages/apps/__tests__/marineLogisticsPlanner.test.jsx`: one test per view that the
  Ekene demo renders values equal to DIRECT engine calls on the fixture read from disk;
  refusals and rerun on edit; page mount, demo load, import refusal; help copy rule.
- `src/__tests__/marineLogisticsRegistration.test.js`: allApps, route, table, engine commit
  in the payload, catalogue, migrations (module and module_id, Coming Soon, deploy gate,
  no transaction control, M&D module price rule with SC3 and SC4), MIGRATIONS.md rows.
- `src/data/__tests__/suiteCatalog.test.js`: count 104.
- `src/pages/apps/__tests__/downstreamRoutes.test.js`: the SC4 seed's slug is routed.

## Owner steps (in order)

1. Price: done. The a la carte price 299 in
   `20260929110000_sc4_seed_marine_logistics_tile.sql` was owner-confirmed 2026-09-27.
2. Apply `20260929100000_sc4_scm_marine_projects.sql` (safe any time).
3. Apply `20260929110000_sc4_seed_marine_logistics_tile.sql` (Coming Soon tile).
4. Merge, build from main (`NODE_OPTIONS=--experimental-global-webcrypto npm run build`
   on Node 18), cut and upload the zip; verify the route is served.
5. Only then apply `20260929120000_sc4_activate_marine_logistics_tile.sql`.
6. Note: `20260927120000_suite_pricing_2026_09.sql` (applied) guards on exactly 102
   live apps; do not re-run it after the SC3 and SC4 activations without adding both slugs.

## Open

- Browser walk on staging not done in this wave (views are covered by jsdom tests).
- NextGen course `marine` follows in `/root/wt-sc4-nextgen`.

## Live (2026-09-27)

Suite zip ef6b02403 uploaded and verified (version.json sha ef6b02403; the planner chunk loads). The table, the Coming Soon seed and the activation migrations are applied to production; the tile is Active, built, at USD 299 (owner-confirmed). Browser walk on staging is still open.
