# Project Portability — Plan of Record (Petrolord Project Package)

Status: **APPROVED, owner sign-off 2026-09-02.** §4 decisions locked
as drafted with these answers to §8: (1) extension is **`.pld`**, not
`.plpkg`; (2) Geoscience first; (3) seismic travels as bricks in v1;
(4) **the backup door does NOT replace the offboarding zip**, the
`org-export` dump stays as it is and PP4 adds backup alongside it;
(5) imports private by default; (6) certificate wording reviewed as
part of PP5. PP0 started 2026-09-02. Waves run in order, one PR per
wave, staging-first for every migration, logged in MIGRATIONS.md.

Drivers (owner, 2026-09-02): **consultant-to-client handover, offline
archive and regulatory delivery, restorable backup.** Explicitly out of
scope: importing Petrel, Kingdom, Geographix or Techlog projects into
Petrolord. That is foreign-format ingestion and stays a separate
program.

## 1. What this is

Petrel, Kingdom and Techlog projects are file trees on disk stamped
with the version that wrote them. Copy the tree anywhere, and any
install at that version or newer opens it, migrating on the way in.
Petrolord is one multi-tenant cloud platform, so two of the three
things that model gives you already exist in a different form:

- **Collaboration** is org membership. Every registry object carries
  `user_id` (owner) and a nullable `organization_id`; stamping the org
  shares it read-only with members. No copy, no version skew between
  installs, because there is one install.
- **Version currency** is automatic. Everyone runs the same build.

What does not exist is the third thing: **a self-contained, portable
copy of a body of work that can leave the platform and come back**,
into a different organization, months later, on a newer build. Today
the only export of stored state is the offboarding dump
(`org-export`), which is one-way: no importer, no ID remapping, blobs
inventoried rather than packaged.

This program adds a **Petrolord Project Package**: a versioned zip
containing registry objects, the app state that references them, their
binary data, and open-format sidecars, plus an importer that opens it
in any organization on any build at or newer than the one that wrote
it. The Petrel compatibility rule, applied to rows instead of files.

## 2. Audit of what exists (survey 2026-09-02)

### 2.1 Where the data lives

| Layer | Tables | Scoping | Bulk data |
|---|---|---|---|
| Wells registry | `geo_wells`, `geo_wells_logs`, `geo_wells_tops`, `geo_wells_zones`, `geo_correlation_sections` | `geo_wells.user_id` + `organization_id`; children inherit via `well_id` | curves as f32 in bucket `wells` at `{user_id}/{well_id}/logs/{log_id}.f32`; surveys and checkshots as jsonb in the row |
| Surfaces, culture | `geo_surfaces`, `geo_culture` | `user_id` + `organization_id` | grids in bucket `surfaces`, features in bucket `culture` |
| CRS | `geoscience_settings` (per user) + `crs` text columns on registries | `user_id` unique, `organization_id` | jsonb |
| Seismic | `seismic_projects`, `seismic_volumes`, `seismic_horizons`, `seismic_faults`, `seismic_lines`, `seismic_line_picks`, `seismic_sessions`, `seismic_exported_surfaces` | mixed: volumes and lines carry `organization_id` + `project_id`; projects and sessions are owner-only | brick pyramids under a prefix in bucket `seismic` |
| Well planning | `wp_sites` → `wp_wellbores` → `wp_designs` → 12 `wp_*_runs` | `user_id` + `organization_id` throughout | jsonb |
| Economics, production ops, simulation | `epe_*` (11), `po_*`, `sim_cases`/`sim_runs` | org-scoped | decks in bucket `sim` |
| Richer app state | `petro_projects`, `pp_projects`, `rp_projects`, `rcp_prospects`, `facility_layouts`, `artificial_lift_designs`, `em_models` | owner-only; refer to wells by `well_ids uuid[]` | jsonb |
| Generic app state | **50 `saved_<app>_projects`** tables, one shape: `inputs_data`, `results_data` jsonb | `user_id` only, no org column | jsonb |

### 2.2 Version stamps

- **No table carries a schema version.** `engine_version text` exists
  on 13 tables, all well-planning (`wp_designs` + 12 run tables).
- **The SPA does not know its own build.** No `VITE_APP_VERSION`, no
  `define` block in vite.config.js; `package.json` version 4.0.0 is
  never read.
- Engines carry string constants (`PIPELINE_VERSION 'pp-1.0.0'`,
  `'gm-1.0.0'`, `'drilling-wd4'`, epe `'3.9.0'`, mbal `'1.0.0-phase1'`,
  15 in all) but only Petrophysics writes a version into saved state
  and migrates it on load (`layoutSchema.js migrateLayouts`, with a
  step-wise slot and built-ins refreshed from code). That is the
  pattern to generalise.

