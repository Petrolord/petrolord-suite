# Stratigraphy Studio, the ST series. Plan of record

Status: **DRAFT for owner sign-off (2026-09-06).** Three decisions are
already locked by the owner on 2026-09-06 and are not open for
re-litigation here (§3.1). The remaining questions are in §11.
Roadmap slot: to be added to Geoscience-ROADMAP.md as **Phase G9,
Stratigraphy** on sign-off (the module currently ends at G8, ten tiles).
App name **Stratigraphy Studio**, slug `stratigraphy-studio`, an eleventh
Geoscience tile. Builds on the G1 to G4 registry: wells, curves, tops,
zones, surfaces and culture. Engines go to the central
`Petrolord/petrolord-engines` repo first and are subtree-vendored under
`packages/engines/engines/stratigraphy/`, the same way every engine since
the extraction runway has shipped.

## 1. What this is

The Geoscience module lets a working geologist run the lithostratigraphic
loop end to end: import wells, pick tops, correlate, flatten, fill zones,
grid isochores, publish surfaces, compute volumes. A specialist
stratigrapher gets nothing beyond a named top at a depth. There is no
stratigraphic column, no typed surface (sequence boundary, maximum
flooding surface, unconformity), no lithology or core or facies log per
well, no systems tracts, no Wheeler view, no biozones and no ages. The
sequence, sedimentological and chronostratigraphic interpretation happens
on paper and only the resulting tops land in Petrolord.

This series fixes that the way G1 fixed wells: **registry entities
first**, then one app that hosts the specialist interpretation, then the
existing apps consuming the new rows. Stratigraphy Studio is the home of
the stratigraphic framework, interval logs, sequence interpretation, the
Wheeler view and age-depth. It draws sections with the same components
Well Correlation uses. Nothing is copied.

## 2. Audit of what exists (2026-09-06)

| Need | State | Disposition |
|---|---|---|
| Tops, correlation, datum flattening, multi-track sections, zones, MD/TVD/TVDSS, PNG export | Well Correlation WC series (waves 0 to 2 merged) | **KEEP**, becomes the section host Stratigraphy Studio imports |
| Isochore, surface arithmetic, net thickness, posted basemaps, culture polygons | Mapping MS series (MS0 to MS5 merged) | **KEEP**, ST4 adds typed facies polygons and net-sand |
| `geo_wells_tops` columns | `name`, `md_m`, `interpreter` only | **EXTEND** (ST0, additive nullable columns) |
| Stratigraphic column (group, formation, member, ages, colours) | absent | **NEW** `geo_strat_units` (ST0) |
| Lithology, cuttings, core description, core photos, facies log per well | absent; `lasParse.js` reads LAS 3.0 core and tops blocks and lists them in `ignoredSections`; `src/pages/apps/CoreImageAnnotator.jsx` is an 84-line unrouted shell | **NEW** `geo_wells_intervals` + core images (ST1); delete the shell |
| Facies tagging | Petrophysics crossplot polygons, private jsonb in `petro_projects.facies`, never shared | **PUBLISH** to intervals (ST1); polygons stay where they are |
| Systems tracts, stacking patterns, log motifs, ghost curve | absent (ghost curve and horizon flattening sit in Well Correlation wave 3 follow-ups) | **NEW** in Stratigraphy Studio (ST2); ghost curve lands once, in the shared painter |
| Wheeler or chronostratigraphic chart | absent | **NEW** engine + view (ST2) |
| Biozones, ages, age-depth plot, timescale | absent | **NEW** (ST3); ICS chart as committed data |
| Facies and paleogeographic maps | culture polygons exist, `geo_culture.kind` is free text with no facies value | **EXTEND** by convention, no DDL (ST4) |
| Seismic stratigraphy: flatten on a horizon, proportional stratal slices, terminations | Seismolord has isochrons and two-horizon interval attributes (W2.5 span walker), no section flattening or slicing | **EXTEND** Seismolord (ST5) |

Nothing existing needs to be replaced. This is additive.

## 3. Decisions

### 3.1 Locked by the owner (2026-09-06)

