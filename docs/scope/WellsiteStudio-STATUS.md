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
| WS3 lag and sample scheduler | not started | |
| WS4 shows, observations, photos | not started | |
| WS5 tops, prognosis, conflicts | not started | |
| WS6 offline shell and sync | not started | |
| WS7 shift handover | not started | |
| WS8 daily report and countersignature | not started | |
| WS9 close-out (help, publish, portability, perf, tile) | not started | |

## Decisions taken in auto mode

Recorded per phase below as they are taken, with the reason.

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
