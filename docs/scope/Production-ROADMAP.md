# Petrolord Production Operations Module — Roadmap

Status: **APPROVED — owner sign-off 2026-08-27** (decisions in §6)
Scope: the entire Production Operations module
This file is the plan of record. Per-app plans are written per phase
against this roadmap. Proposal artifact: "Production Operations
Rebuild" (2026-08-27 deep dive, three parallel audits).

Deploy note (owner decision 2026-08-27): **no production upload until
this program completes.** Everything ships in one recut zip at P12,
which also carries the drilling/completions launch and the DCA Monte
Carlo fixes already on main. Tile activation migrations are HELD for
that upload per the standing convention; hygiene/archive/RLS migrations
apply immediately.

---

## 1. The honest baseline

A production engineer's daily loop is: **surveil rates and downtime →
allocate production back to wells → diagnose underperformance (nodal) →
design/optimize artificial lift → keep the well unloaded (gas wells) →
keep flow assured (hydrates, wax, scale, corrosion) → solve the
gathering network → plan interventions.** The standard commercial
toolkit is PROSPER/GAP (or PIPESIM), OFM, an allocation system, and the
lift-vendor design tools (SubPUMP, SROD, gas-lift design).

Petrolord currently covers this loop with **39 catalog rows** (7
Active, 31 Coming Soon, 1 Archived) of which exactly **one flies**.

Audited state of every built app (2026-08-27, three sweeps — routes,
engines, persistence, mock density):

