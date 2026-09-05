# Well Data Manager — STATUS

**PHASE G1 COMPLETE (G1.0–G1.5, 2026-07-13).** Plan of record:
docs/scope/WellDataManager-PLAN.md (approved 2026-07-12). Roadmap slot:
Geoscience-ROADMAP.md Phase G1 — the keystone shared well registry.
Live at `/dashboard/apps/geoscience/well-data-manager` (tile Active).

Production note: **RESOLVED 2026-07-14** — prod is current (source zip
from main `e84f8a181` uploaded to Hostinger); the tile route is live
and the stale-bundle Seismolord wells-panel error (seismic_wells view
retirement) is gone with the old bundle.

## Phase status

| Phase | Status | Landed |
|---|---|---|
| G1.0 oracle + goldens | **DONE** | PR #54 — lasio oracle, 6 deterministic LAS fixtures + committed goldens (test-data/wells/) |
| G1.1 schema + helper + pentest | **DONE** | PR #55 — migration 20260713100000 (geo_wells / geo_wells_tops / geo_wells_logs + `wells` bucket), is_org_member three-table upgrade, live RLS pentest 14/14; **applied live 2026-07-13** |
| G1.2 LAS engine + services | **DONE** | landed dd9b251 — see below |
| G1.3 app UI | **DONE** | this branch — see below |
| G1.4 Seismolord migration | **DONE** | this branch — see below; migration 20260713160000 **applied live 2026-07-13** |
| G1.5 close-out | **DONE** | this branch — see below; migrations 20260713200000 + 20260713210000 **applied live 2026-07-13** |

## G1.2 delivered (src/pages/apps/WellDataManager/)

- `engine/lasParse.js` — LAS 1.2/2.0 parser, plain JS + JSDoc,
  worker-safe. Wrapped mode, null families, header quirks (greedy
  value-to-last-colon, missing-period lines, unit bracket/period
  stripping), the LAS 1.2 ~Well colon swap (STRT/STOP/STEP/NULL stay
  value-first), UWI/API never numeric, duplicate-mnemonic `:n`
  suffixes, LAS 3.0 read-rejected with a clear message. All errors are
  plain line-numbered domain Errors.
- `engine/lasImport.js` — SI conversion layer (ft→m ×0.3048 exact;
  sonic US/F→US/M divides), conversion factors recorded in provenance,
  unknown units surface instead of guessing, irregular-step detection
  (1% + f32-ULP tolerance), curve-kind guesses for the mapping UI,
  well-header suggestion.
- `services/wellsService.js` — geo_wells CRUD, share/unshare
  (organization_id stamp on the well row), normalized tops replace,
  log metadata + f32 curve up/download to the private `wells` bucket at
  `{user_id}/{well_id}/logs/{log_id}.f32` (client-generated log ids so
  path and row write atomically; orphan cleanup on failed insert).
- `services/lasImportService.js` + `workers/lasParse.worker.js` —
  off-thread parse facade (one promise per file, transferred buffers).

## Validation (G1.2 acceptance)

- Goldens: **bit-exact vs lasio** on all 6 fixtures — u32-compare with
  NaN==NaN, per-curve metadata, first/last finite, checksum
  (sequential-sum exact vs golden bits; 1e-12 rel vs numpy pairwise).
- Fuzz: 18 malformed-input cases → plain line-numbered domain Errors;
  6 weird-but-valid cases parse sanely. Suite: 90 tests green
  (`npx jest src/pages/apps/WellDataManager`); full repo suite 653 green.
- 50 MB LAS (713k rows × 8 curves): parseLas ≈ 2.3 s + prepareLogs
  ≈ 0.7 s, in the worker — main thread untouched.

## G1.3 delivered

- **Shared workstation primitives extracted at the second consumer**
  (roadmap §3 rule): Seismolord's `WorkspaceShell` →
  `src/components/workstation/WorkspaceShell.jsx` (new `autoSaveId` /
  `minWidth` props; Seismolord keeps its pre-extraction persistence
  key) and the `WellImport` form + its delimited-text engine →
  `src/components/wells/WellImport.jsx` + `src/lib/wellImport.js`.
  Seismolord imports re-pointed, all its jest + e2e untouched-green.
- `components/WellWorkstation.jsx` — workstation-lite controller on the
  shared shell: wells tree / map / detail views, slim ribbon, status
  bar. Every data touch goes through an injected backend object.
