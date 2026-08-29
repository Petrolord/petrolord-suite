# Facility Layout Mapper — status

Phase: Facilities F8 (Facilities-ROADMAP.md §3 app 8, §5 F8)
Status: **SHIPPED 2026-08-29** (branch feat/facilities-f8)
Slug: `facility-layout-mapper` (unchanged; no tile migration — the
tile's promise is now kept rather than changed).

## What this phase was for

The Layout Mapper was the module's honest oddity: a genuinely working
geospatial drafting tool (Leaflet placement, pipe runs with flow
decorators, DXF/KML/SVG/GeoJSON/PDF export, Supabase persistence) with
**zero engineering math**, while its catalog tile advertised "safety
distances". Owner decision F#2 kept it as a utility tile and deferred
the spacing checks to this phase. This is the missing half.

## What shipped

- **Engine** (`@petrolord/engines` PR #84, vendored, shim at
  `src/utils/facilities/engine/spacing.js`) that keeps two kinds of
  answer visibly apart:
  - **TABLE spacings** between equipment classes: the customary
    onshore production figures, symmetric, replaceable wholesale by a
    site standard, and returning `null` rather than guessing on an
    unknown pair. A table is a table and the UI says so.
  - **COMPUTED setbacks** from the duty: flare radiation via the same
    API 521 point-source model the F2 relief engine uses, and pool
    fires via published burning-rate and Thomas flame-height
    correlations. These **move when the duty moves**, which a table
    figure cannot, and the engine flags when the point-source model is
    being applied inside the flame height where it under-predicts.
- **Great-circle distances**, because the mapper places equipment on a
  map and a planar distance is wrong at the scale of a large site at
  high latitude.
- **Suite adapter** `src/utils/facilities/layoutSpacing.js` (no
  physics): maps icon names to equipment classes, and deliberately
  **refuses to judge** pipe runs (no single position) and custom icons
  (no class the table knows), reporting them instead of silently
  passing them.
- **Safety Spacing panel** in the mapper's control accordion:
  pass/fail summary, computed setbacks with their notes, violations
  sorted worst-first with the shortfall named, and the honest
  statement of what was skipped and why.
- **Equipment tags are now sequential, not random.** The audit flagged
  `Math.random()`-suffixed tags; an equipment tag is an identity a
  drawing and a datasheet share, and a suffix that changes on every
  placement is not one.

## Validation

Oracle (`oracle_spacing.py`) checks the distance against **both** the
Vincenty sphere formula **and** a 3D chord-through-the-earth
derivation — three formulations of the same quantity — and checks the
radiation setbacks by **round trip**: compute the intensity at the
returned distance and confirm it equals the allowable. 14 engine gates
plus 8 adapter gates; engines suite 1961 green.

## Honest limits (stated in-app)

- Table spacings are industry-practice figures, not a calculation, and
  a site standard should replace them.
- Pipe runs and custom icons are not judged.
- The pool-fire point source under-predicts close to the flame; the
  engine says when that is happening.

## Open

- No tile migration: the tile keeps its name and Active status. Its
  claim is simply true now.
- ARMED literature gate: the published spacing tables themselves
  (owner PDFs) — the values here are the commonly cited figures.
