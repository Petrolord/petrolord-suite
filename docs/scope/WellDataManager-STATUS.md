# Well Data Manager — STATUS

Plan of record: docs/scope/WellDataManager-PLAN.md (approved 2026-07-12).
Roadmap slot: Geoscience-ROADMAP.md Phase G1 — the keystone shared well
registry. Slug `well-data-manager` (tile ships at G1.5 with the
Seismolord migration, per the deploy lesson).

## Phase status

| Phase | Status | Landed |
|---|---|---|
| G1.0 oracle + goldens | **DONE** | PR #54 — lasio oracle, 6 deterministic LAS fixtures + committed goldens (test-data/wells/) |
| G1.1 schema + helper + pentest | **DONE** | PR #55 — migration 20260713100000 (geo_wells / geo_wells_tops / geo_wells_logs + `wells` bucket), is_org_member three-table upgrade, live RLS pentest 14/14; **applied live 2026-07-13** |
| G1.2 LAS engine + services | **DONE** | landed dd9b251 — see below |
| G1.3 app UI | **DONE** | this branch — see below |
| G1.4 Seismolord migration | pending | seismic_wells → registry + compat view, useWells re-point |
| G1.5 close-out | pending | drop seismic_wells, tile Active |

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