1. **Vocabulary is Catuneanu.** Surface types and systems tracts are
   stored in the Catuneanu scheme (Catuneanu 2006; Catuneanu et al.
   2009, *Earth-Science Reviews* 92, "Towards the standardization of
   sequence stratigraphy"). **Exxon terminology is a display option**:
   a pure label map in one file, applied at render time. Nothing is
   stored twice and no row carries both names.
2. **Stratigraphy Studio is a tile of its own.** The owner wants the
   catalog to say Stratigraphy. It is the eleventh Geoscience tile.
3. **No complications, no duplication.** The tile does not re-implement
   the section, the track painter, the tops CRUD or the map. It imports
   them. §4 fixes the split so this stays true.

### 3.2 Proposed (sign-off locks these)

4. **All data through the registry.** Units, typed tops, intervals and
   core images are shared `geo_*` rows read by every Geoscience app.
   Stratigraphy Studio keeps only view state privately (§6, `strat_projects`).
5. **Typed tops are the existing tops rows.** ST0 adds nullable columns
   to `geo_wells_tops` rather than a parallel surfaces table, so every
   existing consumer (Seismolord well ties, Mapping "map this top",
   Petrophysics, Well Correlation) sees typed tops with zero migration
   of data and zero behaviour change until it opts in. `geo_wells_tops`
   is a shared table: the migration takes the **second-engineer review**.
6. **Interpretation products are intervals, not app jsonb.** Systems
   tracts, log motifs, lithology, core description, facies, environment
   and biozones are all "a named thing between two depths on a well".
   One table, `geo_wells_intervals`, keyed by `kind`, carries all of
   them. This is what lets Mapping grid net-sand from lithology and lets
   Well Correlation draw a facies column with no new plumbing.
7. **Sections are shared with Well Correlation.** Stratigraphy Studio
   opens and saves the same `geo_correlation_sections` rows. A named
   section built in one app is the same section in the other.
8. **Engines-first, validation-first.** `engines/stratigraphy/` in the
   central repo: `vocabulary.js` (Catuneanu codes, Exxon label map,
   ordering rules), `intervals.js` (overlap, gap and containment
   arithmetic), `ageDepth.js` (age-depth interpolation, hiatus
   detection, accumulation rates), `wheeler.js` (section to
   chronostratigraphic cells), `timescale.js` (ICS chart lookups).
   Closed-form arithmetic gets analytic jest goldens with a fixtures
   README explaining why there is no Python oracle (the G3.0 precedent).
   The ICS chart is committed data with boundary-age guard tests.
9. **UI on the shared shell.** `WorkspaceShell`, `ModuleHomeLink`,
   `HelpGuideLayout`, `OpenInAppMenu`, the wells layout system and
   `trackPainter.js` from `src/components/wells/`. The section view is
   the imported `CrossSection` component from Well Correlation, moved to
   `src/components/wells/section/` at the second consumer (the roadmap
   rule: extract when the second consumer appears, not before).
10. **Catalog.** `master_apps` row seeded by the `%ROWTYPE` template-copy
    pattern from `well-correlation`, slug `stratigraphy-studio`, flipped
    Active only at close-out with the route in the same PR.

## 4. The split (the no-duplication rule)

| Concern | Owner app | Everyone else |
|---|---|---|
| Well header, deviation, checkshots, LAS import, tops table | Well Data Manager | read |
| Section geometry, well path, datum, track templates, tops pick/drag/propagate | Well Correlation (component imported by Stratigraphy Studio) | Stratigraphy Studio uses the same component; Petrophysics edits tops on one well |
| Stratigraphic column (units, ranks, ages, colours) | **Stratigraphy Studio** | Well Data Manager tops tab shows the unit; Mapping and Earth Modeling read colours and order |
| Surface type, confidence, age on a top | **Stratigraphy Studio** (Well Data Manager tops tab may edit the same fields) | drawn by type everywhere |
| Interval logs (lithology, core, facies, environment, motif, systems tract, biozone) | **Stratigraphy Studio** for editing; Petrophysics publishes facies intervals; Well Data Manager imports lithology from LAS 3.0 and CSV | drawn as one shared track kind |
| Core photos | **Stratigraphy Studio** | Well Data Manager lists them |
| Wheeler view, age-depth plot, terminology display option | **Stratigraphy Studio** only | none |
| Facies polygons on the map, net-sand grids | Mapping & Surface Studio | Stratigraphy Studio links out with "Map this" |
| Horizon flattening, stratal slices | Seismolord | Stratigraphy Studio links out |

Rules that keep it honest:

- A component lives in one directory. If Stratigraphy Studio needs a
  Well Correlation component, that component moves to
  `src/components/wells/` in the same PR and Well Correlation imports it
  from there. Copy-and-edit is refused in review.
- A row is edited through one service. Tops through
  `src/lib/wellsRegistry.js` (extended with the new columns), intervals
  and units through a new `src/lib/stratRegistry.js`. No app-local
  Supabase calls against these tables.
- Exxon labels come from `vocabulary.js` `displayLabel(code, scheme)`.
  No component carries its own name table.

## 5. Vocabulary

Stored codes (Catuneanu). The display option `scheme = 'catuneanu' |
'exxon'` is a per-user preference persisted in `localStorage`
`strat.scheme`, default `catuneanu`.

### 5.1 Surface types (`geo_wells_tops.surface_type`)

| Stored code | Catuneanu name | Exxon display label | Note |
|---|---|---|---|
| `formation_top` | lithostratigraphic top | same | the default; every existing top is this |
| `SU` | subaerial unconformity | Sequence boundary (SB) | |
| `CC` | correlative conformity (sensu Hunt and Tucker) | SB (correlative conformity) | |
| `BSFR` | basal surface of forced regression (CC sensu Posamentier and Allen) | SB (sensu Posamentier) | |
| `RSME` | regressive surface of marine erosion | no equivalent, Catuneanu name shown | |
| `MRS` | maximum regressive surface | Transgressive surface (TS) | |
| `TRS` | transgressive ravinement surface | Transgressive surface (ravinement) | |
| `MFS` | maximum flooding surface | Maximum flooding surface (MFS) | also "downlap surface" in the Exxon glossary |
| `unconformity` | unconformity, unclassified | same | for picks that are not yet sequence-typed |
| `biozone` | biostratigraphic datum | same | ST3; carries `age_ma` and a scheme label |

### 5.2 Systems tracts (`geo_wells_intervals.kind = 'systems_tract'`, `code`)

| Stored code | Catuneanu | Exxon display label |
|---|---|---|
| `LST` | lowstand systems tract | Lowstand systems tract |
| `TST` | transgressive systems tract | Transgressive systems tract |
| `HST` | highstand systems tract | Highstand systems tract |
| `FSST` | falling-stage systems tract | no equivalent (Exxon folds it into LST or late HST); Catuneanu name shown |
| `RST` | regressive systems tract (T-R sequences) | no equivalent; Catuneanu name shown |

### 5.3 Log motifs (`kind = 'motif'`, `code`)

`blocky`, `bell` (fining upward), `funnel` (coarsening upward), `bow`,
`serrated`. Same in both schemes. Stacking patterns for a set of motifs
(`progradational`, `retrogradational`, `aggradational`) are a property
on a `systems_tract` interval, not a separate kind.

Where the Exxon column says "no equivalent" the display falls back to
the Catuneanu name with a small scheme badge. There is deliberately no
reverse map: the app never stores an Exxon code.

## 6. Schema sketch (staging-first, one migration per phase)

```
-- ST0 (shared table, second-engineer review)
alter table geo_wells_tops
  add column surface_type text not null default 'formation_top'
    check (surface_type in ('formation_top','SU','CC','BSFR','RSME','MRS','TRS','MFS','unconformity','biozone')),
  add column unit_id     uuid references geo_strat_units (id) on delete set null,
  add column confidence  text check (confidence in ('high','medium','low')),
  add column age_ma      double precision,
  add column notes       text;
-- RLS unchanged (owner writes, visibility via geo_wells). Existing rows
-- become formation_top with nulls elsewhere; no consumer changes behaviour.

-- ST0
geo_strat_units: id, user_id, organization_id (nullable, org read via
  is_org_member), name, rank ('group'|'formation'|'member'|'bed'),
  parent_id (self FK, set null), order_index, age_top_ma, age_base_ma,
  colour, lithology (text code), notes, created_at, updated_at
  RLS: the geo_surfaces / geo_culture pattern (owner all, org read).
  Index (user_id), (parent_id).

-- ST1 (registry child, the tops pattern: visibility via geo_wells)
geo_wells_intervals: id, well_id FK cascade,
  kind ('lithology'|'core_description'|'facies'|'electrofacies'|
        'environment'|'motif'|'systems_tract'|'biozone_interval'),
  top_md_m, base_md_m (check base > top), code, label,
  properties jsonb (grain_size, sorting, structures, colour, stacking,
  scheme ...), source ('core'|'cuttings'|'log'|'interpretation'|'import'),
  interpreter, created_at, updated_at
  Index (well_id), (well_id, kind).

-- ST1
geo_wells_core_images: id, well_id FK cascade, top_md_m, base_md_m,
  storage_path ({user_id}/{well_id}/core/{id}.{ext} in the existing
  private `wells` bucket, which already carries owner-path Storage RLS),
  caption, width, height, bytes, created_at
  Index (well_id).

-- ST2 (app-private, the geo_correlation_sections pattern: owner-only)
strat_projects: id, user_id, name, section_id (FK geo_correlation_sections
  set null), scheme, wheeler jsonb (age axis, colouring, hiatus style),
  view jsonb, created_at, updated_at
```

Conventions honoured: no DDL against `geo_surfaces` or `geo_culture`
(ST4 uses `geo_culture.kind = 'facies' | 'paleogeography'`, which the
free-text column already allows). MIGRATIONS.md entry per migration.
The .pld portability spec (`src/lib/portability/geoscienceSpec.js`)
gains the three new families and the `unit_id` soft reference in the
same PR as each migration, with the packageSet round-trip test extended,
so a project export never silently drops stratigraphy.

## 7. Phases

Sizes are relative to the Geoscience history (G3 medium, G4 medium-large).

- **ST0, Stratigraphic framework** *(small-medium)*. Engines:
  `vocabulary.js` + `timescale.js` with tests. Migration: the tops
  columns + `geo_strat_units`, live RLS pentest (own, org-shared read,
  forged owner refused). `stratRegistry.js` units CRUD; `wellsRegistry.js`
  tops functions accept the new fields. Consumers opt in: Well
  Correlation and Petrophysics draw tops by `surface_type` (line style
  per type, colour still from `topColors.js`), Well Data Manager tops
  tab gains Type, Unit, Confidence, Age columns. App skeleton on the
  shell with the Column editor as its first center view, harness
  `/dev/stratigraphy-studio`, tile seeded Archived. Accept: a top typed
  MFS in Stratigraphy Studio draws as an MFS in Well Correlation with no
  reload beyond the existing tops reload; the Exxon toggle relabels it
  "Maximum flooding surface (MFS)" and an FSST tract shows the fallback
  badge.
- **ST1, Lithology, core and facies** *(medium)*. Migration:
  `geo_wells_intervals` + `geo_wells_core_images`, pentest. Import: LAS
  3.0 `~Core` and lithology blocks through `lasParse.js` (today listed in
  `ignoredSections`, so the parser change is small and gets goldens on
  the committed LAS 3.0 fixtures), CSV paste through the existing
  `PasteReplacePanel` idiom. One new track kind `intervals:<kind>` in
  `resolveTracks.js` and `trackPainter.js`, so Petrophysics, Well
  Correlation, Well Data Manager and Stratigraphy Studio all draw
  lithology, core and facies columns from one painter. Petrophysics gains
  "Publish facies as intervals" (crossplot polygons to `facies` rows via
  `faciesCurve`; the polygons themselves stay in `petro_projects`).
  Core photo upload, depth-registered strip in the section. Delete
  `CoreImageAnnotator.jsx` after confirming it has no route or importer.
  Accept: a LAS 3.0 file with a core block imports its intervals; a facies
  column drawn in Petrophysics appears identically in the Well
  Correlation section.
- **ST2, Sequence stratigraphy** *(medium-large)*. Engines:
  `intervals.js`, `ageDepth.js`, `wheeler.js` with analytic goldens on a
  deterministic three-well synthetic (a clinoform with one SU hiatus and
  one MFS, ages assigned, expected chronostratigraphic cells derived by
  hand in the fixtures README). Section view: typed surfaces, systems
  tract fills between typed surfaces (per well, written as intervals),
  motif tagging on a GR track, stacking pattern on a tract, ghost curve
  (built once in the shared painter, which also closes the Well
  Correlation wave 3 item), stratigraphic flattening between two chosen
  surfaces (proportional stretch, the Wheeler transform in depth).
  Wheeler view: the section re-plotted with age on the vertical axis,
  deposition cells coloured by tract or lithology, hiatus and erosion
  hatched, in the display scheme chosen. `strat_projects` migration.
  Accept: the synthetic section reproduces the golden Wheeler cells; a
  real three-well section typed with SU, MRS and MFS produces LST, TST
  and HST fills and a Wheeler chart without hand editing.
- **ST3, Biozones and ages** *(small)*. `biozone` tops (name, scheme
  label, `age_ma`, confidence) and `biozone_interval` rows (range top
  and base). ICS International Chronostratigraphic Chart committed as
  JSON in `timescale.js` (CC BY 4.0, version stamped, guard tests on
  known boundaries such as the base of the Paleogene at 66.0 Ma), used
  for the Wheeler axis, unit age pickers and stage labels. Age-depth
  plot per well with accumulation rates from `ageDepth.js`. "Send to
  Basin & Charge Modeling" launcher that builds that app's layer table
  (thickness, lithology, age) from the unit column and tops; today those
  layers are typed by hand. Accept: an age-depth plot on a well with
  three dated surfaces shows the two rates the analytic test expects;
  the Basin launcher opens with the layers pre-filled.
- **ST4, Stratigraphic maps** *(small-medium)*. In Mapping: culture
  polygons typed `facies` and `paleogeography` with a facies legend,
  net-sand and gross-sand grids from lithology intervals between two
  typed surfaces (the existing gridder, a new control-point source in
  `engine/surface.js`), gross depositional environment map from
  `environment` intervals. "Map this" launchers from Stratigraphy Studio
  for a tract interval and for a unit. Accept: net-sand between SU and
  MFS grids on the harness section and publishes as `kind = 'isochore'`
  with provenance naming the two surfaces.
- **ST5, Seismic stratigraphy** *(medium)*. In Seismolord: flatten a
  section on any horizon; proportional stratal slices between two
  horizons in the map window (the W2.5 span-per-cell walker already
  computes the A-to-B span; this adds a fraction parameter and the
  display path); termination annotations (onlap, downlap, toplap,
  truncation) as section markers stored with the interpretation.
  Engines change in `horizonAmplitude.js` with the existing numpy oracle
  extended. Accept: a flattened section is flat on the chosen horizon in
  the e2e; a stratal slice at fraction 0 equals the top-horizon
  attribute map bit-for-bit and at 1 the base.

Close-out for the series: help guide page on `HelpGuideLayout` (the
MS5 shape: overview, quick start, column, typed surfaces, intervals,
tracts and motifs, Wheeler, ages, links, pitfalls, glossary with both
schemes), STATUS doc, roadmap §2 gains the eleventh tile, tile Active
with the route in the same PR, `OpenInAppMenu` gains "Open in
Stratigraphy Studio" on every well app.

ST0 and ST1 are the keystone and ship in order. ST2 to ST5 can be pulled
in any order by demand once ST1 is live.

## 8. Validation approach

- Vocabulary and label maps: exhaustive jest over every code in both
  schemes, plus a guard that the stored check constraint and
  `vocabulary.js` list the same codes (read from the migration file).
- Interval arithmetic, age-depth and Wheeler: closed-form, so analytic
  goldens on the deterministic three-well fixture, hand-derived and
  documented in the fixtures README (the G3.0 rationale applies: there is
  no numerical method to cross-check against, unlike Archie or lasio).
- Timescale: committed ICS data with boundary guards, monotonic-age
  guard, and the chart version pinned in the file header.
- LAS 3.0 core and lithology blocks: generator-written goldens in the
  same style as the existing LAS 3.0 fixtures (lasio misreads 3.0, so
  it is not the oracle there either).
- Stratal slices: fraction 0 and 1 identity against the existing
  horizon-attribute oracle, interior fractions against an extended
  `gen_isofrequency.py`-style numpy script.
- RLS: live pentest per migration, own and org-shared paths, forged
  `user_id` refused.
- e2e on `/dev/stratigraphy-studio` with the seeded synthetic section:
  type a surface, fill a tract, toggle the scheme, open the Wheeler view,
  read cells from data attributes (the WC series pattern).

## 9. Out of scope, and why

These three were called products in the audit. That means each needs a
dedicated build of its own scale, not that each needs its own tile. None
becomes a separate app.

- **Automatic correlation** is a later engine phase inside Stratigraphy
  Studio. It can only be validated against a body of expert typed picks,
  which is exactly what ST0 to ST2 produce. Build it when real users have
  picked enough for the goldens to mean something.
- **Chemostratigraphy** needs a new curve family (XRF or ICP elements
  with units and QC) before any ratio plot. A later phase, ST1-sized,
  pulled by a paying user rather than scheduled.
- **A biostratigraphic reference database** is a licensed, curated
  dataset, not code. ST3 ships the free ICS timescale and user-entered
  biozone picks with a scheme label. No taxonomy or range chart is
  transcribed.

Also out: 3D Wheeler volumes, seismic facies classification, and any
automatic motif or tract detection.

## 10. Risks

- **Shared-table change.** ST0 alters `geo_wells_tops`, which four apps
  and the .pld exporter read. Defence: additive nullable columns with a
  safe default, the exporter spec extended in the same PR, the
  round-trip test extended, and every consumer's existing tests
  untouched-green before the type styling opts in.
- **Component extraction.** Moving `CrossSection.jsx` and the section
  frame to `src/components/wells/section/` touches the Well Correlation
  e2e that reads geometry from data attributes. Keep the attributes,
  move by re-export shim first (the PT wave 1 pattern), delete the shim
  in the close-out.
- **One interval table for eight kinds.** The temptation is to add
  columns per kind. `properties` jsonb holds kind-specific fields;
  `code` and `label` are the only typed ones. Review refuses new columns
  that serve one kind.
- **Scheme drift.** If a component ever stores or compares an Exxon
  label the display option becomes a data option. The vocabulary guard
  test greps the source for Exxon labels outside `vocabulary.js`.
- **Storage quota.** Core photos are the first user images in the wells
  bucket. Cap at a stated size per image and per well in v1 (§11.2).

## 11. Open questions for sign-off

1. **Systems tracts and motifs as shared intervals** (§3.2 decision 6,
   recommended, so Mapping and Well Correlation can draw them) vs
   app-private jsonb in `strat_projects`. Confirm intervals.
2. **Core photos in v1.** Recommended: yes, capped at 5 MB per image and
   200 MB per well, in the existing wells bucket. Or defer photos to a
   later phase and ship core description only.
3. **Well Data Manager editing the new tops fields** (type, unit,
   confidence, age) on its tops tab, recommended for parity with the
   PT-series "full tops CRUD" decision, vs Stratigraphy Studio being the
   only editor.
4. **Basin launcher in ST3** (build Basin & Charge Modeling layers from
   the column) is a nice-to-have. Keep it in ST3 or drop it.
5. **Roadmap placement.** Add as Phase G9 in Geoscience-ROADMAP.md with
   the eleventh tile in §2, on sign-off.
