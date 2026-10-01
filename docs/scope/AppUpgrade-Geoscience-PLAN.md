# Comprehensive app upgrade: Geoscience first

Plan of record, 2026-09-28. The programme after the Senior Testing
Programme. Testing asked "does it work?". This programme asks "is it the
best tool a practitioner could open, and does it use the rest of the Suite?".
Geoscience goes first, one app at a time, in the order below.

Companion docs:
- `docs/scope/AppUpgrade-BestPractices.md`: the practitioner lens (Step 1).
- `docs/scope/AppUpgrade-HumanFeedback-Audit.md`: the evidence behind it.

## 1. The two steps per app

Each app gets one working doc, `docs/upgrade/<App>-UPGRADE.md`, with a
section per step, finding IDs `<APP>-U1-<nnn>` (Step 1) and `<APP>-U2-<nnn>`
(Step 2), and a branch per batch `feat/<app>-u<step>-<batch>`.

### Step 1: the practitioner lens

Run the twelve checks PL1 to PL12 on the app. Read its STATUS, ROADMAP, T1
report and every human round first, and carry forward findings already made
on sibling apps. Defects found here are fixed and merged on green, each with
a test that fails without the fix.

Exit: every check has a recorded result; S1/S2 findings fixed; the hostile
file set, saved-state fixtures and chain e2e exist for the app.

### Step 2: advancement review

**2a. Competitor parity.** Name two or three leading tools (table below).
From their public documentation, build a feature matrix: capability, how the
leader does it, what we do, gap (none, partial, missing, done worse). Mark
the gaps a practitioner would notice in a demo.

**2b. Deferred backlog.** Harvest every deferred, "future scope", "not in
release 1", after-NAPE and open item from the app's STATUS, ROADMAP, PLAN, T1
and memory. Mark each as still wanted, superseded or dropped.

**2c. Suite integration.** Map what the app reads and writes (geo_*
registries, deep links, "Open in", `.pld` families), then check three things:
- which upstream data it ignores that it could use;
- which downstream apps could use its results but do not receive them;
- where a handoff loses units, state or context.

The integrated platform is our strongest selling point. A Petrel user has
one project; our answer must be that every app already knows the wells,
tops, surfaces and results from the others.

**Output.** One ranked upgrade backlog merging 2a, 2b and 2c, each item
sized S/M/L with its value in one line. It goes to the owner in plain words,
as for Mapping's batches A, B and C. The owner picks the batches. Then we
build them validation-first (engine gates call the engine, with a negative
control), with tests, docs and STATUS updates, and merge on green.

**Exit per app.** The chosen batches are merged. STATUS records the new
parity table. The user manual and help are updated. The next app starts.

## 2. Upgrade order

Principles, in priority order:
1. **Upstream first.** An upgrade to a data source improves every app
   downstream of it, and the downstream reviews then run on better inputs.
2. **Least-examined first.** Five apps never had a T1 cycle (WDM,
   Petrophysics, Well Correlation, Seismolord, Wellsite). They carry the most
   unknowns.
3. **Demo and sales weight.** Apps a NAPE visitor opens first.
4. **Shared code together.** Apps built on the same kit go back to back.

