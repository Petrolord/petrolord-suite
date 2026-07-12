# Well Data Manager — Phase G1 Plan

Status: **APPROVED AS DRAFTED — owner sign-off 2026-07-12.** All three
open questions confirmed: (1) v1 sharing is org read-only, writes
owner-only; (2) tops normalize into `wells_tops`; (3) `seismic_wells`
gets a compatibility view during G1.4 and a hard drop at G1.5.
Roadmap slot: Geoscience-ROADMAP.md **Phase G1 — the keystone**: the
shared subsurface well registry every geoscience app reads. App name
**Well Data Manager**, slug `well-data-manager` (locked, roadmap §6.2).

## What this is

One cross-app registry of well data — headers, deviation surveys, LAS
logs, tops, checkshots — owned by users, shareable with their
organization, consumed by Seismolord today and by Petrophysics Studio
(G2), Well Correlation (G3), Mapping (G4) and the Drilling MEM rebuild
tomorrow. After G1 there are no app-private well tables in the suite.

## Design decisions (proposed — owner sign-off locks these)

1. **Schema shape: proven jsonb core + normalized tops + blob logs.**
   - `wells` — header (name, uwi, surface X/Y, kb_m, td_md_m, crs_note,
     units recorded explicitly) + `deviation` and `checkshots` stay
     **compact jsonb** on the well row, byte-compatible with the proven
     `seismic_wells` shapes (a deviation survey is a few KB, always
     consumed whole — the fault-sticks precedent).
   - `wells_tops` — **normalized table** (well_id FK, name, md_m,
     interpreter, updated_at). Deviation from the roadmap's sketch, on
     purpose: Well Correlation (G3) picks and propagates tops *across*
     wells ("every 'Top Dome' in the project"), which jsonb makes
     awkward; per-top rows also carry provenance.
   - `wells_logs` — metadata rows (well_id FK, name/mnemonic, unit,
     start/stop/step MD, null stats, source file info); curve samples as
     **float32 objects** in a new private `wells` Storage bucket under
     `{user_id}/{well_id}/logs/{log_id}.f32` (never large jsonb — the
     Seismolord brick rule).
2. **Ownership + org sharing (roadmap §6.1, locked)**: every row carries
   `user_id` + nullable `organization_id`; private by default; "Share
   with organization" stamps the org id on the WELL (children inherit via
   the well row). RLS calls the new `is_org_member(org uuid)` SECURITY
   DEFINER helper, which encapsulates the three existing membership
   tables (`organization_users`, `organization_members` w/ status check,
   `org_members`). **v1 sharing is read-only for org members; writes stay
   owner-only** (multi-user editing is later collaboration scope).
   Storage read policy for shared logs resolves the owning well from the
   object path and applies the same rule.
3. **Units & CRS from day one**: internal storage is SI (metres, ms);
   LAS `ft` curves and `ft` depth columns convert on import (factor
   recorded in provenance); every well records `crs_note` (free text +
   EPSG when known) — no silent assumptions (the SEG-Y lesson).
4. **LAS engine, validation-first**: `engine/lasParse.js` (plain JS +
   JSDoc, runs in a Web Worker) supporting LAS 1.2/2.0 including wrapped
   mode, `-999.25`-family nulls, and real-world header quirks. A Python
   **lasio oracle** (`tools/validation/wells/`) generates committed
   goldens in `test-data/wells/`; jest asserts bit-level curve equality.
   Malformed-file fuzz suite (the wellImportFuzz pattern: plain
   row-numbered domain errors). LAS 3.0 is read-rejected with a clear
   message (out of v1 scope).
5. **Seismolord migrates onto the registry, shape-preserving**: a data
   migration copies `seismic_wells` rows into `wells` (+ tops into
   `wells_tops`); Seismolord's `useWells` re-points to the new service
   returning the exact `visible` shape its viewers consume (paths, tops,
   checkshots — zero viewer changes). `seismic_wells` becomes a
   compatibility VIEW for one phase, dropped at G1 close-out after the
   Seismolord e2e + a live smoke pass.
6. **App UI: workstation-lite** on the Seismolord workspace idioms —
   left wells tree (search, org/private badges, share toggle), center
   tabs (well map from surface coordinates; well detail: header /
   deviation / logs / tops / checkshots; log quick-view tracks), import
   dialogs (reuse the WellImport column-mapping components + new LAS
   wizard with curve-mnemonic mapping and unit preview). White chartTheme
   for any analytic charts; log tracks are canvas.
