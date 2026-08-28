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

## P5 — ESP Design Studio (BUILT 2026-08-28)

Ships on `feat/production-p5` (stacked on the P4 branch). Route
`apps/production/esp-design-studio`, gated with
`ProtectedAppRoute appId="esp-design-studio"`, studio kit shell.
Absorbs the ESP Performance Monitor tile as the Diagnostics tab, so a
running installation is read against the same stage curve the design
was sized on.

**Engine first (the P4 pattern): engines PR #63, MERGED.**
`packages/engines/engines/production/`:

- `espPump.js` — one stage is the whole description of a pump: head,
  efficiency and brake power against rate at a reference frequency.
  Two routes to that curve and deliberately no third: a least-squares
  fit through the vendor's published points (reported with its
  residual, so a bad transcription shows up), or `referenceStageCurve`,
  a transparent MODEL shape from four named parameters, labelled as a
  model everywhere it surfaces. Affinity laws for speed. The Hydraulic
  Institute viscous correction (ANSI/HI 9.6.7) is NOT reproduced from
  memory: in-situ viscosity is reported and a correction is flagged as
  required, because invented factors would be worse than none.
- `espDesign.js` — intake pressure, the intake stream from black-oil
  PVT, the separator split and the gas volume fraction that picks the
  equipment, total dynamic head from the two pressures, staging, and
  `diagnoseOperation` (the curve read backwards).
- `espMotorCable.js` — motor current at part load by nameplate scaling
  (flagged below half load rather than extrapolated to zero), copper
  conductor resistance with the standard temperature correction, the
  three-phase drop, and a cable selection that returns nothing rather
  than the least bad conductor when none qualifies.
- `data/espCatalog.js` — reference model stages (no part numbers), AWG
  copper resistances (a property of the metal), common motor
  nameplates. Ampacity is absent on purpose: it belongs to the
  insulation system and is a manufacturer number.

Independent Python oracle + byte-identical goldens; 40 engine gates.

**Suite layer** (`src/utils/production/esp.js`, 28 gates) is the part
that needs the well: the IPR at the design rate, the PVT at intake
conditions, the separator split, and a discharge pressure that is a
real multiphase traverse from the wellhead down to the pump. Total
dynamic head falls out of those two pressures.

**The two defects this phase exists to fix**, both from the removed
Artificial Lift Designer ESP tab (`src/utils/espCalculations.js`,
deleted in this phase):

1. TDH was friction plus wellhead pressure with the net vertical lift
   missing. On the studio's default well the net lift is 88 percent of
   the head, so the old staging was short by roughly an order of
   magnitude. The gate `espDesignContext.test.jsx` asserts net lift is
   more than half the head, and the Design tab names it on its own row.
2. Intake and discharge were a static column at one mixture gravity.
   Both are now computed, and the gas in the tubing is the gas the
   separator did not take out.

It also divided hydraulic power by 58800 with head in feet, where that
constant belongs to pressure in psi, and shipped invented stage curves
under vendor-sounding model names.

**State** (`src/contexts/EspDesignContext.jsx`, 25 gates): the P4
recipe — the design IS the project, in the `saved_esp_projects`
payload (hydrated guard + 10 s debounced autosave); the po_* spine is
an optional identity link only. Perforation depth is deliberately NOT
a separate input: it is the well model's node depth, because carrying
it twice is how a pump gets designed against a depth the traverse
never saw. What is live and what is an explicit run is decided by
traverse count: one design run is one traverse, so it recomputes as you
type; the system curve is a traverse per rate and the operating point
is a solve on top of them, so that is an explicit run with a stale
flag.

**UI** (`src/components/esp/`, white chartTheme + ChartLogo on every
chart). Tabs: Design (the head, its three-part decomposition arranged
so the parts sum exactly, and the gas at the intake), Pump Curve (the
stack curve with the recommended band and the duty point, plus where
the duty sits relative to the best efficiency point), Performance (the
explicit pump-against-system run and the operating point), Electrical
(motor load, surface requirement, and every cable candidate with why it
passed or failed), Diagnostics (the absorbed Performance Monitor),
Well Model (the nodal inputs, the spine link and the legacy import).
Ten-section help guide; page smoke test across every tab.

**Refusals worth naming** (each is a real engineering answer):

- A duty off the end of the pump curve produces no stage count rather
  than a negative one.
- A well whose inflow already beats the tubing is reported as naturally
  flowing at that rate, not handed a pump.
