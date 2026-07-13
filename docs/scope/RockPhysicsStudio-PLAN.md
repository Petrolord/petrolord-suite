# Rock Physics Studio — Phase G6 Plan

Status: **APPROVED — owner sign-off 2026-07-13** (all four open
questions answered interactively at drafting: (1) fluids = full
Batzle-Wang 1992 correlations; (2) Vs estimation = yes, Castagna
mudrock + Greenberg-Castagna, always provenance-flagged; (3) outputs =
in-app display + project save, no cross-app export surface in v1;
(4) data model = app-private `rp_projects` only, no publish-back).

Roadmap slot: Geoscience-ROADMAP.md **Phase G6 — Rock Physics / QI**
(advanced tier, first app after the core loop closed at G5). App name
**Rock Physics Studio** (functional naming, roadmap §6.2), slug
`rock-physics-studio` — a NEW tile seeded at close-out; the archived
`rock-physics-analyzer` vaporware row stays archived (catalog closed
2026-07-13, migration 20260713320000).

## What this is

The quantitative-interpretation working environment: pick a well from
the shared registry, build fluid scenarios (brine/oil/gas via
Batzle-Wang), run Gassmann fluid substitution on the log interval,
compute interface AVO (exact Zoeppritz + Aki-Richards/Shuey
intercept-gradient with class overlay), and model wedge synthetics /
tuning — so a geoscientist can answer "what would this reservoir look
like on seismic if the fluid were different?" without leaving the
suite.

Reads `geo_wells` / `geo_wells_logs` / `geo_wells_zones` / tops via
`src/lib/wellsRegistry.js` (sonic, density, shear-if-present, plus
G2-published VSH/PHIE/SW). Writes only `rp_projects`.

## Audit of existing rock-physics code (2026-07-13)

- `src/services/petro/rockPhysicsService.js` (39 loc): Wyllie + Gardner
  real but trivial; `fluidSubstitution` is literally commented "Fake
  physics for UI feedback". **Zero importers — dead file. DELETE at
  close-out.** Nothing to salvage; the G6.1 engine is written fresh
  against the oracle.
- `src/components/earthmodel/petro/RockPhysicsModels.jsx` (63 loc):
  static cards, no math, inside the earthmodel shell tree consumed by
  the archived EarthModelStudio/Pro routes. **NOT ours to delete** —
  that tree dies with its consumers at G8 (same rule as
  subsurface-studio, G0 correction).

## Locked decisions

1. **Fluids — Batzle-Wang 1992** (owner, 2026-07-13): brine
   (T, P, salinity), gas (T, P, gravity), live/dead oil (T, P, API,
   GOR, gas gravity) → density + velocity → K_fl. Mixed saturations
   via Reuss/Wood. Manual K_fl/rho_fl override stays available (the
   correlations pre-fill, the user can still type).
2. **Vs estimation — yes** (owner, 2026-07-13): measured DTS wins when
   present; otherwise Castagna mudrock line / Greenberg-Castagna
   lithology mix (VSH-weighted sand/shale in v1). Estimated Vs is
   ALWAYS badged as estimated (T(z)-provenance discipline from
   synthetics — sources never silently mixed).
3. **Outputs — display + project save only** (owner, 2026-07-13): AVO
   curves, I-G crossplots, wedge panels and tuning curves render
   in-app and persist as `rp_projects` state. No Seismolord export, no
   geo_* writes in v1; revisit when a concrete consumer exists.
4. **Data model — `rp_projects` only** (owner, 2026-07-13): owner-only
   RLS, `petro_projects` pattern. No new shared tables → no
   second-engineer review bar; no publish-back of substituted curves
   in v1.

## Engine scope (all oracle-validated before any UI)

`src/pages/apps/RockPhysicsStudio/engine/`:

- `fluids.js` — Batzle-Wang brine/gas/oil density + velocity, K from
  rho·v²; Wood/Reuss saturation mixing; unit discipline SI internally
  (velocities m/s, densities kg/m³, moduli Pa; display conversions at
  the UI edge only, lasImport precedent).
- `minerals.js` — Voigt-Reuss-Hill mixing for K_min from a small
  editable mineral table (quartz/calcite/dolomite/clay defaults).
