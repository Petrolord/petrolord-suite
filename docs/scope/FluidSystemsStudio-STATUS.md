# Fluid Systems & Flow Behavior Studio — STATUS

Last updated: 2026-07-19 (FS8 — EOS program COMPLETE)

## What this app is

Client-side PVT and flow-behavior studio (`src/pages/apps/FluidSystemsStudio.jsx`),
Reservoir module, tile Active. Engine `src/utils/fluidStudioCalculations.js`
orchestrates the audited black-oil primitives in `src/pages/apps/pvtCalculations.js`.
Everything is pure, synchronous, in-browser — no edge function.

## Shipped (pre-program, "Phase 1"+)

- Stream A black-oil PVT: Standing / Vasquez-Beggs / Glaso Rs & Bo; Beggs-Robinson /
  Beal-Cook-Spillman viscosity; bubble-point solve; gas Z (Papay + Sutton); Lee-Gonzalez-Eakin
  gas FVF/viscosity; oil compressibility; undersaturated viscosity rise.
- Black-oil separator train (staged-liberation GOR partition, honest caveats in
  `SeparatorResultsCard.jsx`).
- Stream B blending with asphaltene-compatibility screening; flow-assurance screening
  (Motiee 1991 hydrate curve, WAT resolution); batch sweeps; project persistence;
  Pipeline Sizer handoff (`backbone` payload); MB Studio PVT prefill consumer
  (`src/pages/apps/reservoir-balance/lib/fluidStudioPvtPrefill.js`).
- Suspect correlations gated with warnings (Glaso rearrangement, Beal-Cook-Spillman).

Note: the engine header previously claimed blending/flow-assurance/batch/persistence
were deferred; that was stale and fixed in FS1.

## Compositional / EOS program (FS1–FS8) — plan of record

Adds a validated Peng-Robinson (1978) compositional engine, opt-in beside the
black-oil default. Client-side JS under `src/utils/fluidstudio/eos/`; envelope
tracing in a web worker. Validation-first per repo doctrine: Python oracle goldens
(`tools/validation/fluidstudio/`, welltest-harness clone) + literature fixtures.

| Phase | Scope | Status |
|---|---|---|
| FS1 | STATUS doc, stale-header fix, component library + BIP defaults, exact-table + structural gates | DONE 2026-07-19 |
| FS2 | PR78 core (mixing rules, cubic, lowest-Gibbs root, fugacity, Peneloux), validation harness scaffold; NIST vapor-pressure + oracle gates | DONE 2026-07-19 |
| FS3 | Stability test + SS/GDEM two-phase PT flash + negative-flash RR; Whitson/Ahmed worked-example gates, K-value gate, oracle flash grid | DONE 2026-07-19; CASE 12 ARMED 2026-07-19 (Whitson Monograph 20 Problem 18 converged PR flash — beta 4e-4, K ≤0.8% vs printed) |
| FS4 | C7+ single-pseudo characterization (Kesler-Lee/Edmister/Chueh-Prausnitz BIP), Psat solve, PT envelope tracer, LBC viscosity + Weinaug-Katz IFT; Coats & Smart SPE 11197 gate | DONE 2026-07-19; CASE 17 ARMED 2026-07-19 (8 SPE 11197 fluids from the paper scan, measured Psat mostly within 10%, two documented outliers regression-pinned; the planned "Whitson BIP" shipped as modified Chueh-Prausnitz — the SG-form could not be source-verified, C-P is what whitsonPVT itself uses for C1-C7+) |
| FS5 | UI: fluid-model selector, composition tab, flash/envelope cards, worker, tier badges; black-oil default snapshot pin | DONE 2026-07-19 |
| FS6 | Compositional separator train (closes the per-stage EOS seam and the multistage-Bo hand-wave in EOS mode); Good Oil / Whitson separator gates | DONE 2026-07-19; CASE 19 ARMED 2026-07-19 (Good Oil Well No. 4 Core Labs report, all four separator tests — GOR ≤2.4%, Bofb ≤1.4% at engine Psat, API bias documented + pinned) |
| FS7 | CCE + DL simulation, EOS black-oil table export, MB prefill + Pipeline Sizer EOS branches | DONE 2026-07-19 (MB bridge shipped as CSV export in the exact PvtRock lab-table schema — MB has no CSV import UI, rows are typed/prefilled, so an MB-side importer is a possible follow-on; Pipeline Sizer branch = EOS backbone override in compositional mode) |
| FS8 | Hardening (near-critical fallback, memoization, worker cancellation), perf smoke, tierMatrix + help guide finalize | DONE 2026-07-19 — program complete |

