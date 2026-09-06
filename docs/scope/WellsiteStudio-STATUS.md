# Wellsite Studio, STATUS

Plan of record: docs/scope/WellsiteStudio-PLAN.md (approved 2026-09-06,
auto mode WS0 to WS9). Roadmap slot: Geoscience-ROADMAP.md Phase G10, the
twelfth Geoscience tile. Slug `wellsite-studio`, route
`/dashboard/apps/geoscience/wellsite-studio`, harness
`/dev/wellsite-studio`. Engines: `packages/engines/engines/wellsite/`
(central repo Petrolord/petrolord-engines, subtree-vendored).

## Phase status

| Phase | Status | Landed |
|---|---|---|
| WS-PLAN | plan of record, roadmap Phase G10, this file | this PR |
| WS0 foundation (depth, time, pumps; schema; local store; shell) | **COMPLETE 2026-09-07: migration APPLIED, pentest green, engines #146 merged** | engines #146 (`engines/wellsite/depth.js`, `time.js`, `pumps.js`, stdlib oracle goldens; 27 tests); Suite branch `feat/ws0-foundation`: migration 20260907090000 (`ws_*` schema, membership helpers, stage guard, conflicts view, `wellsite` bucket), the Dexie local store (`src/lib/wellsite/db.js`, `records.js`, `commit.js`, `ids.js`), the backend port and local backend over the fake and Supabase transports, the workstation shell with Live and Config views, DepthEntry, WellSetup, the harness `/dev/wellsite-studio` (seeded KETA-2), copy-lint test, 12 jest tests, 5 e2e |
| WS1 description prototype | **COMPLETE 2026-09-07: engines #147 + #148 merged, Suite PR merged** | engines #147 (`descriptionVocabulary.js`, `abbreviations.js`, hand-derived golden); Suite branch `feat/ws1-description`: Describe view (quick and full modes, keyboard first, vocabulary typeahead per attribute, Copy previous with changed-field highlight, live abbreviation and narrative), operator profile paste in Config with validation, descriptions as `cuttings_description` observations with top and base depths, jest keystroke test, timed e2e (full description and repeat) |
| WS2 live well workspace and timeline | **COMPLETE 2026-09-07: engines #149 (with the WS3 engines) merged, Suite PR merged** | engines #149 (`events.js`); Suite branch `feat/ws2-live-timeline`: event quick bar on the Live view (one click, time, user and bit depth captured; user-defined asks a label), open events with End, Timeline view (report day, tour, whole well; durations by type), current operation and current lithology cards, explorer counts |
| WS3 lag and sample scheduler | **COMPLETE 2026-09-07: engines #149 merged, Suite PR merged** | engines #149 (`lag.js`, `sampleProgram.js`, oracle goldens G1 to G4); Suite branch `feat/ws3-lag-samples`: lag panel in the dock (strokes, time at the current rate, lagged depth, bottoms up, pump log), Samples view (authorised versioned programme as a decision record, schedule three samples ahead of the bit, predicted arrivals, catch and the stage chain with the mandatory guard, overdue for review), Live view next-sample and catch prompt, describing from a sample records the described stage |
| WS4 shows, observations, photos | **COMPLETE 2026-09-07: engines #150 merged, Suite PR merged** | engines #150 (`shows.js`, hand-derived golden); Suite branch `feat/ws4-shows-photos`: Shows view (controlled values, derived quality read-only, on a sample or a depth), Observations view (the ten manual types with value, unit, text, source and the depth they refer to), Photos (on-device thumbnail and working WebP, SHA-256, local blob store, attached once with depth, user, both times, optional original per well, photographed stage), explorer counts |
| WS5 tops, prognosis, conflicts | **COMPLETE 2026-09-07: engines #151 + #152 merged, Suite PR merged** | engines #151 (`tops.js`), #152 (two fresh calls of one formation on different chains are a conflict, found by the Suite test); Suite branch `feat/ws5-tops-prognosis`: prognosis snapshot versions (registry tops, offset wells' tops through their own surveys, Well Design hole sections and definitive trajectory; manual tops as a new version), Tops view (interpretation and official call as separate chains, lifecycle, history with the evidence chain, approver-only final), approach panel in the dock, conflicts (two heads, two finals) with approver resolution citing both, top_called events, harness `?conflict=1` |
| WS6 offline shell and sync | **COMPLETE 2026-09-07: Suite PR merged (Suite-wide)** | Suite branch `feat/ws6-offline-sync`: installable PWA (vite-plugin-pwa 0.19 on Vite 4, prompt semantics, shell precache, hashed assets cached as fetched, Supabase never cached, real 192/512 icons, update prompt), dead offline files removed, per-user entitlement snapshot with a stale fallback in the auth context, the entitlements hook and ProtectedAppRoute, the sync engine (idempotent push with backoff, auth wait and refused-row isolation, photo row then blobs, pull by cursor, conflict detection), sync pill and drawer with storage and keep-offline, fake server with knobs, 6 sync tests, e2e offline to online round trip with a pulled office row |
| WS7 shift handover | **COMPLETE 2026-09-07: engines #153 (with the WS8 model) merged, Suite PR merged** | engines #153 (`reports.js`: handover and daily models from records on JSON templates, every fact cites its records, synthetic report day golden); Suite branch `feat/ws7-handover`: the report screen shared by handover and daily (period picker, generated sections read-only with sources on demand, narratives as versioned records that regenerate the report, record this version with the SHA-256 of the canonical model, sign-off row with role and hash, PDF via the brand header and DOCX via the OOXML writer) |
| WS8 daily report and countersignature | not started | |
| WS9 close-out (help, publish, portability, perf, tile) | not started | |

