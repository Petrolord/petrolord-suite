# Guided Journey: design for stages 1 and 2

Status: DESIGN, revision 2, 2026-10-17.

Owner decisions of 2026-10-17:
- stages 1 and 2 ship before NAPE (9 to 11 November);
- Seismolord is the first workflow for AI delegation (stage 5);
- AI delegation and autopilot are a premium tier;
- the second engineer has agreed the journey table.

Revision 2 adds three things the owner asked for the same day:
1. **Guidance by discipline.** Drilling, production, facilities, refinery and
   other staff are never shown seismic or log steps.
2. **A Suite-wide Activity indicator.** Running work can be found from any
   app.
3. **One leave guard for every app.** Leaving never silently stops or loses
   work.

The owner's own case is the reason for 2 and 3. A preview closed the import
dialog before anything was imported, and a visit to Well Data Manager
cleared it. The immediate Seismolord fix is #1192.

## 1. What this is

Petrolord greets every user by name on every login. It knows where each
person is in their journey and in their own discipline, and points to one
sensible next step:

- someone just added to an organisation is welcomed and told what to do first;
- someone with no project of their own is shown how to make one;
- someone with a project but no work in it is told what to start with and
  exactly where. This depends on their discipline: a well plan for a drilling
  engineer, a crude assay for refinery staff, seismic for a geophysicist;
- someone who has just started their first piece of work is asked what they
  want to do next, from a short list with one recommended.

Anyone can say "I'll find my way, I'll call you when I need you". From then
on the greeting stays, the cards and prompts stop, and a Guide button brings
help back on demand.

Whatever is running (uploads, conversions, server jobs) or unsaved shows in
one Activity indicator in every app. Leaving an app never silently stops or
loses work.

Stage 1 is the journey record (one table, one config table, three
functions). Stage 2 is everything the user sees:

- the greeting;
- the discipline choice;
- the guide card and drawer;
- the quiet switch;
- the "what next" prompt;
- the Activity indicator and the leave guard.

Stages 3 to 6 (workflow maps, Ask Petrolord, AI delegation, autopilot) build
on these and are out of scope here.

## 2. What exists today (main e648de626, plus #1192)