### Binding program decisions

PR78 only (SRK deferred); single-pseudo C7+ (gamma/Pedersen splitting out); SS+GDEM
flash (full Newton deferred); CCE+DL only (CVD deferred); AOP stays N/A (no asphaltene
model); WAT stays measured/wax-content screening; EOS tuning to lab data is the
natural Phase 3 follow-on, out of this program; black-oil remains the default and is
regression-pinned.

## Out-of-scope register

SRK EOS; three-phase (aqueous) flash; full Newton flash; gamma/Pedersen plus-fraction
splitting; CVD; EOS regression/tuning; asphaltene thermodynamics; wax thermodynamic
model; compositional batch sweeps; compositional gradient with depth; any server/edge
function.

## Separate debt (not this program)

- Studio shell adoption: the page still uses its own 100-line header instead of
  `src/components/studio/`. Orthogonal churn; queue with the VRR/RF kit adoptions.
- Static "PVT QuickLook" marketing card in `src/pages/dashboard/ProductionOptimization.jsx`
  references the deleted app by name only (no route); cosmetic.

## Validation assets

- `src/utils/fluidstudio/eos/__tests__/componentReference.json` — source-cited constants
  table (Whitson & Brulé Monograph 20 App. A; Jhaveri & Youngren SPE 13118 shifts;
  Monograph Table 4-2 BIPs; NIST cross-check bands). FS1 gate pins the library to it.
- `tools/validation/fluidstudio/` (FS2) — independent Python oracle
  (bisection cubic, residual-Helmholtz quadrature for ln phi, Maxwell
  equal-area Psat), genfixtures.py → committed goldens, run-validation.mjs
  labeled-CASE runner (28 gates). Observed engine-vs-oracle agreement
  ~1e-13; NIST vapor-pressure bands documented in
  `src/utils/fluidstudio/eos/__tests__/nistVaporPressure.json`.
- `src/utils/fluidstudio/eos/pr78.js` (FS2) — PR78 core: both kappa
  branches, vdW mixing with FS1 BIPs, Cardano+Newton cubic, lowest-Gibbs
  root selection (min/max override for FS3), closed-form fugacity,
  Peneloux translation applied to volumes/densities only, pure-component
  Psat by fugacity-equality successive substitution. Jest gates in
  `__tests__/pr78.test.js` (105 tests) mirror the harness.
- `src/utils/fluidstudio/eos/flash.js` (FS3) — Michelsen two-sided
  stability + SS/GDEM two-phase PT flash + negative-flash Rachford-Rice
  (safeguarded Newton). Oracle counterpart is deliberately different:
  plain SS (no GDEM), bisection-only RR; agreement on the shared fixed
  point ~1e-10, every two-phase golden sealed by quadrature fugacity
  equality (~5e-12). K-value gates anchored to NIST-gated Psat: plain
  Raoult for heavy components, Lewis-rule phiSat for volatile ones.
  Harness CASES 8–12 + `__tests__/flash.test.js` (52 tests). CASE 12
  ARMED 2026-07-19: Whitson & Brulé Monograph 20 App. B Problem 18
  (converged PR flash, printed component properties, kij = 0) — beta
  within 4e-4, K within 0.8% of the printed solution (see
  tools/validation/fluidstudio/README.md for provenance).
