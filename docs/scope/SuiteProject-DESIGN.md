# Suite Project: design

Status: P0 LIVE 2026-10-14 (reviewed and approved by the second engineer,
applied by the owner, verified); P1 built (see the status table). The owner
brought the build forward on 2026-10-14 ("Start with P0 and P1") as a
consultant pilot and added a Client level (section 12). Designed 2026-09-30
(owner: "start the unit profile and Project design now"). Companion: `docs/scope/SuiteUnits-DESIGN-AND-STATUS.md`
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

## 12. Client level (owner addition, 2026-10-14)

The owner works as a consultant for several companies and is the pilot user:
"I should be able to create separate different company projects and even
create multiple projects within each company project." Many consultants will
want the same. So, inside an organisation:

**Organisation > Client (company) > Project**

- A client has a name, an optional logo and colour, notes, and an archived
  state (`suite_clients`). Clients of a user without an organisation are
  personal (organisation null, owner only).
- A project belongs to at most one client (`suite_projects.client_id`,
  nullable). Projects without a client are shown under "Internal". A client
  can hold many projects. The client must be in the project's organisation.
- The header switcher groups projects by client: "Client X > Project A".
- Who sees a client: its owner, the organisation's admins, and anyone who can
  read at least one of its projects. A client with no projects is visible to
  its owner and the admins only.
- A client holding projects cannot be deleted (archive it instead).

## 13. P0 as built (2026-10-14)

Migrations `20261015100000_suite_projects_p0_tables.sql`,
`20261015100100_suite_projects_p0_registries.sql` and
`20261015100200_suite_projects_p0_backfill.sql`. Rollbacks, verification
queries and the dry run with the role pentest are in
`tools/security/suite-projects/`. Decisions taken while building, within the
design above:

1. **Column name `suite_project_id`**, not `project_id`: `seismic_volumes`
   and `seismic_lines` already have `project_id` (their Seismolord project).
2. **Helper names `suite_project_*`**: `public.can_edit_project` and
   `is_project_member` already exist for another module.
3. **Registry rule as RESTRICTIVE policies beside the existing ones.** The
   permissive policies (own row, record sharing with the organisation, the
   check-out editor) are not touched. The new policies only narrow: a row in
   a members-only project is read by the project's owner and members, by an
   organisation admin after a logged open (`suite_project_admin_open`, valid
   for 12 hours), and always by the row's own creator. Rows in an open
   project keep exactly today's access. This is why a project open to the
   organisation does not by itself share private records: sharing a record
   stays per record, as built in the organisation sharing wave.
4. **Writes:** a row can be put into a project only by someone who may add
   to it (owner, member with role owner or editor, any organisation member
   for an open project, a logged admin), and the row's organisation must
   match the project's.
5. **Insert stamp:** a trigger fills a missing `suite_project_id` with the
   writer's current project, else their default project (made on demand).
   Every new row lands in a project even from an app build that predates P1.
6. **Archive** hides a project from the switcher and the insert stamp; it
   does not lock existing rows.
7. **Backfill** (dry run on production, rolled back): 11 organisation
   defaults and 1 personal default; every registry row stamped (34 wells,
   14 surfaces, 2 sections, 1 seismic project, 21 volumes, 1 line); no row
   without a project; every persona sees the same rows before and after.
8. **Settings** stay `{}` until P2. `suite_user_state` starts empty (no
   current project means the default project).
9. **Unchanged for now:** the per-user well name uniqueness
   (`geo_wells_owner_name_uniq`); the same name in two client projects is
   refused until a later change makes it per project.

## 14. P2 as built (2026-10-14): project settings

`suite_projects.settings` (jsonb, no migration) holds four keys, read through
`src/lib/projects/projectSettings.js`; keys a build does not know survive a
save. Owners and organisation admins edit them on the Projects page (RLS:
the P0 manage rule); everyone else reads them.

| Key | Shape | Drives |
|---|---|---|
| `units` | a unit profile `{preset, units}` | the reserved `project` layer of the unit resolution: user override, project, organisation, built-in (`UnitProfileProvider` now sits inside `ProjectProvider`) |
| `crs` | `{tag, name, xyUnit, setAt}` | the Project CRS imports convert into, for projects other than Default (`settingsService.getProjectCrs` / `setProjectCrs`); the lock counts the project's own tagged rows; the reproject flow converts that project's rows only. The Default project keeps each user's own Project CRS (`geoscience_settings`) as before |
| `datum` | `{refKind, verticalDatum, srdM}` | the depth reference of a new well entered with a bare elevation (built-in KB), and the seismic reference datum a new Pore Pressure model starts from |
| `timescale` | an ICS edition | the default edition of every stratigraphy lookup (`src/lib/stratigraphy/timescale.js` shim; the vendored engine is unchanged) and the labels, panel and exports of Stratigraphy Studio |

Decisions taken while building:

1. CRS stays a storage CRS (imports convert into it), so a project's CRS is
   locked once the project holds tagged data, as the per-user CRS always was.
   Setting it is allowed while the project is empty; the lock is the reason a
   settings change can never imply rewriting coordinates.
2. Custom CRS definitions stay each user's library (decision 4: reference
   libraries are not per project).
3. A member who does not manage a project cannot set its CRS on first import;
   the owner sets it (a limit to revisit in P3 with roles).
4. `em_models` are not filed by project until P4, so a project's CRS lock and
   reproject leave them alone.

Gate (`src/lib/projects/__tests__/settingsGate.test.js`, and live, rolled back,
`tools/security/suite-projects/probes/run_liveprobes.sh C`): a consultant
changes every setting of a client project holding a well; the only write is
the `suite_projects` row, and a fingerprint of every registry and child table,
`geoscience_settings`, `suite_unit_settings` and the storage object list is
byte-identical; a colleague who does not manage the project and another
organisation's user change nothing; the negative control (editing the well)
moves the fingerprint. 9 of 9 on production.

