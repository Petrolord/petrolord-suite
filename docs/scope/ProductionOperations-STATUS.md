# Production Operations module — status

Plan of record: `docs/scope/Production-ROADMAP.md` (owner-approved
2026-08-27). This file tracks execution.

## P0 — Hygiene + honest catalog (COMPLETE 2026-08-27)

Everything below shipped on `feat/production-p0`.

**Deleted (1,522 LOC of dead/mock code, all verified unimported):**
- Production Uptime Tracker: page + `components/uptimetracker` (7
  files) + `uptimeTrackerCalculations.js`. Unrouted stale copy-paste of
  the surveillance dashboard.
- Production Anomaly Detector: `return null` page + three byte-identical
  null-stub components.
- Wellbore Flow Simulator (owner §6.3): page + `components/wellboreflow`
  + `wellboreFlowCalculations.js` + `wellboreFlowExport.js`. The
  "transient simulation" was a Math.random pressure walk. Route
  redirects to Nodal Analysis Studio.
- Artificial Lift Designer's three design tabs (`ESPDesign`,
  `GasLiftDesign`, `RodPumpDesign`): ESP TDH omitted net lift (staging
  ~10x wrong), invented gas-lift gradient, rod code neither Mills nor
  API RP 11L ("7/8" parsed as 7.8 in). The app is screening-only until
  the P4–P6 studios; pre-P0 saves carry their design inputs through
  untouched (`legacyDesignInputs`) for studio import.
- FNH's Deliverables tab: all four PDF exports were hardcoded fiction
  (12.75" line whatever you sized, canned pigging verdicts); the tabs
  hold private state so it could not see a real result.

**Routes:**
- Gated with `ProtectedAppRoute`: Nodal's three aliases (appId
  `nodal-analysis-engine`), `artificial-lift-designer`,
  `facility-network-hydraulics`. Was 1 of 5 gated; now every surviving
  production app is gated.
- Redirect to the hub until their rebuild phase: surveillance dashboard
  (both slug aliases, P2), flow-assurance-monitor (P10),
  network-diagram-pro (P11). Page code kept for phase salvage; lazy
  imports removed.
- `production-forecasting` → DCA Studio. `wellbore-flow-simulator` →
  Nodal.
- **FNH un-hijacked**: `apps/facilities/facility-network-hydraulics`
  served FacilityLayoutMapper, leaving 1,024 LOC of real hydraulics
  (Beggs & Brill flow-pattern map, Swamee-Jain, Colebrook-White,
  Barlow/ASME B31) unreachable. Now serves the real page, gated.

**Delisting (owner §6.4):** Network Diagram Pro's $199 override removed
from `pricingModels.js`; `applicationRoutes.js` entry removed;
`SupabaseAuthContext.allApps` trimmed of retired ids (and now carries
`nodal-analysis-engine` + `facility-network-hydraulics`, which were
missing).

**Database (both migrations applied 2026-08-27, logged in
MIGRATIONS.md):**
- `20260827210000_p0_production_orphan_tables.sql` — repo DDL for the
  four Horizons-era tables + RLS enforcement. Security fix:
  `wellbore_flow_projects` had RLS DISABLED live (policy unenforced;
  all rows readable/writable by any authenticated user). Rows intact.
- `20260827220000_p0_production_honest_catalog.sql` — archived the 4
  misadvertising Active tiles + 31 Coming Soon stubs. Post-state:
  Production 3 Active (nodal-analysis-engine, artificial-lift-designer,
  well-schematic-designer redirect) / 36 Archived. Live now (hub is
  DB-driven); the frontend upload waits for P12 per owner §6.6.

**Chart standard:** FNH LineSizing's two charts moved to white
chartTheme + 40px ChartLogo, animations off; Unsplash backdrop removed.
ALD's only charts lived in the deleted design tabs.

**Verification:** full Suite jest 306 suites / 3755 passed;
`npm run build` green at every commit.