| # | App | Size | Why here | Benchmarks for 2a | Known inputs to Step 2 |
|---|---|---|---|---|---|
| 1 | **Well Data Manager** | S-M (3k LOC) | Keystone: owns geo_wells, logs, tops, intervals, cores; feeds all 12 Geoscience apps and 8 outside. No T1. Small, so it pilots the method. | Petrel well manager, Techlog data, IHS Petra, OSDU well data | LAS 3.0 tops and string channels not imported; owner staging smoke |
| 2 | **Petrophysics Studio** | L (13k) | Main writer of computed curves, zones and tops. Deepest human history, never T1-tested. Techlog/IP parity is the question customers ask. | Techlog, Interactive Petrophysics, Geolog | Multi-mineral stage two (PT11e); Bateman-Konen chart readings; prefs not stored per user; `.pld` import fails on duplicate names |
| 3 | **Well Correlation** | M (1.3k + shared section kit) | Thinnest geoscience app; produces the tops everything maps. No T1. | Petrel well section, Kingdom, Petra | Flattening, TWT reference, named sections, tops CSV, ghost curve (Wave 3 unbuilt) |
| 4 | **Stratigraphy Studio** | M (1.8k + section kit) | Same section kit as Correlation; feeds Basin, Mapping, Seismolord flattening. | Petrel stratigraphy, StrataBugs | ST-T1-E1 (org zone schemes table, Wheeler spacing); auto-correlation, chemostrat, biostrat database out of v1 |
| 5 | **Seismolord** | XL (34k) | Flagship, never T1-tested. Goes after the well stack so well ties, tops and synthetics review on clean well data. | Petrel, Kingdom, OpendTect | 2D picks as gridding control; org-shared projects; fault polygons in 3D; depth picking; interval velocities; fault sticks to Earth Modeling |
| 6 | **Mapping & Surface Studio** (with Contour Map Digitizer) | M (4.2k + 0.9k) | Surface hub for EM, RCP, Simulation and Well Design. T1 closed, so Step 2 carries the weight. | Petrel mapping, Surfer, Kingdom | Minimum curvature, extrapolation control, well-based depth conversion; kriging and tension ignore fault blocks; Digitizer route unprotected |
| 7 | **Earth Modeling** | M (3.1k) | Consumes surfaces, faults and zones; feeds RCP. | Petrel, SKUA-GOCAD, RMS | EM-T1-010 Seismolord fault sticks; Sw from SCAL saturation-height; `em_models` not in `.pld`; stale "EarthModel Pro" help |
| 8 | **ReservoirCalc Pro** | L (17.7k) | End of the geoscience chain; hands prospects to Risked Reserves and economics. | GeoX, REP, Petrel volumetrics | E2 shared Mapping map kit; gas-cap fraction and condensate yield; dead PPFG/Velocity adapters; `rcp_*` not in `.pld` |
| 9 | **Pore Pressure Studio** | M (1.9k) | Bridge to Drilling (Well Design mud window, Geomechanics). | Drillworks, Predict, Petrel PPP | Resistivity Eaton; layer-cake velocity; kick/trip margins and casing seats; publishes MPa while Drilling reads ppg |
| 10 | **Rock Physics Studio** | S-M (2.5k) | Bridge from petrophysics to seismic; smaller audience. | RokDoc, Hampson-Russell | Angle-gather synthetic; wet trend on the I-G crossplot |
| 11 | **Basin & Charge Modeling** | L (7.6k) | Specialist audience; v1 is sound. | PetroMod, Trinity | Route not in ProtectedAppRoute; `bf_wells` not in `.pld`; eroded section on burial history; trap and migration modelling; orphan bf_* tables |
| 12 | **Wellsite Studio** | M (4.8k) | Operations tool with its own PWA and tables; never T1-tested, but it sits apart from the interpretation chain. | WellSight Log, Geolog, mudlogging suites | WITSML/ETP feeds, gas ratios, d-exponent, composite log; owner PWA install and simulated shift |

**Alternative considered: Seismolord first**, as the flagship for NAPE. We
did not choose it. Seismolord had a full tester programme on 09-22, and its
well tie, tops and synthetics depend on apps 1 to 4. Upgrading it first would
mean reviewing those features on inputs we are about to change. If the owner
wants a NAPE headline sooner, swap 5 to 2 and leave the rest unchanged.

## 3. Cross-cutting items found while ranking

Each is assigned to the app whose Step 2c will fix it:

| Item | Owner app |
|---|---|
| `.pld` loses `em_models`, `bf_wells`, `rcp_*` | Earth Modeling, Basin, RCP |
| Basin and Contour Map Digitizer routes lack `ProtectedAppRoute` (about 40 Suite routes do; Wave 2 summary) | Basin, Mapping; Suite-wide item for the owner |
| Pore pressure published in MPa, Drilling reads ppg | Pore Pressure |
| Seismolord fault sticks do not reach Earth Modeling | Seismolord, Earth Modeling |
| Legacy `GeoscienceHub.jsx` points at redirect slugs | Well Data Manager (hub cleanup) |
| Seismolord projects personal-only (no org sharing) | Seismolord |
| Other apps ignore a site's datum override (CRS programme) | Well Data Manager |

## 4. Constraints

- **NAPE (early November 2026).** Demo-core apps (Mapping, Earth Modeling,
  RCP, Seismolord, Petrophysics) must not break before the freeze tag
  `nape-2026-demo`. Upgrade branches merge only on green e2e, and one
  production zip is cut per app, which the owner uploads.
- Shared tables (organizations, users, invitations, onboarding) keep the
  second-engineer rule. New geo_* tables follow the migration conventions and
  are logged in MIGRATIONS.md.
- Engine changes validate against published references before promotion.
- No new Monte Carlo or NPV engines; use the canonical modules.

## 5. Progress

