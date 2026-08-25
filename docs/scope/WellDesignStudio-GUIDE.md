# Well Design Studio — operator guide

Compass-class well trajectory design inside Petrolord Suite. Slug
`well-planning`; tile "Well Design Studio". Everything below is backed
by oracle-gated engines (see `tools/validation/drilling-validation.ts`,
gates A1–A8, all active).

## The workspace

Left tree: **Site → Wellbore → Design**. A site is the pad — CRS
context, slots, lease lines, and the org-share root (share the site,
org members read everything under it; writes stay yours). A wellbore
holds the wellhead, datum (KB), depth unit and the azimuth-reference
chain. Designs are versioned trajectory plans — at most one
**definitive** per wellbore; draft → definitive → archived.

## Designing a well (Design tab)

- Build the path from segments (Hold / Build / Turn / Toolface arc) or
  let the **Design methods** solvers place them: slant (J), S-well,
  continuous build, horizontal landing, nudge. Targets come from the
  Targets tab (points, circles, ellipses, polygons at TVDSS — pick
  them straight from geoscience registries).
- The KO azimuth field follows the wellbore's azimuth reference; the
  engine compiles in grid north through the validated chain
  (magnetic + declination + convergence). Missing cached angles warn
  loudly; nothing converts silently.
- Views: Section, Plots (plan/section/inclination/DLS), Survey table,
  and **3D** — multi-well cube with the actual composite, the site's
  other designs, EOU rings, targets, tops, north arrow, PNG snapshot.
- **EOU**: 2σ ISCWSA MWD Rev4 uncertainty ellipses on the plan view
  and a TVD band on the section view. Needs a geomagnetic reference —
  re-save the wellbore (with a transformable site CRS) to cache its
  WMM2025 model.
- **Survey program**: assign instruments to MD intervals; uncertainty
  then composites per run with the ISCWSA tie-on carry.
- **PPFG**: with a bridged registry well carrying a Pore Pressure
  Studio prognosis (PP/FP/OBG), the section view gains a mud-window
  track (MPa or EMW g/cc).
- **Export**: quick CSV, or the versioned trajectory contract as
  JSON / CSV / Excel / DXF (CAD wellpath in site coordinates).
- **Publish**: pushes the saved trajectory into the geo_wells registry
  (first publish bridges the wellbore; republish updates the same
  row). Published wells co-render in Seismolord's cube, Well Data
  Manager, correlation and petrophysics. Optional checkshot borrow
  makes the well hang in time domains.

## Actual surveys (Surveys tab)

Import runs manually, from CSV, or from a registry deviation; each run
carries its own azimuth reference and unit. Flag runs into the
**definitive composite** (deeper run wins from its tie-on down).
Plan-vs-actual gives overlaid charts and a per-station delta table;
**project-ahead** solves a continuous-build arc from the last station
to a target with a DLS guard.

## Anti-collision (Anti-Collision tab)

The SPE-187073 separation rule with ISCWSA MWD Rev4 uncertainty
(pedal-curve method, gated on the official ISCWSA clearance wells).
Pick the reference (plan or actual composite) and offsets (other
wellbores' designs + registry wells in the site CRS), set the rule
(k, σpa, Sm, radii, no-go/review thresholds), run. Results: per-offset
status cards, SF/distance ladder, traveling cylinder (highside or
north), violation table. **Save run** writes an immutable record to
history; saved runs re-render the full chart pack and feed the AC
report.

## Reports (Reports tab)

Client-side PDF pack from the design's SAVED trajectory:

- **Wall plot** — A4 landscape, header block, vector plan + section
  with EOU, key stations, targets.
- **Survey listing** — full station table with TD/QC summary.
- **Anti-collision report** — rule parameters, per-offset minimum SF,
  vector SF ladder, all stations below the review threshold (from a
  saved AC run).

## Trust chain (what's validated where)

| Layer | Gate |
|---|---|
| Min-curvature / survey math | analytic closed forms (A1–A4) |
| Segment compiler / solvers | closed-form build-hold (A5) + jest property gates |
| WMM2025 magnetics | all 24 official NOAA test values (A6) |
| ISCWSA MWD Rev4 error model | official example Well #1 workbook, 112 per-source covariances + all-station totals ≤1e-8 (A7) |
| Separation rule | official ISCWSA clearance wells, 11 scenarios at the standard criteria (A8) |
| Browser bundle | e2e probes assert solver, declination, AC SF, contract exports and PDF pagination digit-for-digit against the engines |

Armed (awaiting owner literature PDFs): ADE ch.8 build-hold (L1),
Mitchell & Miska survey table (L2), Amoco/API MD-TVD (L3).
