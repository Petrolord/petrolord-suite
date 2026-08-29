# Midstream & Downstream module bring-up (DS0) — status

Phase: DS0 (MidstreamDownstream-ROADMAP.md §6)
Status: **SHIPPED 2026-08-29** (branch feat/downstream-ds0)

The Suite's eighth module, brought up. No app in it is written yet, and
the catalog says so.

## The defect DS0 found before it built anything

The roadmap's DS0 checklist says to verify the live schema before
seeding, because `master_apps.module` is free text while entitlements
are resolved by a `module_id` UUID. Doing that turned up three apps
carrying the **wrong** UUID.

`get-user-entitlements` grants every app whose `module_id` equals a
purchased `module_uuid`. Three apps carried **Geoscience's** id while
sitting in another module, and the consequential one is **FDP
Accelerator**, which is Active and sold:

- buying **Geoscience granted it**, giving away a paid Economics app; and
- buying **Economics did not grant it**, locking out a customer who had
  paid for the module the catalog lists it under.

Both directions wrong, on a live tile, silently. The other two are
Archived Drilling apps, wrong in the same way with less consequence.

Migration `20260829840000` corrects the data only: no app changes
module, no status changes, nothing granted that was not already meant
to be. **Applied.** Every module_id now matches its module: assurance
33, drilling 53, economics 41, facilities 40, geoscience 35, production
49, reservoir 49.

## Registration

Every place a module has to appear, from the 2026-08-29 repo sweep:

| Where | What |
|---|---|
| `SupabaseAuthContext` | `allModules` gains the module; `allApps` gains all ten slugs. A module absent from the first cannot be licensed; an app absent from the second cannot be granted however Active its tile is. |
| `Dashboard.jsx` | Module tile. |
| `DashboardSidebar.jsx` | Nav item to the hub route. |
| `pages/dashboard/MidstreamDownstreamHub.jsx` | New hub on the ApplicationsGrid pattern, plus the three tracks so the module explains its own shape rather than showing ten tiles for things that do not exist yet. |
| `App.jsx` | Lazy import and hub route, guarded like every other hub. |
| `adminHelpers.js` | Name-to-slug mapping and the admin module list. |
| `SuperAdminConsole.jsx` | Fallback list. |

**A trap worth recording**: `useAppsFromDatabase` filters on
`master_apps.module`, which is the display name, not the slug. A hub
filtering on `midstream-downstream` would show an empty grid forever.
The hub filters on `'Midstream & Downstream'` and a test pins that.

## The catalog seed, held

Migration `20260829850000` inserts the `modules` row and seeds ten
tiles, setting **both** `module` and `module_id` for the reason above.

Every tile lands **Coming Soon**, `is_built` false, `is_functional`
false. Not one of these apps is written, and each goes Active in the
migration that ships its own build through DS1 to DS10.

**Deploy-gated**: it goes in with the upload that ships the DS0 build,
because a module tile whose hub route is not yet on the deploy target
links into a 404. Dry run verified ten tiles created and correctly
linked, then rolled back.

## Two deliberate deviations from the checklist

The checklist says to add the module to the three price tables and to
change the "seven modules" marketing copy to eight. **Neither is done,
on purpose**, and each place says why:

- **Pricing.** Every app in the module is Coming Soon. Listing it for
  sale would let a customer buy a module with nothing in it, which is
  precisely what the honest-catalog rule exists to prevent. It joins
  the tables when DS1 ships its first app.
- **Marketing.** Advertising an eighth module before it contains a
  working application is the same claim in a louder place.

Recorded here rather than silently skipped, so DS1 picks them up.

The three module price tables (`pricingModels.js`, `GetQuote.jsx`,
`QuoteEditor.jsx`) **disagree with each other on every module** —
Geoscience is 899, 500 and 500; Economics 599, 350 and 300.
Reconciling them is an owner pricing decision, so it is flagged and not
taken.

## The LP kernel

`packages/engines/lib/lp/simplex.js`, the roadmap's one genuine repo
gap. Two apps need a real linear programme (least-cost blend recipes,
and the refinery plan) and nothing here could do either: the portfolio
knapsack is integer and single-constraint, and the Levenberg-Marquardt
kernel is nonlinear least squares.

Two-phase dense simplex over a bounded-variable standard form. Bounds
are handled **as bounds** rather than as constraint rows, which is what
suits it to blending: every component has a floor and a ceiling, and
turning each into two rows would triple the tableau for nothing.

**Bland's rule** for the entering column. It is slower than Dantzig's
and it cannot cycle, which matters more here: blending problems are
degenerate constantly, because specifications bind exactly at the
optimum, and a solver that cycles on a user's screen is worse than one
that takes an extra millisecond.

It always returns one of optimal, infeasible or unbounded, and says
which. That is not an error path but an answer: an infeasible blend
means the specifications cannot be met by the components available,
which is exactly what a blender needs to be told. Shadow prices come
back with the solution, because in planning they are often the point.

**18 tests**: the Wyndor Glass product-mix LP with its published duals
(0, 1.5, 1); a diet-shape minimisation with greater-than rows;
equalities; bounds honoured above zero and against the objective;
infeasible and unbounded reported rather than approximated; a
degenerate case; **Beale's cycling example**, which defeats Dantzig's
rule; a three-component blend meeting octane and sulfur where the
reported objective is checked to equal the recipe's own cost; and the
shadow price verified by re-solving with the row relaxed by one unit.

## The shared stream/fuel data model

`packages/engines/engines/downstream/streamModel.js`. This is what
makes two of the module's four doctrines structural rather than
aspirational.

**Doctrine 2, one model for plan, schedule and actuals.** Incumbents
sell planning and scheduling as separate products with separate data
models, so the plan and what happened live in different systems and are
reconciled by hand, badly, a month late. Here a plan event, a scheduled
event and a recorded actual are the **same shape**, distinguished by a
`ledger` field. Variance becomes a subtraction rather than a project.

**Doctrine 3, the carbon ledger beside the money one.** Every event
carries what it cost and what it emitted, because emissions come from
the same movements and burns the economics already describe. Deriving
both from one event stream means they cannot disagree; bolting an
inventory on afterwards means maintaining a second copy of the truth.

The module holds **no emission factors and no prices**. Those are
versioned data belonging to the apps that own them, so updating a
factor never means editing the data model.

**20 tests.** The one that matters most: volume variance plus price
variance equals the total **exactly**, because a decomposition with a
residual is a reconciliation and not an attribution. Also: an event
quantity is unsigned with direction carried by its type, so a negative
receipt cannot be stored; an uncosted event stays `null` rather than
becoming zero, since a total that counts missing costs as free is how a
plan comes in under budget on paper; the unaccounted gap in a material
balance is named rather than absorbed, because gain and loss is the
whole point of a terminal reconciliation; and an unplanned cargo is
reported as unmatched rather than folded in as a price effect.

## Verification

- Jest **397 suites / 5634 tests green**, including 18 on the LP kernel,
  20 on the data model and 19 on the registration itself.
- `npm run build` clean.
- `20260829840000` **APPLIED**; `20260829850000` **HELD** for the DS0
  upload, dry-run verified.

## Next

DS1: Crude Assay & Blending Studio, the first app of the refining core,
and the first tile to go Active. It carries the pricing and marketing
items held above.