| Piece | Where | Use in this design |
|---|---|---|
| Landing greeting "Welcome back, {first name of full_name} or Explorer" | `src/pages/Dashboard.jsx:134` | Replaced by the shared greeting |
| First-run gate: an invited user without a profile goes to /profile | `src/components/OnboardingRoute.jsx:17` | Kept; the guide starts after it |
| Shell content area `<DashboardScope><OrgClosureBanner/><Outlet/>` | `src/layouts/DashboardLayout.jsx:86-89` | The guide card mounts here |
| Sidebar (hidden inside full-screen apps) | `src/components/DashboardSidebar.jsx` | Guide and Activity buttons |
| Ten modules, 105 apps | `src/data/suiteCatalog.js` `SUITE_MODULES` | The discipline list and starter packs |
| Membership: `status`, `invited_at`, `joined_at`, `role` | `organization_members` | "Just added" detection |
| A Default project for every org or solo user | `suite_project_bootstrap` | "Has a project" means a non-default active one |
| Per-app saved-work tables with a project column | `projectsService.APP_MOVABLE`, `MOVABLE` | "Has work in this app" |
| Seismic and well registries | `seismic_volumes`, `geo_wells`, `geo_surfaces`, `qi_datasets` | "Has data" for geoscience |
| Entitlements | `usePurchasedModules`, `useUserEntitlements` | Recommend only apps the user can open |
| Seismolord Start-here panel (pure `buildStartHere`) | `src/pages/apps/Seismolord/lib/startHere.js` | The pattern this design generalises |
| Seismolord background runtimes | `importJobsRuntime`, `localImportRuntime`, `serverUploadsRuntime` (#1192), `localWorkspace/jobs` | First Activity sources |
| 10 s debounced autosave cancelled on unmount, in 31 studio contexts and `useFluidStudioProjects` | `src/contexts/*Context.jsx` | Closed by the shared pending-save hook (section 6.3) |
| Router | `BrowserRouter` (not a data router, so no `useBlocker`) | The leave guard intercepts links itself (section 6.4) |

## 3. Principles

1. **Only what this person needs.** Every step, card and prompt is filtered
   by the person's disciplines and by the apps they can open. A drilling
   engineer never sees seismic, logs or wells-for-correlation. A refinery
   planner never sees upstream steps. When nothing applies, the card shows
   nothing.
2. **Derive, do not duplicate.** Journey state is computed from the tables
   that hold the facts. The journey table holds only the person's choices
   (disciplines, guidance mode) and what they have seen or dismissed.
3. **One next step, not a checklist wall.** The card shows the single best
   step and at most three alternatives.
4. **Respect the no.** Quiet mode removes every card and prompt everywhere,
   across devices, until the person turns guidance back on.
5. **Work is never lost silently.** Anything running, or not yet saved, is
   visible from anywhere. Leaving says what will continue and what would be
   lost.
6. **Pure engine, thin UI.** `buildJourney` and `buildActivity` are pure,
   jest-tested functions; components only render them.
7. **Copy rules.** No em dashes and no "X, not Y" contrasts. Depth is in feet
   by default (oilfield preset) wherever it appears.

## 4. Disciplines

### 4.1 The choice

The disciplines are the ten Suite modules plus one role:

| Key | Shown as |
|---|---|
| geoscience | Geoscience (seismic, wells, maps, petrophysics) |
| reservoir | Reservoir engineering |
| drilling | Drilling and completion |
| production | Production operations |
| facilities | Facilities engineering |
| process-safety | Process safety |
| midstream-downstream | Midstream, refining and downstream |
| economics | Economics and project management |
| assurance | Assurance, risk and compliance |
| data-ai | Data and AI |
| management | Management and overview (no single discipline) |

How a person's disciplines are set:

- **Asked once,** in the welcome (J1) or on the first login after this ships:
  "What do you mainly work on? Choose one or more." The question has a
  "Skip" button.
- **Pre-ticked** from the modules the person can open. A user with only
  Drilling apps sees Drilling ticked and the rest available.
- **If they skip,** the disciplines are inferred from the modules they can
  open, and recorded as `disciplines_inferred`. The question is not asked
  again.
- **Changeable at any time** in Profile and in the Guide drawer.

A person with no answer and access to every module gets only
discipline-neutral steps (project, team), plus a gentle "Tell us what you
work on and we'll point you to the right apps". Nothing discipline-specific
is pushed.

### 4.2 Starter packs

Each discipline has a starter pack. It names the recommended first app and
action, the alternatives, and the "what next" list that follows the first
piece of work. This is the stage 2 table, owner-reviewable. Stage 3 replaces
it with full workflow maps.

| Discipline | Recommended first step (where) | Alternatives |
|---|---|---|
| Geoscience | Load seismic: SEG-Y or ZGY (Seismolord, import) | Load wells and logs: LAS (Well Data Manager); load surfaces (Mapping & Surface Studio) |
| Reservoir | Describe your fluid: import a PVT report or start from correlations (Fluid Systems Studio) | Load production history (Decline Curve Analysis); pressure and production history (Material Balance Studio); interpret a well test (Well Test Analysis Studio) |
| Drilling | Plan a well: start a trajectory or import a survey (Well Design Studio) | Casing design (Casing & Tubing Design Studio); cost and time (Well Cost & Time Estimator) |
| Production | Build a well model (Nodal Analysis Studio) | Load production data (Production Surveillance Studio); choose a lift method (Artificial Lift Advisor) |
| Facilities | Size a line (Pipeline & Line Sizing Studio) | Separator (Separator & Slug Catcher Studio); relief and flare (Relief & Flare Studio) |
| Process safety | Start a LOPA study (LOPA & SIL Studio) | Consequence modelling; QRA |
| Midstream and downstream | Load a crude assay (Crude Assay & Blending Studio) | Refinery planning; terminal and depot |
| Economics | Build a project case (Petroleum Economics Studio) | Fiscal regime; NPV scenarios |
| Assurance | Open the risk register (Risk Register) | Management of change; audits |
| Data and AI | Check a dataset (Data Quality Studio) | ML Workbench |
| Management | See your team and projects (Dashboard, Projects) | Invite your team (admins) |

The "what next" lists for the pilot pair, seismic and wells, are in 5.5. For
the other disciplines, stage 2 ships the starter step and its alternatives.
Their "what next" lists come with stage 3. Until then those disciplines get
no "what next" prompt rather than a guessed one.

Every pack entry names an app id. An entry is shown only when the person can
open that app; otherwise the next alternative is used. When none of a
discipline's apps can be opened, the card says "Your organisation has no
{discipline} apps yet". Members are told to ask their admin. Admins get
"Choose apps" (Modules page).

### 4.3 What counts as "started"

Each starter step has a work source that shows the person has started:

| Discipline | Counts as started |
|---|---|
| Geoscience | Rows in `seismic_volumes`, `geo_wells` or `geo_surfaces` |
| Every other discipline | A saved case in the app's own table, from `APP_MOVABLE` (for example `saved_well_design_projects`, `saved_crude_assay_projects`, `saved_mbal_projects`) |

The mapping lives in a small config table (4.4.2), so adding an app needs no
code change in the journey function.

## 5. Stage 1: the journey record

### 5.1 Table `suite_user_journey`

| Column | Type | Meaning |
|---|---|---|
| `user_id` | uuid PK, FK auth.users, on delete cascade | One row per person |
| `disciplines` | text[] default '{}' | Keys from 4.1 |
| `disciplines_source` | text, check in ('chosen','inferred'), null | How they were set |
| `guidance` | text, check in ('guide','quiet'), default 'guide' | Guide me, or I'll call you |
| `guidance_changed_at` | timestamptz | When the choice was last made |
| `welcomed_orgs` | uuid[] default '{}' | Organisations whose welcome the person has seen |
| `dismissed` | text[] default '{}' | Step keys dismissed ("not for me") |
| `acknowledged` | jsonb default '{}' | Prompts answered, for example `{"after_first:seismic": "2026-10-20T..."}` |
| `last_greeted_at` | timestamptz | For "welcome back after a while" |
| `created_at`, `updated_at` | timestamptz | |

Row-level security:

- a person selects, inserts and updates only their own row;
- there is no delete policy (the row goes with the auth user);
- impersonating sessions never write, checked by the client and by the RPCs.

### 5.2 Config table `suite_journey_work_sources`

| Column | Type | Meaning |
|---|---|---|
| `app_id` | text PK | As in `master_apps` and the routes |
| `discipline` | text | Key from 4.1 |
| `table_name` | text | A table with `user_id`, and `organization_id` or `suite_project_id` |
| `kind` | text | 'data' (loaded files) or 'case' (saved work) |

- It is read-only to clients and seeded from `APP_MOVABLE` plus the
  geoscience registries.
- A jest guard keeps it equal to `APP_MOVABLE`, so a new app's table is not
  forgotten.

### 5.3 Functions

**`suite_journey_state(p_project uuid default null)`.** Security invoker,
stable, returns one jsonb in one round trip:

```
{
  "now": ...,
  "user": { "display_name", "full_name", "email", "created_at", "last_sign_in_at", "invited_at" },
  "org": { "id", "name", "role", "status", "joined_at", "member_count", "solo" },
  "projects": { "real", "shared_with_me", "current_id", "current_is_default" },
  "work": { "<app_id>": { "any": bool, "in_project": bool, "first_at": ts } , ... },
  "journey": { the suite_user_journey row, or defaults }
}
```

- `work` is computed only for the work sources of the person's disciplines,
  or inferred disciplines, or every entitled app when neither is known.
  Each one is an `exists` probe on indexed columns, so cost does not grow
  with account size.
- Because the function runs as security invoker, RLS decides what counts,
  exactly as in the apps. Colleagues' shared rows count; other orgs' never do.

**Writes.** Two small RPCs, so the client never builds array updates:

- `suite_journey_set(p_guidance text default null, p_disciplines text[] default null, p_source text default null)`
- `suite_journey_mark(p_kind text, p_key text)`, where kind is one of
  `welcomed_org`, `dismissed`, `acknowledged`, `greeted`

### 5.4 Migration hygiene

- One file, `2026MMDD_suite_user_journey.sql`, covering both tables, the
  three functions, grants and the seed.
- Applied staging first, then a rolled-back dry run against prod (grep for
  begin and commit first: no nested commit).
- Logged in MIGRATIONS.md and applied by the owner.
- Second engineer: agreed on the table. This revision adds the `disciplines`
  columns and the config table, so they see the revision before G0.

## 6. Stage 2: what the user sees

### 6.1 The greeting (every login, always, even in quiet mode)

- **Name:** `display_name`, else the first word of `full_name`, else the part
  of the email before "@".
- **Words:** by the time of day in the person's own time zone, "Good morning,
  Ayo". The first ever login gets "Welcome to Petrolord, Ayo". After 14 days
  away it adds "It has been a while".
- **Where:**
  - the Dashboard header, replacing "Welcome back, Explorer";
  - after sign-in, when the person lands inside an app, a small toast once
    per session.
- **Line two** (guide mode only) is the one-line next step from the person's
  own starter pack.

### 6.2 Journey states

`buildJourney(state, { entitlements, role, disciplines, now })` returns
`{ stage, headline, next, also, path, prompts }`. The first matching state
wins:

| # | State | Detected by | Next step |
|---|---|---|---|
| J0 | Profile not set up | existing `OnboardingRoute` gate | (the gate) |
| J1 | Just added to an organisation | `joined_at` within 30 days, org not in `welcomed_orgs` | Welcome: org, role, team size, the discipline question, then J2 to J4 as live-ticking steps |
| J2 | No project of my own or shared with me | `projects.real = 0 and shared_with_me = 0` | Admin or solo: "Create your first project". Member: "Ask your admin to add you to a project, or create your own". Also possible: "Work in the Default project for now" |
| J3 | Project, no work started in it for the person's disciplines | every `work.*.in_project` false | The starter step for each chosen discipline (4.2), primary first |
| J4 | Something running | Activity has a running item | "Your {thing} is being prepared. You can keep working; it is under Activity." |
| J5 | First work just started in a discipline | `work[app].first_at` is new, and `after_first:<discipline>` is unanswered | The "what next" prompt (6.5), for disciplines that have one |
| J6 | Working | none of the above | Nothing pushed. The drawer shows the path |

Admins and owners have extra steps folded into J1 to J3 where they apply:
"invite your team" (Employees) and "choose your apps" (Modules). Solo users
skip the team steps.

### 6.3 Guide card, Guide button, drawer, quiet mode

**Guide card** (guide mode only):

- Shown once, in `DashboardLayout` under `OrgClosureBanner`, so it appears
  on the Dashboard and Suite pages. It is hidden inside full-screen apps,
  which have their own Start-here panels.
- One headline, one primary button, up to three alternatives.
- "Not now" hides it for the session.
- "I'll find my way" switches to quiet mode and shows a one-line note saying
  where the Guide button is.

**Deep links.** Primary buttons open the right dialog, not only the page.
Each app reads its own parameter once, then clears it:

| Link | Opens |
|---|---|
| `/dashboard/projects?new=1` | Create project |
| `/dashboard/employees?invite=1` | Invite |
| `...?do=import` | The import, in Seismolord, Well Data Manager and the reservoir data apps |
| `...?do=new` | A new case, in case-based apps (Well Design Studio, Pipeline & Line Sizing Studio, Crude Assay & Blending Studio, and others) |

Apps without a handler simply open; adding handlers is a small, per-app
follow-up.

**Guide button.** In the sidebar footer, in the phone top bar, and as a small
floating button inside full-screen apps, where the sidebar is hidden. It is
visible in both modes.

**Drawer.** It shows:

- the greeting;
- "where you are" (org, role, current project, what work it holds);
- the path for each discipline;
- the discipline choice;
- the switch, "Guide me" or "I'll call you when I need you".

Opening the drawer does not turn guide mode back on; the switch does. The
same switch and the discipline choice are also on the Profile page.

### 6.4 Activity and the leave guard (new in revision 2)

**Activity registry.** `src/lib/activity/activity.js` is a Suite-wide
in-memory registry for the tab. Each item is:

```
{ id, appId, appName, kind: 'upload'|'conversion'|'server-job'|'unsaved',
  title, progress: 0..1|null, state: 'running'|'paused'|'failed'|'done'|'dirty',
  href (where to go back to), onLeave: 'continues'|'stops'|'loses', actions: {pause, resume, cancel, save} }
```

Sources, in this order:

1. **Seismolord** publishes through adapters on its existing runtimes:
   browser imports, imports to this computer, server uploads (#1192), and
   browser jobs (attributes, QI on this computer).
2. **Server jobs.** The person's queued or running `qi_jobs` are read on
   sign-in and polled every 20 s only while any are running.
3. **Unsaved work.** The shared `usePendingSave` hook registers each studio
   that has edits not yet saved.

**Activity indicator:**

- In the sidebar and phone top bar: a count, with a spinner while anything
  runs.
- Inside full-screen apps: the same floating button as the Guide, showing
  "2 running".
- A popover lists the items with progress and actions. Clicking an item goes
  to its `href`; for a Seismolord import that opens Seismolord on the import
  progress.
- Finished items stay for the session, so "your upload finished" is not
  missed.

**`usePendingSave` (closes the autosave hazard).** One hook replaces the
pattern in the 31 contexts and `useFluidStudioProjects`:

- it keeps the dirty flag and the save function;
- it flushes on unmount, `visibilitychange` and `beforeunload`;
- it registers an 'unsaved' Activity item while dirty;
- it is adopted context by context, with one generic jest test and a per-app
  smoke test.

**Leave guard.** The app uses `BrowserRouter`, so the guard intercepts links
itself:

- a capture-phase click listener on internal links, plus the app's own Back
  links;
- `beforeunload` for closing the tab;
- a re-push on `popstate` for the browser's Back button.

When the person would leave an app that has items:

- **`continues`** (background uploads and jobs): no dialog. A toast says
  "Your upload carries on in the background. It is under Activity."
- **`loses`** (unsaved edits that cannot flush, or a preview of an
  unimported file): a dialog. "Leaving now loses: {list}. Save and leave /
  Leave anyway / Stay." Save and leave runs the flush first.
- **`stops`** (work that genuinely ends with the page, such as an in-dialog
  v1 import): a dialog naming what stops.

**Guidance link.** J4 ("something running") reads Activity, so the guide and
the indicator never disagree.

### 6.5 "What next" after the first work

- Shown in guide mode only, once per discipline, and recorded as
  `after_first:<discipline>`.
- Stage 2 ships it for the geoscience pair; other disciplines get theirs
  with stage 3.
- In Seismolord it hands over to the Start-here panel.

| After | Recommended | Also possible |
|---|---|---|
| First seismic volume ready | Open it and look at an inline | Load wells to tie; check the survey outline; the 5-minute Seismolord lesson |
| First wells loaded | Check the logs (Well Data Manager) | Correlate wells; interpret logs (Petrophysics Studio); show them on seismic (Seismolord), if a volume exists |

### 6.6 New organisation member: the welcome

> Welcome to Lordsway Energy, Chidi. You were added as a member on
> 14 October, and your team has 6 people. What do you mainly work on?
> [Drilling and completion ✓] [Production operations] ... [Skip]
> Then: choose or create a project, start your first piece of work in
> Well Design Studio, and open your first app.

The welcome is acknowledged when its steps are done, or when the person
chooses "I'll find my way". A person who later joins a second organisation is
welcomed into that one too.

### 6.7 Demo, QA and video accounts

- The demo account used for recordings is set to quiet before any further
  recording, so no card appears in takes.
- Storyboards that show the guide set guide mode explicitly.
- The QA account keeps guide mode: it has no licences, so it exercises the
  "no apps" branch.

## 7. Client architecture

| Module | Role |
|---|---|
| `src/lib/journey/disciplines.js` | Keys, labels, starter packs (4.2), pure lookup by entitlements |
| `src/lib/journey/buildJourney.js` | Pure rules engine (states, steps, prompts) |
| `src/lib/journey/greeting.js` | Pure name and words |
| `src/lib/journey/journeyService.js` | The three RPCs |
| `src/lib/journey/deepLinks.js` | Link builders and `useDeepLinkAction(key, fn)` |
| `src/lib/activity/activity.js` | Registry, `useActivity()`, pure `buildActivity` summary |
| `src/lib/activity/usePendingSave.js` | The shared save hook |
| `src/lib/activity/leaveGuard.js` | Link, Back button and tab-close interception |
| `src/lib/activity/sources/seismolord.js` | Adapters for the Seismolord runtimes |
| `src/lib/activity/sources/serverJobs.js` | `qi_jobs` reader |
| `src/contexts/JourneyContext.jsx` | Loads state after sign-in, refreshes on focus (at most once a minute), on project change and on Activity changes |
| `src/components/journey/*` | GreetingHeader, GuideCard, GuideDrawer, DisciplinePicker, WhatNextDialog, GuidanceSwitch |
| `src/components/activity/*` | ActivityButton, ActivityPopover, LeaveDialog, FloatingShellButtons (inside apps) |

Cost: one RPC per sign-in, per focus (throttled) and per project switch.
Server jobs are polled only while some are running. There is no other
polling.

## 8. Tests and acceptance

**jest:**

- `buildJourney`: every state for owner, admin, member and solo roles. Each
  discipline, single and mixed, with and without each app's entitlement.
  Quiet mode suppressing everything but the drawer.
- Negative controls:
  - a drilling-only person never gets a seismic, log or well-correlation
    step;
  - a refinery-only person never gets an upstream step;
  - an unentitled app is never recommended;
  - a member never gets an admin step.
- `greeting`: the name fallbacks, time zones around the hour boundaries,
  first login, a 14-day absence, impersonation.
- `activity`: registry, summary, and the leave decision per `onLeave`.
- `usePendingSave`: flush on unmount and on visibility change, and the dirty
  item appearing and clearing.
- Guard: the work-sources seed equals `APP_MOVABLE` plus the registries.

**Database tests** (real Postgres):

- RLS: own row only;
- shared rows count and other orgs' rows do not;
- the default project is not "real";
- the RPCs are idempotent;
- impersonated sessions cannot write;
- an unknown discipline key is refused.

**e2e** (signed-out harness `/dev/guided-journey`, in-memory backend):

- the card for each state and each discipline;
- the discipline question;
- "I'll find my way";
- the deep links;
- the Activity popover;
- the leave dialog for unsaved edits.

Plus #1192's import-trap spec, extended to the Activity indicator.

**Live probes** (QA account and a throwaway org, cleaned afterwards):

- an invited member gets the welcome and the discipline question;
- a drilling-only member's first step is Well Design Studio;
- a ZGY import shows in Activity from Well Data Manager.

**Acceptance (owner walk on staging):**

- a brand-new drilling engineer reaches a saved well plan through the guide
  alone and never sees seismic;
- a geoscientist starts a ZGY import, wanders to two other apps, sees it
  under Activity, and returns to it;
- quiet mode holds across devices;
- the greeting by name appears on every login.

## 9. Delivery plan (before NAPE)

| Step | Content | PR |
|---|---|---|
| 0 | Seismolord import-trap fix: start-and-view, setup kept, background server uploads, reopen where you were | #1192 |
| G0 | Migration (journey table, work sources, functions, grants, seed), db-tests, MIGRATIONS.md; the owner applies it after a rolled-back prod dry run | 1 |
| G1 | `disciplines`, `buildJourney`, `greeting`, `journeyService`, `JourneyContext`, jest | 2 |
| G2a | Activity registry, Seismolord adapters, server-jobs source, Activity button and popover, floating buttons inside apps, leave guard | 3 |
| G2b | `usePendingSave`, adopted by the 31 contexts and Fluid Studio (closes the autosave hazard) | 4 |
| G2c | Greeting, discipline picker, guide card, drawer, switch, deep links (projects, employees, Seismolord, Well Data Manager, the starter apps) | 5 |
| G3 | "What next" for seismic and wells; demo account set to quiet; Suite help | 6 |
| G4 | e2e harness, live probes, STATUS doc, deferred register | 7 |

About 11 to 13 working days. Target: merged and in one Suite zip by
31 October, leaving NAPE week for rehearsal. Merge on green under the
programme's authority. The migration and the zip upload are the owner's.

## 10. Defaults chosen (change any of them)

1. Everyone starts in guide mode. A working user (J6) only sees the greeting,
   the Guide button and Activity; nothing is pushed.
2. Greeting words follow the time of day in the person's own time zone.
3. "Just added" means within 30 days of `joined_at`.
4. The welcome names the organisation and role, not the inviter (the
   inviter is not recorded reliably).
5. "What next" appears once per discipline, in guide mode, only where a list
   exists (geoscience first).
6. The discipline question is asked once, can be skipped (disciplines are
   then inferred from the apps the person can open), and can be changed any
   time.
7. Nothing in stages 1 and 2 is premium. The premium tier starts at stage 5,
   where cards will offer "Let Petrolord do it" to entitled organisations.

## 11. Later stages hook in here

- **Stage 3, workflow maps:** one per discipline. They replace the starter
  packs and "what next" tables with the same `Step` shape and the same
  `acknowledged` record.
- **Stage 4, Ask Petrolord:** a tab in the Guide drawer, given the journey
  state and Activity as context.
- **Stage 5, Seismolord delegation (premium):** "Let Petrolord do it" on
  steps such as picking faults, then tracking horizons from seeds. Each runs
  as an Activity item with a review gate.
- **Stage 6, autopilot (premium):** a workflow map run end to end as a chain
  of Activity items, with the gates the person chooses.
