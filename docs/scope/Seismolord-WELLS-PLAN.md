# Seismolord — Wells Phased Plan (draft for owner review)

Drafted 2026-07-11. Follows the conventions of `Seismolord-PLAN.md`
(the plan of record) — its locked architecture decisions apply
unchanged: client-side worker numerics, Python-as-oracle-only, user
RLS, plain-JS engines with JSDoc, direct client persistence, jest +
Playwright. This plan covers WELL DATA: import, persistence, display
in map/section/traverse/3D windows, and well-tie calibration of the
velocity model. Synthetic seismograms and LAS log display are OUT of
scope (noted as future scope at the end).

## Why wells, and why now

Wells are the largest gap between Seismolord and a real interpretation
workflow, and they unlock two recorded follow-ups at once: **well-tie
calibration of layer-cake velocities** (recorded twice in STATUS) and
the SliceView architecture note's anticipated **well overlays** ("draw
through ViewTransform like every existing overlay" — the seam is
already there). Tops give the ground truth that turns the velocity
model from user-typed numbers into something defensible, which in turn
hardens every depth map and depth export the app ships to
ReservoirCalc Pro.

## Design decisions (proposed — need owner sign-off)

1. **Wells are per-user, not per-volume.** A well exists in world
   coordinates (X/Y/TVD); it appears on any volume whose survey
   contains it, mapped through the measured affine
   (`worldToIlxl`). No FK to `seismic_volumes`. This matches how
   interpreters think (one well database, many surveys) and means a
   volume re-ingest never touches wells.
2. **One table: `seismic_wells`** (product-prefixed, user RLS
   `auth.uid() = user_id`, house pattern). Row = header (name, UWI
   optional, surface X/Y, KB elevation, TD) + three compact jsonb
   payloads: `deviation` (survey stations), `tops`, `checkshots`.
   Deviation surveys are a few KB (a 5 km well at 30 m stations is
   ~170 rows × 3 numbers) — jsonb is the fault-sticks precedent, not a
   violation of plan decision #8 (no MULTI-MB jsonb). If log curves
   ever arrive (future scope), THOSE go to Storage blobs.
3. **Depth reference:** stations stored as measured depth + inclination
   + azimuth; the engine computes the path by **minimum curvature**
   (the industry standard) into X/Y/TVDss (subsea, KB-corrected).
   Vertical wells import with a header-only shortcut (surface X/Y +
   TD). All engine depths are METRES TVDss internally, negative-feet
   only at export boundaries — same convention discipline as horizons.
4. **Time-depth for display:** a well is drawn on a TWT section through
   a T(z) function, resolved in priority order: the well's own
   checkshots (piecewise-linear, monotonicity-validated) → the
   volume's velocity model inverted (t(z) is analytic for
   V = V0 + k·z; the layer cake inverts piecewise per column) → not
   drawable in TWT (well shows on the map only, with a clear hint).
   Never silently mix sources.
5. **Section/traverse projection reuses the corridor concept** proven
   by fault sticks: a well path segment draws where it passes within
   ~1.5 lattice cells of the section plane / traverse path,
   pen-breaking outside the corridor. Projection cached per
   (well, section) — never per camera frame.
6. **Import is CSV/tab-delimited with a mapping UI** (like the SEG-Y
   header mapping): columns for MD/INC/AZI (deviation), NAME/MD or TVD
   (tops), MD or TVD/TWT (checkshots). No LAS parsing in this plan.

## Domain rules (violating these = bug)

- Z increases downward everywhere; TVDss is KB-corrected subsea depth.
- Minimum curvature is the only path method; dogleg 0 falls back to
  the balanced-tangential limit analytically (no 0/0).
- Checkshot T(z) must be strictly monotonic after validation; reject
  (with a clear message) rather than sort silently.
- A well never draws in TWT without a declared T(z) source; the
  readout/legend says which source is in use.
- Null = 1.0E+30 for any gridded/exported product, as everywhere.

## Phases

