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
| WS1 description prototype | not started | |
| WS2 live well workspace and timeline | not started | |
| WS3 lag and sample scheduler | not started | |
| WS4 shows, observations, photos | not started | |
| WS5 tops, prognosis, conflicts | not started | |
| WS6 offline shell and sync | not started | |
| WS7 shift handover | not started | |
| WS8 daily report and countersignature | not started | |
| WS9 close-out (help, publish, portability, perf, tile) | not started | |

## Decisions taken in auto mode

Recorded per phase below as they are taken, with the reason.

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