- A design rate at or above the inflow's absolute open flow is refused
  with the open-flow number.
- No cable meeting the drop limit is reported as no cable.

**Validation:** `tools/validation/production-validation.ts` PA9-PA14
ACTIVE (stage curve fitting and recovery, affinity laws, the gas split
and the density the pump actually sees, TDH and staging with the
net-lift regression, the electrical side against the oracle, and the
Suite chain on a real nodal well) + PL5-PL8 ARMED (HI 9.6.7 viscous
correction, Turpin / Alhanati gas handling, vendor pump curves, Takacs
ESP manual). 14/14 active production gates passing.

**Migrations:**

- `20260829230000_p5_saved_esp_projects.sql` — design persistence,
  owner-scoped RLS. Safe pre-deploy. **NOT APPLIED**: the session
  cannot run the real apply; owner runs
  `supabase db query --linked --file supabase/migrations/20260829230000_p5_saved_esp_projects.sql`
  and flips the MIGRATIONS.md row. Until then the studio computes
  normally and only project save/load reports the missing table.
- `20260829240000_seed_esp_design_studio_tile.sql` — the Active tile,
  HELD for the single P12 upload with the other P-phase tiles.

**Verification:** 93 P5 gates (40 engine + 28 Suite analytics + 25
context) plus the page smoke test; full Suite jest 320/4072 and
`npm run build` green.

**The P4 follow-on, answered honestly.** P4 recorded that a shared
per-well IPR/VLP model record would close the P3 nodal cross-check of
well tests, and suggested P5 consider it rather than duplicating. P5
considered it and DID NOT build it: it uses the same local
`buildWellModel` shape the gas lift studio uses. The reason is scope,
not convenience — a shared record is a new spine table plus a service,
and it would have to migrate the design payloads P4 already writes and
be consumed by P3 and P6 to be worth anything. Doing it inside P5 would
mean changing two shipped studios from a third one's branch. It stays
open as its own piece of work, and it is now duplicated in two studios
rather than one, which is the cost of deferring it again.

## P6 — Rod Pump Design Studio (BUILT 2026-08-28)

Ships on `feat/production-p6` (stacked on the P5 branch). Route
`apps/production/rod-pump-design-studio`, gated with
`ProtectedAppRoute appId="rod-pump-design-studio"`, studio kit shell.

**THE SCOPE CALL, stated plainly because it is a deviation.** The
roadmap asks for API RP 11L. RP 11L predicts plunger stroke, loads and
torque from a set of dimensionless CHARTS, and those charts are
themselves solutions of the damped wave equation, computed once and
plotted. Reproducing plotted curves from memory is exactly what this
platform refuses elsewhere (the Hydraulic Institute correction in P5,
the vendor pump curves in the ESP catalog). Here there was no need to
take the risk: the equation the charts solve is first-principles
physics, so P6 solves it directly. That is a superset of the ask, not a
substitute for it. The RP 11L dimensionless groups ARE reported on the
Design tab, because they are how a rod-pump engineer reads an answer,
and the published chart values are ARMED as gate PL9 for when the owner
supplies the document.

**Engine first: engines PR #64, MERGED** (plus a follow-up fix on main,
below). `packages/engines/engines/production/`:

- `rodString.js` — stepped-bar mechanics, closed form. The tapered
  natural frequency is an eigenvalue problem with an exact
  transfer-matrix statement, so it is SOLVED rather than read off a
  frequency-factor table.
- `rodDynamics.js` — the damped wave equation in BOTH directions.
  `predictCard` marches displacement on a collocated grid for the
  design problem; `diagnoseCard` propagates Fourier harmonics in closed
  form for the measurement problem, which is Gibbs 1963. They share no
  code path.
- `pumpingUnit.js` — exact four-bar kinematics. The torque factor is
  ds/dtheta, which is what virtual work says it is, so it is
  differentiated from the linkage rather than quoted from a formula.
- `rodPumpDesign.js` — the chain, the dimensionless groups, section
  stresses off the tension envelope against modified Goodman.
- `data/rodCatalog.js` — API sizes with areas COMPUTED from diameters,
  published weights checked against bare steel plus a consistent
  coupling allowance. No named pumping units: real beam dimensions are
  manufacturer data, so a generic four-bar scaled to a requested stroke
  is offered and labelled generic everywhere it surfaces.

**Two results worth recording.**