## P1 — production data spine (BUILT 2026-08-27; migration apply pending)

Everything below ships on `feat/production-p1`.

**Schema** (`supabase/migrations/20260829120000_p1_create_po_spine.sql`,
idempotent, safe pre-deploy — empty tables, no tile change):

- `po_fields` — the org-shareable parent (geo_wells sharing model:
  private by default, owner stamps `organization_id` to share the whole
  field read-only; children inherit visibility through the field join;
  writes owner-only everywhere, `is_org_member` checks).
- `po_wells` — well handles. `name` is the as-imported CSV label
  (display only); `geo_well_id` is the wellsRegistry linkage so
  downstream apps join production to subsurface data by id, never
  free-text. Unique (field_id, name).
- `po_daily_production` — the daily ledger, VRR units (stb, Mscf) plus
  `hours_on`; upsert key (well_id, prod_date) so re-importing a
  corrected file overwrites in place.
- `po_well_tests` — rates stb/d & Mscf/d, THP, choke, `is_valid` QC
  flag (set by the P3 studio).
- `po_deferments` — downtime events, fixed cause taxonomy (well,
  reservoir, surface_facility, export, planned_maintenance, weather,
  regulatory, other) + free-text cause; open events have null end_date.
- `po_allocation_factors` — per well per month per phase, first-of-month
  key, written by the P3 Allocation Studio.

**Apply status:** rollback-wrapped dry run passed against the linked
project 2026-08-27 (6 tables + 12 policies, rolled back; zero
pre-existing `po_*` tables verified). The real apply was **not run**
(session permission gate); owner applies with
`supabase db query --linked --file supabase/migrations/20260829120000_p1_create_po_spine.sql`
then flips the MIGRATIONS.md row.

**Code:**

- `src/utils/production/csvImport.js` — daily-ledger and well-test CSV
  parsers on the VRR importer recipe (claim-once aliases, injection
  before production twins, unit auto-scaling to stb/Mscf, day/month
  order inference, honest report — nothing silent). Monthly files
  expand to first-of-month rows with a warning; hours_on clamps to 24,
  counted. Template CSVs for both schemas.
- `src/utils/production/registryLink.js` — pure wellsRegistry matcher:
  normalized keys (case/separators/leading zeros: "P-01" ≡ "p 1" ≡
  "P_001"), UWI matches outrank name matches, ambiguous keys yield no
  suggestion, linked wells untouched.
- `src/lib/productionSpine.js` — SHARED spine service (wellsRegistry
  house pattern, direct RLS calls): field CRUD + org share/unshare,
  well CRUD + `ensurePoWells` (importer support), chunked ledger upsert
  (`importDailyProduction`, in-file duplicates collapse last-wins and
  are counted), well-test import/QC, deferment CRUD +
  `DEFERMENT_CATEGORIES`, allocation-factor upsert. Every downstream
  production app (P2+) reads the spine through this module.

**Tests:** `src/utils/production/__tests__/` — 20 gates over the
importers and the registry matcher.

## P2 — Production Surveillance Studio (BUILT 2026-08-27)

Ships on `feat/production-p2`. The OFM-class rebuild of the retired
surveillance dashboard (archived at P0 for discarding its own CSV
uploads and rendering `Math.random()` rates), now reading the P1 spine.

**Route:** `apps/production/production-surveillance-studio`, gated with
`ProtectedAppRoute appId="production-surveillance-studio"`. The two old
dashboard slugs redirect to it instead of to the hub.

**Analytics** (`src/utils/production/surveillance.js`, pure, 33 gates):

- Per-well and field series with derived watercut, GOR and
  producing-day rates. `hours_on` is handled honestly: zero hours means
  shut in (rate null, never Infinity), missing hours means uptime is
  unknown and the producing-day rate equals the calendar-day volume.
