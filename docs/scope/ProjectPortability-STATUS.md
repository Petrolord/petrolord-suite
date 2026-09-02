# Project Portability — STATUS

Plan of record: `ProjectPortability-PLAN.md` (approved 2026-09-02; `.pld`
packages, Geoscience first, seismic as bricks in v1, offboarding dump
kept, imports private by default, certificate wording in PP5).

## Wave status

| Wave | Status | Landed |
|---|---|---|
| PP0 Version foundations | **BUILT 2026-09-02**, app-state migration **APPLIED LIVE** same day, gate passed | PR #352 (feat/portability-pp0) |
| PP1 Package writer, Geoscience | **BUILT 2026-09-02**, gate passed | PR (feat/portability-pp1) |
| PP2 Importer | **BUILT 2026-09-02**, gate passed; jobs migration awaiting owner apply | PR (feat/portability-pp2) |
| PP3 Coverage | not started | |
| PP4 Restorable backup | not started | |
| PP5 Regulatory delivery | not started | |

## PP0 (2026-09-02)

What shipped:

- **Platform build stamp.** `vite.config.js` injects `__PLATFORM_BUILD__`
  = `{ version, sha, builtAt, source }`. Sha source order: `VITE_BUILD_SHA`
  env, `git rev-parse`, a hand-read `.git/HEAD` (the staging container has
  no git binary), then `build-info.json` at the repo root (the Hostinger
  build runs from a source zip with no `.git`; the zip-cut step now writes
  this file, see the deploy procedure). Read through
  `src/lib/platformBuild.js` (`PLATFORM_BUILD`, `buildLabel()`); under
  jest it falls back to `dev`/`unknown`. Shown in the footer of every
  help guide (`HelpGuideShell`).
- **`src/lib/stateVersion.js`.** `registerStateKind(kind, { current,
  migrations, label })`, `openState` / `openStateRow` (step-wise
  migration up; refuses rows stamped above `current` with a message
  naming both versions), `stampState` / `writeStamped` (adds
  `schema_version` + `app_build`; retries once without the stamp on
  PostgREST 42703 / PGRST204 so code can land before the migration).
  Rows with no `schema_version` are version 1 by definition.
- **Migration `20260902120000_pp0_state_versions.sql`** adds
  `schema_version integer not null default 1`, `app_build text`,
  `engine_version text` to 86 app-state tables (IF NOT EXISTS, fast
  defaults). Rollback-wrapped dry run on the linked project: 84 columns
  added (two listed tables are absent in the live schema), clean.
  The session's own apply was blocked by the permission classifier; the
  **owner applied it 2026-09-02** with `supabase db query --linked -f`.
  Live gate the same day: 84 tables carry `schema_version` and
  `app_build`, 0 present tables missing the column; `saved_waterflood_projects`
  and `wp_ac_cases` are the two listed names absent from the live schema.
  (Had the order been reversed, every writer saves without the stamp and
  every reader treats rows as version 1, so nothing breaks either way.)
- **Migration `20260902120500_pp0_registry_state_versions.sql`** (shared
  registries) is **HELD** for the second-engineer review.
- **Loaders retrofitted** through the helper: the `savedProjects.js`
  factory (all 50 `saved_<app>_projects` tables; services may pass
  `schemaVersion` + `migrations`), Petrophysics `petro_projects`, and
  the richer loaders listed in the PR (pore pressure, rock physics,
  earth models, seismic sessions and projects, correlation sections,
  ReservoirCalc prospects, facility layouts, artificial lift designs,
  simulation cases, economics cases, well designs).

Gates (PLAN §6, PP0 row):

- Jest: version N+1 refused with the named message; a row without the
  column opens as version 1 with defaults; migrations run step-wise;
  stamp carries the build; retry-without-stamp path. `src/lib/__tests__/
  stateVersion.test.js`, `src/utils/__tests__/savedProjects.test.js`.
- Live catalog gate (every listed table has `schema_version`) runs after
  the owner applies the migration: `select count(*) from
  information_schema.columns where column_name='schema_version'` should
  read 84 for the app-state half.

