# Wellsite Studio, plan of record (Release 1)

Status: **APPROVED by the owner 2026-09-06, auto mode: WS0 to WS9 proceed
without further sign-off, decisions recorded here and in
WellsiteStudio-STATUS.md as they are taken.** Roadmap slot:
Geoscience-ROADMAP.md Phase G10, the twelfth Geoscience tile
(`wellsite-studio`). Source: the owner's "Wellsite Studio Release 1
Product Specification" (6 September 2026), adapted to the Suite as
recorded in section 2. Spec section numbers are cited as "spec §n".

## 0. Spec to phase map

| Spec | Requirement | Phase |
|---|---|---|
| §9 | Well and prognosis loading, version and date shown | WS0 (well setup), WS5 (prognosis snapshot) |
| §10, §11 | Depth structure, conversion provenance | WS0 (engine `depth.js`, typed columns, DepthEntry) |
| §12 | Time model, UTC plus rig offset | WS0 (`time.js`) |
| §13, §16 | Sample entity and status stages, scheduler | WS3 |
| §14, §15 | Lag engine and its three mandatory reference cases | WS3 |
| §17, §18, §19 | Structured description, vocabulary architecture, performance | WS1 |
| §20 | Shows with controlled values and derived summary | WS4 |
| §21 | Manual rig and geological observations | WS4 |
| §22 | Photographs, derived sizes, automatic association | WS4 |
| §23 to §26 | Tops: interpretation vs decision, approach panel, lifecycle, conflicts | WS5 (detection), WS6 (resolution after sync) |
| §27, §28 | Event timeline, two-interaction entry | WS2 |
| §29, §30 | Shift handover and its editing rule | WS7 |
| §31, §32 | Daily Geological Report and sign-off | WS8 |
| §33 to §35 | Core evidence model, correction workflow, evidence chain | WS0 schema, exercised in WS5 and WS7 |
| §36 to §38 | Offline architecture, synchronisation, conflict rules | WS0 (local store), WS6 (PWA and sync) |
| §39, §40 | Registry integration and philosophy | WS5 (reads), WS9 (publish) |
| §41 | User-visible language rules | every phase (copy-lint test from WS0) |
| §42 | Security | WS0 (RLS, roles), WS6 (TLS sync, cached licence), WS8 (sign-off) |
| §43, §44 | Performance and storage on the reference well | WS9 gate, WS4 storage visibility |
| §45, §46 | Units, operator configuration | WS0 (`units.js`, ConfigView), WS1 (profiles), WS8 (template) |
| §47 | Acceptance criteria | phase gates below |
| §52, §53, §55 | Validation team, first operator template, readiness gate | WS1 review, WS8 template, WS9 simulated shift |


## 1. Why

The owner supplied a Release 1 product specification for Wellsite Studio, the geological command centre for a live well (prognosis to TD: lag and samples, structured cuttings descriptions, shows, manual gas and drilling observations, photographs, formation tops with interpretation, decision and version lifecycle, operational event timeline, shift handover and daily geological report generated from records, offline-first with conflict-preserving sync). The spec is sound and largely adoptable as written. This plan adapts it to what the Suite actually is (a static React SPA on Hostinger over Supabase, engines-first math in the central engines repo, the shared `geo_*` well registry, validation-first goldens, deploy-gated tiles) and to the four decisions the owner took today.

Exploration established that nothing usable exists for the core of this app: no offline layer (the service worker and `useOfflineMode` hook are dead mocks), no sync queue, no prognosis, mudlog, lag, daily report, handover, sign-off or approval concept anywhere, no pump displacement or lag engine, no image downscaling. What does exist and is reused: the registry (`geo_wells` with deviation, `geo_wells_tops`, `geo_wells_intervals` with `source = 'cuttings'`, `geo_wells_core_images`, published PP/FP curves), `wellVolumes` and minimum-curvature math in `engines/drilling`, the stratigraphy lithology and grain-size tables, the Stratigraphy Studio app template (page, harness, backend port, workstation shell, help guide, tests), `pdfBrand.drawBrandHeader` plus jsPDF, the browser DOCX writer, the ECDSA signing kit behind `.pld` exports, `stateVersion` stamps, portability specs, and the tile seed pattern.

