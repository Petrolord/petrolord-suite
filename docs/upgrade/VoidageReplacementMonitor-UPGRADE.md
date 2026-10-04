# Voidage Replacement Monitor: comprehensive upgrade

App #7 of the Reservoir round of the upgrade programme
(`docs/scope/AppUpgrade-Reservoir-PLAN.md`). Step 1 (the practitioner lens
PL1 to PL12 of `docs/scope/AppUpgrade-BestPractices.md` and the reviewer lens
RL1 to RL12 of `docs/scope/AppUpgrade-Reservoir-FeedbackLessons.md`) runs on
branch `feat/vrr-u1`, started 2026-10-04. Step 2 (advancement review) is
analysis only; the programme lead chooses the batches.

- Route: `/dashboard/apps/reservoir/voidage-replacement-monitor` (ProtectedAppRoute, slug `voidage-replacement-monitor`).
- Harness: `/dev/studio/vrr` (in-memory Supabase double).
- Engine: `packages/engines/engines/waterflood/vrr.js` (byte-stable, the course oracle) and `vrrLedger.js` beside it.
- Earlier cycles: V1 to V4 (2026-08-28), senior test T1 (2026-09-27), design system pilot 5.

Work in progress. Sections fill as the items land.

## Findings

Severity: S1 wrong answer with no warning; S2 wrong or lost data, or a door
that misleads; S3 workflow gap or misleading text; S4 polish.

| ID | Sev | Check | Finding | Evidence | Status |
|---|---|---|---|---|---|
| VRR-U1-001 | S1 | PL2, RL10 | The ledger door missed "Water Inj (bbl)" (a space where its alias list had an underscore) and dropped the injection column with no word: VRR 0 and every injector read as a dead well. "Water inj (m3)" was worse: with no other water column it was claimed as water PRODUCED. | Probe; `vrrImportDoor.test.js` with the old importer as negative control. | Fixed: columns placed by name on the shared reader, injection first, a production column never holds "inj"; unused columns listed with the reason. |
| VRR-U1-002 | S2 | PL2, PL3 | Metric volumes read as oilfield: "Oil (sm3)" as bbl (6.29 times low), "Gas (10^3 sm3)" as Mscf (35.3 times high); no warning. | Same. | Fixed: units from the header on the Suite registry, chosen at the door, or assumed in the display system and said so; one known value pinned (1 sm3 = 6.289811 bbl). |
| VRR-U1-003 | S1 | PL1, PL2 | A rate column (BOPD, BWPD, Mscf/d) on monthly rows was summed as the month's volume, 28 to 31 times low. With production as rates and injection as volumes (a common allocation export) the cumulative VRR was 31.6 for a true 1.02, with no warning. | Same. | Fixed: a rate becomes the row's volume by the days of its period (one for daily rows, the calendar month for monthly rows, the gap to the well's next row otherwise), stated in the read-back. |
| VRR-U1-004 | S2 | PL2 | Comma decimals: "31.000,00" read as 31, "1.234,5" as 1.234. | Same. | Fixed: one decimal mark per file from the shared reader; an unsettled file says which reading it took. |
| VRR-U1-005 | S3 | PL2 | The manual grid import split on commas and needed the exact headers label,Np,Wp,Gp,Wi,Gi. | Code. | Fixed: the grid file on the shared reader, any separator and decimal mark, columns in any order. |
| VRR-U1-006 | S2 | PL2, PL3 | The pressure door read every number as psia: a kPa file 6.9 times high, bar 14.5 times high, psig 14.7 psi low. | Same. | Fixed: pressure unit from the header or chosen (psia, psig, kPa, kPag, bar, barg, MPa); gauge readings get the atmosphere (14.696 psi) added, said in the read-back. |
| VRR-U1-007 | S3 | PL2 | Day/month order: a file nothing settles was read day first with a warning (a guess). Month names ("Jan-2025") and Excel serial dates were refused. A second row for the same well and date was summed with no word. | Same. | Fixed: the door asks and the rows wait; month names and serial dates read; a second row that repeats a stream is left out and listed (one that only adds a stream is merged). |