7. **Catalog**: new `master_apps` row (Geoscience, `well-data-manager`),
   flipped Active only when the app + Seismolord migration both work
   (the deploy lesson: tile and route ship together).

## Schema sketch (migration `wells_*`, staging-first, second-engineer review — shared tables)

```
is_org_member(org uuid) returns boolean
  security definer, stable — true when auth.uid() appears in ANY of the
  three membership tables for org (status-filtered where the table has
  a status column). THE only place RLS asks this question.

wells:        id, user_id, organization_id null, name, uwi, surface_x,
              surface_y, kb_m, td_md_m, crs_note, units_note,
              deviation jsonb, checkshots jsonb, created_at, updated_at
wells_tops:   id, well_id FK cascade, name, md_m, interpreter,
              created_at, updated_at
wells_logs:   id, well_id FK cascade, mnemonic, description, unit,
              start_md_m, stop_md_m, step_m null (null = irregular,
              depth vector stored alongside), n_samples, null_count,
              source_file, storage_path, created_at

RLS (all three tables): select = owner OR (organization_id set AND
is_org_member(organization_id)) resolved through the well row for
children; insert/update/delete = owner only.
Storage `wells` bucket: owner-path write; read = owner OR shared-well
member (path-join policy).
```

## Phases

- **G1.0 — Oracle + goldens** *(small)*: lasio oracle + committed LAS
  fixtures (unwrapped, wrapped, ft-unit, irregular step, null-heavy,
  header-quirk cases) + expected-output JSON/f32 goldens.
  Accept: fixtures regenerate byte-identical; documented in
  test-data/wells/README.
- **G1.1 — Schema + helper + pentest** *(small-medium)*: migration
  (tables above + `is_org_member` + `wells` bucket + storage policies),
  MIGRATIONS.md, **live RLS pentest** extended to cover: owner isolation,
  org-shared read, non-member denial, child-table inheritance, storage
  path probes — rollback-wrapped, all green before any UI.
- **G1.2 — LAS engine + services** *(medium)*: `engine/lasParse.js` (+
  worker), `services/wellsService.js` (registry CRUD + share/unshare +
  curve blob up/download), import pipeline (parse → map mnemonics →
  convert units → store). Accept: jest goldens bit-exact vs lasio; fuzz
  suite green; a 50 MB LAS parses in the worker without blocking the UI.
- **G1.3 — App UI** *(medium)*: workstation-lite shell, wells tree, map,
  well detail tabs, LAS + manual import dialogs, share toggle, delete
  with dependent-data warning. Playwright harness
  `/dev/well-data-manager` + e2e smoke. Accept: full import→view→share
  flow drivable in the harness without auth.
- **G1.4 — Seismolord migration** *(small-medium)*: data migration
  `seismic_wells` → registry (+ compatibility view), Seismolord
  `useWells`/import dialogs re-pointed, well-tie gating re-verified.
  Accept: all Seismolord jest + e2e suites green untouched; a well
  imported in Well Data Manager appears in Seismolord sections/map/3D
  with zero re-import; goldens (KETA wells) land at identical IL/XL.
- **G1.5 — Close-out** *(small)*: drop the compatibility view +
  `seismic_wells`, catalog tile Active, STATUS doc, roadmap tick.

Estimated overall: comparable to Seismolord's wells plan W0–W4 (one
focused build cycle), G1.2/G1.3 the largest pieces.

## Risks

- **Shared-table blast radius**: `wells_*` becomes load-bearing for five
  apps → second-engineer review on the schema migration, pentest before
  UI, compatibility view during the Seismolord cutover.
- **LAS reality** (mixed delimiters, broken headers, wrapped 80-col
  data): oracle + fuzz first (G1.0) before the engine, same as SEG-Y.
- **Membership-table drift** until the G5 consolidation: `is_org_member`
  is the single choke point; the pentest asserts each table path.
- **Storage egress** on big log sets: curves are per-log objects fetched
  on demand (not per-well bundles) — revisit only if profiling says so.

## Open questions for sign-off

1. **v1 sharing = org read-only** (writes owner-only) — confirm, or do
   you want org-wide editing in v1?
2. **Tops normalization** (`wells_tops` table instead of jsonb) — confirm
   the deviation from the roadmap sketch, per the G3 rationale above.
3. **`seismic_wells` retirement**: compatibility view during G1.4, hard
   drop at G1.5 — confirm, or keep the view longer?
