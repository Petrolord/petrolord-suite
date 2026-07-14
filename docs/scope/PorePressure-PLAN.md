# Pore Pressure Prediction — Plan (G7 follow-on)

Status: DRAFT 2026-07-14 — P0 (oracle) started; P1+ gated on the open
questions in §5. Roadmap anchor: Phase G7 "Geoscience adds
seismic-velocity-driven pore-pressure prediction … fed by Seismolord
velocity models" (deferred at BasinFlow-PLAN Q4).

## 1. Audit (2026-07-14)

What exists today is the familiar over-built-demo pattern:

- **`pore-pressure-frac-gradient` (Drilling, tile Active/built/
  functional)** routes to `src/pages/apps/PorePressureFracGradient.jsx`
  over an 88-file `src/components/ppfg/` tree — guided wizard, Phases
  1–6, Bayesian/Monte-Carlo/PowerPoint/stakeholder panels — with **zero
  computation**: "Eaton" exists only as a slider default (3.0) and help
  text; the prognosis tab's data path is a placeholder. The catalog row
  misrepresents maturity (the HSE-tiles pattern).
- `src/pages/apps/PPFGAnalyzer.jsx` (196 loc) — unrouted orphan page
  over the same tree.
- `src/components/porepressure/` (4 files) — **zero importers**;
  parameter forms naming Eaton_n/Bowers_A-C, no math.
- ReservoirCalc Pro's `PPFGDataAdapter` expects a
  `{pore_pressure_gradient, fracture_gradient, contacts}` payload from
  "the PPFG app" via the **retired** shared_data_registry — dead path.
- `WellboreStabilityAnalyzer.jsx` hardcodes `porePressureGradient:
  0.45`.
- Geoscience catalog rows `pressure-prediction-system` /
  `pressure-compartment-analyzer` are Archived (stay archived; a new
  app seeds its own tile).

Data the platform already has:

- **Seismolord velocity models** — per-volume `manifest.velocity`
  (+ `velocity_calibration`): analytic V(z) = v0 + k·z, single-function
  or horizon-bounded layer-cake, **per (il, xl) column**
  (`engine/velocityModel.js`, jest-tested). This gives an interval-
  velocity profile at any map location in a survey.
- **geo_wells_logs** — sonic (`DT/DTC/AC/DTCO`) and density
  (`RHOB/DEN/ZDEN`) standardized to SI at LAS import (WDM);
  tops/zones in geo_wells_tops/_zones; surfaces in geo_surfaces.

## 2. Scope v1

One geoscience app: **1D pore-pressure / fracture-gradient prognosis**,
well-based and seismic-velocity-based, oracle-validated.

Engine (`engine/`, pure, SI internal — Pa, m, m/s, kg/m³; ppg/psi/MPa
at the display edge only):

- **Overburden (OBG)**: seawater column + trapezoidal integration of
  density; Gardner ρ = a·V^b fallback where density is absent
  (provenance-recorded, per-sample).
- **Normal compaction trend (NCT)**: Δt_n(z) = Δt_ma + (Δt_ml − Δt_ma)
  · e^(−cz), fit to user-picked shale intervals; equivalent velocity
  form for seismic input.
- **Eaton**: PP = OBG − (OBG − P_hyd) · (Δt_n/Δt)^n (sonic, n=3
  default) and (V/V_n)^n velocity form.
