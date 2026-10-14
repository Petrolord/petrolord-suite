-- Suite Projects P0, part 2 of 3: suite_project_id on the shared geoscience
-- registries, the insert stamp, and the RESTRICTIVE project policies.
-- Needs 20261015100000_suite_projects_p0_tables.sql.
--
-- Parent tables that gain a nullable suite_project_id (references
-- suite_projects on delete restrict, so a project holding data cannot be
-- deleted by accident; archiving is the normal end of life):
--   geo_wells, geo_surfaces, geo_culture, geo_correlation_sections,
--   geo_strat_units, strat_projects,
--   seismic_projects, seismic_volumes, seismic_lines
-- The column is suite_project_id, not project_id: seismic_volumes and
-- seismic_lines already have project_id (their Seismolord seismic_projects row).
--
-- Child rows follow their parent and get no column: geo_wells_logs, _tops,
-- _zones, _intervals, _core_images (their policies read geo_wells through
-- EXISTS, which runs under the reader's own row level security), and
-- seismic_horizons, _faults, _exported_surfaces, _line_picks, _sessions (keyed
-- by volume or line; their org paths read seismic_volumes / seismic_lines the
-- same way). Storage policies on the wells, surfaces, culture and seismic
-- buckets also read these tables through EXISTS, so a members-only project
-- hides its files from non-members too.
--
-- Access rule, added as RESTRICTIVE policies (to authenticated) beside the
-- existing permissive ones, which are not touched. anon is left exactly as it
-- is: every permissive policy on these tables needs auth.uid(), so anon reads
-- no rows today and still reads none.
--   read / update / delete  suite_project_row_visible(suite_project_id), or the
--                           row is the reader's own. For a row in a project that
--                           is open to the organisation (every row after the
--                           backfill) this is true, so existing access is
--                           exactly unchanged. Rows in a members-only project are
--                           seen only by the project's owner and members, and by
--                           org admins after a logged open.
--   insert / update check   suite_project_row_writable(suite_project_id, organization_id):
--                           the writer may add to that project and the row's
--                           organisation matches the project's. Null passes, so
--                           an app build from before P1 keeps saving (the stamp
--                           below fills it).
--
-- Stamp: a BEFORE INSERT trigger fills a null suite_project_id with the
-- writer's current project when they may write to it, else their default
-- project (made on demand). So every new row lands in a project, including rows
-- written by older app builds and by edge functions with the service role.
--
-- Idempotent; no transaction lines. Rollback:
-- tools/security/suite-projects/rollback/20261015100100.rollback.sql

create or replace function public.suite_project_for_new_row(p_uid uuid, p_row_org uuid)
returns uuid language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v uuid; v_org uuid;
begin
    if p_uid is null then return null; end if;
    select s.current_project_id into v from public.suite_user_state s where s.user_id = p_uid;
    if v is not null then
        select organization_id into v_org from public.suite_projects where id = v and status = 'active';
        if found and public.suite_project_can_edit_as(v, p_uid)
           and (v_org is null or p_row_org is null or p_row_org = v_org) then
            return v;
        end if;
    end if;
    v := public.suite_default_project_as(p_uid);
    select organization_id into v_org from public.suite_projects where id = v;
    if v_org is not null and p_row_org is not null and p_row_org <> v_org then
        -- the row is shared with an organisation other than the writer's own:
        -- use that organisation's default, when the writer belongs to it
        if public.suite_org_member_as(p_row_org, p_uid) then
            select id into v from public.suite_projects where organization_id = p_row_org and is_default;
        else
            v := null;
        end if;
    end if;
    return v;
end $$;
revoke all on function public.suite_project_for_new_row(uuid, uuid) from public, anon, authenticated;

create or replace function public.suite_project_stamp()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare n jsonb := to_jsonb(new); v uuid;
begin
    if new.suite_project_id is null then
        begin
            v := public.suite_project_for_new_row((n ->> 'user_id')::uuid, nullif(n ->> 'organization_id', '')::uuid);
        -- never block a save over the stamp; the row stays in no project (visible as before)
        exception when others then v := null; end;
        new.suite_project_id := v;
    end if;
    return new;
end $$;
revoke all on function public.suite_project_stamp() from public, anon, authenticated;

do $$
declare
    t text;
    has_org boolean;
    tables constant text[] := array['geo_wells', 'geo_surfaces', 'geo_culture', 'geo_correlation_sections',
                                    'geo_strat_units', 'strat_projects',
                                    'seismic_projects', 'seismic_volumes', 'seismic_lines'];
    org_expr text;
begin
    foreach t in array tables loop
        execute format('alter table public.%I add column if not exists suite_project_id uuid
                        references public.suite_projects(id) on delete restrict', t);
        execute format('create index if not exists %I on public.%I (suite_project_id)', t || '_suite_project_idx', t);
        execute format('comment on column public.%I.suite_project_id is %L', t,
            'Suite Projects: the project this row belongs to (null only before the P0 backfill). Stamped on insert by suite_project_stamp. See docs/scope/SuiteProject-DESIGN.md.');

        has_org := exists (select 1 from information_schema.columns
                            where table_schema = 'public' and table_name = t and column_name = 'organization_id');
        org_expr := case when has_org then 'organization_id' else 'null::uuid' end;

        execute format('drop trigger if exists suite_project_stamp on public.%I', t);
        execute format('create trigger suite_project_stamp before insert on public.%I
                        for each row execute function public.suite_project_stamp()', t);

        execute format('drop policy if exists %I on public.%I', t || '_project_read', t);
        execute format('create policy %I on public.%I as restrictive for select to authenticated
                        using (user_id = auth.uid() or public.suite_project_row_visible(suite_project_id))',
                       t || '_project_read', t);
        execute format('drop policy if exists %I on public.%I', t || '_project_insert', t);
        execute format('create policy %I on public.%I as restrictive for insert to authenticated
                        with check (public.suite_project_row_writable(suite_project_id, %s))',
                       t || '_project_insert', t, org_expr);
        execute format('drop policy if exists %I on public.%I', t || '_project_update', t);
        execute format('create policy %I on public.%I as restrictive for update to authenticated
                        using (user_id = auth.uid() or public.suite_project_row_visible(suite_project_id))
                        with check (public.suite_project_row_writable(suite_project_id, %s))',
                       t || '_project_update', t, org_expr);
        execute format('drop policy if exists %I on public.%I', t || '_project_delete', t);
        execute format('create policy %I on public.%I as restrictive for delete to authenticated
                        using (user_id = auth.uid() or public.suite_project_row_visible(suite_project_id))',
                       t || '_project_delete', t);
    end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Move rows between projects (the "Move to project" action). The caller must
-- own every row and be able to write to the target; the target's organisation
-- must match each row's. Logged on both projects. Children follow the parent.
-- ---------------------------------------------------------------------------
create or replace function public.suite_move_to_project(p_table text, p_ids uuid[], p_target uuid)
returns integer language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
    uid uuid := auth.uid();
    allowed constant text[] := array['geo_wells', 'geo_surfaces', 'geo_culture', 'geo_correlation_sections',
                                     'geo_strat_units', 'strat_projects',
                                     'seismic_projects', 'seismic_volumes', 'seismic_lines'];
    v_org uuid; has_org boolean; n_owned integer; n_bad_org integer; n integer; src record;
begin
    if uid is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
    if p_table is null or not (p_table = any (allowed)) then
        raise exception 'This kind of record cannot be moved.' using errcode = '22023';
    end if;
    if not public.suite_project_can_edit_as(p_target, uid) then
        raise exception 'You cannot add data to that project.' using errcode = '42501';
    end if;
    if p_ids is null or cardinality(p_ids) = 0 then return 0; end if;
    if cardinality(p_ids) > 5000 then raise exception 'Move at most 5000 records at a time.' using errcode = '22023'; end if;
    select organization_id into v_org from public.suite_projects where id = p_target;
    if exists (select 1 from public.suite_projects where id = p_target and status <> 'active') then
        raise exception 'That project is archived.' using errcode = '22023';
    end if;

    execute format('select count(*) from public.%I where id = any ($1) and user_id = $2', p_table)
       into n_owned using p_ids, uid;
    if n_owned <> cardinality(array(select distinct unnest(p_ids))) then
        raise exception 'You can move only records you own.' using errcode = '42501';
    end if;
    has_org := exists (select 1 from information_schema.columns
                        where table_schema = 'public' and table_name = p_table and column_name = 'organization_id');
    if has_org and v_org is not null then
        execute format('select count(*) from public.%I where id = any ($1) and organization_id is not null and organization_id <> $2', p_table)
           into n_bad_org using p_ids, v_org;
        if n_bad_org > 0 then
            raise exception 'Some records are shared with another organisation.' using errcode = '22023';
        end if;
    end if;

    for src in execute format('select suite_project_id as pid, count(*) as c from public.%I
                                where id = any ($1) and suite_project_id is distinct from $2 group by 1', p_table)
               using p_ids, p_target loop
        if src.pid is not null then
            perform public.suite_log(src.pid, (select organization_id from public.suite_projects where id = src.pid),
                'rows_moved_out', jsonb_build_object('table', p_table, 'count', src.c, 'to', p_target));
        end if;
    end loop;

    execute format('update public.%I set suite_project_id = $1 where id = any ($2) and suite_project_id is distinct from $1', p_table)
       using p_target, p_ids;
    get diagnostics n = row_count;
    if n > 0 then
        perform public.suite_log(p_target, v_org, 'rows_moved_in', jsonb_build_object('table', p_table, 'count', n));
    end if;
    return n;
end $$;
revoke all on function public.suite_move_to_project(text, uuid[], uuid) from public, anon;
grant execute on function public.suite_move_to_project(text, uuid[], uuid) to authenticated;

notify pgrst, 'reload schema';
