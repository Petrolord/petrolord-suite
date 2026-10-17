# Guided Journey: status

Design: `docs/scope/GuidedJourney-DESIGN.md` (revision 2, PR #1191).

Owner decisions of 2026-10-17:
- stages 1 and 2 ship before NAPE;
- Seismolord is first for AI delegation;
- delegation and autopilot are a premium tier;
- the second engineer agreed the journey table.

## Done (2026-10-17)

| Step | What | PR |
|---|---|---|
| 0 | Seismolord import-trap fix (start and view, setup kept, background server uploads, reopen where you were) | #1192 merged |
| Design | Revision 2: disciplines, Activity, leave guard | #1191 merged |
| G0 | Journey record: `suite_user_journey`, `suite_journey_work_sources` (83 sources, 79 apps), state and write functions. Dry run 45 of 45; applied by the owner 2026-10-17 and verified | #1193 merged |
| G1 | Engine: disciplines and starter packs, rules J1 to J6, greeting, service, `JourneyProvider` | #1194 |
| G2a | Activity in every app (registry, Seismolord bridge, server jobs) and the leave guard | #1195 |
| G2b | `usePendingSave` across the autosaving studios (closes the 10 s autosave leave hazard) | background agent PR |
| G2c | Greeting by name on every login, guide card, Guide button and drawer, discipline picker, quiet mode, Profile guidance, deep links | this branch |
| G3 | "What next" after the first seismic or wells. Options are filtered by licence and by work already done. The demo account is set to quiet (2026-10-17) | this branch |
| G4 | `/dev/guided-journey` harness and `e2e/guided-journey.spec.js` (7 scenarios) | this branch |

## Where things are

- **Engine:** `src/lib/journey/`.
- **UI:** `src/components/journey/`.
- **Activity:** `src/lib/activity/` and `src/components/activity/`.
- **Context:** `src/contexts/JourneyContext.jsx`.
- **Mounting:**
  - `JourneyProvider` sits inside `ProjectProvider` in `src/App.jsx`.
  - `JourneyShell` (card, or the floating Guide and Activity buttons inside apps, plus the "What next" dialog) and `ActivityRoot` sit in `src/layouts/DashboardLayout.jsx`.
  - The Guide and Activity buttons are in the sidebar footer and the phone bar.
- **Deep links:**
  - `/dashboard/projects?new=1`
  - `/dashboard/employees?invite=1`
  - Seismolord `?do=import` and `?panel=<dock panel>`
  - Well Data Manager `?do=import`
- **Database:** migration `20261017100000_suite_user_journey.sql`; dry-run kit `tools/security/journey/`.

## Open

- Live owner walk on staging after the next Suite zip (design section 8 acceptance).
- `?do=new` handlers in the case-based starter apps (they open the app page today).
- "What next" lists for the other disciplines come with stage 3.
- The browser's Back button is not intercepted by the leave guard. Pending saves flush on unmount instead (G2b).
