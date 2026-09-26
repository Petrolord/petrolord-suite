# NextGen Academy: catalogue regroup and the commercial and supply chain tracks

Plan of record amendment. Written 2026-09-26 from owner decisions taken the
same day. It amends two earlier documents:

- NextGen-Academy-PLAN.md section 1, where the doctrine reads "one app = one
  course". Section 3 below records the owner's amendment: three course types.
- NextGen-Remaining-Courses-PLAN.md section 12, where the naming decision of
  2026-09-16 kept one Midstream & Downstream module and let Supply Chain
  appear as a course title inside it. Section 5 below supersedes that for
  Supply Chain & Logistics, which stands as its own module with its own
  roster.

Everything else in those two documents stands: the validation-first wave
recipe, the key-truth audit, the go-live ordering rule and the non-goals in
NextGen-Remaining-Courses-PLAN.md section 13.

Heads read for this document: Suite main `2ef005690`, petrolord-engines
main `f50251d`, NextGen main `4196a86e8`.

## 1. The problem (owner, 2026-09-26)

The homepage modules followed the Suite's product categories, and three of
them now read badly to the people the academy is for.

- **Commercial & Trading holds only downstream courses.** Its two courses
  are `crude`, Crude Assay & Blending, and `refinery`, Refinery Feasibility
  & Planning. An upstream reader sees "Commercial" and expects fiscal
  terms, contracts and deal work, and finds refinery linear programming.
- **Supply Chain & Logistics holds one downstream course**, `supply`,
  Terminals, Depots & Fuel Supply.
- **Upstream commercial content sits under Economics.** `cashflow`,
  `fiscal`, `uncertainty`, `decision`, `portfolio` and `fdp` are the
  academy's commercial teaching for upstream, and nothing on the homepage
  says so.

## 2. DECISION: relabel two modules

Label changes only. The module slugs in `academy_apps.module` stay as they
are, so no course moves, no row changes and no migration is written.

| module slug | label today | label from this decision |
|---|---|---|
| `commercial_trading` | Commercial & Trading | Midstream & Downstream |
| `economics` | Economics | Economics & Commercial |

Unchanged:

- **Energy Transition** keeps `carbon` and `gasvalue`.
- **Supply Chain & Logistics stays a standalone module.** The owner's
  words: it must stand. Its roster is section 5.

Where the labels live in NextGen main today, for the relabel PR:

- `src/lib/academyModules.js`, `MODULE_LABELS`.
- `src/lib/homeCatalog.js`, `HOME_MODULES` (label and tagline; this file
  shows Supply Chain & Logistics as "Supply Chain", which the PR can align
  while it is open).
- Four lesson files that name the module in prose:
  `crude/advanced/m01-what-a-linear-programme-is/l01-a-recipe-is-a-continuous-decision.md`,
  `crude/advanced/m06-the-expert-reading/l03-where-this-course-hands-over.md`,
  `crude/intermediate/m06-the-professional-reading/l03-what-the-next-tier-changes.md`,
  `supply/advanced/m06-the-expert-reading/l04-where-this-course-hands-over.md`.
- The course migrations for `crude`, `refinery`, `supply`, `gasvalue` and
  `carbon` mention "Commercial & Trading" in SQL comments only. Applied
  migrations are history and are left alone.

## 3. DECISION: three course types

The owner amends the "one app = one course" doctrine. The moat it protected
stays: every graded answer comes from validated code on a teaching dataset,
or, for the one type with no engine, from an audited source pack. A course
is one of three types.

**App course.** A Suite app over a petrolord-engines engine, with the
auto-graded practical inside the app. Every course in the catalogue today
is an app course, and this remains the default.

**Engine course.** A validated petrolord-engines engine reached through a
course calculator panel, with no Suite app behind it. The capstone is still
auto-graded from the engine. The validation-first rules apply unchanged:
a golden, an independent oracle that computes every reported output
including the summaries, a negative control, and a citable reference before
any lesson is written. An engine course can gain a Suite app later without
changing its capstone.

**Practice course.** No engine. It stands on:

- a dated, cited source pack;
- scenario question banks audited against those sources (the key-truth
  audit reads the source pack in place of an engine digest);
- no numeric capstone;
- a visible "Practice course" badge on the catalogue card and the course
  page;
- a review date, after which the course is re-read against its sources.

Practice courses are kept to a minority of the catalogue, at most about one
in five.

Two content rules apply to every type:

- **Licensed texts are taught by concept and never copied.** The AIPN model
  JOA is the standing example: a course explains what the clauses do, in
  its own words, and quotes none of it.
- **Regulatory content carries a review date.** Acts, regulations and
  guidelines change; a course that teaches one states the version and the
  date it was checked.

## 4. The upstream commercial track, in module `economics` ("Economics & Commercial")

Five engine courses, in this order. The engine inventory below was read
from petrolord-engines main `f50251d` and Suite main `2ef005690`. No
reference values are quoted here: each wave finds its references, records
them in its FINDINGS, and pins them in its goldens.

