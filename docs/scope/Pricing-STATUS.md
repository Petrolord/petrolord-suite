# Suite pricing — status

Resolved 2026-08-30. Records what was wrong, what the numbers now are, and
where to change them.

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
