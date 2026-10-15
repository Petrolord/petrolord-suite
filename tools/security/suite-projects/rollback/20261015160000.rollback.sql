-- Rollback of 20261015160000_suite_projects_qi_worker_tables.sql. Drops the
-- RESTRICTIVE policies, the insert stamps and the suite_project_id column on
-- qi_jobs and qi_datasets (which project each job and file was in is
-- forgotten). The original policies and grants were never touched. No
-- transaction lines.
do $$
declare t text;
begin
    foreach t in array array['qi_jobs', 'qi_datasets'] loop
        if to_regclass('public.' || t) is null then continue; end if;
        execute format('drop policy if exists %I on public.%I', t || '_project_read', t);
        execute format('drop policy if exists %I on public.%I', t || '_project_insert', t);
        execute format('drop policy if exists %I on public.%I', t || '_project_update', t);
        execute format('drop policy if exists %I on public.%I', t || '_project_delete', t);
        execute format('drop trigger if exists suite_project_stamp on public.%I', t);
        execute format('drop index if exists public.%I', t || '_suite_project_idx');
        execute format('alter table public.%I drop column if exists suite_project_id', t);
    end loop;
end $$;