What the module already teaches, which each wave must not repeat:
`cashflow` (EC1) teaches the PIA royalties, hydrocarbon tax, levies,
losses and cost recovery in its Expert tier (modules m01 to m05);
`fiscal` (EC2) teaches regime comparison, the sliding scale, cost
recovery, the R-factor and the tax stack; `decision` (EC4) teaches EMV and
value of information; `portfolio` (EC5) teaches the capital knapsack and
AFE cost control; `fdp` (EC6) teaches concept and schedule economics.

### 4a. Petroleum Industry Act 2021 & the Nigerian fiscal system (first)

Engines that exist today:

- `engines/economics/cashflow.ts`, the EPE cash flow engine and the
  module's single fiscal source of truth. It carries the PIA 2021 cascade
  (production and price royalty by terrain, `deriveGasRoyaltyRate`,
  hydrocarbon tax on crude and condensate, CIT, TET or Development Levy by
  framework, HCDT, NDDC levy, production allowance with volume caps, cost
  price ratio with carryforward), the NTA 2025 framework switch, the
  minimum effective tax rate top-up (a stated project-level approximation),
  loss carryforward and working interest on PIA and PSC.
- `test-data/economics/fixtures/pia-worked-example.json`, the frozen PIA
  validation case, locked by the regression contract in EPE.md.
- `engines/economics/fiscalRegime.js`, `fiscalTemplates.js` (with a
  "Nigeria - PIA (2021)" template) and `fiscalConventions.js` (the
  government take wording shared with the `fiscal` course).
- `engines/economics/montecarlo.ts` for any probabilistic run.

Gaps to establish in a D0-style audit before authoring:

- A written line between this course and `cashflow` Expert and `fiscal`,
  so the new course teaches the Act as a system (licensing, the fiscal
  instruments and how they interact) and reuses the existing lessons by
  reference.
- EPE.md section 7 records that the NTA 2025 validation is synthetic, since
  no NUPRC-published NTA-era worked example exists. The course either
  teaches NTA 2025 with that caveat stated in the lesson or waits for a
  published example.
- Any PIA provision the course teaches that `cashflow.ts` does not compute
  is either taught as concept (and kept out of the capstone) or goes to
  petrolord-engines first as its own PR with a golden and an oracle.

Validation references to find: the published PIA 2021 worked example
already used by EPE.md section 5 (record its full citation in the wave
FINDINGS), the Petroleum Industry Act 2021 text as gazetted, the Nigeria
Tax Act 2025 text, and any NUPRC or NMDPRA guidance the course relies on,
each with the version and date read.

### 4b. Gas commercialisation & gas sales agreements

Engines that exist today:

- `engines/economics/cashflow.ts`: gas price with differential, scale and
  per-year price deck, gas royalty by terrain, and the PIA hydrocarbon tax
  base that excludes upstream gas profits (with its stated escape hatch).
- `engines/downstream/flareToValue.js` and `lpgCng.js`, taught in
  `gasvalue`.
- `engines/facilities/gasProcessing.js` and
  `engines/production/gasProperties.js` for the physical side.

Gaps needing new engine work: no engine in either repository computes a
gas sales contract. Take-or-pay (the deficiency quantity, the payment and
the make-up entitlement carried forward), contract quantities and
nomination shortfalls, price formula indexation, and the domestic gas
delivery obligation all need a new deterministic engine with a golden and
an oracle before a lesson is written.

Validation references to find: published worked examples of take-or-pay
and make-up gas accounting in the gas contracting literature, and the PIA
2021 and regulator texts on domestic gas delivery obligations and gas
pricing, each dated.

### 4c. Joint ventures, operating agreements & cost recovery

Engines that exist today:

- `engines/economics/cashflow.ts`: the JV regime with in-regime working
  interest, PSC cost recovery with the cost pool carried forward
  (`psc_cost_pool_after`, `psc_unrecovered_cost_at_cessation`), profit oil
  tranches and the investment tax credit.
- `engines/economics/fiscalRegime.js`: cost recovery with carryforward and
  R-factor splits.
- `engines/economics/afe.js`: `calculatePartnerCosts` (the partner split by
  working interest, with the operator carrying the remainder), earned value
  and the S-curve.

Gaps needing new engine work: cash calls and joint account billing, sole
risk and non-consent recovery, and default mechanics have no engine. Each
clause mechanic the course grades needs one; the clauses themselves are
taught by concept from the model JOA and never copied (section 3).

Validation references to find: a published PSC cost recovery worked
example for a byte check of the PSC path (EPE.md section 7 records that
JV and PSC math has no published worked example validation yet, which this
wave can close), and published worked examples of non-consent recovery.

### 4d. Farm-ins, farm-outs & asset valuation

Engines that exist today:

- `engines/economics/cashflow.ts` with working interest scaling on JV, PSC
  and PIA, and `montecarlo.ts` for the probabilistic value.
- `engines/economics/decisionTree.js` and `voi.js` for the farm-in as a
  decision and the value of the information a well buys.