1. *The 245,000 constant is derived, not asserted.* Bare steel gives a
   wave speed near 16,980 ft/s. Couplings add mass and essentially no
   stiffness, so they slow the wave by the square root of the 1.087
   coupling allowance, giving about 16,290 ft/s — which is exactly the
   value N0 = 245,000/L is built on. The gates land the derivation on
   244,331, 0.27 percent off the textbook constant, from material
   properties alone.
2. *A conventional unit is not a sine wave.* The exact linkage spends
   54.4 percent of the revolution on the upstroke. The predecessor
   assumed pure harmonic motion, and that asymmetry is most of the
   difference between a real peak torque and a textbook one.

**The four defects this phase exists to fix**, all from the removed
Artificial Lift Designer rod pump tab (`src/utils/rodPumpCalculations.js`,
deleted in this phase). Its "Mills method" was neither Mills nor RP 11L
— the dynamic factor, the torque factor and the minimum load were all
invented expressions — and underneath that:

1. Rod diameter came from `parseFloat("7/8".replace('/', '.'))`, which
   is **7.8 inches**. Areas were about eighty times too large and the
   string could not stretch.
2. The buoyancy factor was `1 - 1.2 * SG / 7.85`. Archimedes has no 1.2
   in it; that factor removed roughly a fifth of the rod weight.
3. Displacement was `0.1166 * plungerArea * S * N`. The constant already
   carries pi/4, so multiplying by area applies it twice: displacement
   21 percent low, which came back out as a pump fillage 27 percent high.
4. The fluid load SUBTRACTED tubing pressure from the column instead of
   adding it, lightening every design.

Each of the four is gated against directly, in the engine suite and in
`production-validation.ts`, because each is easy to repeat.

**Suite layer** (`src/utils/production/rodPump.js`, 27 gates) is the
part that needs the well: the IPR at the design rate, the intake
pressure and the submergence it implies, the free gas that decides how
much of the barrel fills, and the liquid column that sets the fluid
load. Plus the speed sweep, the measured-card diagnosis and the legacy
import.

**State** (`src/contexts/RodPumpDesignContext.jsx`, 22 gates): the
P4/P5 recipe — the design IS the project, in the
`saved_rodpump_projects` payload. Perforation depth is deliberately not
an input: it is the well model's node depth, the same rule P5 set. Live
versus explicit run is decided by wave-equation solves: one design is
one solve, so it recomputes as you type; the speed sweep is a solve per
speed, so it is explicit with a stale flag.

**UI** (`src/components/rodpump/`, white chartTheme + ChartLogo on
every chart). Tabs: Design (fluid load, submergence, fillage, plunger
stroke, production, loads, torque, unit ratings and the RP 11L groups),
Dyno Cards (surface and downhole cards, and gearbox torque through a
revolution), Rod String (the taper, section stresses against modified
Goodman, and the tension envelope down the string), Performance (the
explicit speed sweep), Diagnostics (a measured card read down the
string by the Gibbs solution), Well Model. Ten-section help guide; page
smoke test across every tab.

**Refusals worth naming:** a rod string that does not reach its pump; a
rod size that cannot be read (rather than a plausible diameter); a rate
at or above the absolute open flow; a unit driven at or above the
string's own natural frequency; a linkage whose dimensions cannot
close; and a string with no damping.

**A defect found and fixed mid-phase.** `num(value, undefined)` in
`utils/nodal/numerics` falls back to **0**, because the helper's own
default parameter is 0. The studio's damping input therefore became
zero damping, and an undamped string never settles: the plunger stroke
grew past the surface stroke, the minimum load went negative and the
loads looked perfectly stable. Fixed in both layers — the Suite no
longer asks for it, and the ENGINE now refuses a non-positive damping
ratio up front rather than marching it (engines main `a51a11a`,
subtree-pulled). Worth remembering for P7+: that helper's fallback is
not `undefined`-transparent.

**Validation:** `tools/validation/production-validation.ts` PA15-PA20
ACTIVE (rod mechanics with the fraction and buoyancy regressions, the
245,000 constant derived from the coupling mass, the static limit the
wave equation must reduce to, the predict/diagnose round trip, the
energy identity behind the torque factor, and the Suite chain on a real
nodal well) + PL9-PL12 ARMED (RP 11L charts, Takacs rod manual, API RP
11BR service factors, a measured field card). 20/20 active gates.