### 2.3 Export and import today

- `org-export` edge function: pg_catalog-driven RPCs
  (`export_table_catalog`, `export_fk_edges`, `export_dump_rows` with
  secret redaction, `export_count_rows`), a three-pass closure walk
  (org-scoped tables, user-scoped tables filtered to the org, FK
  descendant sweep), independent recount, manifest `export_version 1`,
  zip in memory with fflate. Blobs are inventoried and signed, never
  zipped; `culture` and `sim` buckets are not covered. **No importer.**
- `src/utils/savedProjects.js` has `exportProjectAsJSON` and
  `importProjectFromJSON`: a raw row dump validated only on `id` and
  `name`, used by Well Test, SCAL and DCA. No version, no remap.
- Open-format writers that already round-trip: LAS 2.0
  (`WellDataManager/engine/lasWrite.js`, `PetrophysicsStudio/services/
  petroExport.js`), XYZ / CPS-3 / ZMAP+ / Irap
  (`packages/engines/lib/gridding/surfaceExport.js`), CSV. There is no
  SEG-Y writer; volumes exist only as Petrolord brick pyramids after
  ingest.
- The deletion certificate path (`org-offboard`, pdf-lib, deterministic
  number, public verify page at `/legal/verify-deletion`) is the model
  for an export certificate.

### 2.4 Grouping

There is **deliberately no cross-app project entity**
(`20260820120000_geoscience_crs.sql`: "there is no project entity").
`shared_data_registry` and DataExchangeHub were dropped; cross-app
exchange is the typed registries. Wells are the hub everything else
hangs off.

## 3. Principles

1. **One package format, three doors.** Handover, archive and backup
   are the same zip with the same importer; they differ only in what
   goes in (a selection, or everything) and in the sidecars requested.
2. **Data, never code.** A package carries rows, blobs and a manifest.
   The importer validates against a JSON Schema and refuses anything
   else. Secrets are redacted on the way out as `org-export` already
   does.
3. **Import creates, never overwrites.** Opening a package is copying a
   Petrel project: everything gets new IDs, the importer becomes the
   owner, the target scope is chosen at import. Nothing existing is
   touched.
4. **The Petrel rule.** A package opens on any build at or newer than
   the one that wrote it. Older builds refuse with a plain message
   naming both versions. Migrations run step-wise on the way in.
5. **Readable without Petrolord.** Every package ships open-format
   sidecars (LAS, ZMAP, CSV, a README) so an archive or regulatory
   delivery stays useful if Petrolord is not there to open it.
6. **Provenance survives the boundary.** Original IDs, source
   organization, build and time travel with the package and are
   queryable after import.

## 4. Design decisions (proposed; owner sign-off locks these)

1. **Format: `<name>.pld`, a plain zip.**
   ```
   manifest.json          package_version, platform build, source, time,
                          scope, inventory, per-table schema_version,
                          sha256 of every file, signature (§4.7)
   README.txt             human summary + open-format inventory
   data/<table>.jsonl     one row per line, redacted like org-export
   blobs/<bucket>/<path>  f32 curves, grids, features, bricks, decks
   open/wells/<uwi>.las   LAS 2.0 per well (inputs + computed curves)
   open/wells/<uwi>-tops.csv, -zones.csv
   open/surfaces/<name>.zmap
   open/<app>/...         CSV summaries the app already exports
   ```
   Packages are ordinary files: they live wherever the user puts them,
   with no platform-side expiry. Sizes above a threshold (proposed
   2 GB) split into numbered parts with one manifest.

2. **Scope = a set of roots, closed over references.** There is no
   project entity and this plan does not add one. A package is built
   from roots the user picks (wells, surfaces, culture sets, seismic
   projects, well-planning sites, economics cases, saved app projects)
   plus everything they pull in: FK children via `export_fk_edges`, and
   **soft references** (uuid arrays and ids inside jsonb, such as
   `petro_projects.well_ids`, `geo_correlation_sections.well_ids`,
   `provenance.input_log_ids`, layout curve addresses, seismic session
   payloads) via a registered soft-reference table that the closure
   engine and the importer both use. "Everything I own" and
   "everything in my organization" are just the largest root sets. If
   a cross-app project entity is ever added, it becomes one more kind
   of root; nothing here blocks or requires it.

3. **Version discipline first, on every table.** One migration adds
   `schema_version int not null default 1` to every app-state table
   (the 50 `saved_*`, the richer app tables, registries) and
   `engine_version text` wherever results are stored. A shared
   `src/lib/stateVersion.js` provides `openState(kind, row)`: tolerant
   defaults, step-wise migrators registered per kind, and a
   refuse-if-newer check with a user-facing message. Every app loader
   is retrofitted to go through it. This is the part of the program
   that pays off even if no package is ever written.