Outcome: a twelfth Geoscience tile that a wellsite geologist can run a shift from with the network off, whose record synchronises to the Suite without last-writer-wins, and whose final tops, descriptions and photos publish into the shared registry for Well Correlation, Petrophysics, Stratigraphy and Pore Pressure to consume.

## 2. Decisions locked (owner, 2026-09-06)

1. Platform: installable PWA inside the Suite. No Electron or Tauri. The local store sits behind a port so a packaged build can swap it later.
2. Encryption: rely on device disk encryption (BitLocker or equivalent), documented in the help guide and the readiness gate. Sync is TLS, sessions authenticated, records immutable.
3. Daily Geological Report: generic industry template now, JSON-driven so a real operator template replaces it without code.
4. Module: Geoscience, beside Well Data Manager, Well Correlation and Stratigraphy Studio.

## 3. Adaptations of the spec to the Suite (locked with the plan)

- Local database is the system of record on the rig (Dexie over IndexedDB), a deliberate departure from every existing app where local storage is only a cache. Server tables are the shared record; the two are reconciled by an append-only sync, never by overwrite.
- All Wellsite tables are app-private `ws_*` and multi-writer within a well (rig and office write the same well). This departs from the `geo_*` owner-only rule on purpose; registry writes happen only through an explicit Publish step that keeps the owner-only rule intact.
- Depth: canonical `md_calc_m` (SI metres MD below KB, the registry convention) plus the five entered attributes and the calculated TVD/TVDSS with survey version and method, all as real columns with CHECK constraints, so an incomplete depth is refused by Postgres as well as the client. Not five loose columns per depth and not jsonb.
- Time: `occurred_at timestamptz` (UTC) plus `local_offset_min` on every row. Tour and report-day boundaries are computed from the well's rig offset, never from the browser timezone.
- Lag is strokes-based (mudlogging practice): the pump log stores SPM step changes; lag time is derived and displayed with the SPM it was computed at. No stored lag minutes.
- Well header fields the registry lacks (field, operator, rig, GL elevation, datum, RT offset, spud) live on `ws_wells`, not on `geo_wells` (shared table). A registry extension is proposed separately later.
- Prognosis is a versioned snapshot row (`ws_prognosis`) loaded online by the well administrator from the registry (own tops marked prognosis, offset wells' tops, published PP/FP curves decimated, planned trajectory and hole sections from Well Design Studio when linked) and pulled to the rig. The version and date show in the workspace as the spec requires.
- Sample status is a set of stage rows (one insert per stage), so two users advancing a sample never conflict; status is derived.
- Photos: client-side derive pipeline (thumbnail 320 px, working 2048 px WebP, original optional per well), blobs in IndexedDB, uploaded metadata first then thumb, working, original.
- Sign-off: an offline `ws_signoffs` row (user, role, UTC, local, report version, SHA-256 of the canonical report) authenticated by RLS on push, countersigned by a new `ws-sign` edge function on the `pld-sign` pattern after sync. The UI says plainly when countersignature is pending.
- Roles: per-well membership `ws_well_members` with roles wellsite_geologist, senior_wellsite_geologist, operations_geologist, well_geology_lead, administrator; approver roles are a per-well setting, never a hardcoded title.
- Language rule (spec §41) is enforced by a jest copy-lint over the app source: no em dashes, and none of "detected", "determined", "confirmed oil", "kick", "set casing" in user-facing strings; assisted features do not exist in R1.

## 4. Architecture

### Engine domain `engines/wellsite/` (central repo, vendored by subtree)

Two new sanctioned cross-domain edges, recorded in the engines README: `wellsite -> drilling` (`wellVolumes`, `annulusCapAt`, `tvdAt`, `mdsAtTvd`, `verticalWellPath`) and `wellsite -> stratigraphy` (`LITHOLOGIES`, `GRAIN_SIZES`, `resolveLithology`, `resolveGrainSize`). No reimplementation of annular volume or minimum curvature.

| Module | Exports (SI internally) | Goldens |
|---|---|---|
| `depth.js` | `DEPTH_UNITS/REFERENCES/DATUMS/KINDS`, `validateDepth`, `toCanonicalMd(entry, ctx)` returning original + calculated + survey version + method, `mdToTvd`, `tvdToMd` (refuses multiple crossings), `toDisplay`, `depthProvenance`, `recalculate` | analytic: vertical well with KB and GL, deviated set pinned to `tvdAt`, S-shaped refusal |
| `time.js` | `toRigLocal`, `fromRigLocal`, `tourAt`, `tourBoundaries`, `reportPeriod`, `assertUtc` | analytic in-test |
| `pumps.js` | `pumpDisplacement({type, linerIdM, strokeLengthM, rodDiameterM, efficiency})`, `flowRate`, `strokesForVolume`, `displacementFromField` | analytic: 6 x 12 in triplex 97 pct = 0.0161796 m3/stk; duplex case |
| `lag.js` | `stringAtBit`, `annulusSections`, `lagStrokesAt`, `lagTimeMin`, `validatePumpLog`, `strokesBetween`, `timeForStrokes`, `bitDepthAt`, `arrivalPrediction`, `laggedDepthNow` (bisection), `lagReadout` | G1 constant 60 SPM (198.97 min, lagged depth 10,033.6 ft), G2 rate change 60 to 40 SPM at 60 min (268.45 min), G3 connection 10 min off then restart (208.97 min, lag time null while off), G4 casing shoe plus BHA (11,782.9 strokes); Python oracle `tools/validation/wellsite/oracle_lag.py` plus hand numbers in README |
| `sampleProgram.js` | `validateProgramme`, `scheduledDepths`, `applyProgrammeChange` (authorised, versioned), `statusConfig`, `canAdvance`, `advance`, `dueState` (overdue after tolerance, never "missed"), `inTransit`, `expectedArrivals` | analytic |
| `descriptionVocabulary.js` | controlled tables (colour hue + modifier, hardness, texture, sorting, rounding, cement, accessories, fossils, porosity, porosity types), `ATTRIBUTES` order list driving UI, abbreviator, narrative and validator, `resolveTerm`, `resolveColour`, `validateDescription` (percent sum within tolerance), `copyPrevious`, `diffDescriptions`, `dominantLithology`, `toIntervalRow` | analytic table tests |
| `abbreviations.js` | `PETROLORD_PROFILE`, `validateProfile`, `mergeProfile` (fallback flag like `displayLabel`), `term`, `abbreviate`, `narrative` | hand-derived `description-goldens.json` with README lineage |
| `shows.js` | controlled value lists, `validateShow`, `showSummary` (score bands none/poor/fair/good/very good, indicator wording) | hand-derived with README rationale |
| `tops.js` | `TOP_STATUSES`, `TOP_TRANSITIONS`, `versionChain`, `currentCall`, `currentInterpretation`, `canTransition`, `newVersion`, `approachPanel` (distance MD and TVD, window, offsets), `toRegistryTop` | analytic |
| `events.js` | `EVENT_TYPES` (17 incl. user_defined, duration flags), `startEvent`, `endEvent`, `validateEvents`, `eventsInPeriod` | analytic |
| `reports.js` | `selectPeriod`, `handoverModel`, `dailyReportModel`, `DEFAULT_DAILY_TEMPLATE`, `validateTemplate`, `signoffRecord` (canonical hash) | synthetic day `report-day.json` |

Tests `__tests__/wellsite.<topic>.test.js`; copy lint applies. Suite shims `src/lib/wellsite/<module>.js`, one line each.

### Server schema (one app-private migration in WS0, additive later)

`ws_role` enum; `ws_wells` (geo_well_id unique FK, organization_id, header jsonb, settings jsonb with approver_roles, mandatory_sample_stages, rig_offset_min, tour starts, default depth entry, keep_originals, overdue tolerance; active_survey_id); `ws_well_members`; `ws_prognosis` (append-only versions); `ws_records` (kind observation | interpretation | event | decision | narrative, subtype, chain_id, version_no, previous_version_id, supersedes_id, resolves_ids, confidence, evidence_ids, sample_id, photo_id, occurred_at, ended_at, depth columns, depth2 columns, payload jsonb); `ws_samples` + `ws_sample_stages`; `ws_tops` (formation_key, role interpretation | official, status, chain columns, depth columns); `ws_photos` (storage_prefix, variants jsonb, original_sha256); `ws_reports` (kind daily | handover, report_date, canonical jsonb, content_hash, chain); `ws_signoffs` (countersignature set only by service role); `ws_publications`. Every row: created_by, client_created_at, received_at, `server_seq` identity (pull cursor), device_id, PP0 stamps.

Depth macro on records, samples, tops, photos: `depth_value, depth_unit, depth_ref, depth_datum, depth_kind, md_calc_m, tvd_calc_m, tvdss_calc_m, survey_version_id, calc_method` with an all-or-none CHECK and per-table not-null rules.

Helpers `ws_is_member(well)`, `ws_can_approve(well)`, `ws_can_admin(well)` (security definer, stable). RLS: members select; members insert with `created_by = auth.uid()`; `final` tops and `resolves_ids` only for approvers; NO update or delete policies on append-only tables (revoked); `ws_wells`/`ws_well_members` admin-managed; `ws_publications` insert only by the `geo_wells` owner. Storage bucket `wellsite` (private), path `{org}/{well}/photos/{id}/{variant}.webp`, member-gated. Live RLS pentest file `tools/validation/wellsite/rls-pentest.sql` (member insert ok, non-member refused, non-approver final refused, update refused).

### Local store and sync (`src/lib/wellsite/`)

- `db.js`: Dexie 4, database `petrolord-wellsite`, stores wells, members, settings, prognosis, records (indexes `[well_id+kind+md_calc_m]`, `[well_id+kind+occurred_at]`, `[well_id+chain_id]`, `previous_version_id`), samples, sample_stages, tops, photos, blobs, reports, signoffs, outbox, cursors, conflicts, meta. `navigator.storage.persist()` on well open; usage bar from `estimate()`.
- `commit.js`: one transaction writes the row (validated depth and time, stamped) and its outbox entry; `liveQuery` updates the UI. Nothing on this path touches the network.
- `sync/`: `push.js` drains the outbox in batches of 200 via `upsert(..., {onConflict: 'id', ignoreDuplicates: true})` (idempotent, client UUID v4), photo order metadata then thumb, working, original; backoff on transient errors, 401 waits for `TOKEN_REFRESHED`, RLS or CHECK rejections become `rejected` and stay local and visible. `pull.js` per-well cursor on `server_seq` per table, `bulkPut` (rows immutable), whole-row pull for wells and members, signoffs by `countersigned_at`. `conflicts.js`: two heads on a chain, or two open `final` tops for one formation; approver resolves by a new version citing both in `resolves_ids`. Server view `ws_conflicts` mirrors the rule. `syncStore.js` (zustand) exposes offline | pending n | synchronising | synchronised hh:mm | conflict n | failed n.
- Triggers: `online`, `visibilitychange`, auth `TOKEN_REFRESHED`/`SIGNED_IN`, 60 s timer, debounced after commit.
- `photos/derive.js` in a worker (`createImageBitmap` with EXIF orientation, OffscreenCanvas, WebP), SHA-256 of the original.
- Backend split: the workstation talks to `localBackend` (Dexie) always; a `transport` port (Supabase or fake) is what sync and publish use. The `/dev/wellsite-studio` harness = Dexie + fake transport + seeded well, so Playwright exercises the real store and the real sync engine with `context.setOffline`. jest uses `fake-indexeddb`.

### Offline boot (Suite-wide, lands in WS6)

- `vite-plugin-pwa@^0.19` (Vite 4 compatible), `registerType: 'prompt'` (never swap assets mid-shift), precache only the shell, runtime CacheFirst for hashed `/assets/`, navigation fallback with a denylist for `/dev/`, `/rest/v1/`, `/auth/v1/`, `/storage/v1/`, `/functions/v1/`; Supabase never cached. Replace the stale EarthModel `public/manifest.json`, delete dead `public/sw.js`, `src/serviceWorkerRegistration.js`, `src/hooks/useOfflineMode.js`; add `useOnlineStatus`. "Make available offline" button warms the app's lazy chunks and the help guide.
- Entitlements: `src/lib/entitlementCache.js` per-user snapshot with stamp; `SupabaseAuthContext` and `useUserEntitlements` (the real gate behind `ProtectedAppRoute`, whose cache is currently one global key) fall back to the snapshot on transient failure with `stale: true`; `ProtectedAppRoute` shows a "working from cached licence, last verified <date>" banner, hard ceiling 30 days. Supabase JS 2.30.0 keeps the session across an offline reload (gotrue 2.43.1 retryable refresh), verified.

### Suite app `src/pages/apps/WellsiteStudio/`

`WellsiteStudio.jsx`, `WellsiteStudioHarness.jsx`, `WellsiteHelpGuide.jsx`, `services/{backendPort,localBackend,transports/{supabaseTransport,fakeTransport},seed,units,wsExport,dailyTemplates,publish,referenceWell}.js`, `components/{WellsiteWorkstation,LiveWellView,DepthEntry,LagPanel,SamplesView,DescribeView,ComponentRow,ShowsView,ObservationsView,PhotosPanel,TopsView,ApproachPanel,ConflictResolver,TimelineView,HandoverView,ReportView,ReportSignoff,ConfigView,SyncStatusPill,SyncDrawer,WellSetup}.jsx`. Reused: `WorkspaceShell` (autoSaveId `wellsite.workspace.v1`), `ModuleHomeLink`, `RowGridEditor`, `CoreImagesPanel` adapter, `OpenInAppMenu`/`appLinks`, `HelpGuideLayout`, `pdfBrand`, `reportAutopilotDocx` writer, `settingsService.getDepthUnit` (local default first, remote as enhancement). Routes `apps/geoscience/wellsite-studio`, `/help`, `/dev/wellsite-studio`. Test-id prefix `ws-*` (readiness gate `ws-status-bit` on the seeded well).

Describe screen keyboard mode: field order from engine `ATTRIBUTES`; Tab/Enter typeahead resolving aliases (`sst`, `lt gy`, `f-m`); Ctrl+Enter next component; Ctrl+D Copy Previous with changed fields highlighted; Alt+n jump; F2 quick/full; Ctrl+S validate and save; live abbreviation and narrative read-only. Touch mode uses chip pickers on the same rows.

## 5. Phases (each independently mergeable; engines PR first, then the Suite PR with the subtree pull)

Sizes are relative to the Stratigraphy series (ST1 = medium). The tile seed ships only in WS9 and is deploy-gated.

**WS-PLAN (first PR after approval, docs only).** Write `docs/scope/WellsiteStudio-PLAN.md` (this plan with the spec's requirement numbering mapped to phases), add tile 12 and Phase G10 to `docs/scope/Geoscience-ROADMAP.md`, create `docs/scope/WellsiteStudio-STATUS.md`. Merge.

**WS0 Foundation (medium).** Engines: `depth.js`, `time.js`, `pumps.js` with goldens, README edge `wellsite -> drilling`. Suite: the `ws_*` migration applied to the linked project after a rollback-wrapped dry run and the RLS pentest; Dexie store, commit path, backend port, fake transport, seed (KETA-2 deviation, 12.25 in hole, 5 in DP, 6 x 12 triplex, one connection in the pump log); workstation shell with ribbon, explorer, status bar; `DepthEntry`; `ConfigView` (hole sections, BHA, drillpipe, pumps with live displacement, tour and offset, mandatory stages, tolerance); `WellSetup` (create a `ws_wells` row from a registry well, online); App.jsx routes (no tile); `units.js`; app copy-lint test. Tests: engine goldens; jest db (commit atomic with outbox, depth-window query over 10,000 seeded observations under 50 ms), depth entry refusal. Gate: the harness opens the seeded well, status bar shows the bit depth in the account unit, a depth missing a datum is refused, a TVD entry on the deviated well shows the correct MD with the survey version.

**WS1 Description prototype (medium, validation-team phase).** Engines: `descriptionVocabulary.js`, `abbreviations.js`, goldens, edge `wellsite -> stratigraphy`. Suite: `DescribeView`, `ComponentRow`, keyboard and touch modes, Copy Previous, live abbreviation and narrative, abbreviation profile paste in Config. Tests: jest keystroke test; e2e with timed scripted sequences (repeat under 10 s, full under 90 s). Gate (spec §47 Description): golden abbreviation string appears on screen; a 90 percent sum is refused with the engine message. Owner: two wellsite geologists and one operations geologist review the screen on staging; findings recorded in STATUS before the screen is frozen.

**WS2 Live Well workspace and timeline (small-medium).** Engines: `events.js`. Suite: `LiveWellView` (bit depth history, pump state, event quick bar, next due, in transit placeholders), explorer tree, `TimelineView` with two-interaction start and end-later. Gate (§47 Events): an event starts in two interactions with time, user and depth captured; a duration event ends later.

**WS3 Lag and sample scheduler (medium).** Engines: `lag.js`, `sampleProgram.js`, Python oracle, G1 to G4, README. Suite: `LagPanel` in the dock, pump log editor, `SamplesView` (programme editor, schedule, stage chips, in transit, overdue highlight, authorised change dialog). Gate (§47 Lag, Samples): the harness reproduces G2 and G3 on screen; overdue highlight after tolerance; the word "missed" appears nowhere (e2e greps).

**WS4 Shows, observations, photos (small-medium).** Engines: `shows.js`. Suite: `ShowsView` (controlled values, derived summary read-only), `ObservationsView` (ten manual types with source), `PhotosPanel` with the derive worker, local blobs, per-well original policy, storage visibility. Gate (§47 Shows, Photos): show quality derived; a photo attached to a sample carries well, section, sample, depth, user, UTC and local time and appears in the sample view without re-attachment.

**WS5 Tops, prognosis and conflicts (medium).** Engines: `tops.js`. Suite: `ws_prognosis` loader (own prognosis tops, offset wells' tops, PP/FP decimated, Well Design trajectory and hole sections when `wp_wellbores.geo_well_id` links), version and date shown; `TopsView` (interpretation vs decision, chain, statuses), `ApproachPanel` in the dock, `conflicts.js` detection with the read-only "competing versions" badge and the approver `ConflictResolver`. Gate (§47 Tops): preliminary to final without deleting versions; evidence chain readable backwards from the event; two heads surface as a conflict and only an approver resolves.

**WS6 Offline shell and sync (medium-large, Suite-wide).** Suite: vite-plugin-pwa, manifest, dead file removal, entitlement cache in context and hook, `ProtectedAppRoute` banner, `useOnlineStatus`; `push.js`, `pull.js`, `syncStore`, `SyncStatusPill`, `SyncDrawer`, Supabase transport, `wellsite` bucket policies (migration), "Make available offline". Tests: sync jest with a fake transport (idempotent retry after a partial batch, backoff, 401 wait, 403 rejected, photo ordering, cursor advance); e2e `setOffline(true)` add records and a photo, reload offline, records persist, `setOffline(false)`, pill reads synchronised; a second e2e seeds a competing head through the fake transport and walks the approver resolution; a live spec gated by `E2E_LIVE=1` round-trips push and pull against staging. Gate (§47 Offline, Synchronisation): WS1 to WS5 flows pass with the network off; the installed PWA reopens to the last well; conflicts preserved. Owner: install the PWA on a Windows laptop and a tablet on staging and confirm the offline reopen.

**WS7 Shift handover (small-medium).** Engines: `reports.js` handover half plus `report-day.json`. Suite: `HandoverView` (tour picker, generated sections, narrative sections stored as `ws_records` kind narrative, regenerate on source correction), PDF via `wsExport`, offline sign-off row with hash. Gate (§47 Handover): one action generates the handover; a wrong fact can only be corrected at its source and the handover regenerates.

**WS8 Daily Geological Report and countersignature (medium).** Engines: `dailyReportModel`, `DEFAULT_DAILY_TEMPLATE`, `validateTemplate`, golden. Suite: `ReportView` (report day from rig offset, template picker, PDF and DOCX), `ReportSignoff`, `ws-sign` edge function (countersign and verify, `pld-sign` conventions, same key secrets) deployed with `supabase functions deploy ws-sign`, `signClient` outbox op after the signoff row is confirmed. Gate (§47 Daily Report): every generated value traces to a record id; a reordered template JSON changes the output without code; a sign-off signed offline is countersigned after sync and the UI states both.

**WS9 Close-out (medium).** Suite: `WellsiteHelpGuide` (guard test quoting engine vocabulary, no em dashes, the BitLocker and "make available offline" instructions), `WELL_APPS` entry and Well Data Manager Open in; publish to registry (`publish.js`: final official tops to `geo_wells_tops`, descriptions to `geo_wells_intervals` kind lithology source cuttings with components in properties, selected photos to `geo_wells_core_images`; overwrite-own contract mirroring Pore Pressure's `staleOwnCurves`; `ws_publications` audit); portability `wellsiteSpec.js` registered in `familySpec.js` with round-trip test; reference well generator (15,000 ft, 2,000 samples, 10,000 observations, 1,500 photo rows, 500 events, 100 interpretations, 50 top versions) with a jest perf gate (lag readout, arrivals, daily model each under 200 ms) and an e2e `?seed=reference` render gate; tile seed `seed_wellsite_studio_app.sql` (Active, deploy-gated); STATUS close-out with the readiness-gate script (spec §55 simulated shift). Owner: simulated shift on staging by an experienced geologist, production upload, chunk-content verification, then the tile seed is applied.

## 6. Cross-cutting rules

- Engines first: every calculation lives in `engines/wellsite/`, vendored by `git subtree pull` from the clean clone `/root/petrolord-suite`; Suite paths are one-line shims. Goldens before UI.
- Every user-facing string obeys the copy rule (no em dashes) and the §41 language rule; the app copy-lint test fails the build otherwise.
- The structured record is authoritative; abbreviation and narrative are derived at render and stored only inside report snapshots.
- No UPDATE or DELETE on any append-only `ws_*` table, in RLS and in the client. Corrections are new rows.
- Nothing before WS9 seeds a tile or touches a shared `geo_*` table.
- Each phase updates `docs/scope/WellsiteStudio-STATUS.md`, `MIGRATIONS.md` where a migration lands, and ends with a full Suite jest run and the app e2e on staging.

## 7. Verification

- Engines: `npm test` in `/root/petrolord-engines` (new `wellsite.*` suites plus copy lint); Python oracle regenerates lag goldens byte-identically.
- Suite: full jest (`npm test`), the new suites under `src/lib/wellsite/__tests__` and `src/pages/apps/WellsiteStudio/__tests__` with `fake-indexeddb`.
- e2e: `e2e/wellsite-studio.spec.js` on `/dev/wellsite-studio` against staging (readiness gate `ws-status-bit`), offline scenarios via `context.setOffline`, timed description sequences, conflict resolution; `e2e/wellsite-studio-live.spec.js` behind `E2E_LIVE=1`.
- Database: rollback-wrapped dry run then apply via `supabase db query --linked -f`, live RLS pentest with counts stashed by `set_config`; PostgREST `ignoreDuplicates` upsert without update privilege verified on staging in WS6 before the sync engine merges (it is the linchpin of idempotent push).
- Production: source zip from the clean clone, clean-room build, verify served chunks by content (`WellsiteWorkstation` marker strings), purge cache, then the deploy-gated tile seed.

## 8. Risks

- IndexedDB eviction for a non-installed tab under disk pressure: `persist()` plus the "photos not yet backed up" count; the install step is mandatory in the help guide.
- Bundle precache covers only the shell: a user who never opened Wellsite online has nothing offline; "Make available offline" is on the first-run screen.
- Clock skew on rig laptops: warn when `received_at` differs from `client_created_at` by more than five minutes on sync; never rewrite.
- Lag on a well without a survey falls back to vertical and says so in provenance.
- Ambiguous TVD entries in horizontal sections are refused with an MD instruction.
- The PWA and entitlement changes are Suite-wide; they land in one PR (WS6) with the full jest run and a staging check of two unrelated apps.
- Multi-writer `ws_*` departs from the registry rule; the migration header says so and publish keeps the rule.

## 9. Release 1.1 and beyond (spec §48 to §51, unchanged)

Release 1.1: lithology and composite log renderer (after symbology review
with practising geologists), sample register and chain of custody on the
`ws_samples` entity. Release 2: the Rig Data Gateway (WITSML 2.1, ETP 1.2,
adapters), live parameters and gas, automatic event detection and lag.
Release 3: corrected d-exponent, pressure-trend surveillance against Pore
Pressure Studio, gas ratios, top evidence scoring, casing, coring and TD
evidence panels. Release 4: assisted intelligence, every result labelled
Suggested and accepted by a person. None of these are in Release 1 and
nothing in Release 1 is designed in a way that blocks them (the pump log
and bit-depth history are the shapes a gateway would feed).
