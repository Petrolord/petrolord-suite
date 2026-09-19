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

**Pricing lands here.** With the first working app, the module joins
`pricing_config.module_pricing` (a migration), `MODULE_PRICING` and
`MODULE_META` in `src/data/pricingModels.js`, and the generate-quote
fallback, which must match the shared table exactly
(`modulePricing.test.js`). The price follows the commercial rule in
pricingModels.js (about 3.3x the module's own per-app price); for a
three-app module that rule needs an owner decision, since the bundle would
cost about what the three apps cost separately. The marketing surfaces
(ModulesShowcase, Home and Solutions module counts) move from eight to nine
modules at the same time, counting built apps only, as DS1 did.

### PS2: Consequence Modelling Studio (`consequence-studio`), course H4

Engine `engines/hse/consequence`: release source terms, Gaussian plume
dispersion, solid-flame pool and jet fires, TNT equivalence and
multi-energy blast, probits. It grades none of the API 521 point-source
radiation outputs FC1 and FC5 already grade.

### PS3: QRA Studio (`qra-studio`), course H5

Engine `engines/hse/qra`: event trees, individual risk, PLL, FAR, F-N
curves against criterion lines, ALARP and ICAF. Built after PS2 because it
consumes PS2's probits. Any discounting imports the canonical NPV module
(CLAUDE.md), and any Monte Carlo imports the canonical MonteCarloEngine.

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
| PS0 | **BUILT 2026-09-19** (branch feat/ps0-process-safety-module) | Module registered end to end; seed written, NOT APPLIED (owner-run, deploy-gated); pricing and marketing held for PS1 |
| PS1 | not started | |
| PS2 | not started | |
| PS3 | not started | |