- Cadence-aware exception surveillance (shut-in, rate drop, injection
  drop, watercut rise, GOR rise, downtime, stale data) anchored on the
  FIELD's latest ledger date, never the wall clock, so historical
  datasets surveil honestly. Monthly ledgers widen the windows rather
  than compare a single month against a single day.
- Deferment rollups by cause, trailing-window field KPIs, date-window
  moving averages, chart decimation.
- Decline overlays through the CANONICAL Arps engine
  (`fitArpsModel`/`generateForecast`); under three usable points there
  is no fit and the studio says so. `annualEffectiveDecline` converts
  the engine's nominal Di to the first-year effective decline an
  engineer reads (exponential and harmonic handled as the b limits).

**State** (`src/contexts/ProductionSurveillanceContext.jsx`, 10 gates):
two layers, deliberately separate. Spine data (fields, wells, ledger,
deferments) loads through `lib/productionSpine` and is NEVER part of the
project payload; analysis state (selected field, thresholds, trend and
decline picks) is the `saved_surveillance_projects` payload on the
VrrMonitorContext recipe (hydrated guard + 10 s debounced autosave).
Thresholds are coerced to numbers at the point of use, so a value that
comes back from JSON as a string, or a half-typed field, cannot silently
disable a rule.

**UI** (`src/components/surveillance/`, studio kit shell, white
chartTheme + 40px ChartLogo on every chart): field picker with the
geo_wells share model, ledger and well-test CSV intake on the P1
importers with the full honest report, well register with type and
wellsRegistry linking, exception list that hands a well to the Trends
tab, trend charts (field or well; rates, ratios or injection; real-time
smoothing; producing-day basis; log axis that drops zeros rather than
drawing them at the floor), deferment capture with the fixed cause
taxonomy and a loss-by-cause rollup, decline overlay with the fit
statistics and a link out to the DCA Studio, plus a nine-section help
guide.

**Deleted:** the dead predecessor tree (`ProductionSurveillanceDashboard`
page + `components/productionsurveillance`, unrouted since P0) and its
two stale investigation reports under `src/docs/`.

**Migrations:**

- `20260829140000_p2_saved_surveillance_projects.sql` — analysis-state
  persistence, owner-scoped RLS. Safe pre-deploy. **NOT APPLIED**: the
  session cannot run the real apply; owner runs
  `supabase db query --linked --file supabase/migrations/20260829140000_p2_saved_surveillance_projects.sql`
  and flips the MIGRATIONS.md row. Until then the studio computes
  normally and only project save/load reports the missing table.
- `20260829150000_seed_production_surveillance_studio_tile.sql` — the
  Active tile, HELD for the single P12 upload with the other P-phase
  tiles.

**Verification:** 43 P2 gates (33 analytics + 10 context); full Suite
jest and `npm run build` green.

## Next: P3 — Production Allocation Studio

Back-allocation from separator and field totals by well-test factors,
test validation against Nodal theoretical rates, and data QC
(ROADMAP §3 app 3), writing `po_allocation_factors` and setting the
`po_well_tests.is_valid` QC flag. The spine service already carries
`upsertAllocationFactor`, `listAllocationFactors`, `listWellTests` and
`updateWellTest`, so P3 is a UI and allocation-math build over existing
persistence.

## Gotchas for later phases

- The retired apps' tables (`wellbore_flow_projects`,
  `flow_assurance_projects`, `production_surveillance_projects`) stay
  read-protected until the owner-gated post-P12 drop decision.
- Old ALD saves may contain `gasLiftInputs`/`espInputs`/`rodPumpInputs`
  in `design_data`; P4–P6 studios should offer to import them.
- `utils/anomalyDetection.js` and `hooks/usePhase5State.js` sound like
  the deleted anomaly detector but belong to a different (multi-well
  portfolio) tree; they were deliberately left alone.
- Salvage for P11: `components/networkdiagram` (editor) +
  `components/facilitynetworkhydraulics` (segment math). Salvage for
  P10: nothing in `components/flowassurance` (fictional equations);
  build on Fluid Studio EOS.
