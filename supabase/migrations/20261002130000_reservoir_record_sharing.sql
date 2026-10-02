-- Organisation sharing for the Reservoir apps' saved records
-- (Reservoir round, Step 0a; docs/scope/AppUpgrade-Reservoir-PLAN.md, owner
-- question 2: covered by the owner's approval of 2026-10-01 because the
-- policy shape is the approved one; design in
-- docs/scope/OrgSharing-DESIGN-AND-STATUS.md).
--
-- Apply AFTER 20261002100000_suite_record_sharing.sql. This file adds no
-- rule of its own: it puts ten more record tables under that file's rules
-- (same columns, same guard and log triggers, same four policies, a row in
-- suite_record_tables), and makes their child tables follow the parent.
--
-- Record tables (shared when visibility = 'organization'):
--   saved_fluid_studio_projects, saved_scal_projects, saved_dca_projects,
--   saved_scenario_hub_projects, saved_well_test_projects,
--   saved_waterflood_design_projects, saved_vrr_projects, saved_rf_projects,
--   rb_cases, sim_cases
--
-- Children (no sharing columns of their own; they follow the parent row):
--   rb_production_data, rb_run_configs, rb_runs, rb_results  -> rb_cases
--       read:  whoever can read the case
--       write: the case owner, unless a colleague holds the unexpired
--              check-out; or the member who holds it (the geo_wells children
--              rule of 20261002110000)
--       log:   a statement on rb_production_data or rb_run_configs logs one
--              'updated' entry on the case ("Production data: 24 added").
--              rb_runs and rb_results are calculation output and are not
--              logged.
--   sim_runs -> sim_cases
--       read:  the run's own user, or whoever can read the case. Written
--              only by the worker and the two SECURITY DEFINER functions, as
--              before.
--   sim bucket (path {user id}/{case id}/...)
--       read:  added: whoever can read the case reads the objects filed
--              under it (the deck and the run results). Upload, rewrite and
--              remove stay with the uploader's own folder, as before.
--
-- What changes for existing data: nothing. Every existing row stays private
-- at version 1 with view access. Live state read on 2026-10-02: no rb_cases
-- row carries org_id and no sim_cases or sim_runs row carries
-- organization_id, so the two tables that could already name an
-- organisation share nothing today.
--   rb_cases.org_id (older column, unused by the app) is left as it is; the
--     sharing rules read the new organization_id like every other table.
--   sim_cases was readable by the organisation whenever organization_id was
--     set. It now follows the one rule: the owner shares it (visibility).
--   rb_cases: the touch trigger update_rb_cases_updated_at is dropped,
--     because the guard stamps updated_at on a change of content and a
--     check-out or a sharing change must not look like an edit.
--
-- An app build from before this migration keeps saving: it sends no version
-- (the stale check passes it) and no sharing columns (the row stays private).
--
-- anon is revoked on all fifteen tables. THE STORAGE LESSON (2026-10-02,
-- 20261002120000): a policy granted to PUBLIC or anon whose expression reads
-- a table anon can no longer read makes every anon query of the policied
-- table fail. Read on the live catalog before writing this file: no policy
-- in any schema that is granted to PUBLIC or anon reads any of the fifteen
-- tables once their own policies are replaced below (all to authenticated).
-- Step 7 checks that again at apply time and REFUSES TO APPLY if it finds
-- one, so the revoke can never land beside such a policy.
--
-- No shared table is changed (organizations is only referenced). Idempotent.
-- No transaction lines: one DO statement, so it applies whole or not at all.

do $reservoir$
declare
    t text; what text; p record; bad text;
    record_tables constant text[] := array[
        'saved_fluid_studio_projects', 'saved_scal_projects', 'saved_dca_projects', 'saved_scenario_hub_projects',
        'saved_well_test_projects', 'saved_waterflood_design_projects', 'saved_vrr_projects', 'saved_rf_projects',
        'rb_cases', 'sim_cases'];
    rb_children constant text[] := array['rb_production_data', 'rb_run_configs', 'rb_runs', 'rb_results'];
    sel text := '(user_id = auth.uid() or (visibility = ''organization'' and organization_id is not null and public.is_org_member(organization_id)))';
    own_ok text := '(user_id = auth.uid() and (visibility = ''private'' or (organization_id is not null and public.is_org_member(organization_id))))';
    colleague text := '(visibility = ''organization'' and org_access = ''edit'' and organization_id is not null and public.is_org_member(organization_id) and editing_by = auth.uid() and editing_expires > now())';
    reader text; writer text; changes text := 'false';
