# Fluid Systems & Flow Behavior Studio — STATUS

Last updated: 2026-07-19 (FS5)

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
| FS3 | Stability test + SS/GDEM two-phase PT flash + negative-flash RR; Whitson/Ahmed worked-example gates, K-value gate, oracle flash grid | DONE 2026-07-19 (Whitson/Ahmed worked-example fixtures scaffolded UNARMED — CASE 12 gates once book-typed data is committed; owner to supply pages) |
| FS4 | C7+ single-pseudo characterization (Kesler-Lee/Edmister/Chueh-Prausnitz BIP), Psat solve, PT envelope tracer, LBC viscosity + Weinaug-Katz IFT; Coats & Smart SPE 11197 gate | DONE 2026-07-19 (Coats & Smart CASE 17 scaffolded UNARMED pending owner paper pages; the planned "Whitson BIP" shipped as modified Chueh-Prausnitz — the SG-form could not be source-verified, C-P is what whitsonPVT itself uses for C1-C7+) |
| FS5 | UI: fluid-model selector, composition tab, flash/envelope cards, worker, tier badges; black-oil default snapshot pin | DONE 2026-07-19 |
| FS6 | Compositional separator train (closes the per-stage EOS seam and the multistage-Bo hand-wave in EOS mode); Good Oil / Whitson separator gates | pending |
| FS7 | CCE + DL simulation, EOS black-oil table export, MB prefill + Pipeline Sizer EOS branches | pending |
| FS8 | Hardening (near-critical fallback, memoization, worker cancellation), perf smoke, tierMatrix + help guide finalize | pending |

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
  (Whitson/Ahmed printed examples) scaffolded unarmed pending owner
  book pages.
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
- CASE 17 (Coats & Smart SPE 11197) scaffolded unarmed in
  `tools/validation/fluidstudio/literature-fixtures.json` — owner to
  supply the printed paper pages (compositions + measured Psat).

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
