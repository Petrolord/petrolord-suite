-- Suite Projects for the seismic worker (QI upgrade, 2026-10-15; the owner
-- runs client QI studies, so the worker's jobs and files must follow the
-- project). The P4 pattern (20261015130000_suite_projects_p4_app_tables.sql)
-- on the two worker tables:
--   qi_jobs      the job queue (clients enqueue through qi_enqueue_job, a
--                SECURITY DEFINER function; the worker uses the service role)
--   qi_datasets  large files in the worker store: uploads, gather stores,
--                angle stacks (written by the qi-upload-url edge function and
--                the worker with the service role)
-- For each: nullable suite_project_id (FK suite_projects, on delete restrict)
-- and index; the insert stamp trigger suite_project_stamp (the writer's
-- current project, else the default; it reads the row's user_id, so service
-- role inserts land in the user's current project too, and the worker sets
-- the project of a file made from another file explicitly); RESTRICTIVE
-- policies to authenticated (select: own rows, or rows in a project the
-- caller may read; the permissive select-own policy is unchanged, so who
-- sees which row is exactly as today); the client write grants stay revoked;
-- backfill of every existing row into its creator's default project; and a
-- final check that raises (rolling everything back) if any row is left
-- without a project.
--
-- saved_qi_studio_projects was adopted by P4 and is not touched here.
-- Idempotent; no transaction lines. Rollback:
-- tools/security/suite-projects/rollback/20261015160000.rollback.sql
-- Verify: tools/security/suite-projects/verify/20261015160000.verify.sql

do $$
declare
    t text; n bigint; total bigint := 0;
    tables constant text[] := array['qi_jobs', 'qi_datasets'];
begin
    if to_regprocedure('public.suite_project_stamp()') is null then
        raise exception 'Suite Projects P0 is not applied here (suite_project_stamp is missing); nothing applied.';
    end if;
    foreach t in array tables loop
        if to_regclass('public.' || t) is null then
            raise notice 'qi projects: % does not exist here, skipped', t;
            continue;
        end if;
        execute format('alter table public.%I add column if not exists suite_project_id uuid
                        references public.suite_projects(id) on delete restrict', t);
        execute format('create index if not exists %I on public.%I (suite_project_id)', t || '_suite_project_idx', t);
        execute format('comment on column public.%I.suite_project_id is %L', t,
            'Suite Projects: the project this row belongs to. Stamped on insert by suite_project_stamp; the worker sets it from the source file. See docs/scope/SuiteProject-DESIGN.md.');

        execute format('drop trigger if exists suite_project_stamp on public.%I', t);
        execute format('create trigger suite_project_stamp before insert on public.%I
                        for each row execute function public.suite_project_stamp()', t);

        execute format('drop policy if exists %I on public.%I', t || '_project_read', t);
        execute format('create policy %I on public.%I as restrictive for select to authenticated
                        using (user_id = auth.uid() or public.suite_project_row_visible(suite_project_id))', t || '_project_read', t);
        execute format('drop policy if exists %I on public.%I', t || '_project_insert', t);
        execute format('create policy %I on public.%I as restrictive for insert to authenticated
                        with check (public.suite_project_row_writable(suite_project_id, organization_id))', t || '_project_insert', t);
        execute format('drop policy if exists %I on public.%I', t || '_project_update', t);
        execute format('create policy %I on public.%I as restrictive for update to authenticated
                        using (user_id = auth.uid() or public.suite_project_row_visible(suite_project_id))
                        with check (public.suite_project_row_writable(suite_project_id, organization_id))', t || '_project_update', t);
        execute format('drop policy if exists %I on public.%I', t || '_project_delete', t);
        execute format('create policy %I on public.%I as restrictive for delete to authenticated
                        using (user_id = auth.uid() or public.suite_project_row_visible(suite_project_id))', t || '_project_delete', t);

        -- backfill: the creator's default project (row org default, creator org default, personal)
        execute format('select count(*) from (select public.suite_default_project_as(x.user_id) from
                          (select distinct user_id from public.%I where suite_project_id is null and user_id is not null) x
                          where public.suite_org_of(x.user_id) is null
                            and exists (select 1 from auth.users u where u.id = x.user_id)) y', t) into n;
        execute format('update public.%I r set suite_project_id = coalesce(
                (select p.id from public.suite_projects p where p.is_default and p.organization_id is not null and p.organization_id = r.organization_id),
                (select p.id from public.suite_projects p where p.is_default and p.organization_id = public.suite_org_of(r.user_id)),
                (select p.id from public.suite_projects p where p.is_default and p.organization_id is null and p.owner_user_id = r.user_id))
              where r.suite_project_id is null', t);

        execute format('select count(*) from public.%I where suite_project_id is null', t) into n;
        if n > 0 then
            raise notice 'qi projects: % rows of % have no project', n, t;
            total := total + n;
        end if;
    end loop;
    if total > 0 then
        raise exception 'QI projects backfill left % rows without a project; nothing applied.', total;
    end if;
end $$;