- Backends: `services/registryBackend.js` (geo_wells via wellsService,
  org resolution via `src/lib/orgContext.js`) and
  `services/inMemoryBackend.js` (same interface, no auth/DB, real LAS
  engine, seeded read-only org well) — the harness runs the identical
  app.
- `components/WellsTree.jsx` (search, org/private badges, owner-only
  context menu), `WellsMap.jsx` (canvas surface map, click-select),
  `WellDetail.jsx` (header/logs/tops/deviation/checkshots tabs, curve
  cache), `LogTracks.jsx` (canvas quick-view; irregular logs plot by
  sample index and say so), `LasImportDialog.jsx` (worker parse, curve
  keep/mapping + unit preview — converted units show source→SI,
  unknown units marked "as-is"; header suggested from ~Well, surface
  X/Y manual; add-to-existing-well path), `AddWellDialog.jsx` (shared
  WellImport form → registry + normalized tops), `DeleteWellDialog.jsx`
  (dependent-data counts in the warning).
- `/dev/well-data-manager` harness route (DEV builds only, App.jsx).
  The app page + tile deliberately do NOT ship yet — G1.5, tile and
  route together (the deploy lesson).

## G1.4 delivered

- Migration `20260713160000_migrate_seismic_wells_to_registry.sql`
  (**applied live 2026-07-13**; both tables were empty at apply time,
  so the copy was a no-op by luck, not design — the SQL handles data):
  seismic_wells rows → geo_wells (ids preserved, idempotent), jsonb
  tops normalized into geo_wells_tops, then the table becomes a
  **security_invoker compatibility view** re-aggregating tops to the
  legacy `[{name, md}]` jsonb shape. INSTEAD OF insert/update/delete
  triggers keep already-deployed production clients working (prod is a
  manually-uploaded static SPA) — their writes route into the registry
  under the caller's own RLS. Hard drop at G1.5.
- Registry service extracted at the second consumer:
  `src/pages/apps/WellDataManager/services/wellsService.js` →
  `src/lib/wellsRegistry.js` (+ new `listWellsWithTops()` embedded
  query; `deleteWell` now surfaces RLS-filtered 0-row deletes as an
  owner-only error instead of a silent no-op).
- Seismolord `services/wellsService.js` is now a thin ADAPTER over the
  registry: same three exports and row shapes (tops bridged
  `md_m`→`md`), zero changes in useWells or any viewer. Wells imported
  in Well Data Manager appear in Seismolord with no re-import;
  org-shared wells arrive read-only.

## G1.5 delivered

- `WellDataManager.jsx` page (WellWorkstation on makeRegistryBackend)
  + protected route `apps/geoscience/well-data-manager` in App.jsx —
  shipped in the same PR as the tile flip (the deploy lesson).
- Migration `20260713200000_seed_well_data_manager_app.sql` (**applied
  live**): master_apps row via the %ROWTYPE template-copy pattern
  (Seismolord sibling), Geoscience module, flat 899 inherited, icon
  `Database`, status Active.
- Migration `20260713210000_drop_seismic_wells_compat_view.sql`
  (**applied live**): the G1.4 compat view, its three INSTEAD OF
  triggers and functions dropped — `seismic_wells` is retired.
  Verified: 0 pg_class objects, 0 compat functions, PostgREST returns
  PGRST205 for it, geo_wells untouched.

## Validation (G1.4 acceptance)

- Live, rollback-wrapped first: dry run of the full migration, then
  6/6 compat-view RLS probes green (insert normalizes tops + stamps
  units_note; owner update replaces tops; owner delete cascades;
  non-owner sees nothing and deletes 0 rows through the view; org
  member reads the shared well + tops; forged-user_id insert raises
  42501). Probes recorded as blocks 6–7 of
  tools/validation/wells/rls-pentest.sql.
- All Seismolord jest suites green untouched; Seismolord wells +
  workspace e2e green; full repo suite green.
