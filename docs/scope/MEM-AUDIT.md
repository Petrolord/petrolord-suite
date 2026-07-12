# MechanicalEarthModel (1D MEM) — G0 Audit (Geoscience-ROADMAP.md Phase G0)

Audited 2026-07-12. Verdict: **REBUILD on a salvaged core** — and
**recommended module placement: DRILLING** (owner decision pending).

## What it is

1D geomechanics app at `apps/geoscience/mechanical-earth-model` (+ aliases
`1d-mechanical-earth-model`, `mem`, `geomechanics`) —
`src/pages/apps/MechanicalEarthModel/`, 108 files, ~7,615 LOC. Its
catalog tile (`1d-mechanical-earth-model`) is Active + built.

## The headline problem

**The routed app runs no math.** Its "Run Calculation" button only
switches tabs, and the page mounts a context whose state shape doesn't
match the hook it consumes. The only code path that executes the real
engine is `GuidedMode.jsx` → `CalculationStep` — **which is not routed
anywhere**. Worse, the `/expert` subroute renders **BasinFlow Genesis
panels** (copy-paste from the other app; the header literally reads
"BasinFlow / Expert"), and `/analytics` is empty unless results are
handed in via navigation state. Persistence targets four `mem_*` tables
and four `calculate-*` edge functions — **none of which exist** (no
migrations, no functions). Zero tests.

## What's real (~10–15%: a small, salvageable engine core)

~440 LOC across four service files compute genuine values:
- **Overburden Sv** (`StressCalculationEngine.js`): density integration,
  0.433 psi/ft per g/cm³ — correct.
- **Pore pressure** (`PressureCalculationEngine.js`): Eaton sonic with
  exponent 3.0 — the formula is right, but the normal-compaction trend is
  hardcoded (DTn = 100 µs/ft, no trend fitting); Hottman-Johnson is a
  stub; no Bowers/resistivity.
- **Fracture gradient**: Hubbert-Willis and Matthews-Kelly — correct
  standard equations.
- **Horizontal stresses**: simplified Andersonian (k0 = ν/(1−ν) +
  frictional limits); Biot declared but unused; no tectonic strain.
- **LAS parser** (`useFileParser.js`): real but minimal (curves + −999.25
  nulls); plus a genuine QC sanity-checker (flags Pp > Fg inversion).

## What's missing for a credible 1D MEM

Two of the four pillars are entirely absent: **log-driven elastic
properties + UCS** (Young's/Poisson are hardcoded lithology lookups; "UCS
Model" is a selector with no formula) and **wellbore stability** (no
Kirsch hoop stresses, no breakout analysis, no actual mud-weight window —
"breakouts" exist only as mock calibration rows). The analytics/ML/
collaboration folders (30+ files) are dummy-data scaffolding.

## Module placement — recommendation: DRILLING

The app's outputs and vocabulary are pre-drill deliverables: Sv/Pp/Fg
gradient plots in psi/ft, mud-weight-window inversion warnings,
breakout/LOT calibration, templates framed as "extended-reach drilling"
and "narrow mud weight windows". That is the drilling engineer's
casing-design/wellbore-stability workflow, and the suite already has a
`components/wellborestability/` module for it to sit beside. The
exploration-geoscience flavor of this domain (basin-scale pore-pressure
prediction from seismic velocities, seal/charge analysis) is absent from
the code — and is already represented in the Geoscience catalog's own
Coming Soon rows (pressure-prediction-system, pressure-compartment-
analyzer) for when the roadmap gets there.

**Recommendation to the owner:** rebuild the app under **Drilling** as
"1D Mechanical Earth Model / Wellbore Stability", salvaging the ~440-LOC
engine + LAS parser as seeds (roughly 30–40% of the physics saved; the
UI/persistence/routing layer is rewritten). Keep pore-pressure prediction
on the Geoscience roadmap as a later, seismic-velocity-driven capability
(natural fit: a Seismolord velocity-volume consumer), rather than
retrofitting this drilling-shaped app into Geoscience.

Pending the owner's decision, note that the Active
`1d-mechanical-earth-model` tile currently advertises an app whose live
route computes nothing — consistent with G0's "hub shows only apps that
work", it should be **archived until the rebuild ships** (in whichever
module). This archive was NOT executed in G0 because the owner explicitly
reserved the MEM decision until this audit.

## Rebuild scope sketch (for the eventual per-app plan)

Salvaged seeds: the four engine files + LAS parser. Build: route the
working workflow; real NCT fitting for Eaton (+ Bowers); elastic
properties from DT/DTS/RHOB with dynamic→static conversion; UCS
correlations; poroelastic horizontal stresses (Biot + tectonic strain);
Kirsch wellbore stability + true mud-weight window; `mem_*` tables that
actually exist (or, better, G1 shared well/log registry as the data
source); published-reference validation tests. Delete the BasinFlow
copy-paste `/expert`, the dummy analytics/ML/collaboration trees, and the
dead edge-function layer.