4. **The platform knows its build.** vite `define` injects
   `__PLATFORM_BUILD__` = `{ version, sha, builtAt }` from
   package.json and git at build time. It is shown in every help
   guide footer and written into every package manifest and every
   saved row (`app_build`). Compatibility on import is decided on
   `package_version` and per-table `schema_version`, with the build
   recorded for diagnosis.

5. **Import remaps, rescopes and records.** A `package-import` edge
   function (service role, authorised against the target org through
   `is_org_member` and role) takes the parsed manifest and rows in
   batches under a `package_import_jobs` row: mints new UUIDs, rewrites
   FKs from the edge graph and soft refs from the registry, sets
   `user_id` to the importer and `organization_id` to the chosen
   target (private, or an org the importer administers), and writes
   the old-to-new map to `package_import_items`. Registry rows that
   have a `provenance` jsonb also get `provenance.imported_from`.
   Blobs upload from the browser straight to the importer's own storage
   paths before rows are committed, so a half-finished import leaves
   nothing dangling. Jobs are resumable.

6. **Export assembles in the browser, closes on the server.** A
   `package-export` edge function computes the closure, dumps and
   redacts rows, writes open-format sidecars for the small formats, and
   returns the manifest plus signed blob URLs. The browser streams
   blobs into the zip (fflate streaming to a File System Access handle,
   with a download fallback). This avoids the in-memory limit that
   caps `org-export` today and makes multi-GB seismic packages
   possible. The `org-export` offboarding dump is unchanged by this
   program (owner decision, §8.4); PP4 adds backup doors beside it.
   *PP1 note (2026-09-02): the Geoscience writer closes on the client
   under the caller's own session and uses jszip, the declared
   dependency; the server closure engine and any streaming-library swap
   are PP4/PP3 work. See STATUS, PP1 deviations.*

7. **Integrity and origin.** Every file has a sha256 in the manifest,
   and the manifest carries an HMAC signature from a platform key, so
   the importer can tell a package Petrolord wrote from one that was
   edited. Editing is not forbidden, it is reported. For regulatory
   delivery PP5 adds a **Certificate of Export** (pdf-lib, deterministic
   number `PLD-EX-<year>-<id8>`, public verify page) alongside the
   existing deletion certificate.

8. **Seismic volumes travel as bricks in v1.** There is no SEG-Y writer,
   and regulatory deliveries of seismic carry the original SEG-Y
   anyway. Packages include the brick pyramid (Petrolord-native,
   re-importable) and the scan metadata; a SEG-Y writer is an open
   item, not a blocker.

## 5. What is deliberately not in this program

- A cross-app project entity (see §4.2). Revisit only if a concrete
  workflow needs it.
- Importing Petrel, Kingdom, Geographix or Techlog project files.
- In-place restore that overwrites existing rows. Restore into an
  empty or new organization is the supported path; a merge-restore is
  a v2 question.
- Duplicate detection on import (same UWI plus identical curve hashes
  already present). v1 warns by UWI and name only; hash-based skip is
  v2.
- Any change to how collaboration works inside the platform. Org
  membership stays the sharing mechanism; packages are for crossing
  boundaries.

## 6. Waves

Each wave is one PR (plus an engines PR where noted), oracle-style
acceptance gate, STATUS update at close. Order matters: PP0 and PP1
are prerequisites for everything after.

