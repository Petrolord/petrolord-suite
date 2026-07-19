# Fluid Systems & Flow Behavior Studio — STATUS

Last updated: 2026-07-19 (FS1)

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
| FS2 | PR78 core (mixing rules, cubic, lowest-Gibbs root, fugacity, Peneloux), validation harness scaffold; NIST vapor-pressure + oracle gates | pending |
| FS3 | Stability test + SS/GDEM two-phase PT flash + negative-flash RR; Whitson/Ahmed worked-example gates, K-value gate, oracle flash grid | pending |
| FS4 | C7+ single-pseudo characterization (Kesler-Lee/Edmister/Whitson BIP), Psat solve, PT envelope tracer, LBC viscosity + Weinaug-Katz IFT; Coats & Smart SPE 11197 gate | pending |
| FS5 | UI: fluid-model selector, composition tab, flash/envelope cards, worker, tier badges; black-oil default snapshot pin | pending |
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
- `tools/validation/fluidstudio/` — arrives in FS2 (oracle.py, genfixtures.py,
  run-validation.mjs, committed goldens).
