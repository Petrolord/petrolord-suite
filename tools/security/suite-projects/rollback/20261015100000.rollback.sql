-- Rollback of 20261015100000_suite_projects_p0_tables.sql (run LAST, after the
-- other two rollbacks). Drops the five Suite Projects tables (clients, projects,
-- members, access log, user state; their data is lost, so export first if any
-- client project holds real work) and every function the file created.
-- Shared account tables were never changed. No transaction lines.
drop table if exists public.suite_user_state;
drop table if exists public.suite_project_access_log;
drop table if exists public.suite_project_members;
drop table if exists public.suite_projects;
drop table if exists public.suite_clients;
drop function if exists public.suite_project_bootstrap();
drop function if exists public.suite_project_admin_open(uuid);
drop function if exists public.suite_user_state_touch();
drop function if exists public.suite_project_members_guard();
drop function if exists public.suite_projects_after();
drop function if exists public.suite_projects_guard();
drop function if exists public.suite_clients_guard();
drop function if exists public.suite_log(uuid, uuid, text, jsonb);
drop function if exists public.suite_is_client();
drop function if exists public.suite_client_can_manage(uuid);
drop function if exists public.suite_client_can_see(uuid);
drop function if exists public.suite_client_has_readable_project(uuid);
drop function if exists public.suite_project_is_member(uuid);
drop function if exists public.suite_project_can_manage(uuid);
drop function if exists public.suite_project_row_writable(uuid, uuid);
drop function if exists public.suite_project_row_visible(uuid);
drop function if exists public.suite_project_can_see(uuid);
drop function if exists public.suite_project_can_edit(uuid);
drop function if exists public.suite_project_can_read(uuid);
drop function if exists public.suite_default_project_as(uuid);
drop function if exists public.suite_project_can_manage_as(uuid, uuid);
drop function if exists public.suite_project_can_edit_as(uuid, uuid);
drop function if exists public.suite_project_can_read_as(uuid, uuid);
drop function if exists public.suite_org_of(uuid);
drop function if exists public.suite_org_admin_as(uuid, uuid);
drop function if exists public.suite_org_member_as(uuid, uuid);
notify pgrst, 'reload schema';