Not in PP0, by design: `wp_*` case and run tables beyond `wp_designs`
(they already carry `engine_version`; `schema_version` was added by the
migration but their loaders stay untouched until PP3 packages them),
`epe_*` result tables written by edge functions, `sim_runs`.

## PP1 (2026-09-02)

What shipped, all under `src/lib/portability/`:

- **Manifest** (`manifest.js`, schema of record
  `test-data/portability/manifest.schema.json`): `buildManifest`,
  `validateManifest` (hand-written validator kept in step with the schema
  by a test), `packageVersionCheck` (the Petrel rule at package level).
  Format `pld`, `package_version 1`, per-table `schema_version` range,
  every file with size and sha256, `signature: null` until PP5.
- **Spec** (`geoscienceSpec.js`): the soft-reference registry for
  `geo_wells`, `geo_wells_logs`, `geo_wells_tops`, `geo_wells_zones`,
  `geo_surfaces`, `geo_culture`, the synthetic `geoscience_custom_crs`
  (custom CRS definitions lifted out of `geoscience_settings`),
  `petro_projects`, `pp_projects`, `rp_projects`,
  `geo_correlation_sections`. Each reference is marked optional or not;
  optional ones (a log's parent interpretation, a surface's isochore
  parents, a pore-pressure project's seismic volume) may be nulled by the
  importer, all others must resolve inside the package.
- **Collector** (`collect.js`): roots are wells, surfaces, culture sets,
  petro/pp/rp projects and correlation sections. Wells bring logs (with
  float32 curves), tops and zones. Project and section roots bring all
  their wells. With `includeInterpretations` the caller's own
  interpretations that refer only to packaged wells come along; one that
  also refers to a well outside the selection is left out and named in
  the notes, never pulled in silently.
- **Sidecars** (`sidecars.js`): LAS 2.0 per well through the Suite's
  round-trip-gated `writeLas` (depth log first; a well with no DEPT/DEPTH/MD
  gets a note instead), tops and zones CSV, ZMAP+ per surface through
  `writeZMAP` (rotation is not representable in ZMAP+ and is noted),
  README.txt.
- **Writer** (`zipWriter.js`): `PackageWriter` on jszip (the declared
  dependency; see deviation 1 below), sha256 per file, float32 stored
  uncompressed, `savePackage` streams to a File System Access handle when
  the browser offers one and falls back to a download.
- **Detector** (`danglingRefs.js`): every uuid-shaped string in every
  dumped row is classified internal, scope, allowed, external or dangling.
  `buildGeosciencePackage` refuses to write a package with a dangling
  reference and names the first one.
- **Source** (`supabaseSource.js`): the registry under the caller's own
  session, so row-level security decides what can be packaged.
- **Doors**: Well Data Manager toolbar (Export package) and the
  Petrophysics Export dialog (Project package), both opening the shared
  `PackageExportDialog`.

Gate (PLAN §6, PP1 row) in `__tests__/geosciencePackage.test.js` on the
Petrophysics analytic type well plus a computed VSH curve, a custom CRS,
two interpretations and a correlation section:

- LAS sidecar parses back to byte-identical float32 curves (all 7 curves,
  nulls included); float32 blobs byte-identical.
- Manifest validates; every listed file present with matching sha256.
- Zero dangling references; the one external reference is the optional
  isochore parent.
- The interpretation spanning a second well is left out and named; the
  one inside travels. A project root pulls both wells and downloads each
  curve exactly once.
- ZMAP sidecar round-trips through `parseSurfaceFile` with nulls.

Two scoped deviations from the PLAN text, recorded here for the owner:

1. **jszip, not fflate.** PLAN §4.6 named fflate. jszip is the Suite's
   declared zip dependency and node_modules is tracked, so adding fflate
   would mean committing dependency changes. jszip's streaming generator
   feeds the File System Access sink; `PackageWriter` is the seam to swap
   the library when PP3 seismic packages need it.
2. **PP1 closes on the client, not on a `package-export` edge function.**
   The Geoscience root set is a small typed graph; walking it under the
   caller's own session inherits row-level security instead of
   re-implementing it in a service-role function. The server-side closure
   engine over the org-export catalog RPCs is still the right tool for the
   largest root sets and arrives with PP4.

## PP2 (2026-09-02)

What shipped:

- **`importPackage.js`**, three phases that each fail without touching the
  importer's data:
  - `readPackage`: unzip, parse and validate the manifest, the Petrel rule
    on `package_version` and on every table's `schema_version.max` against
    what this build reads (`readsUpTo`: the registered state kind's
    `current`, or 1 for registry tables), then size and sha256 of every
    listed file. Unlisted files, missing files, wrong sizes and wrong
    hashes are all refused with a message naming the file.
  - `planImport`: a new uuid for every row; parent FKs and every soft
    reference in the spec rewritten (required ones must map, optional ones
    are nulled or dropped when unmapped); rows rescoped to the importer
    (private by default, or the importer's organization); blob paths
    rewritten under the importer's storage prefix; `provenance.imported_from`
    stamped with the package id, source user and organization, export
    time and build, and the original id; older app-state rows migrated up
    through `openStateRow`; app-state rows version-stamped; registry rows
    stripped of the PP0 columns because that migration is still HELD.
    Duplicate wells (same UWI or name) produce a warning, never a merge.
  - `executeImport`: job row (best effort), custom CRS definitions merged
    into the importer's settings under their original ids, **blobs first**
    to the importer's own paths, then rows in dependency order in batches
    of 200 with the id ledger written as it goes. A failure marks the job
    failed, cleans up orphaned blobs from that run, and the error carries
    the job id; a resume by job id skips every item already written.
- **`supabaseSink.js`**: the registry as the sink, under the caller's own
  session (storage RLS proves tenancy by the uid prefix; row RLS decides
  what the caller may create). `listJobs` feeds the import history.
- **Migration `20260902130000_pld_import_jobs.sql`**: `pld_import_jobs` and
  `pld_import_items`, owner-scoped RLS. Dry run clean; apply pending
  owner. Named `pld_*` for the product-prefix convention (the PLAN text
  said `package_import_*`).
- **Door**: Well Data Manager toolbar (Import package) opening
  `PackageImportDialog`: pick, review (integrity line, tables, warnings,
  notes, scope choice), run, done, with retry-by-job on failure and an
  import history list.

Gate (PLAN §6, PP2 row) in `__tests__/importPackage.test.js`, run
in-process against an in-memory registry standing in for a second user:

- Export from user A, import to user B: every id new, no package id
  survives outside `provenance.imported_from`, owner and scope rewritten,
  blobs byte-identical under B's prefix at the paths the rows point to,
  uploaded before any row is inserted.
- **Petrophysics on the imported curves reproduces the oracle zone
  summary** (SAND A net 18.0 m, gross 20.5 m, NTG 0.878 from
  goldens.json; averages to single precision because curves are float32).
- Importing twice gives two independent copies.
- Refusals, nothing written: manifest edited to `package_version 2` (names
  both versions), tampered data file and tampered binary of identical
  size (refused by hash), unlisted file, missing listed file, table
  `schema_version` above what the build reads, not a zip, no manifest,
  required reference the package cannot resolve, share-with-org without
  an organization.
- Resume: a simulated failure mid-way leaves a failed job; resuming by job
  id skips the 8 rows already written and finishes. Without the job tables
  the import completes and says resume is unavailable.

The staging half of the gate (export from org A, import to org B, open the
copy in Petrophysics Studio and read the SAND A card) is an owner step
after the jobs migration is applied.

## Program gotcha: one database, two builds

Staging (the dev worktree served by HMR) and production (petrolord.com)
share one Supabase project. A `current` bump on any state kind in the
worktree stamps rows that the production build cannot open until the
next Hostinger upload, and readers that map a list (sessions, seismic
projects, earth models, prospects) refuse the whole list on one such
row. Rule: **bump a kind's `current` only in the PR that also ships to
production in the same upload**, never on a long-lived branch, and add
the migrator in the same change.

## Open items

- Second engineer reviews `20260902120500` (registries), then apply.
- Owner applies `20260902130000` (import jobs), then flips its MIGRATIONS.md row.
- Deploy procedure: write `build-info.json` `{ "sha": "<full sha>" }` at
  the clean-checkout root before zipping (untracked, gitignored) so the
  Hostinger build stamps the real sha.
