# Suite public homepage: status

## 2026-09-27 redesign

The homepage at petrolord.com was rebuilt as a sibling of the NextGen
Academy homepage (nextgen PR #257): same certificate brand pack (petrol
green `#0C1F16`, gold `#C8A24E`, ivory), Cormorant Garamond with Public Sans.
Styles are scoped under `.suite-home` in `src/pages/Home.css`.

### What was wrong with the old page
- Said "70+ applications"; the live catalogue has 102 across 10 modules.
- Module cards carried stale counts (Assurance 14, Midstream 1, Production 7)
  and retired app names (Artificial Lift Designer, Flow Assurance Monitor,
  Monte Carlo Analyzer, Relief & Blowdown Sizer and others).
- Solutions page covered only 7 of the 10 modules.
- Signed-in "Start Configuration" went to `/get-quote`, which has no route
  (the quote lives at `/dashboard/get-quote`), so it fell through to home.
- `/nextgen` served an old marketing page (membership tiers, hackathons, an
  "annual summit", a registration form writing the legacy
  `nextgen_registrations` table). It now redirects to nextgen.petrolord.com.
- `index.html` had a generic title and no description or share image.

### Where the numbers come from
| Figure | Source | Refresh |
|---|---|---|
| App and module counts, app names | `src/data/suiteCatalog.js` (mirrors master_apps Active + is_built + is_functional) | edit the module's list when an app goes live or retires |
| Module prices, seat bands | `src/data/pricingModels.js` (client copy of `pricing_config`) | already guarded by modulePricing.test.js |
| Per-app price range ($499 to $899) | `APP_PRICE_RANGE` in Home.jsx, from master_apps.price | on a price change |
| NextGen live courses (72) | `NEXTGEN_LIVE_COURSES` in suiteCatalog.js, from academy_apps status 'available' | when a course goes live |

The Solutions page reads the same catalogue. `src/data/__tests__/suiteCatalog.test.js`
pins the 102/10 count, checks the module slugs equal the priced modules,
bans typed "N+" counts and em dashes on the page.

### Checks run
- Jest: catalogue guard + the three module registration suites, modulePricing.
- e2e `e2e/homepage.spec.js` (anonymous) green against a local dev server.
- Production build green (Node 18 needs `NODE_OPTIONS=--experimental-global-webcrypto`).
- Desktop 1440 and mobile 390 screenshots, no horizontal scroll.

### Deploy
Frontend only: no migrations, no edge functions. Goes live with the next
Suite zip upload. After upload, check the served `<title>` and
`/og-image.png`, and purge the CDN cache (stale index.html is the known cause
of an "unstyled" homepage after a deploy).
