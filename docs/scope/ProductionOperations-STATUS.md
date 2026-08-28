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

## P3 — Production Allocation Studio (BUILT 2026-08-27)

Ships on `feat/production-p3` (stacked on the P2 branch). Route
`apps/production/production-allocation-studio`, gated with
`ProtectedAppRoute appId="production-allocation-studio"`.

**New spine table.** Allocation starts from a measurement the P1 spine
did not hold: the facility, separator or export meter reading for the
whole field on a date. `po_field_totals` is that data class, kept
deliberately separate from `po_daily_production` (which in a commingled
field is itself an allocation). One metered stream per field per date;
fields with several independent trains are a future extension rather
than a silent sum.

**Engine** (`src/utils/production/allocation.js`, pure, 31 gates):

- `testInForce` picks the most recent valid test on or before a date,
  within a validity window, so a stale test stops carrying a well
  instead of propping it up forever.
- `computeAllocation` distributes each metered date across the wells:
  theoretical = test rate x uptime fraction (or the wells' own ledger
  volumes on the proration basis), factor = metered / theoretical per
  phase, allocated = theoretical x factor. Injectors and observation
  wells never take a share. A well with no basis takes nothing and is
  reported; measured volume with no carrier allocates nothing and says
  so. Factors outside the warning band are flagged and NEVER clamped —
  the drift is the only evidence that the tests, the meter or the
  uptime record disagree.
- `monthlyFactors` rolls up volume-weighted per well per month in the
  `po_allocation_factors` shape; `allocatedLedgerRows` returns the
  ledger-shaped rows for the write-back, carrying the uptime that
  produced them; `imbalanceSeries` is meter against booked.
- `validateWellTests` QCs every test against data the spine already
  holds: the well's own test-history median, the ledger rate on the
  test date (producing-day basis, so a part-day well is judged fairly),
  the ledger watercut, test duration and zero flow. **Nodal
  cross-check is deliberately NOT here**: a theoretical nodal rate
  needs a per-well IPR/VLP model, which the spine does not carry until
  the P4-P7 lift studios build one. It is a P5+ follow-on, recorded
  rather than faked.

**State** (`src/contexts/ProductionAllocationContext.jsx`, 19 gates):
the P2 two-layer split — spine data (fields, wells, ledger, tests,
metered totals, saved factors) never enters the payload;
`saved_allocation_projects` holds analysis state only (field, period,
basis, thresholds). Numeric settings are coerced at the point of use,
so a string from JSON or a half-typed field cannot disable a rule.

**UI** (`src/components/allocation/`, studio kit shell, white
chartTheme): Allocation tab (per-well allocated volumes against
theoretical and metered, daily factor chart with the warning band,
grouped diagnostics), Test QC tab (every test with its verdict, accept
or reject writing `is_valid` to the spine, bulk-reject the high
severity ones), Reconciliation tab (meter against booked per phase with
the imbalance as bars), Factors tab (monthly factors against what is
already saved, plus the two write-backs), Data tab (meter CSV import,
manual entry, register). Eight-section help guide.

**Write-backs are deliberate, never side effects.** Save factors writes
one row per well-month to `po_allocation_factors`. Book to ledger
upserts allocated volumes into `po_daily_production` stamped
`source = 'allocation'`, behind a confirmation that says plainly it
replaces the measurements for those well-dates.

**Shared refactor:** the field picker both studios use moved to
`src/components/production/FieldPicker.jsx` (pure props); P2's
`FieldPanel` is now a thin wrapper, behavior unchanged.

**Migrations:**

- `20260829160000_p3_create_po_field_totals.sql` — the metered totals
  table. **NOT APPLIED** (session permission gate); owner runs
  `supabase db query --linked --file supabase/migrations/20260829160000_p3_create_po_field_totals.sql`.
- `20260829170000_p3_saved_allocation_projects.sql` — analysis-state
  persistence. **NOT APPLIED**, same gate.