| App | State | Verdict |
|---|---|---|
| Nodal Analysis Studio (`nodal-analysis-engine`) | Real engine in `src/utils/nodal/`: oil+gas IPR families, 5 VLP correlations, traverse, Cullender-Smith, system solve, gas-lift response, chokes. 1,027 gates, 11 armed literature fixtures, PROD LIVE | **KEEP — anchor** |
| Artificial Lift Designer | Lift screening matrix is honest and well written. Design tabs are not: ESP TDH omits net lift (`espCalculations.js:91`, staging ~10x wrong); gas-lift gradient is an invented fudge; "Mills method" rod code is neither Mills nor API RP 11L and parses rod diameter "7/8" as 7.8 in. Imports nothing from the nodal engine | **UPGRADE** (P9 Advisor keeps screening; broken design tabs replaced by P4–P6 studios) |
| Wellbore Flow Simulator | "High-fidelity transient simulation" = 2.5 s fake delay around a `Math.random()` pressure walk; tubing ID, GOR, water cut collected and never read; different answers every run | **RETIRE at P0** (route → Nodal; mock engine deleted) |
| Flow Assurance Monitor | Hydrate curve is `18·ln(P)−100` (no composition/salinity/inhibitor); pressure drop constant 0.02 psi/ft at any rate or diameter; method dropdowns unbound decoration | **REBUILD** (P10, on the Fluid Studio EOS) |
| Production Surveillance Dashboard | Uploads two CSVs then discards both; renders `Math.random()` rates for 7 hardcoded wells; status re-randomizes per render; SCADA/exports/audit-trail = toast stubs; allocation tab sums random numbers | **REBUILD** (P2, on the P1 data spine) |
| Network Diagram Pro | Genuinely usable drag-and-drop editor (10 node types) but Solve = toast, Save/Import/Export no onClick, zero persistence; listed at $199, ungated | **ABSORB** (P11; standalone listing removed at P0) |
| Production Uptime Tracker | Unrouted, unreachable, stale copy-paste of the surveillance dashboard (its h1 still says "Production Surveillance Dashboard") | **DELETE at P0** |
| Production Anomaly Detector | Page is `return null`; all three components are byte-identical 6-line null stubs; catalog still advertises it | **DELETE at P0** |
| Facility Network Hydraulics (Facilities module) | 1,024 LOC of real engineering (Beggs & Brill with flow-pattern map, Swamee-Jain, Colebrook-White, Barlow/ASME B31, real pipe schedule + K-value data) — unreachable because `App.jsx` routes its slug to FacilityLayoutMapper; its Deliverables tab exports canned fiction (hardcoded 12.75" line etc.) | **SALVAGE at P0** (route fixed, fiction removed); segment math feeds P11 |

Cross-cutting defects:

- **Schema not in code.** `artificial_lift_designs`,
  `wellbore_flow_projects`, `flow_assurance_projects`,
  `production_surveillance_projects` exist only in the live DB.
  Verified live 2026-08-27: each has one owner policy
  (`auth.uid() = user_id`), but **`wellbore_flow_projects` has RLS
  DISABLED** — the policy is not enforced and any authenticated user
  can read/write all rows (3 rows live). The other three have RLS
  enabled but no repo DDL. Fixed at P0.
- **No production data spine.** No `prod_*`/`po_*` tables anywhere;
  production history enters the suite only as per-project CSV payloads.
- **Chart standard: 0 of 5** audited apps on the white chartTheme +
  ChartLogo standard; two are on Chart.js entirely.
- **Entitlement gating: 1 of 5** routed production apps wrapped in
  `ProtectedAppRoute` (only the surveillance dashboard).
- **Zero tests** on every production util except the nodal engine.

## 2. What we build on (reuse, never rebuild)

| Asset | Where | Feeds |
|---|---|---|
| Nodal engine | `src/utils/nodal/` (validated, literature-anchored) | Gas lift, ESP intake, choke, liquid loading, network, advisor |
| Fluid PVT + EOS | `fluidStudioCalculations.js` + `fluidstudio/eos/` (PR78 flash, envelopes, hydrate curve) | Flow assurance, all lift design |
| Well test engine | `src/utils/welltest/` | Allocation test validation, intervention diagnostics |
| DCA engine | `packages/engines/engines/dca/` | Surveillance overlays, forecasting redirect |
| VRR CSV importer | `src/utils/vrr/csvImport.js` (per-well ledger schema) | Template for the P1 data-spine intake |
| Segment hydraulics | `src/components/facilitynetworkhydraulics/` (Beggs & Brill et al.) | Production Network solver (P11) |
| Network editor UI | `src/components/networkdiagram/` (drag-and-drop canvas) | Production Network front end (P11) |
| Studio kit + persistence | `src/components/studio/` + `saved_*_projects` convention | Every app shell |
| Wells registry | `src/lib/wellsRegistry.js` (geo_wells + curves) | Canonical well identity across the module |
| Launch playbook | `docs/scope/Drilling-ROADMAP.md` | The whole program |

## 3. The locked 12-app portfolio

| # | App | Industry counterpart | Scope and engine basis |
|---|---|---|---|
| 1 | Nodal Analysis Studio | PROSPER | Live and validated. Absorbs Wellbore Flow Simulator (traverse viewer is a Nodal panel). |
| 2 | Production Surveillance Studio | OFM | Full rebuild on the P1 spine: well/field hierarchy, rate–watercut–GOR trends, exception surveillance, downtime/deferment capture with cause taxonomy, DCA overlays. Absorbs Uptime Tracker, Anomaly Detector, Daily Production Report, Field Ops Log, Downtime Analysis tiles. |
| 3 | Production Allocation Studio | Avocet-class | Back-allocation from separator/field totals by well-test factors, test validation against Nodal theoretical rates, data QC. Absorbs Allocation, Virtual Metering, Multiphase Flow Meter, Production Data QC tiles. |
| 4 | Gas Lift Design Studio | PROSPER GL / API Gas Lift Manual | Valve spacing, unloading sequence, injection-depth optimization, performance curves. Extends `nodal/gasLift.js` ("NA4+"). Literature: Takacs Gas Lift Manual, Guo. |
| 5 | ESP Design Studio | SubPUMP | Correct TDH from IPR intake pressure via Nodal, staging against real pump curves, affinity/VSD, motor/cable sizing, gas separation check. Absorbs ESP Performance Monitor tile as diagnostics tab. |
| 6 | Rod Pump Studio | SROD / QRod | API RP 11L design, unit geometry, gearbox/structural checks, diagnostic dyno cards. Literature: API RP 11L, Takacs Sucker-Rod Pumping. |
| 7 | Gas Well Performance | Turner/Coleman + plunger tools | Liquid-loading critical rate (Turner 1969, Coleman 1991), plunger lift screening and cycle design, deliverability over gas IPR + Cullender-Smith. Absorbs Liquid Loading Monitor, Plunger Lift Controller tiles. |
| 8 | Choke & Wellhead Performance | Gilbert-family tools | Choke sizing/rating and operating envelopes over validated `nodal/chokes.js`; fastest build. Absorbs Choke Sizing Calculator, Operating Envelope tiles. |
| 9 | Artificial Lift Advisor | Lift-selection screening | Keep and extend the honest screening matrix (ESP, gas lift, rod, PCP, jet, plunger), IPR-aware, cross-linked to #4–#7. The broken design tabs move out. |
| 10 | Flow Assurance Studio | PIPESIM FA / Multiflash-lite | Rebuild on the Fluid Studio EOS: real hydrate envelopes + inhibitor dosing (Hammerschmidt), WAT, scale screening, de Waard–Milliams / NORSOK corrosion, API RP 14E erosional velocity. Absorbs Corrosion Monitoring, Scale Management, Chemical Injection tiles. |
| 11 | Production Network Studio | GAP / PIPESIM network | Network Diagram Pro's editor + salvaged Beggs & Brill segment hydraulics + Nodal VLP/chokes, solved as a real gathering network with topology validation and persistence. |
| 12 | Well Intervention Planner | Chan diagnostics + screening | Stimulation and water/gas shutoff candidate screening (Chan plots, SPE 30775), workover planning with EPE economics hooks. Absorbs Stimulation Candidate, Water/Gas Shutoff, Workover Planner, Rigless Intervention tiles. |

Tile dispositions outside the twelve:

- Production Forecasting → **redirect to DCA Studio** (route added at P0).
- Well Schematic Designer → keeps its existing redirect to Completion
  Design Studio (drilling).
- Jet Pump Selector, PCP Design → screening in the Advisor; full design
  apps deferred; tiles archived honestly.
- Sand Face Predictor → covered by Perforation & Sand Control
  (drilling); archived.
- Pigging Scheduler → Facilities' scope; archived here.
- Smart Field Connector → archived; SCADA integration is not honest
  scope for this program.
- Well Integrity Guardian → covered by Well Integrity & P&A (drilling);
  archived.

## 4. Architecture principles (inherited from the Drilling launch)

- **Data spine first (P1):** org-scoped, RLS-enabled `po_*` tables
  created by migrations — daily production ledger (VRR importer schema
  as the model), well tests, deferment events, allocation factors.
  Wells identified through `wellsRegistry`, never free-text names.
- **Validation-first engines:** every new engine lands in
  `packages/engines/engines/production/` via engine PRs to
  Petrolord/petrolord-engines, with a Python oracle, committed goldens,
  and a `tools/validation/production-validation.ts` runner. Literature
  gates ship ARMED where the source is a copyrighted PDF (Takacs, API
  RP 11L, Turner, Chan), exactly like the drilling L-gates.
- **One shell, one chart language:** studio kit (StudioLayout +
  StudioProjectManager + StudioAutoSave, the Nodal pattern); white
  chartTheme + 40px ChartLogo everywhere; per-app help guide; no em
  dashes in user-facing copy.
- **Honest catalog:** the P0 migration archives every shell tile; app
  tiles activate only via idempotent seed migrations HELD for the P12
  launch upload.
- **Every route gated:** `ProtectedAppRoute` on all twelve.

## 5. Phasing

| Phase | Delivers | Notes |
|---|---|---|
| **P0** | Hygiene + honest catalog | Delete dead trees (uptime tracker, anomaly detector); retire Wellbore Flow Simulator into Nodal; fix the Facility Network Hydraulics route hijack and remove its fictional Deliverables tab; gate all production routes; repo DDL + RLS enforcement for the four orphan tables (incl. the `wellbore_flow_projects` RLS-disabled hole); Network Diagram Pro delisted from `pricingModels.js`; catalog archive migration; chart sweep on kept apps. |
| **P1** | Production data spine | `po_*` tables + CSV importer (VRR pattern) + wellsRegistry linkage. Everything downstream reads this. |
| **P2–P3** | Surveillance Studio, Allocation Studio | The data-facing pair; makes the module immediately useful to operators. |
| **P4–P7** | Gas Lift, ESP, Rod Pump, Gas Well Performance | The artificial-lift block on the nodal + PVT engines. New engines: valve mechanics, pump curves, RP 11L, Turner/Coleman. **P4 SHIPPED 2026-08-28** (engines PR #62 opened the package's `production` domain; Suite `feat/production-p4`, 84 gates, `tools/validation/production-validation.ts` PA1-PA8 active + PL1-PL4 armed). **P5 SHIPPED 2026-08-28** (engines PR #63 added ESP stage curves, gas handling, TDH and the electrical side; Suite `feat/production-p5`, 93 gates, PA9-PA14 active + PL5-PL8 armed; absorbs the ESP Performance Monitor tile as the Diagnostics tab). **P6 SHIPPED 2026-08-28** (engines PR #64 added rod string mechanics, the damped wave equation in both directions, four-bar unit kinematics and the design chain; Suite `feat/production-p6`, 95 gates, PA15-PA20 active + PL9-PL12 armed). **P9 SHIPPED 2026-08-28** (no engine PR — the first phase with none, correctly, because it adds no new physics: the screening matrix is operating guidance and the design pass reuses the four validated chains P4-P7 built. Suite `feat/production-p9`: six methods screened, four DESIGNED against one shared well record, disagreements between the two named; the tile is RENAMED rather than reseeded because its slug carries live entitlements; 44 gates, PA25 active + PL20-PL22 armed). **P8 SHIPPED 2026-08-28** (engines PR #67 added the wellhead limits — RP 14E erosional velocity with C as an input, Gilbert-family coefficient fitting, Hammerschmidt hydrate screening; the choke correlations themselves stayed in the already-validated nodal layer rather than being rebuilt. Suite `feat/production-p8`: the bean as a constraint INSIDE the nodal solve, the operating envelope, the critical-flow limit found rather than assumed, both phases; 44 gates, PA24 active + PL17-PL19 armed). **P7 SHIPPED 2026-08-28** (engines PR #66; Suite `feat/production-p7`, liquid loading with the Turner constant DERIVED from the droplet balance rather than quoted, the critical-rate profile whose controlling station is the shoe, the reservoir pressure at which a well will load, tubing screening and plunger lift; 55 gates, PA22-PA23 active + PL13-PL16 armed; the first studio built on the shared well record from the start). **P6.5 SHIPPED 2026-08-28** (unplanned, inserted before P7 on owner decision): the shared per-well model record `po_well_models`, one description of a well used by every production studio, which also closed the nodal cross-check of well tests deferred at P3. **Scope note on P6:** the plan said API RP 11L. RP 11L predicts from dimensionless CHARTS, and those charts are solutions of the damped wave equation. Reproducing plotted curves from memory is what this platform refuses, so the equation is solved directly instead; the RP 11L dimensionless GROUPS are reported because they are how the answer is read, and the published chart values are ARMED as PL9. |
| **P8–P9** | Choke & Wellhead, Artificial Lift Advisor | Small builds; UI over validated engines plus cross-links into P4–P7. |
| **P10** | Flow Assurance Studio | **SHIPPED 2026-08-28** (engines PR #68 added the flowline thermal-hydraulics and the hydrate inhibition relations; PR #70 fixed a silent-fallback defect in the material lookups that the Suite layer found on first use — an unknown insulation id returned the FIRST catalog entry, carbon steel, so a typo made a line look two thousand times better insulated than it is. Suite `feat/production-p10`: ONE CONTINUOUS TRACE from the perforations to the arrival — the validated nodal traverse up the wellbore, the choke as a Joule-Thomson step, then the flowline and riser marched with pressure and temperature COUPLED rather than overlaid, so every gradient is evaluated at the temperature the thermal model puts the line at. The hydrate question is asked at every station and the worst one is ranked by SUBCOOLING, not temperature. 43 + 16 gates, PA26 active + PL23-PL27 armed. **Scope note:** the plan said EOS-backed. Where the hydrate boundary IS stays with the Fluid Studio's screening and its caveats are carried through rather than dropped; this studio computes how far an inhibitor MOVES the boundary, which is a different question and is the one a flow assurance study actually asks. There is no wax correlation at all: a WAT is a measurement, and inventing one from an API gravity would be exactly the fiction the archived app was retired for. The replacement takes a FRESH SLUG; `flow-assurance-monitor` stays archived and redirects.) |
| **P11** | Production Network Studio | **SHIPPED 2026-08-28** (engines PR #71 added the gathering-network solver and line pipe geometry; PR #72 fixed a defect the Suite layer found — a shut-in well's dead node made the solver refuse the whole network instead of pinning it. Suite `feat/production-p11`. THE ONE THING NO OTHER STUDIO CAN SAY: every other studio in this module solves a well against a wellhead pressure somebody typed in, and in a network nobody types it in — the header pressure is whatever the trunk needs and the total is what the wells make at that header pressure, so the wells set the pressure that holds the wells back. The studio reports what each well makes in the network against what it would make ALONE through the same lines, solved on the same network with the others shut in so the difference is the other wells and nothing else. 33 + 29 + 22 gates, PA27 active + PL28-PL31 armed. **Scope notes:** the plan said salvage the Network Diagram Pro editor. Its canvas was kept in spirit but not in code: a gathering system is a DAG that lays itself out by depth from the delivery point, so hand-positioning nodes is busywork, and generating the drawing frees it to carry the answer — pressures, rates, the bottleneck — which a hand-arranged diagram never could. The FNH segment math was NOT salvaged either: it was a second, unvalidated single-phase implementation of physics the nodal layer already has validated, and its line sizer assumed a 0.25 inch wall for every size with a real schedule table sitting next to it. Its DATA (pipe schedules, K values, API 5L grades) went into the engine instead, with od, wall AND bore carried so the table catches its own transcription errors. Compressors and pumps are deliberately NOT modelled: a compressor in a network solve needs a real machine curve and inventing one would be worse than leaving it out.) |
| **P12** | Intervention Planner + launch pack | **SHIPPED 2026-08-28** (engines PR #73; Suite `feat/production-p12`). THE DIAGNOSIS DECIDES THE TREATMENT: water channelling and water coning look identical on a water-cut plot and need opposite treatments, so the screening is GATED by the diagnostic read from the well's own history. On a coning well the shutoff squeeze is ruled out with the reason — the cone re-forms above whatever is plugged — and reducing drawdown becomes the candidate instead. What survives is sized by solving the well BEFORE AND AFTER rather than by a multiplier, so the tubing takes back part of what the inflow gained and a shutoff's gain through the lighter column is found at all. Economics on the canonical `calculateEconomics`, imported per the module rule, with a decline that has to be stated. 34 + 27 + 19 gates, PA28 active + PL32-PL34 armed. **Scope notes:** Chan's published type curves are NOT transcribed; what is here reads the same two things Chan reads with every threshold a named input, and the type curves are armed. The oracle caught a real design error — for any power law the ratio and its derivative share a log-log slope, so the two cannot be separated by comparing them and an earlier classifier read ordinary displacement as a treatable water path. The Bourdet derivative is the well test module's, not a second one, and its one-sided endpoints are set aside because keeping them drags the recovered exponent from 1.56 to 1.32. The hub needed no code change: it is fully database-driven, so the tiles appear when the held migrations are applied. |

## 6. Locked decisions (owner sign-off 2026-08-27)

1. **Lineup:** the twelve in §3 as listed, tile dispositions included.
2. **Network ownership:** Production owns the gathering-network solver
   (app #11). Facilities keeps single-line sizing only; FNH's route and
   export fixed at P0.
3. **Wellbore Flow Simulator:** retired at P0. Route redirects to Nodal
   Analysis Studio; the mock engine is deleted.
4. **Network Diagram Pro:** the $199 standalone listing is removed at
   P0; the editor folds into Production Network Studio at P11.
5. **Shell:** studio kit (the Nodal/reservoir pattern), not the
   drilling WorkspaceShell.
6. **Deploy sequencing:** no production upload until P12; one recut zip
   at the end (also carries drilling/completions and the DCA MC fixes).