- `src/utils/fluidstudio/eos/characterization.js` (FS4) — C7+
  single-pseudo characterization: Søreide Tb, Kesler-Lee Tc/Pc,
  Lee-Kesler ω (Watson-K branch above Tbr 0.8; Edmister exported),
  Jhaveri-Youngren shift, LBC C7+ Vc, Firoozabadi parachor, modified
  Chueh-Prausnitz C1–C7+ BIP (non-HC pairs reuse the FS1 table's nC6
  column). All coefficients web-verified against published reproductions
  at build time (SPE 109892; whitsonPVT manual; pychemqt; IntechOpen
  Table 3 for C-P). Gates: oracle double-transcription (~1e-15), pure
  n-alkane recovery on NIST NBP + committed GPSA SG (bands in
  `__tests__/characterizationReference.json`).
- `src/utils/fluidstudio/eos/envelope.js` (FS4) — phaseBoundaries /
  saturationPressure / tracePhaseEnvelope by log-scan + bisection on
  the FS3 stability flag; boundary kind classified by near-boundary
  flash beta. Known limits documented in-file: needs ≥2 components,
  truncates near-critical, can miss windows narrower than the scan
  grid. Engine and oracle agreed exactly on every boundary probe
  (harness CASE 15); Raoult bubble-point identity on C3/nC4 anchored
  to the NIST-gated purePsat.
- `src/utils/fluidstudio/eos/transport.js` (FS4) — LBC viscosity
  (SPE 109892 field-unit statement, ξ = 5.35 form) + Weinaug-Katz IFT.
  Gates: oracle transcription (~1e-10), NIST methane/nitrogen dilute
  viscosity anchors (±10%), identity gates. LBC ships untuned
  (order-10% gas, order-2x oil accuracy expected; Vc tuning is the
  lab-data follow-on).
- FS4 goldens additions: characterization grid (13 pts), characterized
  oil + condensate flash/envelope/transport states, all flash states
  quadrature-sealed. Harness now 80 gates + jest 246 EOS tests.
- CASE 17 (Coats & Smart SPE 11197) ARMED 2026-07-19 with 8 Table 1
  fluids read from the paper scan on Whitson's NTNU course site:
  measured Psat vs untuned engine within 0.08–8% for six fluids (10%
  gate); Oil 1 (+10.3%) and Gas 5 dew (−15.8%) regression-pinned just
  above their observed untuned errors (documented in the harness
  README).
- `src/utils/fluidstudio/eos/separator.js` (FS6) — compositional
  separator train: sequential stability-gated flash of the wellstream
  through the user stages (stock tank 14.696 psia / 60 °F always
  appended), vapor drawn per stage, liquid fed forward on a 1 lb-mol
  basis. Reports per-stage vapor split / gas gravity / GOR (ideal-gas
  sc molar volume R·Tsc/Psc, GPSA air MW 28.9647, water 62.3664 lb/ft³
  for API), stock-tank oil density/API/MW, GOR partition, and a
  thermodynamic multistage Bo vs a single-flash Bo — reported only when
  the feed is single-phase at reservoir conditions (two-phase state
  withholds Bo with a warning; the wellstream Bo is undefined there).
  Single-phase stage outcomes classified by the pr78 v/b < 1.75
  heuristic. Oracle counterpart `oracle.separator_train` (plain-SS
  flashes, bisection RR); goldens cover char-oil two- and three-stage
  trains, the condensate one-stage train, the two-phase-reservoir
  degradation and the lean-gas no-stock-tank-liquid edge. Harness
  CASE 18 (engine vs oracle ~1e-13 + material-balance / GOR-telescoping
  / explicit-stock-tank identities); harness now 153 gates, jest 271
  EOS tests.
- CASE 19 (Good Oil Co. Well No. 4 separator tests) ARMED 2026-07-19
  from the original Core Labs report scan (TAMU Blasingame archive)
  cross-verified against Whitson & Brulé Ch. 6 and wiki.whitson.com:
  all four two-stage tests — total GOR within 0.05–2.4%, multistage
  Bofb within 0.3–1.4% (compared at the engine's Psat, +5.9% above lab
  Pb), STO API regression-pinned with its documented ~9-API untuned
  volume-shift bias (harness README has the full record).
