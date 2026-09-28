# Suite pricing: status

Current prices and rules as of the 2026-09 pricing review (owner-approved
2026-09-27, migration `20260927120000_suite_pricing_2026_09.sql`). The
history of how module pricing came to have one source of truth follows in
the 2026-08-30 sections below.

## 2026-09-28: quote and organisation admin pages on the design system (rollout 3F)

Get quote (`/dashboard/get-quote`), Quote dashboard (`/dashboard/quote/:quoteId`),
Audit logs, Teams, Bulk import and App analytics wrap themselves in
`ThemedApp` (shared `AccountScope`, `AccountPage`, `AccountHeader` from
`src/components/account/accountChrome.jsx`, imported unchanged) and open on
the grey panel with a light/dark toggle in the header. Routes are registered
in `src/design/rollout/w3f.js`.

- Money paths are classes only. No function that prices, verifies a promo,
  calls `generate-quote`, `get-active-apps`, `verify-paystack-payment`,
  `verify-bank-transfer` or `create-stripe-checkout`, or writes to the
  database changed; `quotePricingParity`, `modulePricing` and
  `midstreamDownstreamRegistration` pass unchanged. `appCategories` is left
  as it is.
- Status colour only for status: quote status badge (warning, info,
  success, danger), payment verified, unlocked access, import success and
  failure counts, member status, promo errors. Pay buttons, prices, the
  total and discount lines are primary or plain text; the gold top rule on
  the Total Due card is the brand accent.
- Tests: `src/pages/__tests__/W3fAdminPages.theme.test.jsx` (describeAppTheme
  per page, plus the audit log dialog, the transfer proof dialog and a walk
  through the configurator steps).
- Checked at 1440 and 390 wide in light, and in dark at 1440, from a private
  preview server with stand-in data: no sideways page scroll (wide tables
  scroll inside their card).

Found on the way, left as they are:

- `appCategories` in `src/data/applications.js` is an empty list, so step 1
  of Get quote lists no modules and Next stays disabled (the same root cause
  as the empty Module access overview noted under 1E).
- The "Payment Confirmed" toast in `QuoteDashboard.runVerification` (the
  Paystack verify path) still passes a green `className`, so it stays green
  in the themed toaster.
- App analytics shows fixed placeholder figures (124 users, 450 sessions).

## 2026-09-28: account page fixes (renewals, access requests, availability)

Fixes three of the defects found in rollout 1E (below). Owner decision
2026-09-28: renewals go through the normal quote-and-pay flow.

