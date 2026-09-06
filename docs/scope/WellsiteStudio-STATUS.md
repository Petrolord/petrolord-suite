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
| WS0 foundation (depth, time, pumps; schema; local store; shell) | not started | |
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

## Owner actions outstanding

- WS1: validation team review of the description screen on staging
  (two wellsite geologists, one operations geologist).
- WS6: install the PWA on a Windows laptop and a tablet against staging
  and confirm the offline reopen.
- WS9: simulated shift on staging (spec section 55), production upload,
  then the deploy-gated tile seed.