| Wave | Deliverable | Acceptance gate |
|---|---|---|
| **PP0 Version foundations** | `__PLATFORM_BUILD__` define + footer display; migration adding `schema_version` (and `engine_version` where results live) to every app-state table; `src/lib/stateVersion.js` with migrator registry and refuse-if-newer; all loaders retrofitted (the 50 `saved_*` go through `savedProjects.js`, so that is one change; Petrophysics `migrateLayouts` becomes the first registered migrator) | Jest: a synthetic row at version N+1 is refused with the named message; a version 0 row (no column) opens with defaults; every app-state table in the live catalog has the column (gate query against staging) |
| **PP1 Package writer, Geoscience** | Manifest JSON Schema in `test-data/portability/`; soft-reference registry; `package-export` fn (closure + dump + small sidecars + signed URLs); browser streaming zip; roots = wells, surfaces, culture, petro/pp/rp projects, correlation sections; LAS/ZMAP/CSV sidecars | Round trip on the Petrophysics analytic type well: package → unzip → LAS sidecar parses to byte-identical curves; manifest validates; a dangling-reference detector finds zero uuids in dumped jsonb that are not in the package |
| **PP2 Importer** | `package_import_jobs` / `_items` tables; `package-import` fn (remap, rescope, soft-ref rewrite, batches, resume); import UI (choose target scope, review inventory, warnings); refuse-if-newer end to end | Staging E2E: export from org A, import to org B; Petrophysics zone summaries on the imported well equal the oracle numbers (SAND A 18.0 m, SAND B 2.5 m); import twice gives two independent copies; a manifest edited to a higher `package_version` is refused; a tampered file is reported by hash |
| **PP3 Coverage** (split 2026-09-02 into PP3a core families, PP3b well planning, PP3c Seismolord; see STATUS) | Seismolord (projects, volumes as bricks, horizons, faults, lines, picks, sessions), well planning `wp_*` hierarchy, `epe_*`, `po_*`, `sim_cases` decks, all 50 `saved_*`; add `culture` and `sim` to the pointer tables (fixes the same gap in `org-export`) | Per family: export → import → the app opens the copy and a recorded golden (existing harness fixtures) reproduces; Seismolord opens the imported volume and a horizon renders |
| **PP4 Restorable backup** | "Back up my organization" and "Back up my work" doors on the Data Export page using the same writer with the largest root sets; multi-part packages; the offboarding dump stays untouched; restore = import into a new or empty org by an admin | Staging: export a disposable org, purge it with the existing offboarding path, restore into a fresh org, manifest counts match the restored counts table by table, blobs byte-identical |
| **PP5 Regulatory delivery** | Manifest HMAC signature; Certificate of Export PDF + public verify page (`/legal/verify-export`); README wording for regulators; per-package inventory page in-app | Certificate round trip and verify page; legal review of certificate wording (owner); a signed package altered after export is flagged on import |

Estimated size: roughly 12 to 15 Suite PRs and 2 to 3 engines PRs
(LAS/ZMAP sidecar helpers, the soft-reference scanner). PP0 alone
touches every app's loader and should land early, independent of the
rest.

## 7. Risks and how the gates cover them

- **Soft references hidden in jsonb.** The single biggest correctness
  risk: an id inside a layout, a session payload or a provenance block
  that the closure does not know about points at nothing after import.
  Mitigation: the dangling-reference detector in PP1 scans every dumped
  jsonb for uuid-shaped strings and fails the gate if any is outside
  the package. Runs on every fixture in PP3.
- **Package size.** Seismic pyramids reach many GB. Mitigation: browser
  streaming assembly (§4.6), multi-part packages (§4.1), bricks only
  at the resolution levels selected by the user.
- **Partial imports.** Mitigation: blobs first to the importer's own
  paths, rows last in batches under a job row; resume from the job;
  nothing references a blob until its row commits.
- **RLS and authorisation.** The import function writes as service
  role. Mitigation: it checks `is_org_member` and admin role on the
  target org before any write, and only ever writes `user_id` =
  caller. The export function only dumps rows the caller can already
  read (reuse `org-export`'s filters).
- **Silent version drift.** Mitigation is PP0 itself: no state is
  opened without going through `openState`.
- **Shared-table changes.** `geo_wells*`, `geo_surfaces` and the
  seismic tables are shared registries. The PP0 `schema_version`
  column and the PP2 provenance stamp touch them; both need a second
  engineer's review per the database conventions, and both are
  additive with defaults.

## 8. Open questions for the owner (RESOLVED 2026-09-02, see Status)

1. Name and extension. **Petrolord Project Package, `.pld`.**
2. Coverage order. **Geoscience first.** Proposed Geoscience first (PP1/PP2 on wells,
   surfaces, culture, Petrophysics) because wells are the hub and the
   oracle-verified type well is the ready-made acceptance case. The
   alternative is generic `saved_*` first, which is trivial but proves
   nothing hard.
3. Seismic in v1 as bricks only (§4.8), or hold seismic until a SEG-Y
   writer exists? **Bricks in v1.**
4. Should the backup door replace the `org-export` zip outright, or
   should offboarding keep its own dump? **Offboarding keeps its own
   dump; PP4 adds backup beside it.**
5. Should packages carry the importer's org scope choice as a hard
   default (private unless changed), or default to the target org?
   Proposed: private by default; sharing is a second, explicit step, as
   it is today for imported LAS files. **Approved as proposed.**
6. Certificate of Export wording and whether legal wants it reviewed
   before PP5 or as part of it. **As part of PP5.**

## 9. References

- `docs/scope/OrgDataExport-STATUS.md`: the exporter this reuses.
- `docs/scope/WellDataManager-PLAN.md`: the brick rule and LAS
  round-trip gate that PP1 inherits.
- `docs/scope/PetrophysicsStudio-ROADMAP.md`: interpretations and the
  `migrateLayouts` pattern that PP0 generalises.
- `supabase/migrations/20260805130000_org_export.sql`: catalog and FK
  edge RPCs.
- `supabase/migrations/20260713270000_drop_shared_data_registry.sql`:
  why there is no generic hub.