| # | App | Step 1 | Step 2 | Batches merged | Upgrade doc |
|---|---|---|---|---|---|
| 1 | Well Data Manager | done 2026-09-28: 12 checks, 33 findings, 19 fixed (all S2) | analysed 2026-09-28: 18 items; batch decision 2026-09-28: 14 built (A, B, C), 4 deferred (U2-007, U2-012, U2-009, U2-018) | A, B, C built on `feat/wdm-u2` (PR open, 2026-09-28) | `docs/upgrade/WellDataManager-UPGRADE.md` |
| 2 | Petrophysics Studio | done 2026-09-29: 12 checks, 33 findings, 17 fixed (the S1 and all S2) | analysed 2026-09-29: 18 items; batch decision 2026-09-29: 15 built (A: 005, 003, 002, 004, 001; B: 012, 009, 013, 008, 007, 010, 011, 006; C: 015, 018), 3 deferred (U2-014, U2-016, U2-017) | A, B, C on `feat/petro-u2` (PR #817); engines PRs #285 and #286 merged, vendored at a5b1e52 (2026-09-30) | `docs/upgrade/PetrophysicsStudio-UPGRADE.md` |
| 3 | Well Correlation | done 2026-09-29: 12 checks, 26 findings, 16 fixed (5 S2, 8 S3, 3 S4; no S2 open) | analysed 2026-09-29: 18 items; batch decision 2026-09-29: 14 built (A, B, C), 4 deferred (U2-011, U2-017, U2-018, U2-016) | A, B, C merged 2026-09-30 (PR #818) | `docs/upgrade/WellCorrelation-UPGRADE.md` |
| 4 | Stratigraphy Studio | done 2026-09-30: 12 checks, 34 findings, 23 fixed (7 S2, 11 S3, 5 S4; no S2 open) | analysed 2026-09-30: 20 items; batch decision 2026-09-30 (+ owner: U2-008 in scope): 16 built (A: 002, 001, 003, 006, 004, 005, 007; B: 011, 012, 009, 010, 008; C: 016, 018 in part, 019), U2-013 deferred (no table without a schema change), 4 deferred by the decision (020, 014, 015, 017) | A, B, C on `feat/strat-u2` (PR open, 2026-09-30); engines PRs #287 and #288 merged, vendored at 8983e2f | `docs/upgrade/StratigraphyStudio-UPGRADE.md` |
| 5 | Seismolord | done 2026-09-30: 12 checks, 26 findings, 18 fixed (2 S1 at the registry door, 5 S2, 7 S3, 4 S4; no S1/S2 open) | analysed 2026-09-30: 20 items; batch decision 2026-09-30: 12 built (A: 001, 002, 003, 010, 014, 013, 007, 018; B: 005, 009, 006; C: 017) plus the Suite unit profile adoption, 8 deferred (004, 012, 011, 015, 008, 019, 016, 020) | A, B, C on `feat/seis-u2` (PR open, 2026-10-01); engines PR #292 merged, vendored at 1e5d394 | `docs/upgrade/Seismolord-UPGRADE.md` |
| 6 | Mapping & Surface Studio (with Contour Map Digitizer) | done 2026-09-30: 12 checks, 35 findings, 20 fixed (2 S1, 7 S2, 7 S3, 4 S4; no S1/S2 open), 5 carried to consumer apps | analysed 2026-09-30: 20 items; batch decision 2026-09-30: 13 built (A: 007, 001, 004, 002, 005, 003, 006 + U1-028; B: 009, 012, 013, 008 with the layer cake as a hook; C: 017), MAP-U1-025 deferred (not S), 8 deferred by the decision (011, 014, 010, 015, 016, 019, 020, 018 owner) | A, B, C on `feat/map-u2` (PR open, 2026-09-30); engines PR #289 merged, vendored at bf8376b | `docs/upgrade/MappingSurfaceStudio-UPGRADE.md` |
| 7 | Earth Modeling | done 2026-09-30: 12 checks, 26 findings, 18 fixed (1 S1, 9 S2, 5 S3, 3 S4), 015 partly fixed (PL10, 9x; worker in U2-004), 1 carried to RCP; cross-app MAP-U1-031 (Well Design) and MAP-U1-032 (Simulation) fixed; `em_models` in `.pld` | analysed 2026-09-30: 18 items, batches A/B/C for the programme lead | | `docs/upgrade/EarthModeling-UPGRADE.md` |
| 8 | ReservoirCalc Pro | done 2026-10-01: 12 checks, 39 findings, 31 fixed (4 S1, 11 S2, 14 S3, 2 S4; no S1/S2 open), EM U2-009 contract carried; `rcp_prospects` in `.pld` | analysed 2026-10-01: 17 items; batch decision 2026-10-01: 11 built (A: 006, 005, 001, 008, 002; B: 007, 009, 011, 012, 013; C: 017), U2-004 skipped (Earth Modeling U2 not on main), U2-015 kept (Seismolord still writes the legacy exports), 4 deferred by the decision (003, 010, 014, 016) | A, B, C on `feat/rcp-u2` (PR open, 2026-10-01) | `docs/upgrade/ReservoirCalcPro-UPGRADE.md` |
| 9 | Pore Pressure Studio | not started | not started | | |
| 10 | Rock Physics Studio | not started | not started | | |
| 11 | Basin & Charge Modeling | not started | not started | | |
| 12 | Wellsite Studio | not started | not started | | |