- Renew (`/dashboard/subscriptions/renew`, old `/renew/:moduleId` kept)
  no longer shows a fixed "$15,000.00" or makes up a payment reference, and
  no longer calls `renew-subscription`. It reads what the organisation holds
  (`src/lib/renewalSelection.js`: app-level `purchased_modules` rows with
  their `seats_allocated`, module licences from the active `subscriptions`
  rows' `modules` less `hse_professional`, and the latest term) and opens the
  upgrade page with that as route state. QuoteBuilder only ticks the boxes
  (module check selects all its apps at one seat, a held app keeps its seat
  count, Coming Soon apps are skipped, as the hand handlers do); pricing,
  generate-quote and Paystack are unchanged. Subscriptions page has a Renew
  button; the (currently unmounted) renewal banner points to the same flow.
- `RespondToRequestModal`: Approve and Reject pass their decision straight to
  `handleSubmit`, so `respond-to-access-request` is called with it.
- Module access Availability Overview lists `SUITE_MODULES`
  (`src/data/suiteCatalog.js`) matched to licences by slug, the live
  `modules` UUID or an app's parent module (`src/lib/moduleAvailability.js`).
  `appCategories` stays empty: GetQuote reads it for its app list and
  pricing preview, so filling it would change that page.
- Success toasts for quote generated, invite sent and request answered no
  longer pass a green className.
- Tests: `src/pages/__tests__/accountFixes.test.jsx`,
  `src/lib/__tests__/renewalSelection.test.js`, updated
  `SubscriptionPages.theme.test.jsx`.

Open (server side, not changed here): when a renewal quote is paid,
`manual_verify_quote` upserts existing app rows on `(organization_id,
app_id)` without updating `quote_id`, and sets `expiry_date` from the quote.
The paid-quote expiry sync in verify-paystack-payment / provision-quote then
matches rows by the new `quote_id`, so renewed rows may not get the new
subscription end date. Needs a migration (owner and second-engineer review).

## 2026-09-28: account and billing pages on the design system (rollout 1E)

The upgrade page (quote builder), module access, seats, employees, access
requests, subscriptions, renew, subscription history and usage analytics
each wrap themselves in `ThemedApp` through `AccountScope`
(`src/components/account/accountChrome.jsx`, batch-local, used only by
these pages). They open light, the header toggle switches to dark per user,
and their routes are registered in `src/design/rollout/w1e.js`
(`/dashboard/subscriptions` covers renew, history and analytics).

- Visual change only. The quote calculation, the verify-bridge-code,
  verify-promo-code and generate-quote calls, the Paystack path, the seat
  RPCs and every database write are byte-identical (checked by extracting
  each page's logic above its render and comparing with main).
- Status colour only for status: active, invited, pending, approved,
  rejected, locked, full seats, code accepted or rejected. Discount lines
  and savings read as plain text with their minus sign. Gold is the brand
  CTA (`Button variant="accent"`, "Generate & Pay") and the "SAVE n%" flag.
- Tests: `src/pages/__tests__/{QuoteBuilder,ModuleAccess,EmployeeManagement,SubscriptionPages}.theme.test.jsx`
  (describeAppTheme per page, plus dialog, menu and select walks).
- Checked at 1440 and 390 wide in light and in dark from a private preview
  server with stand-in data: no sideways page scroll.

Found on the way, left as they are (behaviour, outside this visual batch):

- `RespondToRequestModal`: Approve and Reject call `handleSubmit` through
  `setTimeout` from the render where `action` is still null, so the early
  return fires and nothing is sent.
- `ModuleAccess` "Availability Overview" is always empty: `appCategories`
  in `src/data/applications.js` is an empty list.
- `RenewSubscription` shows a fixed "$15,000.00" and a simulated payment
  reference; renewal does not go through Paystack.
- Success toasts raised inside the money and write handlers (quote
  generated, renewal, invite sent, request answered) still pass a green
  `className`, so they stay green in the themed toaster.

## 2026-09 pricing review

Until this review every app in a module carried one flat price (Geoscience,
Drilling and Data & AI $899; Reservoir $799; Production, Facilities and
Process Safety $699; Economics and Midstream $599; Assurance $499). Each app
is now priced on its own, from the products it competes with.

### Method

For each app, M is the typical per-seat annual price of the product a buyer
would compare it with, and D (0.5 to 1.0) is how much of that product's
capability the app delivers.

    target per seat per year = M x D x r(M)
    r = 60% when M <= $5k, falling (log scale) to 25% at M >= $40k
    licence per month = target x team / 12 - seat cost for that team
    team = 3 for engineering apps, 10 for compliance and collaboration apps

Results round to prices ending in 49, 99 or 90, with a floor of $249 for
engineering apps and $199 for compliance tools and bundle items, and a
ceiling of $1,990. The benchmark (about 150 competitor products, with
sources and confidence) is kept with the owner's review page.

### Modules (USD per month, all apps included)

A module costs about 35% of its apps bought one by one (45 to 65% for a
module of fewer than eight apps).

| Module | Apps | Before | Now |
|---|---|---|---|
| Geoscience & Analytics | 12 | 2,999 | **3,990** |
| Reservoir Management | 13 | 3,299 | **3,990** |
| Drilling & Completion | 12 | 3,299 | **4,490** |
| Production Operations | 12 | 2,499 | **3,490** |
| Facilities Engineering | 13 | 2,499 | **1,990** |
| Process Safety | 3 | 1,999 | **1,990** |
| Midstream & Downstream | 10 | 1,999 | **1,490** |
| Economics & Project Management | 12 | 1,999 | **1,990** |
| Assurance | 10 | 1,499 | **899** |
| Data & AI | 5 | 2,999 | **1,290** |

Every module together: **all-access $12,990 a month** (`pricing_config.all_access_price`).

### Rules in the quote engine

Implemented once in `supabase/functions/_shared/suite-pricing.ts`
(generate-quote, authoritative) and mirrored in `src/data/quotePricing.js`
(GetQuote and the upgrade QuoteBuilder); `quotePricingParity.test.js` runs
the same scenarios through both.

- **Essentials seats** for 24 light apps: $19 / $15 / $12 / $9 per seat a
  month in the same 5 / 15 / 40 bands (`essentials_seat_tiers`,
  `essentials_seat_apps`). Every other app keeps $49 / $39 / $29 / $19.
- **Platform fee waived** when a module is licensed or the term is a year
  or longer. It still applies to monthly and quarterly single-app quotes.
- **Included apps**: Risk Heatmap with Risk Register, and Lessons Learned DB
  with Audit & Findings Manager, carry no licence and no seat charge when
  quoted with their host (`bundle_included_with`).
- **All-access**: selecting every priced module charges the all-access
  price instead of the ten module prices.

All four read from `pricing_config`, so a value can change without a
deploy; the code carries matching fallbacks, held together by the tests.

### Commercial programme

- **FOUNDING30**: 30% off for the first ten organisations
  (`suite_promo_codes`, scope all). Best on an annual quote, where it covers
  the first year. Pair it with a 30-day guided pilot of one module on the
  customer's own data.
- **Naira rate**: Paystack charges convert at `pricing_config.suite_ngn_per_usd`
  (falls back to `hse_ngn_per_usd`). Review it monthly against the market.
- Public pages show no prices; buyers see them in the quote builder after
  signing up.

### Fixed along the way

- The upgrade QuoteBuilder priced apps from a stale hardcoded list ($99
  unless overridden) instead of `master_apps.price`, started every quote
  with the Geoscience module selected, and sent module ids where
  generate-quote expects slugs, so any other module failed the quote.
- GetQuote's "Apps Add-on" line summed the prices of apps a module already
  covered, although the total correctly excluded them.

### Deploy order

1. Apply `20260927120000_suite_pricing_2026_09.sql` (data only).
2. Deploy `generate-quote`.
3. Upload the Suite build (GetQuote and QuoteBuilder previews).

Until step 2 the server keeps charging the new app and module prices under
the old seat and platform-fee rules, so quotes can differ from the preview
by the seat and fee amounts.

### App prices (USD per month, organisation licence)

| Module | App | Before | Now |
|---|---|---|---|
| Geoscience & Analytics | Seismolord | 899 | **1,490** |
| Geoscience & Analytics | Well Data Manager | 899 | **349** |
| Geoscience & Analytics | Petrophysics Studio | 899 | **1,290** |
| Geoscience & Analytics | Well Correlation | 899 | **399** |
| Geoscience & Analytics | Stratigraphy Studio | 899 | **1,190** |
| Geoscience & Analytics | Mapping & Surface Studio | 899 | **399** |
| Geoscience & Analytics | Pore Pressure Studio | 899 | **1,190** |
| Geoscience & Analytics | Rock Physics Studio | 899 | **1,190** |
| Geoscience & Analytics | Earth Modeling | 899 | **1,290** |
| Geoscience & Analytics | Basin & Charge Modeling | 899 | **799** |
| Geoscience & Analytics | ReservoirCalc Pro | 899 | **990** |
| Geoscience & Analytics | Wellsite Studio | 899 | **799** |
| Reservoir Management | Decline Curve Analysis | 799 | **599** |
| Reservoir Management | Material Balance Studio | 799 | **1,490** |
| Reservoir Management | Fluid Systems Studio | 799 | **1,490** |
| Reservoir Management | SCAL Studio | 799 | **699** |
| Reservoir Management | Well Test Analysis Studio | 699 | **1,190** |
| Reservoir Management | Reservoir Simulation Studio | 799 | **1,490** |
| Reservoir Management | Waterflood Design Studio | 799 | **1,190** |
| Reservoir Management | Voidage Replacement Monitor | 799 | **699** |
| Reservoir Management | EOR Screening | 799 | **199** |
| Reservoir Management | Recovery Factor Estimator | 799 | **199** |
| Reservoir Management | Well Spacing Optimizer | 899 | **799** |
| Reservoir Management | Forecast Scenario Hub | 799 | **699** |
| Reservoir Management | Risked Reserves Valuation | 799 | **349** |
| Drilling & Completion | Well Design Studio | 899 | **1,490** |
| Drilling & Completion | Casing & Tubing Design Studio | 899 | **1,490** |
| Drilling & Completion | Drilling Fluids & Hydraulics Studio | 899 | **990** |
| Drilling & Completion | Torque & Drag Studio | 899 | **899** |
| Drilling & Completion | Well Control Studio | 899 | **699** |
| Drilling & Completion | Cementing Studio | 899 | **899** |
| Drilling & Completion | Geomechanics & Wellbore Stability Studio | 899 | **1,490** |
| Drilling & Completion | Completion Design Studio | 899 | **990** |
| Drilling & Completion | Perforation & Sand Control Designer | 899 | **699** |
| Drilling & Completion | Stimulation Designer | 899 | **1,190** |
| Drilling & Completion | Well Cost & Time Estimator | 899 | **599** |
| Drilling & Completion | Well Integrity & P&A Studio | 899 | **990** |
| Production Operations | Nodal Analysis Studio | 699 | **1,190** |
| Production Operations | Gas Well Performance Studio | 699 | **990** |
| Production Operations | Artificial Lift Advisor | 699 | **349** |
| Production Operations | Gas Lift Design Studio | 699 | **990** |
| Production Operations | ESP Design Studio | 699 | **799** |
| Production Operations | Rod Pump Design Studio | 699 | **549** |
| Production Operations | Choke & Wellhead Performance Studio | 699 | **299** |
| Production Operations | Flow Assurance Studio | 699 | **1,190** |
| Production Operations | Production Network Studio | 699 | **799** |
| Production Operations | Production Allocation Studio | 699 | **799** |
| Production Operations | Production Surveillance Studio | 699 | **990** |
| Production Operations | Well Intervention Planner | 699 | **449** |
| Facilities Engineering | Pipeline & Line Sizing Studio | 699 | **249** |
| Facilities Engineering | Separator & Slug Catcher Studio | 699 | **399** |
| Facilities Engineering | Relief & Flare Studio | 699 | **799** |
| Facilities Engineering | Compressor Station Designer | 699 | **499** |
| Facilities Engineering | Pump Station Designer | 699 | **249** |
| Facilities Engineering | Heat Exchanger & Cooling Studio | 699 | **299** |
| Facilities Engineering | Gas Processing Studio | 699 | **799** |
| Facilities Engineering | Produced Water Treatment Studio | 699 | **349** |
| Facilities Engineering | Flow Metering Designer | 699 | **249** |
| Facilities Engineering | Control Valve & Choke Sizing | 699 | **249** |
| Facilities Engineering | Storage Tank & Venting Designer | 699 | **349** |
| Facilities Engineering | Corrosion & Integrity Studio | 699 | **599** |
| Facilities Engineering | Facility Layout Mapper | 699 | **199** |
| Process Safety | LOPA & SIL Studio | 699 | **599** |
| Process Safety | Consequence Modelling Studio | 699 | **1,190** |
| Process Safety | QRA Studio | 699 | **1,690** |
| Midstream & Downstream | Crude Assay & Blending Studio | 599 | **699** |
| Midstream & Downstream | Product Blending Optimizer | 599 | **449** |
| Midstream & Downstream | Refinery Planning & Scheduling Studio | 599 | **699** |
| Midstream & Downstream | Modular Refinery Feasibility Studio | 599 | **499** |
| Midstream & Downstream | Terminal & Depot Studio | 599 | **349** |
| Midstream & Downstream | Fuel Pricing & Supply Chain Studio | 599 | **299** |
| Midstream & Downstream | LPG & CNG Rollout Studio | 599 | **249** |
| Midstream & Downstream | Flare Gas to Value Studio | 599 | **449** |
| Midstream & Downstream | Energy & Utilities Efficiency Studio | 599 | **249** |
| Midstream & Downstream | Carbon Footprint & Abatement Studio | 599 | **249** |
| Economics & Project Management | Petroleum Economics Studio | 599 | **1,190** |
| Economics & Project Management | Fiscal Regime Designer | 599 | **499** |
| Economics & Project Management | NPV Scenario Builder | 599 | **249** |
| Economics & Project Management | Probabilistic Breakeven Analyzer | 599 | **299** |
| Economics & Project Management | Decision Studio | 599 | **249** |
| Economics & Project Management | Decision Tree Builder | 599 | **199** |
| Economics & Project Management | Value of Information Analyzer | 599 | **249** |
| Economics & Project Management | Capital Portfolio Studio | 599 | **399** |
| Economics & Project Management | AFE Cost Control Manager | 599 | **499** |
| Economics & Project Management | Project Management Pro | 599 | **349** |
| Economics & Project Management | FDP Accelerator | 599 | **1,190** |
| Economics & Project Management | Technical Report Autopilot | 599 | **199** |
| Assurance | Risk Register | 499 | **249** |
| Assurance | Risk Heatmap | 499 | **199** |
| Assurance | Management of Change | 499 | **249** |
| Assurance | Audit & Findings Manager | 499 | **299** |
| Assurance | Document Control | 499 | **199** |
| Assurance | Peer Review Manager | 499 | **199** |
| Assurance | Quality Assurance Plan | 499 | **199** |
| Assurance | ISO Compliance Tool | 499 | **199** |
| Assurance | Regulatory Compliance | 499 | **249** |
| Assurance | Lesson Learned DB | 499 | **199** |
| Data & AI | Data Quality Studio | 899 | **249** |
| Data & AI | ML Workbench | 899 | **499** |
| Data & AI | Electrofacies Studio | 899 | **799** |
| Data & AI | Production Forecasting ML Workbench | 899 | **699** |
| Data & AI | AI Evaluation Studio | 899 | **249** |

## 2026-09-27: NextGen bridge codes match on the module slug (HELD)

A NextGen Expert certificate issues a single-use code for one Suite module
(`bridge.suite_module`). generate-quote matched a quoted app on its display
name (`master_apps.module`, e.g. 'Midstream & Downstream') while the module
branch and QuoteBuilder matched on `modules.slug`. Only single-word modules,
whose display name lowercases to the slug, ever matched. The app loop now
calls `bridgeCoversApp` (`supabase/functions/_shared/bridge-scope.ts`) with
`moduleSlugById[app.module_id]`, and the module slugs load for any bridge
quote. Apps without a module_id keep the old display-name match, so every
code that worked still works (`_shared/__tests__/bridge-scope.test.ts`).

The Academy half: NextGen migration `20261117_bridge_suite_module.sql` adds
`academy_apps.suite_module` so courses in Academy modules that are not Suite
slugs (supply_chain, data_ai, commercial_trading, energy_transition, hse)
stamp the slug of the Suite module their app sits in.

Deploy order: apply the NextGen migration, then
`supabase functions deploy generate-quote`.

## 2026-08-30: module pricing single source

Resolved 2026-08-30. Records what was wrong, what the numbers were then, and
where to change them. Superseded prices are kept for history.

## What was wrong

There were **four** numbers for every module and all of them disagreed:

| Module | pricingModels.js | GetQuote.jsx | QuoteEditor.jsx | Server (billed) |
|---|---|---|---|---|
| geoscience | 899 | 500 | 500 | **500 flat** |
| reservoir | 799 | 500 | 400 | **500 flat** |
| drilling | 899 | 450 | 600 | **500 flat** |
| production | 699 | 400 | 400 | **500 flat** |
| economics | 599 | 350 | 300 | **500 flat** |
| facilities | 699 | 400 | 300 | **500 flat** |
| assurance | 499 | absent | 200 | **500 flat** |
| midstream-downstream | 299 | 150 | 150 | **500 flat** |

The server ignored all three client tables and charged a **hardcoded flat
$500 for any module**. Because a purchased module grants every app whose
`module_id` matches, that $500 bought 10 to 14 apps worth **$5,990 to
$11,988 a month** a la carte — a 92 to 96 percent discount, reachable from
the public quote page.

### Why it was reachable, which is the worse half

`get-active-apps`, the function that fills the quote page's app list, was
**live but had no source in this repo**. Recovered with
`supabase functions download`, it turned out to query a table called
`apps`: four legacy demo rows, keyed by module slug, priced 299–499,
covering three modules.

So a buyer saw **two apps for Geoscience and none at all for Facilities,
Production, Economics, Midstream & Downstream or Assurance**. Five of eight
modules looked empty. Worse, the app ids it returned did not exist in
`master_apps`, so `generate-quote` discarded them —
`No active apps found from requested list` — and fell through to the module
branch. That is how an ordinary customer journey landed on the flat $500.

Two further defects found on the way:

- **`billingEngine.js`** read `.basePrice` and `.name` off `MODULE_PRICING`
  entries that are plain numbers, so every module priced at **0**. It had
  no importers. Deleted.
- **`pricing_config.seat_tiers` never worked.** The column is `jsonb`, so
  supabase-js returns a parsed object; `JSON.parse` threw on it and the
  `catch` silently kept the defaults. Now accepts either shape.

## What the numbers are now

One source of truth: **`pricing_config.module_pricing`** in the database,
read by `generate-quote`, which is authoritative. Changing a price is a
config edit, not a deploy.

**The rule: a module costs about 3.3x its own per-app price** — roughly
what three apps cost, for ten to fourteen apps. That keeps the bundle the
obvious purchase and keeps a la carte an honest convenience premium for
someone who wants two tools.

| Module | Apps | App $/mo | A la carte | **Module $/mo** | Discount |
|---|---|---|---|---|---|
| Geoscience | 10 | 899 | 8,990 | **2,999** | 67% |
| Drilling | 12 | 899 | 10,788 | **3,299** | 69% |
| Reservoir | 13 | 899 | 11,687 | **3,299** | 72% |
| Facilities | 13 | 699 | 9,087 | **2,499** | 73% |
| Production | 12 | 699 | 8,388 | **2,499** | 70% |
| Economics | 12 | 599 | 7,188 | **1,999** | 72% |
| Midstream & Downstream | 10 | 599 | 5,990 | **1,999** | 67% |
| Assurance | 14 | 499 | 6,986 | **1,499** | 79% |

Per-app prices on `master_apps.price` are unchanged. On top sit the
platform fee ($299/mo, tier multiplier 1.0/1.25/1.5), graduated seats
($49 down to $19), term discounts to 25 percent, and the existing
full-platform bundle at 20 percent off.

HSE is deliberately not in this table: it is the separate external portal,
billed in naira through `hse_ngn_per_usd`.

### What this looks like to a buyer

- **Entry**: two Economics apps + platform + 2 seats ≈ **$1,595/mo**.
- **A modular refiner**: the Midstream & Downstream module + platform +
  5 seats ≈ **$2,543/mo**, about $30k a year, against a sector where a
  single licensed plant is a $50–200M investment.
- **A mid-size operator**: Reservoir + Production + Economics ≈
  **$7,797/mo** before seats, for 37 applications — comparable to a single
  seat of the incumbent tools these replace.

## Where to change it

1. `pricing_config.module_pricing` — the live price. No deploy.
2. `src/data/pricingModels.js` — the client's mirror, for the preview.
3. The `MODULE_PRICING_FALLBACK` in `generate-quote` — used only if the
   config row is missing.

`src/data/__tests__/modulePricing.test.js` fails if these drift apart, if a
module has no price, if a module ever costs more than its apps
individually, or if a second copy of the table reappears.

## Safety

- **Issued quotes are unaffected.** `quotes` stores `total_amount`,
  `pricing_breakdown` and `selected_items` as a snapshot and nothing
  recomputes on read. The 5 pending quotes worth $135,768.65 and the one at
  $26,732.67 keep their agreed figures.
- **Existing entitlements are unaffected.** `purchased_modules` grants
  access; it does not re-derive price.
- Only quotes generated from now on use the new numbers.

## Open for the owner

- **These are my numbers, not yours.** They follow a stated rule and are
  defensible, but pricing is a commercial judgement. They are one config
  edit away from whatever you decide.
- **Existing customers.** Techtainment Camp (5 purchases) and AMW Petroleum
  Development Co. Ltd (1) hold entitlements bought under the old scheme.
  Nothing has changed for them; whether renewals move to the new pricing is
  a commercial decision, not a technical one.
- **`apps` (4 rows) is now orphaned.** Nothing reads it since
  `get-active-apps` was repointed at `master_apps`. Dropping it needs a
  check that nothing else touches it first.

## Term expiry and HSE with Suite (2026-09-07, Breeze Energy onboarding)

**Defect fixed.** generate-quote prices a term as N months (monthly 1,
quarterly 3, annual 12, 2year 24, 3year 36) but never stored
`quotes.billing_period`, and both provisioning paths (the shared
`_shared/provision-quote.ts` and the inlined copy in
verify-paystack-payment) derived the access window as "monthly, else one
year". A quarterly purchase was therefore granted twelve months on
`subscriptions.end_date` and `purchased_modules.expiry_date`, and the
renewal cron advanced non-monthly terms by a year. No live subscription
was affected (the only one is annual). Now one table,
`_shared/billing-term.ts` (jest: `__tests__/billing-term.test.ts`, 9
gates), drives quoting (billing_period stored), provisioning (window =
payment date plus the term's months, day clamped) and renewals.

**Rule added: HSE follows a Suite purchase.** Every Suite provisioning path
now also writes the HSE Professional grant (organization_apps app `hse`,
module `hse_professional`, seats = the quote's seats) and sets
`organizations.hse_status = 'ACTIVE'`, and the Suite subscription row carries
`hse_professional` in `modules`, so the nightly lapse sweep
(20260810230000) and the expiry reminders retire HSE on the same end date
as the Suite. An HSE Professional quote on its own is unchanged.

Deploy: generate-quote, verify-paystack-payment, paystack-webhook,
verify-stripe-payment, stripe-webhook, hse-checkout,
process-subscription-renewals (all import the shared modules).