**The oracle earned its keep.** It takes a different route at every
step — finite-element eigenvalues against the transfer matrix, Newton
loop closure with implicit differentiation against circle intersection
with finite differences, a staggered velocity/tension RK4 march against
the collocated explicit displacement march, and Python's own complex
type against hand-rolled complex arithmetic. Building it found a real
bug in its own surface boundary condition (a zero surface velocity),
which is what an independent oracle is for. The diagnostic agrees with
it to 1e-16.

**Migrations:**

- `20260829260000_p6_saved_rodpump_projects.sql` — design persistence,
  owner-scoped RLS. Safe pre-deploy. **NOT APPLIED**: owner runs
  `supabase db query --linked --file supabase/migrations/20260829260000_p6_saved_rodpump_projects.sql`
  and flips the MIGRATIONS.md row.
- `20260829270000_seed_rod_pump_design_studio_tile.sql` — the Active
  tile, HELD for the single P12 upload with the other P-phase tiles.

**Verification:** 95 P6 gates (46 engine + 27 Suite analytics + 22
context) plus the page smoke test; full Suite jest 324/4173 and
`npm run build` green.

**The shared per-well model record — CLOSED at P6.5.** P4 raised it, P5
declined it and recorded the cost, and P6 built the same local
`buildWellModel` a third time before the owner called it. It was done
as its own phase immediately after this one, before P7 could make it a
fourth. See the P6.5 section below.

## P6.5 — the shared per-well model record (BUILT 2026-08-28)

Ships on `feat/production-p6.5-well-model` (stacked on the P6 branch).
**Unplanned, inserted before P7 on an explicit owner decision.** P4
raised the need, P5 declined it and recorded the cost, P6 deferred it a
third time. The count was heading for six or seven, and P9 (the
Artificial Lift Advisor) cannot be built without it: comparing gas
lift against ESP against rod pump *on the same well* is meaningless if
each studio holds its own description of that well.

**What the record is, and the line it draws.** `po_well_models` holds
the well's OWN description and nothing else:

| Belongs to the WELL (shared) | Belongs to the DESIGN (not shared) |
|---|---|
| trajectory, temperatures | design rate |
| fluid / PVT | water cut |
| inflow (IPR) | wellhead pressure |
| completion (tubing, casing, roughness, correlation, step) | injection gas, plunger size, rod taper, stroke, speed |

That line is the whole discipline of the phase, and it is gated in
three places. Water cut and wellhead pressure look like well properties
and are not: they are what the well was doing on the day. If they
leaked into the shared record, two studios sharing a well would
silently overwrite each other's design conditions, which is worse than
the duplication this replaced. **The gas lift studio's `completion`
section therefore lost `whp` and `wctPct` to its `injection` section**
in this phase; that is a visible move in a built studio and is
deliberate.

One current model per well, enforced by a unique key on `well_id`.
Named revisions are a real want, but the cross-check needs an
unambiguous answer to "what does this well do", so the simple shape
ships first and revisions can be a child table later.

**Code:**

- `supabase/migrations/20260829290000_p65_create_po_well_models.sql` —
  the table, RLS on the po_* spine pattern verbatim. **NOT APPLIED**;
  owner runs it.
- `src/utils/production/wellModel.js` — one `buildWellModel`, the
  default shape, merge/round-trip helpers, and `wellModelProblems`.
  The `vlp` it returns is SELF-CONTAINED (it carries the fluid, the
  trajectory and the temperature alongside the completion) because the
  gas lift studio spreads it straight into a traverse call; a vlp
  missing those would build fine and fail at the traverse, which is the
  worst place to find out.
- `src/lib/productionSpine.js` — `getWellModel`, `listFieldWellModels`,
  `upsertWellModel`, `deleteWellModel`.
- `src/hooks/useWellModelSync.js` — load, save and the divergence
  report, written once so the shared record did not arrive with its own
  triplicated wiring. It never syncs automatically: a design may try a
  different inflow without rewriting the field's record for everyone,
  so loading and saving are both deliberate and the drift is reported
  rather than resolved. The dirty check compares the TYPED STRINGS,
  because comparing coerced numbers would call "2.441" and "2.4410"
  different and a half-typed field a change.
- `src/components/production/WellModelPanel.jsx` — the panel, replacing
  three near-identical copies that had already drifted in wording and
  in which fields they offered. `showCompletion` is a prop because it
  is genuinely optional: a rod pump lifts a liquid column and marches
  no multiphase traverse.