- `gassmann.js` — forward (K_dry → K_sat), inverse (K_sat → K_dry),
  full substitution (sat A → dry → sat B); μ invariant asserted;
  domain errors (not silent NaN) on unphysical inputs
  (K_dry ≥ K_min, φ outside (0,1), K_fl ≤ 0 …) — petrophysics
  NaN-not-silent-defaults discipline.
- `vsEstimate.js` — Castagna mudrock + Greenberg-Castagna (sandstone /
  limestone / dolomite / shale coefficient sets, VSH-weighted 2-term
  mix in v1) with `source: 'measured' | 'estimated'` provenance.
- `avo.js` — exact Zoeppritz PP reflectivity (4×4 solve, complex past
  critical), Aki-Richards 3-term, Shuey 2-/3-term intercept-gradient,
  Rutherford-Williams class I–III + class IV from (A, B).
- `wedge.js` — two-interface wedge reflectivity → synthetic panel via
  the SHARED waveform primitives (Ricker, convolveSame) extracted from
  Seismolord synthetics (second consumer → `src/lib/` extraction, G4
  gridding precedent); tuning curve (peak amplitude vs thickness) and
  measured tuning thickness.

Compute runs client-side; wedge panels are small (≤ a few hundred
traces) so no worker in v1 — revisit if profiling says otherwise.

## Phases

- **G6.0 — oracle + goldens** (`tools/validation/rockphysics/`,
  stdlib-only Python, written from primary published definitions —
  NEVER from any JS): oracle.py + genfixtures.py →
  `test-data/rockphysics/` goldens. Anchors SELF-ASSERTED at
  generation (G2 fixture-v2 lesson): Gassmann A→B→A round-trip and
  dry-inverse round-trip at f64 noise; BW brine reduces to pure-water
  at S=0; Zoeppritz at θ=0 equals (Z₂−Z₁)/(Z₂+Z₁) exactly and matches
  Aki-Richards for small contrasts; Shuey(θ=0)=A; class fixtures on
  the published Rutherford-Williams sand cases. Published worked
  examples used where an open, verifiable source exists — numbers are
  never guessed from memory (G2 Q4 precedent: analytic self-asserted
  anchors are an accepted acceptance basis).
- **G6.1 — engine** validated vs goldens (jest, 1e-12 style where
  exact, documented tolerance where the oracle itself is iterative);
  malformed-input fuzz in the wellImportFuzz style.
- **G6.2 — migration**: `rp_projects` (owner-only RLS, petro_projects
  copy), staging-first + live RLS pentest probes; MIGRATIONS.md row.
- **G6.3 — waveform extraction**: Ricker/convolve/reflectivity →
  `src/lib/waveform/` with Seismolord re-pointed; existing synthetics
  jest goldens are the tripwire (must stay green untouched).
- **G6.4 — workstation UI**: WorkspaceShell + injected backends
  (registry vs in-memory analytic fixture); panels: Fluids & Gassmann
  (scenario table, before/after curves), AVO (interface from zone/top
  or manual halfspaces; Zoeppritz-vs-Shuey curves + I-G crossplot with
  class bands — white chartTheme + ChartLogo), Wedge (canvas panel +
  tuning curve); provenance badges for estimated Vs;
  `/dev/rock-physics-studio` harness seeded with the analytic fixture
  so e2e asserts oracle numbers off the UI.
- **G6.5 — close-out**: `rp_projects` persistence wired, page + route
  `apps/geoscience/rock-physics-studio`, seed-tile migration (%ROWTYPE
  template copy, Active), delete dead `rockPhysicsService.js`, e2e
  route smoke, STATUS doc, roadmap tick.

## Acceptance

- Engine: every golden matched at documented tolerance; Gassmann
  round-trips exact; Zoeppritz normal-incidence identity exact; a
  class-III gas-sand fixture classifies III with negative A and B.
- App: harness well runs fluid substitution brine→gas and the AVO
  panel's intercept/gradient equal the goldens; wedge tuning thickness
  read off the UI matches the oracle value within one thickness step.
- No new shared tables; jest + e2e green; build green.