## 15. P3 as built (2026-10-14): members, roles, copy, archive, names

- **Members and roles** (Projects page, `ProjectMembersCard`): owners and
  organisation admins add colleagues from the organisation, set roles (owner,
  editor, viewer) and remove them; a member may leave. Every change is in the
  project log, which owners and admins read beside the admin opens. Rules are
  the P0 tables and triggers; no new policy.
- **Copy to project** (`src/lib/projects/copyToProject.js`): wells (with logs,
  tops, zones, intervals), surfaces and culture are copied with the `.pld`
  round trip run in memory, so curve samples and grids are real copies under
  new ids and storage paths, every copied row records
  `provenance.imported_from`, and a name the target already uses arrives as
  "<name> (imported)". Seismic is moved, never copied.
- **Archive**: projects and clients (built in P1); archived projects leave the
  switcher and the insert stamp, nothing is deleted.
- **Well names unique per project** (migration
  `20261015120000_geo_wells_name_unique_per_project.sql`): the unique index
  is now (owner, project, name key) instead of (owner, name key). The app's
  name check, the `.pld` importer's clash list and Move to project follow the
  project; a move into a project that already has the name is refused with a
  plain message.

Gate (live, rolled back, `run_liveprobes.sh E` and `D`): 20 of 20 role probes
(viewer reads but cannot add data, members, roles or settings; editor adds
data but not members; another organisation's user cannot be added; an org
admin adds a member and it is logged; removal ends access while the removed
member keeps their own rows; leaving works) and 5 of 5 name probes, whose
negative control (without the migration) fails the second project's name.

## 16. P4 as built (2026-10-14): app project tables adopt the project

Migration `20261015130000_suite_projects_p4_app_tables.sql` gives 77 root
tables the P0 treatment (column, insert stamp, RESTRICTIVE policies,
backfill into the creator's default project); child tables follow their
root. Module by module:

| Module | Root tables | Lists now scoped in |
|---|---|---|
| Geoscience apps | petro_projects, pp_projects, rp_projects, em_models, bf_wells, rcp_prospects, rrv_valuations, saved_qi_studio_projects, saved_quickvol_projects | Petrophysics, Pore Pressure, Rock Physics, Earth Modeling, Basin, ReservoirCalc Pro (projects and prospects), Risked Reserves, QI Studio |
| Every Studio-shell app (Reservoir, Production, Facilities, Economics, Midstream, Downstream) | every `saved_*_projects` and `scm_*_projects` | the shared `createSavedProjectsService` (one change covers them all) |
| Drilling | wp_sites (every `wp_*` hangs from a site) | Well Design Studio (`wpApi.listSites`) |
| Economics | epe_cases (cases); epe_assumption_sets (a library: column and stamp, list stays organisation-wide, decision 4) | Petroleum Economics Studio case list |
| Production | po_fields | Production Operations (`productionSpine.listFields`) |
| Material balance | rb_cases | Material Balance Studio |
| Simulation | sim_cases | Reservoir Simulation Studio |

Rules kept from P0: saves never carry a project (a new row is placed by the
database's insert stamp, and saving an existing row never moves it); lists
use `selectScoped`, which falls back to the unscoped list if the column is
not there yet, so the code is safe before the migration is applied; Move to
project accepts these tables (owner of the rows, editable target, logged).

Gate: rolled-back production dry run (`run_p4_dryrun.sh`): applied twice;
every persona's view of all 77 tables (counts and md5 of visible ids, demo
included, 1240 comparisons) unchanged after apply and after rollback; 148
rows stamped, none left without a project; verify all true; probes 10 of 10
(saved project lands in the default, or in the current project; an
org-shared ReservoirCalc Pro project in a members-only project is hidden from
a non-member until moved to the open default; another organisation never sees
it; a non-member cannot write into the members-only project; Well Design
sites and Economics cases land in the default). Each module's jest suites
green on the branch.

### Status

| Phase | State |
|---|---|
| P0 | LIVE 2026-10-14. Second engineer reviewed and approved; the owner applied the three migrations. Before apply: dry run and role pentest on production inside a rolled-back transaction, 94 of 94, negative control fails 6, rollbacks restore the catalog and every persona's rows. After apply: verification queries as expected, live role pentest 94 of 94, and 0 differences between every persona's visible rows (demo account included) and pre-P0 access (`tools/security/suite-projects/probes/run_liveprobes.sh`). |
| P1 | Built 2026-10-14. PR A: scope, `useProject()`, switcher (hidden until a user has a client or a second project), Projects page at /dashboard/projects, registries filtered and stamped, `.pld` per project, Move to project. PR B: the sidebar "Projects" entry, held until the demo recordings finish. Gate: `src/lib/projects/__tests__/geoscienceChain.test.js`: a consultant with two clients loads a well into each through Well Data Manager, and all 12 Geoscience apps list only the current project's wells (Seismolord volumes too); the negative control (projects off) lists both. User guide `docs/scope/SuiteProjects-GUIDE.md`. |
| P2 | Built 2026-10-14 (section 14). No migration. Gate: settings change leaves stored data byte-identical, jest and live (9 of 9, rolled back). |
| P3 | Built 2026-10-14 (section 15). One migration (well names per project), owner apply pending. Gate: per-role pentest 20 of 20 and name probes 5 of 5, live and rolled back. |
| P4 | Built 2026-10-14 (section 16). Migration 20261015130000 (77 app tables) applied by the owner 2026-10-14 and verified; live equivalence 1240 of 1240 identical, probes 10 of 10. Lists scoped module by module. |