- Owner follow-up: one signed-in staging smoke (import a well in the
  WDM harness flow → see it in Seismolord's explorer/map) — the DB
  probes prove the path, but a human click-through with a real session
  hasn't happened yet.

## Validation (G1.3 acceptance)

- e2e (`e2e/well-data-manager.spec.js`): full LAS import → detail →
  plot → share → read-only check → delete-with-warning flow, plus
  manual add-well with pasted tops and map view — green on the live
  harness. Seismolord wells + workspace e2e re-run green after the
  extractions.
- jest: `__tests__/inMemoryBackend.test.js` pins the harness contract
  (seeded shared well, full flow, SI conversion provenance, owner-only
  writes mirroring RLS, tops normalize + sort, domain-error surfacing).
  Full repo suite 659 green.

## Gotchas encoded

- The goldens pin lasio's reading of ambiguous LAS constructs — change
  the parser only against the oracle (tools/validation/wells/).
- `uniformStepM` tolerance exists because ft→m converted f32 depths
  jitter by an ULP per increment (feet_20) — do not tighten it back to
  exact equality.
- numpy `sum` is pairwise; never assert the engine's sequential f64 sum
  equals the golden JSON figure exactly.

## 2026-09-03: one well name per registry

`saveWell` and a rename through `updateWell` now refuse a name that
matches, case- and whitespace-insensitively, any well the caller can see
(own or shared by a teammate); the message names the clash. The
in-memory harness backend mirrors the rule through the same pure
function (`wellNameClashMessage`) and `inMemoryBackend.test.js` covers
create, rename and the shared-well case. Server backstop for the
same-owner half: `20260903120000_geo_wells_unique_name_per_owner.sql`,
**applied 2026-09-03** after the owner took the shared-table review
(0 duplicates existed; probe insert of a case/space variant rejected).
The .pld importer was taught the same rule the same day: a packaged
well whose name is taken is imported as "<name> (imported)" with the
original kept in provenance (ProjectPortability-STATUS).

## 2026-09-03: LAS lands in the selected well

Owner finding: a well built from survey + checkshots received its LAS
as a NEW well. The wizard now (a) targets the selected own well by
default, target block first, (b) lets every curve be renamed ("Save as")
before it is written, (c) shows "In well" for the target's existing
curves with a per-curve choice, keep both (next `:n` suffix) or replace
(old row deleted first), and (d) never writes a second depth curve: when
the well already has one, incoming curves are RESAMPLED onto the well's
depth grid (linear between finite neighbours, NaN across nulls and
outside the LAS interval; same grid passes through). All of it is pure
planning in `engine/mergeImport.js` (`planMerge`, `resampleToGrid`) with
`__tests__/mergeImport.test.js`; provenance records `source_mnemonic`,
`resampled_from`, `replaced_log_id`. The detail view reloads after an
import into the same well (`refreshNonce`). e2e extended: second import
of the same file into KETA G1-1 → still 2 wells, 9 logs, GR renamed
GR_RUN2, RHOB kept as RHOB:2.

## 2026-09-03: LAS 3.0 import

Testers could not load LAS 3.0 files (the reader refused them by design
in v1). `packages/engines/engines/welldata/lasParse.js` now reads 3.0:
DLM SPACE/COMMA/TAB with quote-aware rows, one row per depth step,
`~Log_Definition`/`~Log_Parameter`/`~Log_Data` (2.0 names still
accepted), `{FORMAT}` and `| association` tails peeled from
descriptions, empty fields as nulls, array channels as ordinary curves.
Text columns ({S}/{D}/{DT}/{T} or undeclared non-numeric) are skipped
and named in `skippedCurves`; every other `*_Definition/*_Data` pair
(Core, Tops, ...) is ignored and named in `ignoredSections`; the import
dialog shows both. The 1.2/2.0 path is byte-identical (its lasio goldens
unchanged). Oracle note: lasio 0.32 misreads LAS 3.0, so the two `*_30`
fixtures carry goldens written by `genfixtures.py` from its own
closed-form arrays; `lasGoldens.test.js` runs them bit-for-bit and
`lasParse30.test.js` covers the rules and the domain errors. Engines PR
lands first, then the subtree copy here.

## 2026-09-03: checkshots as Petrel enters them; editable well data (PT1)

- **At the door.** The add-well Checkshots tab has reference (MD | TVD |
  TVDSS), unit (m | ft) and time (one-way | two-way) selectors, defaulting
  to MD + OWT like a Petrel export; header words (`OWT`, `TVDSS`, `ft`)
  set them once and never override a choice. The preview shows the
  stored TVDSS / TWT beside the entered values through the pasted survey
  and KB, with a note saying which frame was used. Deviation MD, tops MD,
  KB and TD accept feet. Column ids for checkshots are now
  `well-map-depth` / `well-map-time`. The converter is the welldata
  checkshots engine (closed-form goldens, engines PR #102); a flat or
  uphill lateral is refused with a message naming the MD interval.
- **Stored.** Core unchanged (`{tvdss_m, twt_ms}`) plus `md_m` per row
  and `checkshots_provenance` (migration 20260904090000, HELD for the
  shared-table review; the writers retry without the column until it is
  applied). Well Planning's borrowed tables strip `md_m` and record
  `source: well-planning-borrow`.
- **Editable after creation.** Every tab but Logs has an owner-only Edit
  button: Header (KB, TD, in m or ft; a KB change re-derives an
  MD- or TVD-referenced checkshot table and says so; legacy tables are
  left alone and labelled), Deviation (grid or replace-from-paste;
  MD-referenced checkshots re-derive through the new survey), Checkshots
  (grid in the entered convention with a live convention switch, or
  replace-from-paste; saved through the same converter), Tops (row edits
  keep ids for Well Correlation; replace-from-paste warns that ids
  regenerate). Validation lives in `wellsRegistry.updateWellData` and is
  mirrored by the harness backend.
- **Reading.** The Checkshots tab shows the table as entered with a
  view-as selector (MD / TVD / TVDSS, m / ft, OWT / TWT) beside the stored
  columns; ambiguous (uphill) and extrapolated rows are marked; a note
  appears when Seismolord's tie-derived set is active.
- **Deep link.** `?well=<id>&tab=<tab>` selects a well on load;
  Petrophysics Studio's explorer offers "Edit well data" on own wells.

**2026-09-03:** `geo_wells.checkshots_provenance` migration (PT1) applied live; writers no longer hit the missing-column retry.

## 2026-09-03: cross-app navigation (Open in, home link)

Tester ask: after loading wells here, open Petrophysics Studio or any
other app that uses them without going back through the dashboard, and
have a way back to the Geoscience dashboard at all (the dashboard
sidebar is hidden on every app route, so the ribbon was a dead end).

- The ribbon starts with a shared `ModuleHomeLink` (`wdm-home`) to
  `/dashboard/geoscience`; Petrophysics Studio, Well Correlation,
  Mapping & Surface, Rock Physics, Pore Pressure and Earth Modeling got
  the same link.
- "Open in" launchers (`src/components/wells/OpenInAppMenu.jsx` on the
  pure table `src/components/wells/appLinks.js`) sit in the ribbon for
  the selected well (`wdm-open-in`), in every tree row's right-click
  menu (`wdm-row-open-in`, read-only wells included) and in the well
  detail header (`wdm-detail-open-in`). Petrophysics Studio opens on
  `?well=<id>`, Well Correlation on `?wells=<id,...>`; the other
  Geoscience apps open on their explorer. The harness passes
  `DEV_APP_PATHS` so links stay inside `/dev/*`.
- Log quick-view tracks (`LogTracks.jsx`) moved to the white printed-log
  palette Petrophysics uses, so a log looks the same in all three apps.
- e2e: `well-data-manager.spec.js` "cross-app" test.

## 2026-09-05: PT8, the surface location is editable

Filed as Petrophysics tester feedback, but the well Header tab is this
app's — Petrophysics links here to edit a header.

- Surface X and Y were static text on the Header tab while KB, TD and
  CRS were editable, so a well imported with the wrong location could
  only be fixed by deleting and re-importing it. Both are now inputs in
  the same Header edit mode (`wdm-header-x`, `wdm-header-y`), validated
  as finite numbers and carried in the same Save header payload.
- They are world coordinates already expressed in the well's CRS, so
  nothing is transformed and the m/ft selector — a depth unit for KB and
  TD — does not touch them. The field labels name the frame the numbers
  are in (`Surface X (m, <CRS>)`, or "CRS not assigned").
- `updateWellData` accepts `surfaceX` / `surfaceY` in both
  `lib/wellsRegistry.js` and the harness backend, rejecting anything
  non-finite with the message the panel shows; `null` clears a
  coordinate.
- A cleared coordinate is a state a well could already reach, so
  `WellsMap` now fits its extent over the wells that have a location
  (exported `mappable`) instead of reading a null as zero and dragging
  the extent to the origin.
- e2e: the PT1 checkshots test now also edits the location and asserts
  the non-finite rejection.