- `src/components/production/WellModelSpinePanel.jsx` — load/save, in
  each studio's spine link panel.
- `src/components/allocation/NodalCheckPanel.jsx` — the P3 check, below
  the existing Test QC panel.

**THE P3 CROSS-CHECK, now closed.** P3 deferred checking well tests
against what the well should make, and said exactly why: it needs a
per-well IPR and VLP, and the spine knew the wells but not what they
do. `crossCheckTestsAgainstNodal` in `utils/production/allocation.js`
is that check. A test records a rate and a tubing head pressure; feed
that pressure to the well's own model, solve where inflow meets
outflow, and the rate that comes out is what the well should have made.
It uses the TEST's own water cut and gas ratio, not the model's,
because the model says what the well IS and the test says what it was
doing. Five honest outcomes: agrees, disagrees (with the direction
named), will not flow at those conditions, no wellhead pressure, no
well model. It is an explicit run in the Allocation Studio, not part of
the live QC, because it marches a traverse per rate per test.

**A live defect this consolidation found.** Absolute open flow
calibrates a Vogel inflow and only a Vogel inflow — the straight-line
PI and composite models are calibrated by a productivity index or a
test point. All three lift studios offered "Absolute open flow" for
every model, and picking it on the default composite model calibrated
nothing: `qmax` came back NaN, and because every downstream rate guard
compares against it — and NaN comparisons are false — the design sailed
straight past its own refusals and produced a page of NaN. Fixed three
ways: `buildWellModel` now returns null when the inflow did not
calibrate (so every studio's existing "the well model is incomplete"
refusal fires), `wellModelProblems` names the combination, and the
shared panel only offers the option where it means something. This was
live in P4, P5 and P6.

**Verification:** 20 well-model gates + 9 cross-check gates + 8 new
context gates across the three studios (save carries no duty, refuses
without a linked well, loading replaces the well and leaves the duty
alone, and the drift report). `production-validation.ts` PA21 ACTIVE
added; 21/21 active gates. Full Suite jest 325/4210 and `npm run build`
green.

**What this does NOT do.** It does not yet give P2 (Surveillance) or
the future P8/P11 studios a well model — they simply have no reason to
build one yet. When they do, they consume the same module. Named model
revisions are deliberately not built.

## P7 — Gas Well Performance Studio (BUILT 2026-08-28)

Ships on `feat/production-p7` (stacked on the P6.5 branch). Route
`apps/production/gas-well-performance-studio`, gated with
`ProtectedAppRoute appId="gas-well-performance-studio"`, studio kit
shell. **The first studio built on the shared per-well record from the
start** rather than carrying its own copy of the well, which is what
P6.5 was for.

**Engine first: engines PR #66, MERGED**, plus a follow-up fix on
engines main.

**TURNER'S EQUATION IS DERIVED, NOT QUOTED.** The whole correlation
falls out of two statements about the largest droplet a gas stream can
hold up: at terminal velocity drag balances weight less buoyancy, and a
droplet above a critical Weber number shatters. Eliminating the droplet
diameter between them gives

    v = [ 40 gc^2 sigma (rho_L - rho_g) / (Cd rho_g^2) ]^(1/4)

and with Cd = 0.44, We = 30 and sigma in dyne/cm the bracket collapses
to **1.5935** — the 1.593 every gas-well text prints. The critical-rate
constant is derived the same way and lands on the published 3.06.
Deriving them means the drag coefficient and the Weber number are
visible inputs a user can argue with rather than numbers buried in a
constant. This is the same discipline as the 245,000 constant at P6.

**Turner and Coleman are ONE equation and one factor.** Turner applied
a 20 percent upward adjustment to match his field data; Coleman,
working on wells below about 1,000 psi wellhead, found none was needed.
Treating them as rival correlations would hide that. The guidance
follows the pressure ranges each was fitted on, and choosing against it
is allowed but reported.

**THE SHOE CONTROLS, NOT THE WELLHEAD.** Critical rate goes as roughly
the square root of pressure, so it is highest at the bottom of the
tubing. A well can sit comfortably above it at the wellhead — which is
where the operator is looking — while loading at the shoe, which is
where liquid actually collects. So the gas column is marched segment by
segment and the droplet check runs at every station; the controlling
one is found rather than assumed. There is a gate on exactly that case.
Temperature works the other way and partly cancels the pressure effect,
which is why some wells come out nearly uniform down the string.

