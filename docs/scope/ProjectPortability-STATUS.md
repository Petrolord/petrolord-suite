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
| PP3 Coverage | **PP3a BUILT** (PR #355), **PP3b BUILT** (PR #356), **PP3c Seismolord BUILT 2026-09-02** | PRs feat/portability-pp3, -pp3b, -pp3c |
| PP4 Restorable backup | **BUILT 2026-09-02** (client-side, beside the offboarding dump) | PR (feat/portability-pp4) |
| PP5 Regulatory delivery | **BUILT 2026-09-02**; needs key generation, secrets, function deploy and the ledger migration (owner) | PR (feat/portability-pp5) |

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

## PP3 (split into three PRs)

PP3a (2026-09-02, this PR): the engine generalised and four families added.
PP3b: well planning (`wp_*`, 34 tables, prefixed `wp:`/`geo:` ids in
anti-collision runs, cross-case FKs). PP3c: Seismolord (brick prefixes,
horizon and line objects, session payload references, member horizons
stored under a non-owner prefix). Each has its own gate.

### PP3a

- **Family registry** (`familySpec.js`): tables, roots, insertion order and
  optional hooks per family; the collector, exporter, importer and manifest
  are generic over it. Geoscience is registered first with its PP1 rules
  moved into `geoscienceHooks.js` (interpretations that refer only to
  packaged wells; custom CRS lifting; LAS/ZMAP/CSV sidecars). Adding a
  family is a spec, never a code path.
- **Blob forms**: one object per row (`pathColumn` + `newPath`) or many
  objects under a prefix (`prefixOf` + `newPrefix` + `pathColumns` to
  rewrite columns that name a file inside the prefix). The production
  source lists prefixes recursively through storage `list`.
- **Wildcard roots**: a root kind may map to `*` and name its table
  (`saved_project` with `table: 'saved_choke_projects'`); the manifest root
  gains an optional `table` field (schema updated).
- **Families added** (`familiesCore.js`):
  - `apps`: the 50 `saved_<app>_projects` tables, one shape. The payload's
    own `inputs_data.id` follows the new row id (found by the gate: a copy
    would otherwise point at its old self). The production spine links some
    contexts persist (`inputs.link.fieldId` / `wellId`, plus the legacy flat
    and surveillance forms) are rewritten when the field travels and cleared
    when it does not.
  - `production`: `po_fields` root with wells, models, tests, deferments,
    allocation factors, daily production and field totals. `po_wells.geo_well_id`
    is cleared when the registry well is not in the package.
  - `economics`: `epe_cases` root with configs, volumes, capex, opex, runs,
    Monte Carlo runs, results, sensitivity runs and results; `run_config_id`
    and `base_run_config_id` re-linked. `epe_assumption_sets` as its own root.
    Results travel as data; the edge functions are not involved in an import.
  - `simulation`: `sim_cases` root with every deck object under
    `{uid}/{caseId}/deck/`; `deck_path` follows the new folder. `sim_runs`
    are worker-owned results and never travel.
- **Geoscience gaps from the survey** closed in the spec: `geo_surfaces.
  provenance.volume.id` / `horizon.id` and `geo_wells.checkshots_derived.
  provenance.volume_id` are declared optional references into Seismolord.
- **Importer**: a kind the importing page never registered (its app is not
  loaded) opens as stored and keeps its own `schema_version`; the Petrel
  rule still applies through the manifest's per-table maximum.
- **Offboarding dump** (`org-export/helpers.js`): pointer tables gain
  `geo_culture` (object), `seismic_lines` (prefix), `seismic_line_picks`
  (object) and `sim_cases` (new kind `dir`: the folder around `deck_path`);
  `EXPORT_BUCKETS` gains `culture` and `sim`. This fixes the gap the PP1
  survey found; the function needs a redeploy to pick it up.
- **Door**: the export dialog gains pickers for production fields,
  economics cases, simulation cases and saved projects by app.

Gate (`__tests__/familiesCore.test.js`), in-process across two users:
field hierarchy rewritten and rescoped with the geo link cleared; saved
project payload intact with its link following the imported field and
well, and cleared when exported alone; economics run chain re-linked
including sensitivity results; every deck object lands in the importer's
folder with `deck_path` following; no source id survives in any written
row. The PP1 and PP2 gates run unchanged on the generalised engine.

Not in PP3a: `wp_*` and `seismic_*` (PP3b/PP3c); `sim_runs`; the
`epe_*` edge-function re-run of imported cases (the copy carries its
results as history).

### PP3b (well planning)

- **Family `wellplanning`** (`familiesWellPlanning.js`), 30 tables: 8 core
  (`wp_sites`, `wp_targets`, `wp_wellbores`, `wp_wellbore_geometry`,
  `wp_surveys`, `wp_designs`, `wp_survey_programs`, `wp_ac_runs`) plus
  eleven studio case/run pairs (ct, cd, ps, st, wi, wct, td, hyd, wc, cmt,
  gm). The survey's count of 34 included `wp_ac_cases`, which does not
  exist. Root kind `wp_site`: a site travels with its whole tree. Only
  `wp_sites` carries `organization_id`; no storage blobs anywhere.
- **References**: `wp_designs.target_ids` (required, targets are site
  children), `published_geo_well_id` and `wp_wellbores.geo_well_id`
  (optional, cleared when the registry well is absent), self links on
  targets and wellbores, `design_id` on every case and run (optional),
  cross-case links `cd.ct_case_id`, `ps.ct/cd_case_id`, `st.ps_case_id`,
  `wi.ct/cd_case_id`, `wct.ct_case_id` (optional; insertion order puts ct
  before cd before ps before st, wi and wct after), `wp_gm_cases.source.
  geoWellId` and `wp_ct_cases.environment.ppfg.geoWellId` (optional).
- **Prefixed ids** in anti-collision runs (`offsets`, `results`, `summary`
  carry `wp:<wellbore id>` and `geo:<well id>`): the importer's `any`
  form now rewrites known uuids as substrings, so `wp:` offsets follow the
  new wellbore ids and unknown `geo:` offsets stay named for the app to
  treat as unavailable.
- **Stamped**: sites, targets, wellbores, designs, survey programs and the
  eleven case tables (PP0 columns exist); runs carry `engine_version` only.
- **Door**: the export dialog gains a Well planning sites picker.

Gate (`__tests__/familiesWellPlanning.test.js`): a site with two targets
(one parented), two wellbores (one sidetrack), geometry, a survey, a
definitive design with a program, an anti-collision run with a `wp:` and a
`geo:` offset, and a ct/cd/ps case chain with a ct run. After import every
level is re-parented and rescoped, target ids and cross-case links
re-linked, `wp:` offsets follow, `geo:` stays named, registry links
cleared, stamped tables stamped, runs not, and no source id survives
outside named external references and provenance.

Not in PP3b: a wellbore-level root (a wellbore alone would lose its
site's targets, so the site is the unit); re-running studio engines on
import (runs travel as history).

### PP3c (Seismolord)

- **Family `seismic`** (`familiesSeismic.js`): `seismic_projects` (root)
  with volumes and 2D lines under it; `seismic_volumes` (root) with
  horizons, faults and exported surfaces; `seismic_lines` (root) with
  picks; `seismic_sessions` through a hook. `seismic_wells` is dropped
  and not packaged.
- **Bucket layout handled by two engine additions**: `prefixExclude` on a
  prefix blob (a volume's `horizons/` and a line's `picks/` objects belong
  to child rows and travel with them, so they are not doubled under the
  old ids), and `companions` on an object blob (a horizon's `.conf.f32`
  confidence grid is derived from its path and follows the horizon's new
  path). Volumes land under `{importer}/{newVolumeId}` with bricks and
  manifest; horizons under `.../horizons/{newId}.f32`; exported surfaces
  under `{importer}/exports/{newId}.xyz`; lines under `{importer}/{newLineId}`
  with picks under `picks/`.
- **Member horizons** on a shared volume live under the member's own
  prefix in the source; the row's exact `storage_path` carries them and
  the importer places them under the importer's volume folder. Storage
  path columns are now exempt from the dangling-reference check, since the
  uids they embed are owner prefixes the importer rewrites, not references
  (found by the gate).
- **Sessions and bookmarks** come along when their `payload.volume_id`
  is packaged (required reference); `visibleIds`, `visibleFaultIds` and
  `visibleSurfaceIds` follow when mapped and are dropped when not. A
  bookmark for a volume outside the package stays behind.
- **Optional references**: `project_id`, `parent_volume_id` (attribute
  volumes), `parent_version_id` (horizon and fault versions),
  `horizon_id` and provenance ids on exported surfaces.
- **Stamped**: `seismic_projects`, `seismic_sessions`. Registry tables
  await migration 20260902120500.
- **Door**: a Seismic picker (projects, volumes, lines in one list) in the
  export dialog.
- **Size**: volumes are many bricks and can reach gigabytes; the in-memory
  jszip writer is the known limit (STATUS PP1 deviation 1). Real volumes
  should be tried on staging before this door is advertised; the writer is
  the seam for a streaming replacement.

Gate (`__tests__/familiesSeismic.test.js`): a project with a volume
(manifest, two bricks), an owner horizon with confidence companion, a
member horizon under the member prefix, a fault, an exported surface, a
2D line with manifest, nav and a pick, one session opening the volume and
one bookmark for another volume. Every object exported exactly once and
attributed to its row; after import the volume, horizons, companion,
exported surface, line and picks land under the importer's paths;
faults, surface, line and picks re-link; the session follows its volume,
horizons and fault with the unknown surface dropped; the other bookmark
stays behind; no source id survives outside provenance. A volume root
alone brings its horizons, faults and sessions and clears `project_id`.

## PP4 (2026-09-02)

Owner decision (§8.4): the offboarding dump stays untouched. PP4 adds
backup and restore doors beside it, on the same `.pld` engine.

- **Multi-part packages** (`packageSet.js`): one logical package over N
  archives. Part 1 holds rows, sidecars and the manifest; blobs fill parts
  up to the part size (1.5 GB of input by default). The manifest gains
  `parts` (index, file, bytes, sha256 of every part after the first) and
  each blob names its `part`; the schema is updated. A single-part set is
  exactly the PP1 package. The importer accepts all parts together in any
  order, verifies every later part by hash before touching anything, and
  refuses a missing part, an altered part, or extra files on a single-part
  package.
- **Backup** (`backup.js`): `discoverBackupRoots('mine' | 'org')` lists
  every root the caller can read across all families (wells, surfaces,
  culture, interpretations, seismic projects, volumes and lines, sites,
  fields, economics cases and assumption sets, simulation cases, saved
  projects by table); `'mine'` keeps rows the caller owns, `'org'` adds
  rows teammates shared with the organization. `buildBackup` runs the
  generic exporter over that root set into a `PackageSet`.
- **Doors** on the Data Export page: "Back up my work", "Back up what my
  organization shares", and "Restore from a package" (the import dialog,
  which now takes several files for multi-part sets).
- **What a client-side backup cannot contain**: other members' private
  rows. Row-level security hides them from everyone but their owner,
  admin or not; the offboarding dump (service role) is the tool for that,
  and restoring members' private rows into another organization would
  change their ownership anyway. Each member backs up their own work.
  The PLAN's server-side closure engine for the largest root sets is
  therefore not built: with the offboarding dump kept as is, there is no
  remaining client need for it.
- `rootsCatalog` now returns `user_id` on every candidate and lists
  interpretation kinds, so backups can tell mine from shared.

Gate (`__tests__/packageSet.test.js`, `__tests__/backup.test.js`): blobs
over the part size spill into numbered parts with hashes; the importer
opens all parts together in any order and restores every blob byte for
byte; missing, altered and extra parts refused. Backup of my work across
wells, a surface, a production field with its well linked to the
registry well, a saved choke project linked to both, and a simulation
case: the world is wiped, the package restores into an empty account,
every table's row count matches the manifest, blobs are byte-identical,
and the links follow the restored rows. An `'org'` backup carries the
teammate's shared well too.

The staging half of the gate (export a disposable organization, purge it
through the offboarding path, restore into a fresh one) is an owner step.

## PP5 (2026-09-02)

- **Signature** (`signing.js`): ECDSA P-256 over SHA-256 of the canonical
  manifest (keys sorted at every level, `signature` removed). The private
  key lives only in the `pld-sign` edge function's secret; public keys ship
  in `PUBLIC_KEYS` by key id so verification works offline, which is what
  an archive or a regulator needs. Rotation adds a new key id and keeps the
  old ones. The edge function's `helpers.js` canonicalises with the same
  pure code, and a test pins both sides byte for byte.
- **Import** (`readPackage`): reports `signature.status` as valid, unsigned,
  unknown-key, unsupported or invalid. An invalid signature is refused
  (`bad-signature`): every file hash may still match, but the manifest
  itself was edited after signing. Unsigned packages import with a plain
  note; unknown keys are reported, never trusted.
- **Edge function `pld-sign`**: `sign` (caller JWT; canonicalise, sign,
  record the export in `pld_exports`, render the Certificate of Export
  PDF into `org-exports/pld-certificates/{package_id}.pdf`, return the
  signature and certificate number, verification code and download link;
  idempotent per package; unconfigured secrets yield `signature: null`),
  `certificate` (a fresh link to the caller's own PDF),
  `verify_certificate` (public: number + code, facts and a link).
- **Certificate of Export**: number `PLD-EX-<year>-<id8 of the package id>`,
  deterministic; the same pdf-lib page grammar as the Certificate of Data
  Deletion; a Contents table of row counts, the manifest digest, the
  signing key id, parts and binary files; a Verification section naming
  `/legal/verify-export`.
- **Public page** `/legal/verify-export` (`VerifyExport.jsx`), a sibling
  of the deletion one.
- **Doors**: the export dialog and the backup panel sign before saving
  and show the signing note, the certificate number, the download link and
  the verification code; the import review shows the signature status.
  Signing never blocks an export: when the function is missing or
  unconfigured the package stays unsigned and says so.
- **Migration `20260902140000_pld_exports.sql`**: the ledger, owner read;
  dry run clean; apply pending owner.

Gate (`__tests__/signing.test.js`): canonical bytes stable under key order
and identical to the edge helper; a signed manifest verifies and reads as
valid; a manifest changed after signing is invalid; unsigned, unknown key,
unsupported and garbage values are reported, never trusted; a signed
package edited after signing is refused on read even though every file
hash still matches; the certificate number is deterministic and the
certificate fields never carry the verification code.

Owner steps to switch signing on: run `node tools/portability/gen-signing-key.mjs`,
set `PLD_SIGNING_PRIVATE_JWK` and `PLD_SIGNING_KEY_ID` with
`supabase secrets set`, paste the public JWK into `PUBLIC_KEYS`, apply the
migration, `supabase functions deploy pld-sign`. Certificate wording
review sits with this wave (owner decision §8.6).

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

- DONE 2026-09-03: `20260902120500` (registries) applied after the owner
  took the shared-table review; the portability specs now mark every
  registry table `stamped` (geo_wells family, geo_surfaces, geo_culture,
  seismic volumes/horizons/faults/lines/picks/exported surfaces), so
  imported registry rows carry `schema_version` and `app_build`.
  Follow-up: the registry writers in `src/lib/wellsRegistry.js`,
  `surfacesRegistry.js` and Seismolord's services still write without
  `app_build` (the column defaults are correct; stamping them is a
  retrofit like PP0's app-state loaders).
- DONE 2026-09-03: `20260902130000` (import jobs) and `20260902140000`
  (export ledger) applied (gate: three tables, RLS on, owner policies);
  signing key `pld-2026-09` generated, secrets set, public half pasted into
  `PUBLIC_KEYS`, `pld-sign` deployed (v1) and `org-export` redeployed (v4)
  with the PP3a pointer tables. Private JWK backup sits outside the repo
  at `/root/.pld-signing/secrets.env` (mode 600); delete it once the owner
  has their own copy, or rotate.
- The public key must reach production in the same upload as PP5; until
  then the production build reports staging-signed packages as unknown-key.
- Owner: certificate wording review (PLAN §8.6) and the staging E2E (export
  from Well Data Manager, confirm signature + PLD-EX- number, re-import
  reads signature valid).
- Deploy procedure: write `build-info.json` `{ "sha": "<full sha>" }` at
  the clean-checkout root before zipping (untracked, gitignored) so the
  Hostinger build stamps the real sha.
