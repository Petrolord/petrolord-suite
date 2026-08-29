# FDP Accelerator slim rebuild (Economics E3) — status

Phase: Economics E3 (Economics-ROADMAP.md §6 E3)
Status: **SHIPPED 2026-08-29** (branch feat/economics-e3)
Owner decision this implements: **SLIM REBUILD, not archived**
(E-series locked decisions, 2026-08-29).

## What the app was

The FDP Accelerator was the module's largest liability: a 33-line page
over roughly 11,000 lines of context, layout, modules and services, with
no tests, no server-side persistence, and fabrication reachable from the
first screen.

The audit called out product-theatre modules and mock seams. Working
through them found more than the audit had listed, and all of it was the
same kind of thing: the app telling the user something that was not so.

## What was deleted, and why

### Seven theatre modules

- **Mobile App** — a mobile application that does not exist, with an
  analytics panel reporting 45 daily active users, a 99.8 percent crash
  free rate and an average session of 12m 30s. All four numbers were
  literals in a service file.
- **API Integration** — a REST and GraphQL API that does not exist,
  including a request tester that "called" it and got mock responses
  back, and an API health panel reporting 1.2 million requests across
  15 endpoints.
- **Optimization** — the `OptimizationService` returned a well count
  from `Math.random()`, a hardcoded "+15.4 percent NPV" improvement and
  a "convergence: true" flag, behind a 2.5 second wait that existed to
  look like computation. The Cost Optimization panel was entirely
  hardcoded: a Pareto chart whose bars were fixed at 35, 25 and 15
  percent whatever the plan's costs were.
- **Collaboration** — a mock team, mock comments and mock notifications.
  One handler carried the comment "for now, just show success as we are
  in a mock environment".
- **Workflow & Tasks** — mock tasks, mock approvals and a mock audit
  log. An audit log is the last thing that should be invented.
- **Training Academy** — mock courses. The Suite's real training is
  NextGen Academy.
- **Help Center** — mock FAQs, mock articles and mock video tutorials
  for videos that do not exist. Replaced by a real help guide, below.

### Seven fake cross-app imports

Every remaining module carried an Import or Sync button wired to a
service that announced it was contacting a real Suite application,
waited behind a simulated latency, and returned hardcoded values:

| Button said | Actually did |
|---|---|
| "Retrieving field data from connected apps", then "Field data updated from Geoscience & Reservoir apps" | Returned a fixed porosity of 0.22, permeability of 450 md and a STOOIP of 450 MMbbl |
| "Connecting to reservoir engines" | Returned two fixed zones and a fixed pore pressure and fracture gradient |
| "Connecting to Well Design Studio" | Returned three fixed wells, then stamped every one with a default 30 days and $7.5MM |
| "Importing from AFE & Project Management" | Returned eight fixed cost lines |
| "Syncing with HSE Management System" | Returned three fixed risks |
| "Loading plan from Project Management Pro" | Returned seven fixed activities |
| "Loading facility templates" | Returned three fixed facility concepts |

This is the most serious of the findings. A user could take a porosity,
a rig rate or a cost sheet into a development decision believing it came
from their own subsurface, drilling or cost work.

The data itself is a serviceable worked example of an offshore oil
development, so it is kept in `src/services/fdp/exampleData.js` and
called what it is. The buttons say **Load example**, the messages say
the figures are illustrative and not the user's project, nothing waits
to look like a network call, and nothing names another application as a
source. Real cross-app import is separate work; when it exists it will
read the Suite's own saved artifacts, the way Decision Studio already
reads saved Monte Carlo runs, decision trees and portfolios.

### Three more fabrications in the chrome

- The right panel's **"Active Integrations"** list showed five Suite
  apps with green connected dots, from a hardcoded registry that
  contacted nothing.
- Its **Validation** box always read "Facilities cost estimates are
  pending validation from the engineering team", whatever the plan
  contained.
- The top bar's **Save and Export buttons had no `onClick` at all**, and
  the notification bell carried a permanent red unread dot that was a
  styled span rather than a notification.

The panel now lists what the plan is actually missing, worked out from
the plan, so an empty list means the plan really does have its basics in
place. Save is the real studio-kit control. Export goes to the tab that
exports. The bell and the no-op profile button are gone.

### A real bug found in the same panel

The panel read `state.subsurface.reserves.p50`. The state keeps reserves
under `reserves.summary.p50`, so the Reserves stat had been rendering
undefined. Fixed, and gated.

### Dead code

`src/context/HelpContext.jsx`, `src/context/TrainingContext.jsx`, their
two service directories and the test helper that was their only
importer: a fully dead chain left over from the legacy LMS retirement.
`DataMapper`, `FieldDataManager` and `MachineLearningService` went with
the importers that were their only callers.

## What was kept

The plan itself, which is the real product: field overview, subsurface,
concepts, scenarios, wells, facilities, schedule, costs and economics,
HSE, community relations (its stakeholder register is genuine
user-entered CRUD), risk management, and FDP generation and export.
`DataValidator`, `RiskIntegrationService` and `FDPExportService` are
real and stay.

## What was added

- **Supabase persistence.** Migration `20260829820000` adds
  `saved_fdp_projects` on the `saved_<app>_projects` convention. A field
  development plan previously lived in one browser's localStorage and
  nowhere else: lost with the cache, invisible from any other machine,
  unshareable with the people who have to review it. Named plans now
  save and reopen through the shared studio-kit persistence
  (`src/hooks/useSavedProjects.js`, extracted in E2).

  The localStorage draft is **kept deliberately** as a scratch buffer,
  so a refresh does not lose work in progress before a plan has been
  named or while signed out. The help guide says plainly that the draft
  is a convenience and not a home.

- **A real help guide**, replacing the mock Help Center. It states which
  fiscal tier the economics belong to, where each number should come
  from, and what the tool does not do.

- **The first tests this app has ever had**: 14 of them, mounting the
  app, checking the plan-status logic and the example data, and guarding
  the deletions. Two of those guards read the source tree, so no file
  may import the deleted mock data or importers again, and no
  user-facing string may claim a sync that does not happen.

## Effect

- FDP JSX: 8,547 to 6,660 lines. The production bundle for this route:
  **262.7 kB to 187.9 kB**, a 28 percent cut, with every removed
  kilobyte being something that was not true.
- 25 files deleted, 3 added.

## Verification

- Jest 14 new tests green; full suite green.
- `npm run build` clean.
- Migration `20260829820000` is **PENDING** apply. Safe pre-deploy: no
  tile changes, and the app keeps its local draft and shows a stated
  "run the migration" message without the table.

## Left open

- Real cross-app import, as described above. It is a genuine feature and
  should be built against saved Suite artifacts, not simulated.
- The economics tab still runs on an illustrative production profile
  rather than the plan's own; the panel says so on screen. Wiring the
  plan's profile through is the natural next increment.
