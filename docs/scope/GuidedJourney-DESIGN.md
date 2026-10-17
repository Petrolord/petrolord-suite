# Guided Journey: design for stages 1 and 2

Status: DESIGN, 2026-10-17. Owner idea and decisions of the same day:
stages 1 and 2 ship before NAPE (9 to 11 November); Seismolord is the first
workflow for AI delegation (stage 5); AI delegation and autopilot are a
premium tier; the second engineer has agreed the journey table.

## 1. What this is

Petrolord greets every user by name on every login. It knows where each
person is in their journey and always points to one sensible next step:

- someone just added to an organisation is welcomed into it and told what to
  do first;
- someone with no project of their own is shown how to make one;
- someone with a project but no data is told what to load and exactly where;
- someone who has just loaded data is asked what they want to do next, from a
  short list with one recommended.

Anyone can say "I'll find my way, I'll call you when I need you". From then
on the greeting stays, the cards and prompts stop, and a Guide button in the
shell brings help back on demand.

Stage 1 is the journey record (one table and one read function). Stage 2 is
everything the user sees: the greeting, the guide card, the guide drawer, the
quiet switch, and the "what next" prompt after a first import in Seismolord
and Well Data Manager. Stages 3 to 6 (the workflow maps, Ask Petrolord, AI
delegation, autopilot) build on these two and are out of scope here.

## 2. What exists today (main e648de626)

| Piece | Where | Use in this design |
|---|---|---|
| Landing greeting "Welcome back, {first name of full_name} or Explorer" | `src/pages/Dashboard.jsx:134` | Replaced by the shared greeting |
| First-run gate: invited user without profile goes to /profile | `src/components/OnboardingRoute.jsx:17` | Kept; the guide starts after it |
| Shell content area `<DashboardScope><OrgClosureBanner/><Outlet/>` | `src/layouts/DashboardLayout.jsx:86-89` | The guide card mounts here |
| Sidebar, Projects, Employees, Profile links | `src/components/DashboardSidebar.jsx` | Guide button added in the footer |
| Membership with `status`, `invited_at`, `joined_at`, `role` | `organization_members` | "Just added" detection |
| Every org (or solo user) gets a Default project | `suite_project_bootstrap` RPC | "Has a project" means a non-default active one |
| Projects service and context | `src/lib/projects/*`, `ProjectContext.useProject()` | Create project, current project |
| Data registries with `user_id`, `organization_id`, `suite_project_id` | `seismic_volumes`, `geo_wells`, `geo_surfaces`, `qi_datasets`, `seismic_lines` | "Has data" detection |
| Entitlements | `usePurchasedModules`, `useUserEntitlements` | Recommend only apps the user can open |
| Seismolord Start-here panel and tour (pure `buildStartHere`) | `src/pages/apps/Seismolord/lib/startHere.js` | The pattern this design generalises |
| Display name in auth `user_metadata.display_name`, `full_name` | `SupabaseAuthContext`, `Profile.jsx` | Greeting name |

There is no Suite-wide tour, notification centre or help button, and no
per-user settings table outside geoscience.

## 3. Principles

1. **Derive, do not duplicate.** Journey state is computed from the tables
   that already hold the facts (membership, projects, volumes, wells). The new
   table holds only what cannot be derived: the user's guidance choice and
   what they have acknowledged or dismissed. Nothing can go stale.
2. **One next step, not a checklist wall.** The card shows the single best
   step and a short "also possible" list. The drawer shows the whole path.
3. **Only what the user can do.** Steps respect entitlements and role. A
   member with no Seismolord licence is never sent to Seismolord; an admin may
   be told to add it.
4. **Respect the no.** Quiet mode removes every card and prompt everywhere,
   across devices, until the user asks for help again.
5. **Pure engine, thin UI.** `buildJourney(state)` is a pure, jest-tested
   function (the `buildStartHere` precedent); components only render it.
6. **Copy rules.** No em dashes and no "X, not Y" contrasts in user-facing
   text; depth in feet by default (oilfield preset) where depth appears.

## 4. Stage 1: the journey record

### 4.1 Table `suite_user_journey` (one migration)

| Column | Type | Meaning |
|---|---|---|
| `user_id` | uuid PK, FK auth.users on delete cascade | One row per person |
| `guidance` | text, check in ('guide','quiet'), default 'guide' | Guide me, or I'll call you |
| `guidance_changed_at` | timestamptz | When the choice was last made |
| `welcomed_orgs` | uuid[] default '{}' | Organisations whose welcome the user has seen (a person can join a second org later and is welcomed again) |
| `dismissed` | text[] default '{}' | Step keys the user dismissed ("not for me") |
| `acknowledged` | jsonb default '{}' | Prompts answered, e.g. `{"after_import:seismic": "2026-10-20T..."}` |
| `last_greeted_at` | timestamptz | Last greeting shown (for "welcome back after a while") |
| `created_at`, `updated_at` | timestamptz | |