- **Bowers**: loading V = V_ml + A·σ'^B inverted for σ'; unloading
  V = V_ml + A·(σ_max·(σ'/σ_max)^(1/U))^B; PP = S − σ'.
- **Fracture gradient**: Eaton FG = ν/(1−ν)·(OBG − PP) + PP with
  depth-varying ν; Matthews-Kelly Ko variant.
- Inputs: (a) a well's DT/RHOB from geo_wells_logs; (b) a Seismolord
  velocity-model column sampled at a clicked map location (honestly
  flagged as trend-resolution — an analytic v0+k model carries no
  local overpressure anomaly; it constrains the regional trend).

Workstation (WorkspaceShell + injected backends, /dev harness):
track viewer (PP/FG/OBG/hydrostatic vs depth, white chartTheme),
NCT picking on the sonic log, method parameter panel, well vs
map-location source picker, calibration overlay (RFT/MDT points
entered manually in v1).

Publish/persist: app-private `pp_projects` (rp_projects pattern,
owner-only RLS); computed PP/FG/OBG curves publishable to
geo_wells_logs with provenance (petrophysics publish pattern);
prognosis export shaped to feed Drilling consumers (the
PPFGDataAdapter payload shape, minus the dead registry).

## 3. Out of scope v1 (cuttable-§7 style)

- Centroid/lateral-transfer effects, 3D pressure cubes, basin-model-
  coupled PP (BasinFlow overpressure would be disequilibrium-compaction
  driven — a later integration).
- Resistivity-Eaton (needs resistivity mnemonic standardization at WDM
  import first).
- Automated shale discrimination (v1 = user-picked intervals + GR
  cutoff assist).
- Real-time/while-drilling anything; the MEM-under-Drilling rebuild
  consumes this app's outputs later, not vice versa.

## 4. Phases

- **P0 — Oracle** (STARTED): `tools/validation/porepressure/`
  stdlib-Python oracle + self-asserted analytic anchors + committed
  goldens (basinflow/rockphysics pattern). Anchors are closed-form:
  constant-density OBG; Gardner round-trip; Eaton at Δt=Δt_n ⇒ PP
  exactly hydrostatic; Eaton n=1 linear blend; Bowers load/unload
  round-trip inversion at 1e-12; FG at ν=1/3 ⇒ exact ½(OBG−PP)+PP;
  full synthetic GoM-style well (NCT + overpressure ramp) as the
  integration golden.
- **P1 — Engine**: `src/pages/apps/PorePressureStudio/engine/`
  (obg/nct/eaton/bowers/fracgrad/profile), jest vs goldens, NaN-not-
  silent, unphysical inputs throw.
- **P2 — Persistence**: `pp_projects` migration + RLS pentest block
  (staging-first, MIGRATIONS.md).
- **P3 — Workstation**: shell UI, /dev harness seeded with the P0
  synthetic well so e2e asserts oracle numbers off the UI.
- **P4 — Integration + close-out**: Seismolord velocity-column source;
  publish curves; tile seed (%ROWTYPE copy); legacy purge per Q2;
  STATUS.md.

## 5. Open questions (owner)

- **Q1 — Placement + name**: new Geoscience tile **Pore Pressure
  Studio** (recommended; functional name, Studio-series consistency)
  vs rebuilding under the existing Drilling slug.
- **Q2 — Legacy PPFG surfaces**: archive the Drilling
  `pore-pressure-frac-gradient` tile + redirect its route to the new
  app, and delete `components/ppfg` (88 files), `PPFGAnalyzer.jsx`,
  `components/porepressure`, `PorePressureFracGradient.jsx`
  (recommended — G2.6 delete discipline, importers verified
  file-by-file) vs keep the shell alive.
- **Q3 — Bowers in v1**: Eaton + Bowers (recommended; both are
  parameter-driven closed forms sharing the σ' framework) vs
  Eaton-only.
- **Q4 — Publish target**: PP/FG/OBG as geo_wells_logs curves with
  provenance (recommended) vs project-private only.

## 6. Acceptance

- Oracle goldens committed, byte-identical regeneration, jest engine
  suites green at 1e-12 vs goldens.
- e2e: harness well's PP/FG at anchor depths match goldens off the UI.
- Cross-app: a Seismolord velocity model column produces a finite,
  monotone-OBG, PP ≥ hydrostatic prognosis at a clicked location.
- No regression: existing jest + build green.
