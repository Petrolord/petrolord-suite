-- Well Spacing Optimizer: saved projects
-- (Reservoir round of the app upgrade programme, app 12, Step 1, WS-U1;
-- docs/scope/AppUpgrade-Reservoir-PLAN.md, owner question 4, default taken:
-- "saved_well_spacing_projects through createSavedProjectsService, in the
-- .pld apps family"; docs/upgrade/WellSpacingOptimizer-UPGRADE.md).
--
-- NOT APPLIED. File only; the owner applies it, staging first.
--
-- Apply AFTER 20261002100000_suite_record_sharing.sql (applied 2026-10-02).
-- This file adds no rule of its own. It creates ONE new product table on
-- the saved_<app>_projects convention (the columns of saved_rf_projects,
-- 20260826101500, plus the Project Portability stamp of 20260902120000) and
-- puts it under that file's rules exactly as saved_eor_screening_projects
-- (20261004220000), rrv_valuations (20261002151500) and the ten Reservoir
-- tables (20261002130000) are: the same sharing columns, the same guard and
-- log triggers, the same four policies, a row in suite_record_tables.
--
-- public.saved_well_spacing_projects: one saved spacing study per project
--   id               uuid primary key (the app sets it)
--   user_id          the owner (auth.users, on delete cascade)
--   project_name     the name in the picker
--   inputs_data      jsonb: the payload { id, name, schema: 1, inputs, modified };
--                    inputs in oilfield units (area, pay, porosity, Swi, RF,
--                    fluid, costs, prices, the spacing range, the layout, the
--                    drainage inputs), the display unit system, identification,
--                    input sources, the pvt-1 / wta-1 / mbal-1 /
--                    dca-forecast-1 / registry-wells intakes. Results are a
--                    pure function of the inputs and are recomputed on load.
--   results_data     jsonb, unused (the convention's column)
--   schema_version, app_build   the Project Portability stamp (PP0)
--   created_at, updated_at
--   + visibility, organization_id, org_access, editing_by, editing_since,
--     editing_expires, version, updated_by, change_note   (the sharing model)
--
-- What changes for existing data: nothing. The table is new and starts
-- empty; no other table's columns, policies or grants are touched. One
-- additive SELECT policy is created on suite_record_changes so that whoever
-- can read a project can read its change history.
--
-- The app works before this file is applied: a save says "Saving is not
-- switched on yet" and the study stays on screen; nothing is lost while the
-- page is open.
--
-- anon is revoked on the table. THE STORAGE LESSON (2026-10-02,
-- 20261002120000): the table is new, so no policy can read it yet; step 5
-- checks at apply time all the same and REFUSES TO APPLY if it finds one.
--
-- No shared table is changed (organizations and auth.users are only
-- referenced). Idempotent. No transaction lines: one DO statement, so it
-- applies whole or not at all.

do $wsp$
declare
    t constant text := 'saved_well_spacing_projects';
    p record; bad text;
    sel text := '(user_id = auth.uid() or (visibility = ''organization'' and organization_id is not null and public.is_org_member(organization_id)))';
    own_ok text := '(user_id = auth.uid() and (visibility = ''private'' or (organization_id is not null and public.is_org_member(organization_id))))';
    colleague text := '(visibility = ''organization'' and org_access = ''edit'' and organization_id is not null and public.is_org_member(organization_id) and editing_by = auth.uid() and editing_expires > now())';
begin
    -- -----------------------------------------------------------------------
    -- 0. Needs the rules of 20261002100000
    -- -----------------------------------------------------------------------
    if to_regclass('public.suite_record_tables') is null or to_regclass('public.suite_record_changes') is null
       or to_regprocedure('public.suite_record_guard()') is null or to_regprocedure('public.suite_record_log()') is null
       or to_regprocedure('public.is_org_member(uuid)') is null then
        raise exception 'Apply 20261002100000_suite_record_sharing.sql first.';
    end if;

    -- -----------------------------------------------------------------------
    -- 1. The table
    -- -----------------------------------------------------------------------
    create table if not exists public.saved_well_spacing_projects (
        id               uuid primary key default gen_random_uuid(),
        user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
        project_name     text not null check (length(project_name) between 1 and 300),
        inputs_data      jsonb not null default '{}'::jsonb check (jsonb_typeof(inputs_data) = 'object'),
        results_data     jsonb,
        schema_version   integer not null default 1,
        app_build        text,
        created_at       timestamptz not null default now(),
        updated_at       timestamptz not null default now()
    );
    comment on table public.saved_well_spacing_projects is
        'Well Spacing Optimizer: one saved spacing study per project (inputs in oilfield units, identification, input sources, pvt-1 / wta-1 / mbal-1 / dca-forecast-1 / registry-wells intakes). Under the organisation sharing rules of 20261002100000.';
    create index if not exists saved_well_spacing_projects_user_idx on public.saved_well_spacing_projects (user_id, updated_at desc);

    -- -----------------------------------------------------------------------
    -- 2. It joins the list the check-out functions read
    -- -----------------------------------------------------------------------
    insert into public.suite_record_tables (table_name, shared_when, label) values
        ('saved_well_spacing_projects', 'visibility', 'Well Spacing project')
    on conflict (table_name) do update set shared_when = excluded.shared_when, label = excluded.label;

    -- -----------------------------------------------------------------------
    -- 3. Sharing columns, triggers, the four policies and grants (the section
    --    6 loop body of 20261002100000, for this table)
    -- -----------------------------------------------------------------------
    alter table public.saved_well_spacing_projects
        add column if not exists visibility text not null default 'private',
        add column if not exists organization_id uuid references public.organizations (id) on delete set null,
        add column if not exists org_access text not null default 'view',
        add column if not exists editing_by uuid,
        add column if not exists editing_since timestamptz,
        add column if not exists editing_expires timestamptz,
        add column if not exists version integer not null default 1,
        add column if not exists updated_by uuid,
        add column if not exists change_note text;
    if not exists (select 1 from pg_constraint where conrelid = 'public.saved_well_spacing_projects'::regclass and conname = 'saved_well_spacing_projects_visibility_check') then
        alter table public.saved_well_spacing_projects add constraint saved_well_spacing_projects_visibility_check check (visibility in ('private', 'organization'));
    end if;
    if not exists (select 1 from pg_constraint where conrelid = 'public.saved_well_spacing_projects'::regclass and conname = 'saved_well_spacing_projects_org_access_check') then
        alter table public.saved_well_spacing_projects add constraint saved_well_spacing_projects_org_access_check check (org_access in ('view', 'edit'));
    end if;
    create index if not exists saved_well_spacing_projects_shared_org_idx on public.saved_well_spacing_projects (organization_id) where visibility = 'organization';

    drop trigger if exists suite_record_guard on public.saved_well_spacing_projects;
    create trigger suite_record_guard before insert or update on public.saved_well_spacing_projects
        for each row execute function public.suite_record_guard('visibility');
    drop trigger if exists suite_record_log on public.saved_well_spacing_projects;
    create trigger suite_record_log after insert or update or delete on public.saved_well_spacing_projects
        for each row execute function public.suite_record_log('visibility');

    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
        execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    alter table public.saved_well_spacing_projects enable row level security;
    execute format('create policy %I on public.%I for select to authenticated using (%s)', t || '_select_own_or_org', t, sel);
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)', t || '_insert_own', t, own_ok);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = auth.uid() or %s) with check (%s or %s)',
                   t || '_update_own_or_editor', t, colleague, own_ok, colleague);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = auth.uid())', t || '_delete_own', t);

    revoke all on public.saved_well_spacing_projects from public;
    revoke all on public.saved_well_spacing_projects from anon;
    revoke all on public.saved_well_spacing_projects from authenticated;
    grant select, insert, update, delete on public.saved_well_spacing_projects to authenticated;

    -- -----------------------------------------------------------------------
    -- 4. The change log of a project: whoever can read the project (the
    --    sub-select runs under the caller's own row level security). The
    --    owner reads it after a delete through the reader policy of
    --    20261002100000 (owner_id = auth.uid()).
    -- -----------------------------------------------------------------------
    drop policy if exists "suite_record_changes_select_well_spacing" on public.suite_record_changes;
    create policy "suite_record_changes_select_well_spacing" on public.suite_record_changes
        for select to authenticated
        using (table_name = 'saved_well_spacing_projects' and exists (select 1 from public.saved_well_spacing_projects r where r.id = record_id));

    -- -----------------------------------------------------------------------
    -- 5. The storage lesson, enforced: no policy granted to PUBLIC or anon,
    --    in any schema, may read the table anon was just revoked on. If one
    --    exists this migration does not apply (scope that policy to
    --    authenticated first).
    -- -----------------------------------------------------------------------
    select string_agg(format('%I.%I policy %I', pol.schemaname, pol.tablename, pol.policyname), '; ') into bad
    from pg_policies pol
    where (pol.roles && array['public', 'anon']::name[])
      and (coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, '')) ~ '\msaved_well_spacing_projects\M';
    if bad is not null then
        raise exception 'Not applied: a policy granted to PUBLIC or anon reads a table this migration revokes anon on (%). Scope it to authenticated first.', bad;
    end if;

    perform pg_notify('pgrst', 'reload schema');
end
$wsp$;