RLS: a user selects, inserts and updates only their own row. No delete
policy (the row goes with the auth user). Impersonating sessions never write
(the client checks `isImpersonating`; the RPCs check that `auth.uid()` is the
real user).

Why a new table and not `suite_user_state` or `user_metadata`: the second
engineer agreed a dedicated table; it keeps guidance out of the project state
row and out of auth metadata (which every session token carries).

### 4.2 Read function `suite_journey_state()`

`security invoker`, `stable`, returns one jsonb, one round trip:

```
{
  "now": ...,
  "user": { "display_name", "full_name", "email", "created_at", "last_sign_in_at", "invited_at" },
  "org": { "id", "name", "role", "status", "joined_at", "member_count", "solo": bool },
  "projects": { "real": n, "shared_with_me": n, "current_id", "current_is_default": bool, "newest_real": {id, name, owner_is_me} },
  "data": {
    "seismic_volumes": n, "seismic_ready": n, "seismic_lines": n,
    "wells": n, "wells_with_logs": n, "surfaces": n, "qi_datasets": n,
    "in_current_project": { "seismic_volumes": n, "wells": n, "surfaces": n }
  },
  "journey": { the suite_user_journey row, or defaults }
}
```

Counts read the user's own rows plus rows shared with them, using the same
RLS the apps use (security invoker), so a colleague's shared volume counts as
"data you can work with". Each count is an `exists`-style capped count (stop
at 1000) on indexed columns, so it stays cheap on large accounts.

Writes go through two small RPCs, so the client never builds array updates:

- `suite_journey_set_guidance(mode text)`
- `suite_journey_mark(kind text, key text)`, where kind is one of
  `welcomed_org`, `dismissed`, `acknowledged`, `greeted`

### 4.3 Migration hygiene

One file `2026MMDD_suite_user_journey.sql`, staging first, a rolled-back dry
run against prod (no nested commit), logged in MIGRATIONS.md, applied by the
owner. Second engineer review: agreed.

## 5. Stage 2: what the user sees

### 5.1 The greeting (every login, always, even in quiet mode)

- **Name.** `display_name`, else the first word of `full_name`, else the part
  of the email before "@". Impersonation shows the impersonated user's name.
- **Words.** By the time of day in the user's own time zone: "Good morning,
  Ayo", "Good afternoon", "Good evening". After 14 days away: "Welcome back,
  Ayo. It has been a while." On the first ever login: "Welcome to Petrolord,
  Ayo."
