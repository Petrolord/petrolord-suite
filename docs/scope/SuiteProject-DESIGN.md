# Suite Project: design

Status: DESIGN, approved to write 2026-09-30 (owner: "start the unit profile
and Project design now"). Build after NAPE (early November 2026), before
customer data grows. Companion: `docs/scope/SuiteUnits-DESIGN-AND-STATUS.md`
(the unit profile, built now, is the first settings layer this design
places inside a project).

## 1. Why

A Petrolord Project is a lightweight workspace for one field, asset,
study or client. It gives the Suite three things it lacks today:

1. **Separation.** A consultancy working for several clients, or an
   operator with several fields, needs each set of wells, surfaces, tops and
   interpretations kept apart. Today everything a user loads sits in one
   pool.
2. **One set of rules per study.** Coordinate system, datum, units,
   timescale edition and the wells in scope, set once and honoured by every
   app. Unit, frame and cross-app handoff defects were the largest class the
   upgrade programme found (`docs/scope/AppUpgrade-HumanFeedback-Audit.md`);
   a single project setting removes their root cause.
3. **Team access per asset.** Who may see and edit which study, with an
   audit trail for reserves work and joint ventures.

It is deliberately not a copy of Petrel's project file. Petrolord data is
shared and online, stored in canonical units with the unit recorded on the
row, so a project is a scope plus a bundle of settings. Changing a project's
units or CRS display never rewrites stored data.

## 2. Where the Suite is today (measured 2026-09-30)

- 150 application and registry tables in the geoscience and app families:
  126 carry only `user_id`, 8 carry `organization_id`, 3 carry a
  `project_id` that means an app-internal project (seismic lines and
  volumes, portfolio scenarios).
- Shared registries: `geo_wells` (+ logs, tops, zones, intervals, core
  images through the well), `geo_surfaces`, `geo_culture`,
  `geo_correlation_sections`. `geo_wells` SELECT policy: own rows, or rows
  whose `organization_id` the reader belongs to.
- Live volume: 13 wells, 246 logs, 227 tops, 0 surfaces, 1 saved section,
  4 Petrophysics projects, 9 organisations. **All 13 wells have
  `organization_id` null**, so organisation sharing is not in effect: in
  practice every well is private to the user who loaded it.
- Settings: `geoscience_settings` (one row per user: project CRS, XY unit,
  depth unit, custom CRS definitions). The Petrel term "project CRS" is
  already used there, but the scope is the user.
- Each app keeps its own saved-project table (`saved_*_projects`,
  `petro_projects`, `pp_projects`, `strat_projects`, `seismic_projects`,
  and so on), private to the user.
- `.pld` packages already bundle registry rows and app projects: the
  natural export boundary of a Project.

## 3. Concepts

| Term | Meaning |
|---|---|
| Organisation | The customer account (unchanged). |
| Project | A workspace inside one organisation: name, description, settings, members. |
| Default project | One per organisation, created by the backfill, holding everything that exists before projects. Users without an organisation get a personal default project. |
| Current project | The project a user is working in; chosen in the Suite header and carried in deep links (`?project=`). |
| Project settings | CRS, XY unit, datum policy, unit profile, timescale edition, default wells scope. |
| Membership | Who may read or edit a project. |

Settings resolve in this order for every family: **user override, project,
organisation, built-in**. The unit profile built now implements user,
organisation and built-in, with the project slot reserved.

## 4. Data model (all product tables; no change to shared account tables)

```
suite_projects
  id uuid pk, organization_id uuid (FK organizations, on delete cascade; null only
  for personal default projects), owner_user_id uuid, name text, description text,
  visibility text check in ('organisation','members'),  -- open to the org, or members only
  settings jsonb  -- {crs, xy_unit, datum:{reference, srd_m}, units:{...}, timescale:'2026/06', ...}
  is_default boolean, status text check in ('active','archived'),
  created_by, created_at, updated_at, app_build
  unique (organization_id) where is_default

suite_project_members
  project_id uuid FK suite_projects on delete cascade, user_id uuid FK auth.users,
  role text check in ('owner','editor','viewer'), added_by, added_at
  primary key (project_id, user_id)

suite_user_state
  user_id pk, current_project_id uuid FK suite_projects on delete set null, updated_at
```

Registry and app rows gain a nullable `project_id uuid references
suite_projects(id) on delete restrict`:

- Phase 1: the parent registries `geo_wells`, `geo_surfaces`, `geo_culture`,
  `geo_correlation_sections`, and the geoscience app projects
  (`petro_projects`, `pp_projects`, `rp_projects`, `strat_projects`,
  `seismic_projects`, `em_models`, `bf_wells`, `rcp_prospects`,
  `strat_zone_schemes` stays organisation-wide by design).
- Child rows (logs, tops, zones, intervals, core images) follow their
  parent well; they get no column.
- Phase 2: the remaining `saved_*_projects` tables, app by app, as each app
  adopts the project switcher.

`on delete restrict` means a project with data cannot be deleted by
accident; archiving is the normal end of life.

## 5. Access rules (row level security)

Two SECURITY DEFINER helpers, the only way policies read membership (same
rule as the membership consolidation of 2026-07-13):

- `can_read_project(p uuid)`: the project's organisation member when
  visibility is 'organisation'; otherwise a row in `suite_project_members`;
  always the owner.
- `can_edit_project(p uuid)`: role owner or editor, or an organisation admin.

Registry policies become:

- SELECT: own row, or `project_id is not null and can_read_project(project_id)`,
  or the existing organisation path while `project_id` is null (transition).
- INSERT/UPDATE: `can_edit_project(project_id)` when set; own rows otherwise.
- DELETE: unchanged (owner of the row) plus project owners.

This changes who can see data, so it needs a second engineer's review and
the staging-first apply, with a rolled-back pentest per role (owner,
editor, viewer, other member of the organisation, outsider, anon) like the
one used for `strat_zone_schemes`.

## 6. Moving existing data (the backfill)

One idempotent migration, dry run first with counts:

1. Create a Default project per organisation (visibility 'organisation',
   owner the organisation's owner role holder), and a personal default
   project for every user who owns registry rows but has no organisation.
2. Stamp `project_id` on every parent registry row and app project row:
   the creator's organisation default project, else the creator's personal
   default. Rows with `organization_id` null (all 13 live wells today) go to
   the creator's default project, which also fixes the fact that
   organisation sharing is not in effect today.
3. Seed each default project's settings from the owner's
   `geoscience_settings` (CRS, XY unit, depth unit) and the organisation unit
   profile.
4. Set every user's current project to their organisation's default.

Nothing is renamed, moved between users or deleted. A user who never
creates a second project sees no difference beyond the header label.

## 7. Suite integration

- **Header switcher** (Suite shell): current project name, list, create,
  archive; switching reloads the registries in scope. Mobile keeps a compact
  label.
- **`useProject()`** context next to `useUnitProfile()`: current project,
  its settings, the user's role.
- **Registries** (`wellsRegistry`, `surfacesRegistry`, `cultureRegistry`,
  `sectionsRegistry`, `stratRegistry`) filter by the current project and
  stamp it on writes. "Open in" links carry `?project=`.
- **Apps** read CRS, units, datum and timescale from the project settings
  through the shared hooks; app-level toggles remain as view overrides.
- **`.pld`** exports one project (settings, members as names only,
  registries, app projects) and imports into a new or chosen project.
- **Copy between projects**: copy wells (with logs, tops) and surfaces into
  another project the user can edit; provenance records the source.

## 8. Phases and sizing

| Phase | Content | Size | Gate |
|---|---|---|---|
| P0 | Tables, helpers, RLS, backfill migration, pentest | M | Owner + second engineer review, staging-first apply |
| P1 | Header switcher, `useProject()`, geoscience registries filtered and stamped, `.pld` per project | M | Chain e2e across the 12 Geoscience apps |
| P2 | Project settings drive CRS, units, datum, timescale (the unit profile moves under the project slot) | S | Settings change leaves stored data byte-identical |
| P3 | Membership and roles UI, copy between projects, archive | M | Pentest per role |
| P4 | Remaining app project tables adopt `project_id` module by module | L (spread) | Each module's suites |

S under a day, M two to four days, L a week or more.

## 9. What is done now so this slots in

- The unit profile (built now) resolves user, organisation, built-in, with
  a reserved project slot and the same jsonb shape the project settings
  will use.
- New product tables created before P0 either stay organisation-wide by
  intent (`strat_zone_schemes`) or leave room for a nullable `project_id`.
- The Geoscience upgrades keep all registry access inside the registry
  modules, so P1 changes a handful of files rather than every app.

## 10. Risks and safeguards

| Risk | Safeguard |
|---|---|
| A policy mistake exposes one client's wells to another | Helpers are the only membership path; rolled-back pentest per role before apply; second engineer review |
| Backfill assigns a row to the wrong project | Deterministic rule (creator's organisation default), dry-run counts reviewed, no deletes, rows can be moved later |
| Apps written before P1 ignore the project | Registries filter centrally; an app that bypasses the registry is found by the chain e2e |
| Users confused by a new header control | One default project per organisation, so nothing changes until someone creates a second project |
| Deep links from before P1 | Links without `?project=` open in the current project |

## 11. Decisions (owner delegated to the programme lead, 2026-09-30)

The owner asked for the pending items to be executed; these four were
decided on the proposals below and are binding for P0 to P4.

1. **Default visibility: open to the whole organisation.** A project can be
   switched to members only, for client-confidential work (consultancies,
   joint ventures). The switch is recorded with who changed it and when.
2. **Organisation admins can see every project, members-only included,**
   for governance. An admin opening a members-only project they are not a
   member of is logged (project, admin, time), and the project owner can
   see that log.
3. **Projects are purely organisational at launch.** No project limits or
   per-project charges in any plan; licensing stays per organisation and
   per app. Revisit only with pricing data.
4. **Reference libraries stay organisation-wide:** biozone schemes
   (`strat_zone_schemes`), unit profiles, custom CRS definitions and the
   timescale tables. Projects reference them and may pin a choice (for
   example the timescale edition) in their settings.