- `src/utils/fluidstudio/eos/experiments.js` (FS7) — CCE (relative
  volume V/Vsat + liquid dropout on a committed grid), differential
  liberation (stagewise vapor removal at reservoir T, 60 °F/14.696 psia
  cooldown defines the residual oil normalizing Bod/Rsd; per-stage gas
  Z/gravity/Bg in the black-oil rb/scf convention), and the composite
  black-oil table via the standard Amyx/McCain separator adjustment
  (Bo = Bod·Bofb/Bodb, Rs = Rsfb − (Rsdb − Rsd)·Bofb/Bodb, exact at Pb,
  approximate toward atmospheric; undersaturated branch exact from the
  EOS molar-volume ratio; LBC viscosities per row). Saturation pressure
  is an input (one envelope scan serves everything; callers own it).
  Oracle counterparts cce_expansion / diff_lib / black_oil_table;
  goldens: char-oil CCE+DL+table at 200 °F, char-condensate retrograde
  CCE at 150 °F, grids committed from the oracle's own Psat. Harness
  CASES 20–21 (agreement ~1e-11; identities: mole balance, Rsd
  telescoping to the cooldown gas, Bo(Pb)=Bofb, Rs(Pb)=Rsfb,
  monotonicity, single-phase above Psat). Harness 203 gates, jest 283
  EOS tests.

## FS5 UI wiring (2026-07-19)

- Fluid-model selector in the input panel (`black-oil` default | `eos`);
  the compositional path runs BESIDE black-oil — separators/blending/
  flow-assurance stay on the black-oil stream. Selecting EOS adds the
  Composition input tab and the Compositional results tab.
- `src/utils/fluidstudio/eosAnalysis.js` — UI seam: mol% parsing/
  normalization/validation (`parseComposition`), sync flash orchestrator
  (`runEosFlash`: flashPT + LBC + Weinaug-Katz + component table +
  characterization block), worker payload builder (`envelopeRequest`).
- Envelope worker: `eos/envelope.worker.js` (module worker, Vite idiom)
  + `envelopeClient.js` (supersede-by-id, sync fallback when workers are
  unavailable). `envelopeWorkerFactory.js` is the only file with
  import.meta; jest maps it to a null factory (see jest.config.js
  moduleNameMapper) because babel-jest cannot parse import.meta.
- Components: `CompositionInput` (11 library components + C7+ in mol%,
  normalize button, C7+ MW/SG/optional Tb, flash conditions, envelope
  window), `CompositionalResultsCard` (phase split, per-phase props,
  x/y/K table, characterization line), `PhaseEnvelopeCard` (worker
  trace, bubble/dew branches + flash point + saturation point on the
  shared white ChartFrame), `FluidStudioTierBadge` (oracle_gated /
  published_method / screening; tierMatrix doc finalizes in FS8).
- Sample composition = the "char-oil" goldens fluid (2% CO2, 40% C1, 7%
  C2, 6% C3, 5% nC4, 6% nC6, 34% C7+ MW 190 SG 0.84 at 2500 psia/200°F)
  so the switch shows pre-validated numbers.
- Black-oil pin: `src/utils/__tests__/blackOilSnapshot.{json,test.js}`
  locks the default sample analysis (KPIs, table rows, separator
  totals, backbone, warnings) at 1e-9; regenerate only for deliberate
  black-oil changes, in the same PR.
- Help guide gained a Compositional section (full pass in FS8).

## FS6 UI wiring (2026-07-19)

- `eosAnalysis.runEosSeparator(composition, stages)` — reuses the SAME
  Separator Train stage inputs as the black-oil card (pressure psia,
  temperature °F, enabled flag); the Composition tab's flash conditions
  double as the reservoir state for the Bo block. Returns display-ready
  rounded rows/totals/Bo plus engine warnings.
- `CompositionalSeparatorCard` renders in the Compositional results tab
  under the flash card: stage table (P/T/vapor mol%/gas SG/GOR), surface
  totals, stock-tank oil tiles, Bo tile with the single-flash comparison
  line, oracle_gated badge. The black-oil Separator Train tab and its
  staged-liberation card are untouched (snapshot pin stays green).
- Known pre-existing lint gap (not FS6): `Compositional.render.test.jsx`
  reports jest-global no-undef errors at HEAD too (.test.jsx files are
  outside the eslint jest-globals override); all FS6 .js files lint
  clean.

