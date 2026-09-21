# Process Safety module roadmap

The Suite's ninth module. It hosts the three applications behind the
NextGen HSE courses H3, H4 and H5 (docs/scope/NextGen-Remaining-Courses-PLAN.md
§14, owner decision 2026-09-19: H1 and H2 go into the HSE product, H3 to H5
form a new Suite module beside Facilities).

| Identifier | Value |
|---|---|
| Display name (`master_apps.module`, hub filter) | `Process Safety` |
| Slug (`modules.slug`, routes, entitlements) | `process-safety` |
| Hub route | `/dashboard/process-safety` |
| App routes | `/dashboard/apps/process-safety/<app-slug>` |
| Future app tables | `ps_*` |

## Why the slug is not `hse`

`hse` is already taken, three ways, by the external HSE portal
(hse.petrolord.com):

- `src/App.jsx` routes `/dashboard/hse` to an external redirect to the portal;
- `src/pages/Dashboard.jsx` has an `hse` module card that opens the portal;
- `hse_free` and `hse_premium` are entitlements, and
  `normalizeModuleName` maps any module name containing "hse" to `hse`.

A Suite module on the same id would collide with the redirect, inherit the
portal's entitlement mapping, and make "HSE" mean two products with two
billing systems (the portal is billed in naira and is excluded from
`MODULE_PRICING`). Process safety is also the accurate name: LOPA, SIL,
consequence modelling and QRA are process safety disciplines, while
occupational safety and health (H1, H2) stay in the HSE product. None of
the portal's identifiers are touched by this module.

## Phases

### PS0: scaffold (this phase)

Registration in every place DS0 (41f86e031) registered Midstream &
Downstream: `allModules` and the three app slugs in SupabaseAuthContext, the
dashboard card, the sidebar item, `ProcessSafetyHub` on the ApplicationsGrid
pattern (filtering on the display name), the lazy hub route in App.jsx, the
adminHelpers name mapping and module list, the SuperAdminConsole fallback,
and `MODULE_LABELS` in appLinks.js (added to the registry after DS0). The
catalog seed `20260919200000_ps0_seed_process_safety_module.sql` writes the
`modules` row and three tiles at Coming Soon, setting both `module` and
`module_id`. Test: `src/__tests__/processSafetyRegistration.test.js`.

Held, as at DS0: pricing and marketing copy (see below).

### PS1: LOPA & SIL Studio (`lopa-sil-studio`), course H3

Engine `engines/hse/lopa` in petrolord-engines, built validation-first
(goldens from published worked examples, an independent Python oracle, a
negative control, a FINDINGS record) and vendored into the Suite. Scope:
LOPA mitigated event frequency against a tolerable target, required risk
reduction to SIL band, PFDavg for 1oo1, 1oo2 and 2oo3 with common cause
and proof-test interval. IEC 61508/61511 tables are cited, never embedded;
a licensed table enters only as user input.

**Pricing landed here** (2026-09-19, decided under the owner's
delegation): the module joins `pricing_config.module_pricing` at 1,999
(migration 20260919230000), `MODULE_PRICING` and `MODULE_META` in
`src/data/pricingModels.js`, and the generate-quote fallback. The literal
3.3x rule on the inherited per-app price (699) gives about 2,299, which is
more than the three planned apps cost a la carte (2,097), so the price is
1,999: 2.86x, inside the 2.8x-4.0x band `modulePricing.test.js` holds, and
below a la carte. The marketing surfaces (ModulesShowcase, Home and
Solutions) moved to nine modules, counting the one built app, as DS1 did.
Detail: `ProcessSafety-PS1-STATUS.md`.

### PS2: Consequence Modelling Studio (`consequence-studio`), course H4