## Decisions taken in auto mode

Recorded per phase below as they are taken, with the reason.

### WS7

- One `ReportScreen` serves the handover and the daily report; only
  the template and the period differ, so the editing rule (spec section
  30) is enforced once: generated sections render with no inputs, the
  narratives edit their own record, and the report regenerates.
- A narrative is a `ws_records` row of kind `narrative` keyed by its
  section and the period start; a later edit is a new version on the
  chain and the report cites the head.
- Recording a report stores the whole model as `canonical` with
  `sha256:` of its canonical JSON; signing records that version first
  if the model changed since the last record, so a sign-off always names
  the hash of what was on screen.
- The WS7 and WS8 engine work shipped together (#153): both reports are
  one model builder with two templates.
- `src/lib/wellsite/reports.js` (the engine shim) and a `reports/`
  directory cannot coexist under jest's mapper (nor under Vite's
  resolver until the dev server restarts); the hash helper lives at
  `reportHash.js`.
- Importing jsPDF into the workstation's mount graph broke every Dexie
  transaction under jsdom ("Transaction has already completed or
  failed"): jsPDF does not replace Promise but patches enough of the
  environment to break Dexie's zone. The PDF and DOCX writers load on
  demand from the export buttons (`import('../services/wsExport')`),
  which also keeps jsPDF out of the app's first chunk; the builders have
  their own store-free test on the engine golden.

### WS6

- The PWA precaches only the shell (index and the entry chunk) and
  caches hashed assets as they are fetched; Wellsite Studio's own lazy
  chunks are fetched on demand by Keep offline. Nothing under the
  Supabase paths is ever cached or falls back to index.html.
- `registerType: 'prompt'`: a new build waits for the person to reload;
  never swapped under a user mid-shift.
- The entitlement snapshot is per user (the old single key leaked one
  person's licence to the next on a shared laptop) and is used only when
  the failure is the network's; a genuine empty answer still locks out.
  ProtectedAppRoute shows a banner while working from it, with a 30 day
  ceiling.
- Push is `upsert(..., { onConflict: 'id', ignoreDuplicates: true })`, so
  a retried batch is harmless; a refused batch is retried row by row and
  only the offending row stays local and visible. Pull is by the
  server-assigned `server_seq` per table; own rows come back and merely
  confirm.
- Conflicts are recomputed after every pull with the same rule as the
  server's `ws_conflicts` view (two heads on a chain, two open calls or
  two finals for one formation).
- The sync subscription fires on local commits and completed cycles, not
  on every counter tick: the first cut re-read the well fourteen ways per
  tick and slowed the screens.
- The PostgREST `ignoreDuplicates` path is exercised against the real
  backend only by a signed-in session; the fake server mirrors the
  semantics. The live round trip is on the owner's staging walk list.
- `packages/engines/__tests__/dca.montecarlo.test.js` failed once under
  full-suite load during WS5 and passes alone: a load flake, not a
  regression.

### WS5

- The prognosis is a versioned snapshot row (`ws_prognosis`), loaded
  online by an administrator or edited by hand (a new version each
  time), so the rig knows which version and date it works from.
- Offset tops carry a subsea depth computed through the offset well's
  own registry survey at load time; the approach panel compares subsea
  depths, never MD across wells.
- A first official call is preliminary or confirmed; final needs an
  approver role on the well; a withdrawn call is not current and never
  publishes. Every change is a new version on the chain.
- Calling a top records a `top_called` event citing the call, and the
  call cites the interpretation and the observations chosen as evidence,
  so a reviewer walks Event to Decision to Interpretation to
  Observations (spec section 35).
- Rows arriving from elsewhere are stored through `_pullRows` with no
  outbox entry; the harness `?conflict=1` uses it to stand in for the
  office until the sync engine lands in WS6.

### WS4

- The show quality is derived at render from the stored controlled
  values and never written to the record (spec section 20).
- Photo variants are made on the main thread with `createImageBitmap`
  (decoding is already off-thread in the browser) rather than a worker:
  one 2048 px resize is well under the interaction budget and a worker
  would have needed its own jest factory mapping. Revisit if a rugged
  tablet shows jank.
- Photos live in the local blob store and display by object URL; nothing
  is fetched, so the grid works offline and after a reload. The outbox
  carries one entry per photo; the sync engine (WS6) uploads the
  variants behind it.
- A photo on a sample records the `photographed` stage when the
  mandatory chain allows it, otherwise silently waits (the guard is the
  authority).
- Observations default their depth to the lagged sample depth now; the
  geologist can pick the bit depth, type one, or record none.

### WS3

- The sampling programme is a Decision record (`subtype sample_programme`,
  spec section 33.4 lists a programme change as a decision); a change is
  a new version on the chain and needs an authoriser.
- Samples are scheduled automatically three programme intervals ahead
  of the latest bit depth, so the next sample is always visible without
  a thousand rows being minted at once.
- A cuttings sample at depth D represents the interval (D minus one
  interval, D]; Describe from a sample prefills that interval and records
  the `described` stage on save.
- The mandatory-stage guard runs in the local backend as well as in the
  server trigger, so the refusal is immediate offline.
- The board derives `scheduled` and `due` from lag and time; only the
  stages a person records (caught onwards) are offered as buttons.

### WS2

- An event is a `ws_records` row of kind `event` with the type as its
  subtype; ending a duration event is version 2 on the same chain with
  `ended_at`, never an update. The current state of an event is the head
  of its chain (`eventsFromRecords`).
- The WS2 and WS3 engine modules shipped in one engines PR (#149): the
  event vocabulary is tiny and the lag engine was ready; the Suite phases
  stay separate.
- A point event (bottoms up, cavings, top called) starts and ends at the
  same instant; the first cut computed the end a millisecond before the
  start and the record refused itself.

### WS1

- A cuttings description is an observation (`subtype cuttings_description`)
  with the top and base as the record's two depths and the structured
  components in the payload; the abbreviation and the narrative are never
  stored (only the profile id used), so the record cannot drift from its
  rendering.
- The description screen's fields resolve typed text on leaving the
  field (Tab, Enter) rather than on every keystroke, so a geologist can
  type "lt gy" or "f-m" in one go; an unresolved entry keeps its text and
  goes amber with the engine message.
- The next description defaults its top to the previous base and its
  base to top plus the sample interval (setting `sample_interval_m`,
  default 10 ft), matching the sampling programme WS3 formalises.
- Engine defect found by the screen: rendering a draft component with no
  lithology threw; both renderers now skip such rows (engines #148).
- Field text is read from a ref on commit: a blur fired by a
  programmatic focus change (Copy previous) was committing stale empty
  text over the copied codes.

### WS0

- Rig geometry, BHA, drillpipe and pump are a dated `rig_config`
  observation, not a well setting: a casing run or a BHA change is
  something that happened on the rig, it must be recordable offline by
  the geologist, and its history matters to the lag record. Well
  settings (offset, tours, approver roles, mandatory stages) stay on
  `ws_wells.settings`, changed by an administrator.
- Bit depth and pump rate changes are observations too (`bit_depth`,
  `pump_rate`), so the lag engine in WS3 reads one time-ordered log and a
  gateway in Release 2 feeds the same shapes.
- The harness runs the real local database with a fake transport rather
  than a separate in-memory backend: one backend implementation, and
  Playwright exercises the actual store (an offline reload keeps the
  record, proven in the WS0 e2e).
- Depth columns are real columns with an all-or-none CHECK on the
  server, so a partial depth is refused by Postgres as well as by the
  client; `md_calc_m` keeps the registry convention (metres MD below KB).
- Multi-writer `ws_*` with per-well membership is a deliberate departure
  from the registry's owner-only rule (migration header says so); the
  registry is only written through Publish (WS9).
- jsdom lacks `structuredClone`; a guarded v8-based polyfill now sits in
  `src/__tests__/setup.js` for every jest suite.
- Seed times are relative to now so a record made during a test sorts
  after the seed (a fixed future date broke that).

## Owner actions outstanding

- WS1: validation team review of the description screen on staging
  (two wellsite geologists, one operations geologist).
- WS6: install the PWA on a Windows laptop and a tablet against staging
  and confirm the offline reopen.
- WS9: simulated shift on staging (spec section 55), production upload,
  then the deploy-gated tile seed.