**THE FORECAST IS THE POINT OF THE STUDIO.** A loading number for today
is surveillance. The reservoir pressure at which a well STARTS to load
is a plan, and it is what a tubing change, a plunger or a compressor
gets justified against. As the reservoir depletes the deliverability
falls faster than the critical rate does and the two curves cross; the
crossing is reported. Each point is a full nodal solve and a marched
column, so it is an explicit run, and the deliverability coefficients
are held across it — this is the same well depleted, not a different
one.

**Plunger lift rests on computed physics, not a rule of thumb.** The
required gas-liquid ratio is the gas a cycle needs, from the real gas
law over the swept tubing volume, divided by the liquid it brings up.
The industry's ~400 scf/bbl per 1,000 ft heuristic is reported beside
it as a labelled cross-check and **whether the two agree is surfaced**,
because a well sitting between them is exactly where a screening rule
misleads. There is a gate on a well the heuristic passes and the
physics fails. The lift pressure is a static force balance readable
term by term; friction, rise and fall velocities and the cycle times
are inputs with stated typical ranges, because plunger lift is a field
full of rules of thumb and none of them is dressed up here as physics.

**The shared record grew a phase.** `well.phase` says oil or gas, and a
`gasInflow` section carries the deliverability coefficients. Everything
else — trajectory, temperatures, fluid, completion — stays shared,
because none of it cares what phase the well makes. Reservoir pressure,
gas gravity and bottomhole temperature are read from the sections that
already hold them rather than asked for twice. The record carries BOTH
inflows, so re-describing a well does not lose the other one.
`wellPhaseProblem` gives a studio a sentence to show when the wrong
phase is loaded, which is an ordinary accident now that records are
shared.

**Three defects the P6.5 gates caught during this phase**, each of them
the kind of thing a shared record is supposed to prevent:

1. `wellInputsFrom` was written out by hand, so adding `gasInflow`
   silently stopped a gas well's deliverability coefficients from ever
   reaching the spine. It is now driven by `WELL_MODEL_SECTIONS`, so a
   section added to the record cannot be forgotten.
2. The lift studios did not carry the `gasInflow` section at all, so
   opening a gas well in the ESP or rod pump studio and saving would
   have **wiped its deliverability coefficients for every other
   studio** — worse than the duplication the shared record replaced.
   All three now carry the whole record even though they use part of
   it, with a regression gate in each.
3. The gas IPR results do not carry the reservoir pressure, so
   `model.prPsia` was added: a consumer showing a drawdown had nowhere
   else to get it from, and the Deliverability panel was reading a
   field that did not exist.

**Engine defect found and fixed mid-phase:** a loading profile point
reported only its depth and its result, not the pressure, temperature
and z it was computed at. That made the profile unplottable and the
controlling station useless to the tubing sizing, which has to be
evaluated exactly there — every candidate silently failed. Fixed in the
engine (main `b7c111d`, subtree-pulled) and gated.

**UI** (`src/components/gaswell/`, white chartTheme + ChartLogo on
every chart). Tabs: Deliverability (the node on the validated gas
layer), Liquid Loading (the profile down the string, the controlling
station, and tubing screening), Forecast (the explicit run that says
when the well will load), Plunger Lift, Well Model (the shared panel
plus the gas inflow). Ten-section help guide; page smoke test across
every tab.

**Validation:** `tools/validation/production-validation.ts` PA22-PA23
ACTIVE + PL13-PL16 ARMED (Turner 1969 worked examples, the Coleman
data set, Foss & Gaul / Beeson-Knox-Stoddard plunger examples, Lea &
Nickens deliverability). 23/23 active gates.

**The oracle worked in SI throughout** — newtons per metre, kilograms
per cubic metre, pascals, with no gc anywhere because SI does not need
one — and converts only at the boundary, while the engine works in
field units. Agreement is two unit systems meeting, which is the
strongest available check on a correlation full of remembered
constants. The derived Turner constant matches across that boundary to
a part in a million.

**Verification:** 55 P7 gates (31 engine + 24 Suite) plus the page
smoke test; full Suite jest 328/4272 and `npm run build` green.

**Migrations:**

- `20260829310000_p7_saved_gaswell_projects.sql` — analysis
  persistence, owner-scoped RLS. Safe pre-deploy. **NOT APPLIED**.
- `20260829320000_seed_gas_well_performance_studio_tile.sql` — the
  Active tile, HELD for the single P12 upload.

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