### Phase W0 — Oracle + goldens (validation-first)
- `tools/validation/seismolord/wells/` (Python, dev-only): minimum-
  curvature reference implementation cross-checked against a published
  worked example (SPE/API drilling-engineering standard case), plus
  synthetic wells through the existing analytic dome: one vertical,
  one deviated S-shape, one horizontal-landing; deterministic
  checkshots derived from the dome fixtures' known V(z).
- Committed goldens: station tables, true X/Y/TVDss paths (float64),
  T(z) truth per well, and the tops each well should intersect on the
  analytic dome surface.
- **Acceptance:** JS `engine/wellPath.js` minimum curvature matches
  the published example and the Python reference to < 1 cm over a
  5 km path; vertical-well shortcut bit-matches the general path.

### Phase W1 — Import, persistence, map display
- `seismic_wells` migration (user RLS; logged in MIGRATIONS.md — the
  file gets created with this first entry, per CLAUDE.md).
- `wellsService.js` (direct client CRUD under RLS, house pattern).
- Wells panel: CSV import with column mapping + live preview
  (deviation, tops, checkshots tabs), manual header entry for
  vertical wells, list with visibility toggles/colors/delete.
- MapView: well spots (symbol + name label) via `worldToIlxl`;
  deviated wells show the surface location plus the projected path
  polyline; toggle in the map Layers menu.
- **Acceptance:** golden wells import through the real UI path
  (Playwright harness) and land on the dome fixtures' maps at the
  correct IL/XL (< 0.1 cell vs truth, incl. the ROTATED fixture —
  the affine must be exercised); RLS pentest extension: user B sees
  0 of user A's wells.

### Phase W2 — Section, traverse and 3D display
- `engine/wellSection.js`: T(z) resolution (checkshots → inverted
  velocity model → none) and corridor projection of the path onto
  inline/xline/traverse views; tops render as labeled tick marks on
  the projected path.
- SliceView overlay (through ViewTransform, per the architecture
  note); CubeView: path polyline + tops in cube space via interpMesh
  conventions.
- **Acceptance:** on the dome fixture with its known V(z), the
  synthetic wells' projected TWT positions match the golden T(z) to
  < 1 sample; a top placed exactly on the dome surface plots on the
  tracked horizon overlay within 1 sample on sections AND traverses;
  corridor pen-breaking covered by jest like projectStickToTraverse.

### Phase W3 — Well-tie velocity calibration
- `engine/wellTie.js`: given tops ↔ horizon pairings at well
  locations (user pairs them in a small dialog), fit the layer-cake
  layers' V0 (k optional, off by default) so converted horizon depths
  match tops in least squares; report per-well residuals before/after.
  Works for the single-function model too (fit V0/k globally).
- UI: "Calibrate from wells" next to the velocity editor — shows the
  proposed model + residual table, applies only on explicit Save
  (never silently rewrites the model).
- **Acceptance:** on synthetic wells whose checkshots come from a
  KNOWN layer cake, calibration recovers each layer's V0 to < 1% from
  perturbed starting values; residuals reported honestly (a
  deliberately inconsistent top shows a large residual, not a silent
  averaged-away fit).

### Phase W4 — Hardening + suite integration (small)
- Malformed-CSV fuzz (wrong columns, non-monotonic MD, duplicate
  stations, unit mix-ups) → clear domain errors, never raw exceptions.
- Well-marker provenance in RCP handoff params (`wells_used`) when a
  calibrated model drove a depth export.
- STATUS.md + memory updates; RLS pentest re-run.

## Explicitly future scope (not this plan)

LAS log import/display (log tracks beside sections), synthetic
seismograms / wavelet extraction (true seismic-to-well tie), org-level
well sharing (blocked on the suite membership-table decision), well
markers as gridding constraints.

## Working conventions

Branch + PR per phase; commit per completed sub-task; STATUS.md at
phase end; migration logged in MIGRATIONS.md; jest green per-phase
acceptance before moving on.