Engine `engines/hse/consequence` (petrolord-engines #223, merged b43f1d9):
liquid and gas orifice discharge, pool from a spill, Mackay and Matsugu
evaporation, the ground-reflected Gaussian plume with Briggs rural sigmas
and the distance to a concentration, the solid-flame pool fire (burning
rate, Thomas flame length, tilt, SEP, Mudan/Raj view factor, Bagster
transmissivity) and the distance to a heat flux, TNT equivalence with
Kinney and Graham overpressure and its inverse, and thermal, toxic and
overpressure probits. It re-exposes none of the point-source radiation
outputs FC1 and FC5 already grade (relief.js, spacing.js); it imports the
Thomas still-air height from spacing.js, which now exports it unchanged bit
for bit.

**Dropped in the engine, and stated in the app:** jet fires (the only
worked example, YB 6.6.2, is internally inconsistent), TNO multi-energy and
Kingery-Bulmash (published as curves only), two-phase discharge, the
instantaneous puff, urban sigmas and unconfined pool spreading
(FINDINGS-consequence.md section 6). The planned "jet fires" and
"multi-energy blast" are therefore NOT in PS2; the tile activation
migration replaces the PS0 seed description that promised them. Detail:
`ProcessSafety-PS2-STATUS.md`.

### PS3: QRA Studio (`qra-studio`), course H5

Engine `engines/hse/qra` (petrolord-engines #230, merged abb41c3): event
trees with PB Table 4.5 direct ignition, the PB fatality rules from a
consequence dose, LSIR and IRPA, PLL, FAR, F-N curves against the PB/Bevi
line, the R2P2 para 136 point or a given line, ALARP banding (a value at a
limit belongs to the LOWER band, owner decision), LSIR transects with PB
contour crossings, and the gross disproportion test with the ICAF. It
consumes PS2's engine (probits, plume, solid flame) and re-grades none of
it; discounting is the canonical `npv` of engines/economics/cashflow.ts.
No Monte Carlo.

**Dropped in the engine, and stated in the app:** an aversion-weighted risk
integral, a slope for the R2P2 societal point, grid and wind-rose
bookkeeping, delayed ignition over time and BLEVE probabilities as tree
presets. The tile activation migration replaces the PS0 seed description
("ALARP judged by the implied cost of averting a fatality") with what the
engine does. Detail: `ProcessSafety-PS3-STATUS.md`.

## Tile activation rule

A tile goes Active (status 'Active', is_built true, is_functional true)
only in the migration that ships its app's build, and that migration is
applied only after the production upload carrying the app's route is live
and the route has been served on the deployed site (the F12 rule, as in
AS13 `20260918900000_as13_activate_assurance_tiles.sql`). The same holds for
the PS0 seed itself: it is deploy-gated on the upload that ships the hub
route, or the dashboard card links into a 404. The NextGen go-live for each
course is held until the app's route serves.

## Status

| Phase | Status | Landed |
|---|---|---|
| PS0 | **MERGED 2026-09-19** (PR #533, 16eb8be03) | Module registered end to end; seed written, NOT APPLIED (owner-run, deploy-gated); pricing and marketing held for PS1 |
| PS1 | **MERGED 2026-09-19** (PR #536, fc9ecdd31) | LOPA & SIL Studio on the vendored engines/hse/lopa (canonical a1d8c9f); `ps_lopa_studies`, tile activation and pricing migrations written and dry-run proven, NOT APPLIED (owner-run); nine-module marketing; `ProcessSafety-PS1-STATUS.md` |
| PS2 | **MERGED 2026-09-20** (PR #539, 48dab703a) | Consequence Modelling Studio on the vendored engines/hse/consequence (canonical b43f1d9, which also brings #220, #221 and #222); `ps_consequence_studies` and tile activation migrations written and dry-run proven, NOT APPLIED (owner-run); no pricing change; showcase counts two apps; `ProcessSafety-PS2-STATUS.md` |
| PS3 | **BUILT 2026-09-21** (branch feat/ps3-qra-studio) | QRA Studio on the vendored engines/hse/qra (canonical abb41c3, which also brings #229); `ps_qra_studies` and tile activation migrations written and checked on a local scratch database, NOT APPLIED (owner-run; the owner dry run is in the PR); no pricing change; showcase counts three apps; `ProcessSafety-PS3-STATUS.md` |
