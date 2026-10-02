# Organisation sharing: design and status

Status: BUILT, migrations NOT APPLIED (owner-run). Branch `feat/org-sharing`.
Written 2026-10-02. Owner statement 2026-10-01: "the organization-sharing
work is approved by the second engineer". Target: solid before NAPE (early
November 2026).

This wave closes the sharing item that every Geoscience upgrade deferred
"for a second engineer": Seismolord U2-008, Earth Modeling U2-014,
ReservoirCalc Pro U2-014, the Rock Physics published-gather item, Well
Correlation named sections, Basin U2-019 and Well Data Manager U2-012.

## 1. Scope (programme lead decisions, recorded verbatim)

### 1.1 First decision, 2026-10-01

> READ sharing with the owner's organisation, opt-in per record; the owner
> keeps sole edit rights; a colleague opens a shared record read-only and can
> "Save a copy" as their own. Tables:
> 1. seismic_projects (Seismolord U2-008) and every child table a project
>    needs to be readable (horizons, faults, picks, ties, wavelets, attribute
>    outputs, etc.: enumerate them from the live schema and code; reads flow
>    through the parent's visibility).
> 2. em_models (Earth Modeling U2-014) and children.
> 3. saved_quickvol_projects and rcp_prospects (ReservoirCalc Pro U2-014).
> 4. rp_projects (Rock Physics; this also makes a published gather visible to
>    colleagues in Seismolord).
> 5. geo_correlation_sections (Well Correlation named sections) if it is
>    owner-only today.
> 6. bf_wells (Basin U2-019): the four-policy split with WITH CHECK as
>    proposed in the Basin doc, plus the same sharing.
>
> NOT in scope (record as still open, needing a further owner word):
> multi-author editing of anything, WDM U2-012 team editing of shared wells,
> the WDM datum model, the Mapping Digitizer image storage policy, org admins
> seeing private records (that arrives with the Suite Project).

### 1.2 Extension, 2026-10-01 (supersedes "the owner keeps sole edit rights" and "NOT in scope: multi-author editing")

Owner's words:

> "The edit rights should be granted but there should be decorum on the way
> multiple users are allowed to edit the same record. It should be done in a
> way that will avoid confusion and will also bear the identity of who changed
> what."

Design (programme lead decision):

> 1. Sharing level per record, chosen by the owner: `visibility` 'private' |
>    'organization', plus `org_access text not null default 'view' check
>    (org_access in ('view','edit'))`. "Colleagues can view" or "Colleagues
>    can edit". Only the owner changes visibility, access level, or deletes
>    the record. Existing rows stay private.
> 2. One editor at a time (check-out). A shared-edit record carries
>    `editing_by uuid`, `editing_since timestamptz`, `editing_expires
>    timestamptz`. A colleague (or the owner) must take the record for editing
>    before any write; others see "Being edited by <name> since <time>" and
>    stay read-only, with "Save a copy". The lock renews while the editor is
>    active (heartbeat on save or every few minutes), expires after a short
>    idle period (propose 30 minutes), is released on close, and can be
>    released by the owner at any time (the owner's "Take over" is logged).
>    Enforce it in the database, not only the UI: do the take/renew/release
>    through small SECURITY DEFINER RPCs with a fixed search_path that check
>    is_org_member and the lock atomically (select ... for update), and make
>    the update policy / a trigger refuse a colleague's write when they do not
>    hold an unexpired lock. Child tables follow the parent's lock.
> 3. No silent overwrite: a `version integer not null default 1` bumped by
>    trigger on every update; every save sends the version it loaded and a
>    stale save is refused with a clear message ("<name> saved a newer version
>    at <time>. Reload, or save yours as a copy."). This also protects the
>    owner's two tabs.
> 4. Who changed what: `updated_by uuid` and `updated_at` stamped by trigger
>    from auth.uid() (never trusted from the client), and ONE shared
>    product-neutral change log table for the whole wave, e.g.
>    `suite_record_changes` (id, table_name, record_id, organization_id,
>    changed_by, changed_at, action: created | updated | shared |
>    access_changed | checked_out | released | taken_over | deleted, summary
>    text, changed_fields jsonb), written by trigger/RPC so it cannot be
>    skipped or forged; select policy: whoever can read the record; no client
>    insert/update/delete; anon revoked. Keep the diff modest (names of
>    changed top-level fields and a short summary the app supplies through the
>    RPC or a session setting), not full row copies of large JSON. Each app
>    shows a "History" panel on the record: who, when, what; and the last
>    editor's name beside the record in open dialogs. Resolve names through
>    the existing safe profile lookup the apps already use for display names;
>    never expose emails across organisations.
> 5. One shared implementation: a `src/lib/recordSharing` module (visibility,
>    access, lock, version, history) plus shared components (share control,
>    "being edited by" banner, history panel), used by all apps. Tests with an
>    in-memory store mirroring the policies and RPCs: two users, lock taken
>    and refused, expiry, owner take-over, stale version refused, history rows
>    with the right author, a view-only colleague refused, another
>    organisation and anon refused, forged updated_by ignored. The pentest SQL
>    covers the same cases.
> 6. Tables as before (seismic_projects and children, em_models,
>    saved_quickvol_projects, rcp_prospects, rp_projects,
>    geo_correlation_sections, bf_wells with the four-policy split). ADD LAST,
>    after the others are committed: Well Data Manager U2-012 team editing of
>    organisation wells (geo_wells and its child registries) with the same
>    lock, version and history; another agent is changing geo_wells columns
>    for the datum model on branch feat/datum-digitizer, so keep your
>    geo_wells migration to policies/lock/version/history columns, put it in
>    its own migration file, and merge origin/main before the PR.
> 7. Still not in scope: org admins seeing private records (arrives with the
>    Suite Project stage). Simultaneous real-time co-editing is deliberately
>    not built; say so in the doc.
> 8. All earlier rules stand: read live state read-only first; no production
>    writes; migrations logged NOT APPLIED with the exact owner commands in
>    order; code must work before apply (controls hidden with an honest note);
>    only is_org_member / is_org_admin_of inside policies; commit and push
>    after every step; one PR; CI 16 checks green.

### 1.3 Deliberately not built

- **Two people editing the same record at the same moment** (real-time
  co-editing). The model is one editor at a time, with the editor's name
  shown to everyone else.
- **Organisation admins seeing private records.** That arrives with the
  Suite Project (`docs/scope/SuiteProject-DESIGN.md`, decision 2, with its
  access log).
- Still open, needing a further owner word: the WDM datum model (another
  branch), the Mapping Digitizer image storage policy.

## 2. The live state before this wave (read-only catalog read, 2026-10-02)

One shared Supabase project (staging and production share the database).
9 organisations, 22 membership rows.

| Table | Rows | Policies before | Note |
|---|---|---|---|
| `seismic_projects` | 0 | 4, owner-only (`auth.uid() = user_id`) | An explorer folder: name and description. Volumes and 2D lines point at it (`project_id`, on delete set null). |
| `seismic_volumes` (6), `seismic_lines` (0) | | own, or `organization_id` set and `is_org_member` (read); owner writes | Already shared per volume and per line. NOT changed. |
| `seismic_horizons` (5), `seismic_faults` (2), `seismic_line_picks` (0) | | own, or through an organisation-shared volume or line (read); owner writes | Each interpreter's own rows on a shared volume. NOT changed. |
| `seismic_sessions` (2), `seismic_exported_surfaces` (0) | | owner-only | Personal view state and a legacy export list. NOT changed. |
| `em_models` | 0 | 4, owner-only | No child tables. |
| `saved_quickvol_projects` | 5 (2 users) | 6: four owner-only, one ALL owner-only, one dormant `Allow admin full access` (JWT claim `user_role`) | No `updated_at` column. |
| `rcp_prospects` | 0 | 4, owner-only | |
| `rp_projects` | 0 | 4, owner-only | The published gather lives in `avo.published_gather`. |
| `geo_correlation_sections` | 1 | 4, owner-only | Yes, owner-only today. |
| `bf_wells` | 4 (3 users) | 1: `Users can manage their own wells`, ALL, USING only, no WITH CHECK | `user_id` nullable; a `set_updated_at` trigger. |
| `geo_wells` | 13, all `organization_id` null | select own or organisation; insert, update, delete owner-only | Shared when `organization_id` is set. |
| `geo_wells_logs` (246), `_tops` (227), `_zones` (32), `_intervals` (525), `_core_images` (0) | | read through the well; writes by the well's owner | |

Every table above granted `anon` and `authenticated` all privileges
(select, insert, update, delete, truncate); the policies, written for the
`public` role with `auth.uid()`, were what kept anon out. Helpers present:
`is_org_member(uuid)`, `is_org_admin_of(uuid)` (SECURITY DEFINER,
`search_path=public`). `wells` storage bucket: read own folder or through an
organisation-shared well; write own folder only.

**What "children of a Seismolord project" turned out to be.** A project owns
no interpretation rows. Its children are volumes and 2D lines, which carry
their own organisation sharing already, and the horizons, faults and picks
read through those. So the Seismolord part of the migration touches only
`seismic_projects`, and a shared project opens for a colleague exactly as
far as they can read its volumes (section 6).

## 3. Data model

Seven record tables gain the same columns (`20261002100000`):

| Column | Meaning |
|---|---|
| `visibility text not null default 'private'` | `'private'` or `'organization'`, the owner's choice |
| `organization_id uuid` (FK organizations, on delete set null) | the organisation the record is shared with |
| `org_access text not null default 'view'` | `'view'` or `'edit'`: what colleagues may do |
| `editing_by`, `editing_since`, `editing_expires` | the check-out |
| `version integer not null default 1` | bumped on every change of content |
| `updated_by uuid`, `updated_at` | stamped by trigger from `auth.uid()` |
| `change_note text` | transient: a save's short summary; the trigger moves it to the log and stores NULL |

`geo_wells` (`20261002110000`) keeps its own sharing model, shared when
`organization_id` is set, and gains `org_access`, the check-out columns,
`version`, `updated_by` and `change_note` (no `visibility`: the datum branch
owns the other geo_wells columns).

`suite_record_changes` is the one change log: `table_name`, `record_id`,
`organization_id`, `owner_id`, `changed_by`, `changed_at`, `action`,
`summary`, `changed_fields` (names only), `change_count`.
`suite_record_tables` lists the tables under these rules for the check-out
functions; clients cannot read it.

## 4. Rules, enforced in the database

Row level security, to `authenticated`, membership only through
`is_org_member`:

- **read**: the owner; or a member of the organisation the record is shared
  with.
- **insert**: the owner only, and a row marked `'organization'` must carry an
  organisation the writer belongs to.
- **update**: the owner; or, when colleagues can edit, a member who holds the
  unexpired check-out. WITH CHECK repeats both, so nobody shares into an
  organisation they do not belong to.
- **delete**: the owner only.

Guard trigger `suite_record_guard` (BEFORE INSERT OR UPDATE, SECURITY
INVOKER so `current_user` tells a client request from the check-out
functions, which cannot be forged from a request):

- pins the owner and the check-out columns on a client update;
- refuses a save that names an older `version` (SQLSTATE `SR001`);
- refuses a colleague's write without the check-out, and the owner's content
  write while a colleague holds it (`SR002`);
- refuses a sharing change by anyone but the owner (`SR003`);
- stamps `updated_by` and `updated_at`, bumps `version` on a change of
  content, renews the check-out on the editor's save, ends it when sharing is
  switched off or to view only.

Check-out functions (SECURITY DEFINER, `search_path = public, pg_temp`, row
locked `FOR UPDATE`, execute to `authenticated` only):
`suite_record_take(table, id, take_over)`, `suite_record_renew(table, id)`,
`suite_record_release(table, id)`. A check-out lasts **30 minutes** from the
last save or renewal. The owner may take over a colleague's check-out and may
release anyone's; both are logged.

Log trigger `suite_record_log` (AFTER, SECURITY DEFINER): created, updated
(field names and the app's summary; saves by one author within ten minutes
fold into one row), shared, access_changed, checked_out, released,
taken_over, deleted. Clients have select only, as far as they can read the
record; the owner still reads the log of a record they deleted.

`anon` is revoked on every table touched. Existing rows stay private, at
version 1: applying the migrations changes nobody's access.

### 4.1 Decisions inside the lead's design (and why)

1. **`version` follows content only.** A sharing change, taking or releasing
   a check-out and an empty save are logged but are not new versions.
   Otherwise the person who has just taken a record would be refused as
   stale by their own take.
2. **The owner and the check-out.** The database refuses the owner's content
   write only while a colleague holds an unexpired check-out. When nobody
   holds it, the owner's write goes through without one. The apps are one
   step stricter: on a record colleagues can edit, everyone, the owner
   included, presses Start editing, so colleagues always see who is working.
   The softer database rule keeps the owner's other apps working on a shared
   well (Petrophysics, Rock Physics, Pore Pressure and others write a well's
   logs and tops without a sharing control). The version check still stops a
   silent overwrite in that gap.
3. **A build from before the migration keeps saving.** It sends no `version`,
   so the stale check lets it through (last write wins, as before); it cannot
   share. Production runs the old build until the next upload.
4. **The summary travels in a column** (`change_note`), because a PostgREST
   request cannot carry a session setting into a later request.
5. **The change log has no retention rule yet.** Rows are small (names, not
   data). Add one with the Suite Project audit trail.
6. **`Allow admin full access` on `saved_quickvol_projects` is left as it
   is.** It reads a JWT claim nothing sets today.

## 5. One implementation in the app

- `src/lib/recordSharing/rules.js`: who may do what (`accessOf`), the
  sentences, helpers. No I/O.
- `src/lib/recordSharing/store.js`: the store every app calls (capability,
  context, version tracking, `update`, `setSharing`, `take`, `renew`,
  `release`, `history`, `names`) over a small transport.
- `src/lib/recordSharing/supabaseTransport.js`: the real transport.
- `src/lib/recordSharing/memoryDb.js`: an in-memory database that mirrors the
  policies, the guard, the check-out functions and the log, for the harnesses
  and jest. `harness.js` gives every `/dev` harness a small organisation: you
  and one colleague.
- `src/lib/recordSharing/useRecordSharing.js`: the open record's sharing
  state, the check-out, its renewal (every four minutes while the user is
  active) and its release on close.
- `src/components/recordSharing`: `RecordSharingBar` (share switch, view or
  edit, who is editing, Start editing, Done editing, Take over, Save a copy,
  last saved by, History), `RecordHistoryPanel`, `SharedRowNote` for lists.

Names come from the organisation's member list (`organization_members`: the
full name, or the member's email where no name is set), the lookup Wellsite
Studio already uses. Row level security shows a member only their own
organisation's rows, so nothing about a person crosses organisations: anyone
outside reads "A colleague".

**Before the migration is applied** the store finds no sharing columns
(asked again each minute), the bar is a short note ("Sharing with your
organisation is not switched on for this database yet. Records stay private
until it is."), and every save is the plain update the app always made.

## 6. Per app

| App | Table | Where the control is | Lists | Read-only and copy |
|---|---|---|---|---|
| Seismolord | `seismic_projects` | A share button on each project folder, and "Sharing and history" in its menu, open a dialog | Own folders, then "Shared with me" | A shared project lists only the volumes shared with the organisation and says so; the owner is told which volumes of the project are still private. Editing a project means renaming it. Save a copy makes a folder of the user's own. |
| Earth Modeling | `em_models` | Under the Save buttons in the builder dock | Own models, then "Shared with me" | Save is refused with the reason; "Save as a new model" or Save a copy keeps the work. |
| ReservoirCalc Pro | `saved_quickvol_projects` | A Share button in the header opens the bar under it | Project Manager: own, then "Shared with me" | A Read-only badge; Save and auto-save never overwrite; Save a copy in the Save dialog and the Project Manager. |
| ReservoirCalc Pro | `rcp_prospects` | A share button on each inventory row | Inventory and portfolio stay the user's own; "Shared with me" below | View sharing only (a prospect is added and deleted, never edited in place); Save a copy adds it to the inventory. Risked Reserves Valuation keeps reading the user's own. |
| Rock Physics | `rp_projects` | A Share button in the ribbon | A project picker appears when colleagues have shared projects | A shared project makes its published gather readable in a colleague's Seismolord. Save a copy replaces the user's own project after a question (one project per user). |
| Well Correlation | `geo_correlation_sections` | A Share button beside the section picker | The picker: own, then "Shared with me" with the owner's name | Save is refused with the reason; the copy button saves it as the user's own. Stratigraphy Studio still opens the user's own newest section. |
| Basin | `bf_wells` | Above the model list, for the active model | Own models, then "Shared with me" | The auto-save skips a read-only model (the edit stays on screen, with a note) and stops, after saying so once, when a newer version was saved elsewhere. |
| Well Data Manager | `geo_wells` and children | Above the well's tabs; the tree's share button still shares for viewing | The tree marks organisation wells, as before | Read-only until taken for editing; no Save a copy for a well (section 7). |

Check-out and history behave the same everywhere: the bar's banner, Start
editing, Done editing, Take over (owner), the notice when a newer version
exists, and the History panel (who, when, what).

## 7. Well Data Manager: team editing of organisation wells (U2-012)

`20261002110000_geo_wells_team_editing.sql`, in its own file because another
branch is changing `geo_wells` columns for the datum model.

- The well keeps its sharing model (shared when `organization_id` is set).
  The owner chooses "Colleagues can view" (the default: what a shared well
  already was) or "Colleagues can edit", in the control above the well's tabs.
- The well row has the check-out, the version, the author stamp and the log,
  through the same guard, functions and log trigger.
- The child registries (`geo_wells_logs`, `_tops`, `_zones`, `_intervals`,
  `_core_images`) follow the well's check-out: writable by the owner unless a
  colleague holds it, and by the colleague who holds it. Reads are unchanged.
  One statement-level trigger per write kind logs a folded line on the well
  ("Tops: 3 added").
- The `wells` bucket: everyone still uploads under their own user id. The
  well's owner can read, rewrite and remove every object under the well; the
  colleague holding the check-out can rewrite and remove objects under it.
- The rule reaches every app that writes a well. `src/lib/wellsRegistry.js`
  turns a refusal into the same sentences ("Being edited by ..."). Only Well
  Data Manager, the well's editor, sends the version; other apps patch a field
  or two and are not versioned.
- Not offered: Save a copy of a well (Export and project packages do that);
  the Tops sheet view stays owner-only.

## 8. Migrations and how to apply them

Both files are idempotent and carry no transaction lines. Staging and
production share one database, so there is one apply. Order matters:

```
supabase db query --linked -f supabase/migrations/20261002100000_suite_record_sharing.sql
supabase db query --linked -f supabase/migrations/20261002110000_geo_wells_team_editing.sql
```

Then flip the two rows in `MIGRATIONS.md`. The app already on staging finds
the columns within a minute and the controls appear; nothing has to be
redeployed. Production shows them after the next upload.

## 9. Proof

- `tools/validation/org-sharing/run.sh`: a scratch Postgres rebuilt from the
  live catalog read; both files apply twice; existing rows unchanged; grants
  and policies as designed; `pentest.sql` passes inside a rolled-back
  transaction; with the guard trigger dropped the pentest fails (negative
  control); a pre-migration payload still saves.
- `tools/validation/org-sharing/pentest.sql`: 495 checks as real roles
  (`authenticated` with a JWT sub, `anon`): owner reads and writes; a
  colleague reads a shared record, cannot read a private one, cannot write a
  view-only one, writes only while holding the check-out; the check-out
  refused, expired, taken over and released; a stale version refused; forged
  `updated_by`, `version` and check-out columns ignored; nobody shares into a
  foreign organisation; another organisation and anon read nothing; nobody
  writes the log; the same for wells and their tops. It ends by raising, so
  the transaction it runs in cannot commit.
- The same pentest was run against the live database inside one rolled-back
  transaction with both migrations (2026-10-02): 495 of 495; a read-only
  check afterwards found nothing left behind.
- jest: `src/lib/recordSharing/__tests__/recordSharing.test.jsx` and one
  `orgSharing.test.jsx` per app, each with the before-apply state.
- Playwright: `e2e/org-sharing.spec.js` on the `/dev` harnesses.

## 10. Open items

1. Owner: apply the two migrations (section 8).
2. Walk on staging with two real accounts of one organisation after the
   apply (the harness has one signed-out user and a simulated colleague).
3. Organisation admins seeing private records: with the Suite Project.
4. Change log retention: with the Suite Project audit trail.
5. When the Suite Project lands (`project_id`), `can_read_project` and
   `can_edit_project` take the place of the organisation test in these
   policies; the check-out, version and log stay as they are.