## FS7 UI wiring (2026-07-19)

- `eosAnalysis.runEosPvtTable(composition, stages)` — one saturation
  scan at the flash temperature + eosBlackOilTable on the Separator
  Train inputs. The full pipeline is a few dozen flashes (~tens of ms)
  so it recomputes synchronously in the page useMemo like runEosFlash;
  no worker change was needed (the worker remains envelope-only).
  Degradations: no saturation point in the window, or no stock-tank
  liquid → table null with the warning shown on the card.
- `EosPvtTableCard` in the Compositional tab: Pb/Rsfb/Bofb/Bodb·Rsdb/
  STO-API tiles, the composite table with the Pb row highlighted, and
  "Export CSV (MB schema)" — `eosPvtTableCsv` emits exactly the
  PvtRock lab-table columns (pressure_psia, bo_rb_stb, rs_scf_stb,
  oil_viscosity_cp, z_factor, bg_rb_mscf, gas_viscosity_cp), ascending
  pressure, Bg converted to rb/Mscf. Badges: oracle_gated +
  published_method (Amyx composite) + LBC screening note.
- Pipeline Sizer EOS branch: in compositional mode the Integration
  Suite backbone is overridden by the EOS one (source: 'eos';
  oil_gravity = STO API, gas_gravity = surface gas SG, gor = Rsfb,
  pb/bo_at_pb/mu_o_at_pb from the table, pvt_table = the composite
  rows). Black-oil mode and the black-oil backbone are untouched
  (snapshot pin green).

## FS8 hardening (2026-07-19) — program close-out

- Near-critical fallback: boundary classification in envelope.js now
  probes an inset ladder (1/3/6%) via the exported `classifyBoundary`
  before conceding 'indeterminate'; `saturationPressure` falls back to
  the v/b < 1.75 liquid-likeness heuristic (`classifyByLiquidLikeness`)
  and reports `kindSource: 'flash-probe' | 'density-heuristic'`. Golden
  classifications unchanged (no golden was indeterminate); physics
  limits (trace truncation at the critical point, scan-width window
  detection) stand and are documented in-file and in Help.
- Worker cancellation: envelopeClient terminates the in-flight worker on
  supersede/cancel/dispose and respawns lazily, so an abandoned trace
  stops burning CPU immediately. `createEnvelopeClient({ workerFactory })`
  accepts a test factory; 5 fake-worker tests cover supersede, cancel,
  dispose, stale-id drop and crash-respawn.
- Memoization: the page splits the EOS pipeline into narrow-dep useMemos
  (composition, separator stages), so black-oil-side edits no longer
  re-run the flash/separator/saturation/DL pipeline. Input components
  already preserve object identity for untouched sections.
- Perf smoke: harness CASE 22 wall-clock budgets (observed on the dev
  box: flash ×10 ≈ 1 ms, separator ≈ 0.3 ms, saturation + table ≈ 4 ms,
  15-point envelope ≈ 45 ms; budgets set an order of magnitude above).
- tierMatrix: docs/scope/FluidStudio-TierMatrix.md maps every displayed
  quantity to its tier and backing gate; badges must stay in step.
- Help guide full pass: compositional maturity reflected in overview /
  separator / handoff / limits sections, and all user-facing prose
  em dashes removed across the Fluid Studio UI per the owner copy rule
  (table placeholder glyphs retained).
- Final counts: harness 207 gates, jest 288 EOS tests, full suite 136
  suites / 1878 passing, build green.

## Program summary (FS1–FS8, all DONE 2026-07-19)

Stacked PRs #126 → #133 (merge in order, retarget bases via gh api
PATCH as each lands). The out-of-scope register above is the follow-on
menu; the natural next initiative is EOS tuning to lab data. The three
literature gates (CASES 12 / 17 / 19) were ARMED and closed 2026-07-19
from fetched copies of the printed sources (the owner had no pages);
provenance and observed errors are recorded in
tools/validation/fluidstudio/README.md and literature-fixtures.json.
The documented untuned-EOS biases they pin (heavy-oil/dew Psat, STO
API from the generalized volume shift) are the EOS-tuning initiative's
first targets.