- **Where.**
  - The Dashboard header (replacing today's "Welcome back, Explorer").
  - After sign-in, when the user lands anywhere else (a deep link into an
    app), a small greeting toast, once per session.
- **Line two** (guide mode only) is the one-line next step, e.g. "Your next
  step: load your first seismic volume."

### 5.2 Journey states

`buildJourney(state, { entitlements, role, now })` returns
`{ stage, headline, next: Step, also: Step[], path: Step[], prompts: Prompt[] }`.
States, first match wins:

| # | State | Detected by | Next step (recommended) | Also possible |
|---|---|---|---|---|
| J0 | Profile not set up | existing `OnboardingRoute` gate | (gate handles it) | |
| J1 | Just added to an organisation | `org.joined_at` within 30 days and org id not in `welcomed_orgs` | Welcome card: "Welcome to {Org}. You were added as {role}. Here is how to start." then J2 to J4 for this org | Meet your team (members list) |
| J2 | No project of my own or shared with me | `projects.real = 0 and shared_with_me = 0` | Admin or solo: "Create your first project" (Projects page, with the Create form open). Member: "Ask your admin to add you to a project, or create your own" | Work in the Default project for now |
| J3 | Project, no data in it | `in_current_project` all zero | "Load your data", with the place: Seismolord for SEG-Y or ZGY, Well Data Manager for LAS and well headers, Mapping for surfaces. Recommended item picked from what the user can open (seismic first if Seismolord is entitled) | The other load doors the user can open |
| J4 | Data loading or converting | `seismic_volumes` with status converting | "Your volume is being prepared. You can keep working." | |
| J5 | First data loaded | a data count went from 0 to 1 or more and the matching `after_import:*` prompt is unanswered | The "what next" prompt (5.5) | |
| J6 | Working | none of the above | Nothing pushed. The drawer shows the path and the step most likely next, from the same rules | |

Admins and owners have extra steps woven into J1 to J3 where they apply:
invite your team (Employees page), choose your apps (Modules page). Solo
users (an org of one) skip the team steps. A user whose org has no app that
handles any data type sees "Your organisation has no data app yet. Ask your
admin" (member) or "Add an app" (admin).

### 5.3 The guide card (guide mode)

- Mounted once, in `DashboardLayout`'s content area under
  `OrgClosureBanner`, so it shows on the Dashboard and Suite pages. It is
  hidden inside full-screen apps, which have their own Start-here panels.
- One headline, one primary button that takes the user exactly there, up to
  three "also possible" links, and two small actions: "Not now" (hides it
  for this session) and "I'll find my way" (quiet mode, with a one-line
  confirmation saying where the Guide button is).
- Every primary button is a deep link that opens the right dialog, not only
  the right page:
  - `/dashboard/projects?new=1` opens the Create project form;
  - `/dashboard/apps/geoscience/seismolord?do=import` opens the volume import
    (SEG-Y or ZGY);
  - `/dashboard/apps/geoscience/well-data-manager?do=import` opens the LAS
    import;
  - `/dashboard/employees?invite=1` opens the invite form.

  These query parameters are new. Each app reads its own once and clears it.

### 5.4 The Guide button and drawer (always available)

- A "Guide" button sits in the sidebar footer, above Profile, and in the
  phone top bar. It is visible in both modes.
- It opens a right-hand drawer showing:
  - the greeting;
  - "Where you are" (org, role, current project, what data the project holds);
  - the path as a short list of steps marked done, next or later;
  - the guidance switch: "Guide me" or "I'll call you when I need you".
- In quiet mode the drawer is the only guidance surface. Opening it does not
  turn guide mode back on; the switch does.
- Profile page: the same switch under a "Guidance" heading.

### 5.5 "What next" after a first import (the pilot of stage 3)

When the first volume of a kind reaches ready, a small dialog asks what the
user wants to do next. It covers seismic in Seismolord and wells in Well
Data Manager. It appears in guide mode only and once per kind, recorded as
`after_import:seismic` or `after_import:wells`.

| After | Recommended | Also possible |
|---|---|---|
| First seismic volume ready | Open it and look at an inline (opens the volume; the Start-here panel takes over) | Load wells to tie (Well Data Manager or Seismolord's well import); Crop or check the survey outline; Learn Seismolord in 5 minutes (the lesson video) |
| First wells loaded | Check the logs (Well Data Manager QC view) | Correlate wells (Well Correlation); Interpret logs (Petrophysics Studio); Show them on seismic (Seismolord), if a volume exists |

The recommendation follows simple rules. If the other half of a pair is
missing (wells without seismic, or seismic without wells), loading it comes
second. Choices are logged in `acknowledged`, which is how stage 3 learns
what people pick.

In Seismolord the dialog hands over to the existing Start-here panel rather
than duplicating it. "Open it" opens the volume and shows Start-here.

### 5.6 New organisation member: the welcome

When J1 fires, the card becomes a short welcome:

> Welcome to Lordsway Energy, Chidi. Your admin added you as a member on
> 14 October. Here is how to start: choose or create a project, load your
> data, and open your first app. Your team has 6 people.

It has three numbered steps (J2 to J4 for this org) with live ticks as each
completes. It is acknowledged when all three are done, or when the user
chooses "I'll find my way". A person who joins a second organisation later is
welcomed into that one as well.

### 5.7 Demo, QA and video accounts

The demo account used for recorded videos is set to quiet before any further
recording, so no card appears in takes. Storyboards that open the Guide
drawer set it explicitly. The QA account keeps guide mode, because its lack
of licences exercises the no-app branch.

## 6. Client architecture

| Module | Role |
|---|---|
| `src/lib/journey/journeyService.js` | RPC calls: `fetchJourneyState`, `setGuidance`, `mark` |
| `src/lib/journey/buildJourney.js` | Pure rules engine (states, steps, prompts, recommendation) |
| `src/lib/journey/greeting.js` | Pure: name choice, time-of-day words, first-login and long-absence variants |
| `src/lib/journey/deepLinks.js` | The `?new=1`, `?do=import`, `?invite=1` builders and a `useDeepLinkAction(key, fn)` hook apps call once |
| `src/contexts/JourneyContext.jsx` | Loads state after sign-in. Refreshes on window focus and when the project changes. Imports publish to it through the existing import-job events, so J4 to J5 move without a reload. Exposes `journey`, `guidance`, `setGuidance`, `mark`, `refresh` |
| `src/components/journey/GreetingHeader.jsx`, `GuideCard.jsx`, `GuideDrawer.jsx`, `WhatNextDialog.jsx`, `GuidanceSwitch.jsx` | UI on the design system (light and dark, grey panel) |

Wiring:

- `JourneyProvider` sits inside `ProjectProvider` in `App.jsx`.
- `GuideCard` goes in `DashboardLayout`; the Guide button in `DashboardSidebar`.
- Dashboard uses `GreetingHeader`.
- Seismolord, Well Data Manager, Projects and Employees each read their own
  deep-link parameter.
- The Seismolord and Well Data Manager import-completion paths call
  `journey.refresh()`.

Cost: one RPC per sign-in, per focus (throttled to one a minute) and per
project switch. No polling.

## 7. Tests and acceptance

- **jest, buildJourney.** Every state J1 to J6 for owner, admin, member and
  solo roles; with and without each entitlement; quiet mode suppressing
  cards and prompts while the drawer still answers. Negative controls: a
  member never gets an admin step; an unentitled app is never recommended.
- **jest, greeting.** The name fallbacks (display name, full name, email),
  time zones around the hour boundaries, first login, the 14-day absence, and
  impersonation.
- **Database tests** (worker db-tests pattern, real Postgres):
  - RLS: own row only.
  - Counts include shared rows and exclude another org's rows.
  - The default project is not counted as real.
  - The mark RPCs are idempotent.
  - Impersonated sessions cannot write.
- **e2e** on a signed-out harness `/dev/guided-journey` with an in-memory
  backend:
  - the card for each state;
  - "I'll find my way" hides the card and the Guide button brings the drawer;
  - each deep link opens its dialog;
  - the "what next" dialog appears once.
- **Live probes** (QA account and a throwaway org, cleaned after):
  - new member invited, then accepted, gets the J1 welcome;
  - creating a project moves to J3;
  - a ZGY import moves to J5 and shows the prompt.
- **Acceptance (owner walk on staging):**
  - a brand-new invited user reaches a loaded volume through the guide
    alone, without help;
  - an existing user switches to quiet and is never prompted again on any
    device;
  - the greeting by name appears on every login.

## 8. Delivery plan (before NAPE)

| Step | Content | PR |
|---|---|---|
| G0 | Migration (table, RPCs, grants), db-tests, MIGRATIONS.md; owner applies after the rolled-back prod dry run | 1 |
| G1 | `buildJourney`, `greeting`, `journeyService`, `JourneyContext`, jest | 2 |
| G2 | Greeting header and toast, GuideCard, Guide button and drawer, switch on Profile; deep links in Projects, Employees, Seismolord, Well Data Manager | 3 |
| G3 | "What next" dialog for seismic and wells; demo account set to quiet; help text in the Suite help | 4 |
| G4 | e2e harness, live probes, STATUS doc, deferred register | 5 |

About 8 to 10 working days. Target: merged and in one Suite zip by
30 October, which leaves NAPE week for demo rehearsal. Merge on green under
the programme's authority. The migration is applied by the owner; the zip
upload is the owner's.

## 9. Defaults chosen (change any of them)

1. New users start in guide mode. Existing users also start in guide mode,
   but J6 pushes nothing, so the change for a working user is only the
   greeting and the Guide button.
2. The greeting is by time of day, in the user's own time zone.
3. The "just added" window is 30 days from `joined_at`.
4. The welcome names the organisation and role, and does not name who sent
   the invitation (the table does not record the inviter reliably).
5. The "what next" prompt shows once per data kind, in guide mode only.
6. Nothing in stages 1 and 2 is premium. The premium tier begins with stage 5
   (AI delegation), where the card will later offer "Let Petrolord do it" to
   entitled organisations.

## 10. Later stages hook in here

- **Stage 3 (workflow maps)** replaces the hand-written tables in 5.2 and
  5.5 with per-workflow maps. It uses the same `Step` shape and the same
  `acknowledged` record.
- **Stage 4 (Ask Petrolord)** is a tab in the Guide drawer, fed the same
  `suite_journey_state` as context.
- **Stage 5 (Seismolord delegation, premium)** adds "Let Petrolord do it" to
  the relevant steps (pick faults, then track horizons from seeds), each with
  a review gate.
- **Stage 6 (autopilot, premium)** is a workflow map run end to end, with the
  gates the user chooses.