- `20260829180000_seed_production_allocation_studio_tile.sql` — the
  Active tile, HELD for the single P12 upload.

**Verification:** 56 P3 gates (31 allocation + 6 importer + 19
context); full Suite jest and `npm run build` green.

## P4 — Gas Lift Design Studio (BUILT 2026-08-28)

Route `apps/production/gas-lift-design-studio`, entitlement-gated,
studio kit shell. The first phase to need an engine PR: the valve
mechanics and the spacing construction landed in
**@petrolord/engines PR #62** (merged, subtree-pulled here) as the
package's first `production` domain.

**Engine** (`packages/engines/engines/production/`, vendored; the Suite
imports it through `src/utils/production/engine/*` shims and never
edits the vendored copy):

- `gasProperties.js` — Sutton pseudo-criticals, Wichert-Aziz acid-gas
  correction, DAK z solved on reduced density, the real-gas static
  casing column marched with local temperature and z (plus its inverse,
  which is what expresses a valve's closing pressure at surface), and
  nitrogen z for the dome charge. No flat 0.02 psi/ft gas gradient
  anywhere.
- `gasLiftValves.js` — the bellows force balance (IPO and PPO are the
  same relation with casing and tubing swapped), the fixed-volume
  real-gas nitrogen ratio between the 60 degF test rack and valve
  temperature (not the linear rule of thumb, which drifts several
  percent on a hot deep valve), test-rack opening, spread,
  Thornhill-Craver port throughput with a continuous critical branch,
  and port selection against a target gas rate.
- `gasLiftDesign.js` — top-down spacing in both conventions
  (decreasing surface pressure, constant pressure), per-valve settings,
  the unloading sequence with multipointing detection, and the deepest
  point of injection from a supplied flowing traverse.
- `data/gasLiftValveCatalog.js` — the generic 1 in / 1.5 in bellows
  geometry the literature works in. Deliberately NOT a vendor catalog;
  the vendor spot-check is ARMED gate PL4.

**Validation.** `packages/engines/tools/validation/production/oracle_gaslift.py`
is an independent stdlib oracle written from the method spec (RK4 column
at 20x the engine's resolution, bisection where the engine iterates a
fixed point); goldens regenerate byte-identical. 39 engine gates, and
`tools/validation/production-validation.ts` runs PA1-PA8 ACTIVE with
PL1-PL4 ARMED (Takacs worked design, API Book 6 / NIST nitrogen, Guo
and Brown worked example, vendor valve data book). PA5 cross-checks
Thornhill-Craver against the validated nodal gas choke, which reaches
the same orifice physics through separately rounded published
constants.

Writing the closed-form spread gate caught a real error in the first
draft of the engine: spread is `R (P_open - P_other)`, not
`R/(1-R) (P_open - P_other)`, which is the dome form. Engine and oracle
both corrected before the goldens were committed.

**Suite analytics** (`src/utils/production/gasLift.js`, 26 gates) — what
needs the well itself:

- **Injection at depth.** The NA3 screening in `utils/nodal/gasLift.js`
  assumed the gas joined the stream at the node, so the whole string
  flowed at the lifted ratio. Here the traverse is marched in two
  segments, native gas-oil ratio below the injection point and the
  lifted ratio above it, which is what actually happens and is why
  injection depth is worth optimizing at all.
- The point-of-injection construction (flowing gradient from the
  wellhead against the real-gas injection line), the injection-depth
  sweep, the performance curve at a fixed depth, the psig/psia boundary
  (the engine works in absolute, the form in gauge), form validation
  that refuses with reasons rather than defaulting, the valve sheet, and
  the legacy Artificial Lift Designer import.

**State** (`src/contexts/GasLiftDesignContext.jsx`, 19 gates): unlike
P2/P3 this is a design app, so the well model and the design settings
ARE the `saved_gaslift_projects` payload. Cheap derivation (spacing,
injection point) recomputes as you type; the performance curve and the
depth sweep solve a nodal point per sample and stay explicit runs with a
stale flag, the Nodal Studio pattern. The `po_*` spine appears only as
an optional identity link: name the well a design is for, and apply its
latest valid test to the design rate, water cut, wellhead pressure and
gas-oil ratio (the last two derived from the test's measured rates,
since the spine stores rates rather than ratios).

**UI** (`src/components/gaslift/`, studio kit shell, white chartTheme):
Valve Design tab (pressure-depth plot with the injection line, kill
fluid line, flowing gradient and valve markers; the valve sheet with
CSV export; design checks), Unloading tab (stage by stage with the
multipointing verdict per stage), Injection Point tab (the construction
plus the four numbers that define it), Performance tab (the response
curve with its maximum and economic points, and the rate-against-depth
sweep), Well Model tab (the nodal model inputs, the spine link and the
legacy import). Nine-section help guide. Page smoke test covers every
tab.

**Legacy import.** Old Artificial Lift Designer saves that still carry
`design_data.gasLiftInputs` (kept deliberately at P0) load into the
matching sections. The old spacing safety factor has no equivalent in a
design with an explicit transfer differential and drop per valve, so it
is reported as not carried rather than guessed at.

**Migrations:**

- `20260829200000_p4_saved_gaslift_projects.sql` — design persistence.
  **NOT APPLIED** (session permission gate); owner runs
  `supabase db query --linked --file supabase/migrations/20260829200000_p4_saved_gaslift_projects.sql`.
- `20260829210000_seed_gas_lift_design_studio_tile.sql` — the Active
  tile, HELD for the single P12 upload.

**Also fixed here:** a P1 artefact in `src/lib/productionSpine.js` wrote
a literal NUL character into an import de-duplication key, which made
git treat the whole module as binary and hid it from grep. Replaced with
its escape sequence; the runtime string is identical.

**Verification:** 84 P4 gates (39 engine + 26 analytics + 19 context)
plus the page smoke test; `production-validation` 8/8 active; full Suite
jest 315/3968 and `npm run build` green.

## Next: P5 — ESP Design Studio

Correct total dynamic head from the IPR intake pressure through the
nodal model, staging against real pump curves, affinity and variable
speed, motor and cable sizing, and the gas separation check, per
ROADMAP §3 app 5. Absorbs the ESP Performance Monitor tile as a
diagnostics tab. The P4 pattern carries over: engine PR to
`packages/engines/engines/production/` with a Python oracle and
committed goldens first, then the studio.

Two P4 follow-ons to fold in when they fit:

- The nodal cross-check of well tests deferred at P3 needs a per-well
  IPR/VLP model. P4 now builds one, but it lives in a gas-lift design
  rather than on the spine; the natural home is a shared per-well model
  record, which P5 should consider rather than duplicating.
- Lift-gas allocation across a field (equal-slope allocation of a
  limited gas supply) is real gas-lift optimization but is outside the
  locked P4 scope of ROADMAP §3 app 4. It needs several wells' response
  curves, so it belongs with the Advisor (P9) or the Network Studio
  (P11).

## Gotchas for later phases

- The retired apps' tables (`wellbore_flow_projects`,
  `flow_assurance_projects`, `production_surveillance_projects`) stay
  read-protected until the owner-gated post-P12 drop decision.
- Old ALD saves may contain `gasLiftInputs`/`espInputs`/`rodPumpInputs`
  in `design_data`; P4–P6 studios should offer to import them. P4 does
  this (`importLegacyGasLiftInputs` + the Well Model tab); P5 and P6
  should follow the same shape, carrying only fields that mean the same
  thing and reporting the rest.
- `utils/anomalyDetection.js` and `hooks/usePhase5State.js` sound like
  the deleted anomaly detector but belong to a different (multi-well
  portfolio) tree; they were deliberately left alone.
- Salvage for P11: `components/networkdiagram` (editor) +
  `components/facilitynetworkhydraulics` (segment math). Salvage for
  P10: nothing in `components/flowassurance` (fictional equations);
  build on Fluid Studio EOS.