begin
    -- -----------------------------------------------------------------------
    -- 0. Needs the rules of 20261002100000
    -- -----------------------------------------------------------------------
    if to_regclass('public.suite_record_tables') is null or to_regclass('public.suite_record_changes') is null
       or to_regprocedure('public.suite_record_guard()') is null or to_regprocedure('public.suite_record_log()') is null
       or to_regprocedure('public.suite_record_log_updated(text, uuid, uuid, uuid, text, jsonb)') is null then
        raise exception 'Apply 20261002100000_suite_record_sharing.sql first.';
    end if;
    foreach t in array record_tables || rb_children || array['sim_runs'] loop
        if to_regclass('public.' || t) is null then
            raise exception 'Table public.% does not exist.', t;
        end if;
    end loop;

    -- -----------------------------------------------------------------------
    -- 1. The ten record tables join the list the check-out functions read
    -- -----------------------------------------------------------------------
    insert into public.suite_record_tables (table_name, shared_when, label) values
        ('saved_fluid_studio_projects',      'visibility', 'Fluid Systems Studio project'),
        ('saved_scal_projects',              'visibility', 'SCAL Studio project'),
        ('saved_dca_projects',               'visibility', 'Decline Curve Analysis project'),
        ('saved_scenario_hub_projects',      'visibility', 'Forecast Scenario Hub project'),
        ('saved_well_test_projects',         'visibility', 'Well Test Analysis project'),
        ('saved_waterflood_design_projects', 'visibility', 'Waterflood Design project'),
        ('saved_vrr_projects',               'visibility', 'Voidage Replacement Monitor project'),
        ('saved_rf_projects',                'visibility', 'Recovery Factor project'),
        ('rb_cases',                         'visibility', 'Material Balance case'),
        ('sim_cases',                        'visibility', 'simulation case')
    on conflict (table_name) do update set shared_when = excluded.shared_when, label = excluded.label;

    -- -----------------------------------------------------------------------
    -- 2. Columns, triggers, the four policies and grants (the section 6 loop
    --    of 20261002100000, for these tables)
    -- -----------------------------------------------------------------------
    foreach t in array record_tables loop
        execute format('alter table public.%I
            add column if not exists visibility text not null default ''private'',
            add column if not exists organization_id uuid references public.organizations (id) on delete set null,
            add column if not exists org_access text not null default ''view'',
            add column if not exists editing_by uuid,
            add column if not exists editing_since timestamptz,
            add column if not exists editing_expires timestamptz,
            add column if not exists version integer not null default 1,
            add column if not exists updated_by uuid,
            add column if not exists change_note text', t);
        if not exists (select 1 from information_schema.columns
                       where table_schema = 'public' and table_name = t and column_name = 'updated_at') then
            execute format('alter table public.%I add column updated_at timestamptz', t);
            execute format('update public.%I set updated_at = created_at where updated_at is null', t);
            execute format('alter table public.%I alter column updated_at set default now()', t);
        end if;
        if not exists (select 1 from pg_constraint where conrelid = format('public.%I', t)::regclass and conname = t || '_visibility_check') then
            execute format('alter table public.%I add constraint %I check (visibility in (''private'', ''organization''))', t, t || '_visibility_check');
        end if;
        if not exists (select 1 from pg_constraint where conrelid = format('public.%I', t)::regclass and conname = t || '_org_access_check') then
            execute format('alter table public.%I add constraint %I check (org_access in (''view'', ''edit''))', t, t || '_org_access_check');
        end if;
        execute format('create index if not exists %I on public.%I (organization_id) where visibility = ''organization''', t || '_shared_org_idx', t);

        execute format('drop trigger if exists suite_record_guard on public.%I', t);
        execute format('create trigger suite_record_guard before insert or update on public.%I
                        for each row execute function public.suite_record_guard(''visibility'')', t);
        execute format('drop trigger if exists suite_record_log on public.%I', t);
        execute format('create trigger suite_record_log after insert or update or delete on public.%I
                        for each row execute function public.suite_record_log(''visibility'')', t);

        -- replace the owner policies (several are granted to PUBLIC today) with
        -- the four below. The dormant "Allow admin full access" policy on
        -- saved_dca_projects is left as it is, as on saved_quickvol_projects.
        for p in select policyname from pg_policies
                 where schemaname = 'public' and tablename = t and policyname <> 'Allow admin full access' loop
            execute format('drop policy %I on public.%I', p.policyname, t);
        end loop;
        execute format('alter table public.%I enable row level security', t);
        execute format('create policy %I on public.%I for select to authenticated using (%s)', t || '_select_own_or_org', t, sel);
        execute format('create policy %I on public.%I for insert to authenticated with check (%s)', t || '_insert_own', t, own_ok);
        execute format('create policy %I on public.%I for update to authenticated using (user_id = auth.uid() or %s) with check (%s or %s)',
                       t || '_update_own_or_editor', t, colleague, own_ok, colleague);
        execute format('create policy %I on public.%I for delete to authenticated using (user_id = auth.uid())', t || '_delete_own', t);

        execute format('revoke all on public.%I from anon', t);
        execute format('revoke all on public.%I from authenticated', t);
        execute format('grant select, insert, update, delete on public.%I to authenticated', t);

        changes := changes || format(' or (table_name = %L and exists (select 1 from public.%I r where r.id = record_id))', t, t);
    end loop;

    -- the guard stamps updated_at on a change of content; this older trigger
    -- would stamp it on a check-out and on a sharing change too
    drop trigger if exists update_rb_cases_updated_at on public.rb_cases;

    -- -----------------------------------------------------------------------
    -- 3. One 'updated' entry on the parent for a statement on a child table.
    --    TG_ARGV: what changed (plain words), the parent table, the child's
    --    column that points at it. Written like suite_record_child_log of
    --    20261002110000 (which is fixed to geo_wells and is left untouched).
    -- -----------------------------------------------------------------------
    execute $fn$
    create or replace function public.suite_record_child_log_parent()
    returns trigger language plpgsql security definer set search_path = public, pg_temp as $body$
    declare
        what text := coalesce(tg_argv[0], tg_table_name);
        parent text := tg_argv[1];
        fk text := tg_argv[2];
        rec record; own record;
    begin
        if parent is null or fk is null
           or not exists (select 1 from public.suite_record_tables s where s.table_name = parent) then
            raise exception 'suite_record_child_log_parent: needs a shared record table and a column.' using errcode = '22023';
        end if;
        for rec in execute format('select r.%I as parent_id, count(*) as n from %s r group by 1',
                                  fk, case tg_op when 'DELETE' then 'old_rows' else 'new_rows' end) loop
            execute format('select p.organization_id, p.user_id from public.%I p where p.id = $1', parent)
                into own using rec.parent_id;
            if own.user_id is not null then   -- not when the parent itself is being deleted
                perform public.suite_record_log_updated(parent, rec.parent_id, own.organization_id, own.user_id,
                    format('%s: %s %s', upper(left(what, 1)) || substr(what, 2), rec.n,
                           case tg_op when 'INSERT' then 'added' when 'DELETE' then 'removed' else 'changed' end),
                    jsonb_build_array(what));
            end if;
        end loop;
        return null;
    end $body$
    $fn$;
    revoke all on function public.suite_record_child_log_parent() from public, anon, authenticated;

    -- -----------------------------------------------------------------------
    -- 4. rb_cases children: read through the case, write under its check-out
    -- -----------------------------------------------------------------------
    foreach t in array rb_children loop
        -- the sub-select runs under the caller's own row level security on rb_cases
        reader := format('exists (select 1 from public.rb_cases c where c.id = %I.case_id)', t);
        writer := format('exists (select 1 from public.rb_cases c where c.id = %I.case_id and (
            (c.user_id = auth.uid()
             and not (c.visibility = ''organization'' and c.organization_id is not null and c.org_access = ''edit''
                      and c.editing_by is not null and c.editing_by <> auth.uid() and c.editing_expires > now()))
            or (c.visibility = ''organization'' and c.organization_id is not null and c.org_access = ''edit''
                and public.is_org_member(c.organization_id) and c.editing_by = auth.uid() and c.editing_expires > now())))', t);
        for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
            execute format('drop policy %I on public.%I', p.policyname, t);
        end loop;
        execute format('alter table public.%I enable row level security', t);
        execute format('create policy %I on public.%I for select to authenticated using (%s)', t || '_select_via_case', t, reader);
        execute format('create policy %I on public.%I for insert to authenticated with check (%s)', t || '_insert_writer', t, writer);
        execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)', t || '_update_writer', t, writer, writer);
        execute format('create policy %I on public.%I for delete to authenticated using (%s)', t || '_delete_writer', t, writer);

        execute format('revoke all on public.%I from anon', t);
        execute format('revoke all on public.%I from authenticated', t);
        execute format('grant select, insert, update, delete on public.%I to authenticated', t);

        execute format('drop trigger if exists suite_record_child_log_ins on public.%I', t);
        execute format('drop trigger if exists suite_record_child_log_upd on public.%I', t);
        execute format('drop trigger if exists suite_record_child_log_del on public.%I', t);
        what := case t when 'rb_production_data' then 'production data' when 'rb_run_configs' then 'run settings' else null end;
        if what is not null then
            execute format('create trigger suite_record_child_log_ins after insert on public.%I referencing new table as new_rows
                            for each statement execute function public.suite_record_child_log_parent(%L, ''rb_cases'', ''case_id'')', t, what);
            execute format('create trigger suite_record_child_log_upd after update on public.%I referencing new table as new_rows
                            for each statement execute function public.suite_record_child_log_parent(%L, ''rb_cases'', ''case_id'')', t, what);
            execute format('create trigger suite_record_child_log_del after delete on public.%I referencing old table as old_rows
                            for each statement execute function public.suite_record_child_log_parent(%L, ''rb_cases'', ''case_id'')', t, what);
        end if;
    end loop;

    -- -----------------------------------------------------------------------
    -- 5. sim_runs: read through the case. No client write policy, as before
    --    (the worker and the SECURITY DEFINER functions write).
    -- -----------------------------------------------------------------------
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'sim_runs' loop
        execute format('drop policy %I on public.sim_runs', p.policyname);
    end loop;
    alter table public.sim_runs enable row level security;
    create policy "sim_runs_select_via_case" on public.sim_runs for select to authenticated
        using (user_id = auth.uid() or exists (select 1 from public.sim_cases c where c.id = sim_runs.case_id));
    revoke all on public.sim_runs from anon;

    -- -----------------------------------------------------------------------
    -- 6. sim bucket: whoever can read the case reads the objects under it.
    --    To authenticated only. objects.name is qualified: inside the
    --    sub-select a bare `name` is sim_cases.name.
    -- -----------------------------------------------------------------------
    if to_regclass('storage.objects') is not null then
        drop policy if exists "sim_objects_select_case_reader" on storage.objects;
        create policy "sim_objects_select_case_reader" on storage.objects for select to authenticated
            using (bucket_id = 'sim' and exists (
                select 1 from public.sim_cases c where c.id::text = (storage.foldername(objects.name))[2]));
    end if;

    -- the change log of these records: whoever can read the record
    drop policy if exists "suite_record_changes_select_reservoir" on public.suite_record_changes;
    execute format('create policy "suite_record_changes_select_reservoir" on public.suite_record_changes
                    for select to authenticated using (%s)', changes);

    -- -----------------------------------------------------------------------
    -- 7. The storage lesson, enforced: no policy granted to PUBLIC or anon,
    --    in any schema, may read a table anon was just revoked on. If one
    --    exists this migration does not apply (scope that policy to
    --    authenticated first).
    -- -----------------------------------------------------------------------
    select string_agg(format('%I.%I policy %I', pol.schemaname, pol.tablename, pol.policyname), '; ') into bad
    from pg_policies pol
    where (pol.roles && array['public', 'anon']::name[])
      and (coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, ''))
          ~ ('\m(' || array_to_string(record_tables || rb_children || array['sim_runs'], '|') || ')\M');
    if bad is not null then
        raise exception 'Not applied: a policy granted to PUBLIC or anon reads a table this migration revokes anon on (%). Scope it to authenticated first.', bad;
    end if;

    perform pg_notify('pgrst', 'reload schema');
end
$reservoir$;