- `engines/economics/portfolio.js` for the farm-in against the rest of the
  capital programme.
- `engines/economics/screening.js` and `breakeven.js` for screening value.

Gaps needing new engine work: carried interest (a promote paid through a
carry of the farmor's share of costs, with or without a cap and a back-in)
and the deal terms that turn a working-interest NPV into a price for the
interest. Neither exists; both need a golden and an oracle.

Validation references to find: published farm-in and carried interest
worked examples in the petroleum economics literature.

### 4e. Reserves & resources under SPE-PRMS 2018

Engines that exist today:

- `engines/dca/` (`arps.js`, `typeCurve.js`, `groupRollup.js`,
  `monteCarlo.js`) and `engines/mbal/` for the production and volume
  basis.
- ReservoirCalc Pro's `src/pages/apps/ReservoirCalcPro/services/MonteCarloEngine.js`
  in the Suite, the canonical Monte Carlo for in-place volumes.
- `lib/conventions/percentile.js`: the Suite-wide P-label convention,
  already written to the SPE PRMS exceedance meaning.
- `engines/economics/cashflow.ts`: the economic limit test
  (`apply_economic_limit`), which is where a reserves cut-off meets the
  cash flow.

Gaps needing new engine work: no engine classifies or categorises a
volume under PRMS, and none aggregates resources the two ways PRMS
distinguishes (arithmetic and probabilistic). The Suite's Risked Reserves
Valuation app (`src/utils/riskedReservesCalculations.js`) is not a base: it
carries its own inline NPV and samples on `Math.random`, both against the
CLAUDE.md single-implementation rule, and it computes no PRMS class. It is
recorded here as a finding for the owner.

Validation references to find: the SPE-PRMS 2018 document itself and the
worked examples in the SPE PRMS application guidelines (edition to be
confirmed when the wave starts).

## 5. The Supply Chain & Logistics roster (owner-approved)

Module `supply_chain`, label Supply Chain & Logistics. This section
supersedes, for Supply Chain, the single-module naming decision in
NextGen-Remaining-Courses-PLAN.md section 12.

| # | course | type | Suite app | status |
|---|---|---|---|---|
| 1 | Terminals, Depots & Fuel Supply (`supply`) | App course | Terminal & Depot Studio over `engines/downstream/terminalDepot.js` and `fuelPricing.js` | Live |
| 2 | Procurement, Tendering & Contracting | Engine course first, app later | none at first | Built first |
| 3 | Materials, Spares & Inventory Management | App course | new Materials & Spares Planner | Planned |
| 4 | Offshore & Marine Logistics | App course | new Marine Logistics Planner | Planned |
| 5 | Contract & Supplier Management | Practice course | none | Planned |

**Course 2, Procurement, Tendering & Contracting.** Two-envelope
evaluation; weighted scoring; lowest evaluated cost; lump-sum,
reimbursable and day-rate compared on one job; Nigerian content scoring
under the NCDMB Act 2010 (the Nigerian Oil and Gas Industry Content
Development Act); should-cost built on the existing well cost and AFE
engines (`engines/drilling/wellCost.js`, `engines/economics/afe.js`). No
engine in either repository computes tender evaluation today, so the
engine is new work with a golden and an oracle.

**Course 3, Materials, Spares & Inventory Management.** Criticality,
safety stock, reorder point, EOQ, lead-time risk, slow-moving and obsolete
stock. New engine and new app.

**Course 4, Offshore & Marine Logistics.** Supply vessel fleet sizing,
voyage and deck-space planning, shore base throughput. New engine and new
app.

**Course 5, Contract & Supplier Management.** Practice course under the
section 3 rules: source pack, audited scenario banks, badge, review date.

**What the Suite will not build.** The Suite has no procure-to-pay
(Ariba-type) app and will not build one. Procure-to-pay is transactional
ERP with no engine a capstone can be graded from. The fit for Petrolord is
the decision layer: evaluating, costing and planning, which is what
courses 2 to 4 teach.

## 6. Sequencing

1. **After the Data & AI D5 course (`appliedai`) ships.**
2. **The relabel PR first**, in NextGen, small: section 2.
3. **The first two builds**: Supply Chain course 2 (Procurement, Tendering
   & Contracting) and 4a (Petroleum Industry Act 2021 & the Nigerian
   fiscal system).
4. **Then the rest**: 4b to 4e in order, and Supply Chain courses 3 to 5.

Each course follows the validation-first wave recipe: engine, then app if
the course has one, then course foundation, lessons, banks, key-truth
audits, migrations and the PR. Go-lives stay HELD until the deployed site
serves the route. Path orders continue after 70 and are assigned in build
order.

## 7. Open questions for the owner

1. **Pricing and entitlement** for engine courses and practice courses.
   Both are new kinds of catalogue row; neither has a Suite app to anchor
   a bridge mapping or a module price.
2. **Certificates for practice courses.** Whether a practice course, which
   has no numeric capstone, carries a certificate on the ladder, a
   different certificate, or none.
