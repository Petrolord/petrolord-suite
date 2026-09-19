-- Behavioural probes for the anon RLS exposure fix. run.sh applies the
-- stubs, then Migration A, runs the A_ probes, then Migration B, runs the
-- B_ probes, and diffs stdout/stderr against probes.expected*.
\set ON_ERROR_STOP 0
\set O1 '''10000000-0000-0000-0000-000000000001'''
\set O2 '''10000000-0000-0000-0000-000000000002'''
\set UA '''00000000-0000-0000-0000-00000000000a'''
\set UB '''00000000-0000-0000-0000-00000000000b'''
\set PA '''60000000-0000-0000-0000-00000000000a'''
\set PB '''60000000-0000-0000-0000-00000000000b'''
\if :{?PHASE_B}
\else
-- ======== after Migration A only ========
-- A1 anon can no longer read, write or truncate (expect permission denied x4)
set role anon;
select 'A1 anon read', count(*) from public.badge_definitions;
insert into public.work_permits(organization_id, title) values (:O1, 'anon write');
update public.pm_deliverables set name = 'x';
truncate public.work_permits;
reset role;
-- A2 a signed-in user keeps today's access on client tables (RLS still off there): OK
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select 'A2 A sees permits (both orgs, unchanged by A)', count(*) from public.work_permits;
insert into public.pm_deliverables(project_id, name) values (:PA, 'A deliverable after A');
select 'A2 A sees own deliverable', count(*) from public.pm_deliverables;
-- A3 dead tables: RLS on, no policy -> signed-in user sees nothing, cannot insert
select 'A3 A reads payment_audit_log', count(*) from public.payment_audit_log;
insert into public.payment_audit_log(action) values ('forged');
reset role;
-- A4 service role (edge functions) still reads and writes the dead table
set role service_role;
insert into public.payment_audit_log(action) values ('from edge fn');
select 'A4 service_role sees payment_audit_log', count(*) from public.payment_audit_log;
reset role;
\endif
\if :{?PHASE_B}
-- ======== after Migrations A and B ========
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
-- B1 PM: own project OK, other user's project refused, forged created_by refused
insert into public.pm_deliverables(project_id, name, created_by) values (:PA, 'ok', :UA);
insert into public.pm_deliverables(project_id, name) values (:PB, 'intruder');
insert into public.pm_deliverables(project_id, name, created_by) values (:PA, 'forged', :UB);
select 'B1 A sees deliverables (own project only)', count(*) from public.pm_deliverables;
select 'B1 A sees resources', count(*) from public.pm_resources;
-- B2 assignment against B's resource refused; against own OK; delete own OK
insert into public.pm_resource_assignments(resource_id, role) values ('61000000-0000-0000-0000-00000000000b', 'x');
insert into public.pm_resource_assignments(resource_id, role) values ('61000000-0000-0000-0000-00000000000a', 'x');
delete from public.pm_resource_assignments where role = 'x';
-- B3 no delete grant where the app never deletes (expect permission denied)
delete from public.project_issues;
delete from public.work_permits;
-- B4 work permits: org1 OK, org2 refused, forged creator refused, cannot move to org2
insert into public.work_permits(organization_id, title, created_by) values (:O1, 'A permit', :UA);
insert into public.work_permits(organization_id, title) values (:O2, 'intruder');
insert into public.work_permits(organization_id, title, created_by) values (:O1, 'forged', :UB);
update public.work_permits set organization_id = :O2 where title = 'A permit';
select 'B4 A sees permits (org1 only)', count(*) from public.work_permits;
select 'B4 A sees approvals (org1 permit only)', count(*) from public.permit_approvals;
truncate public.work_permits;
-- B5 feedback / safety moments: own attribution only
insert into public.feedback(organization_id, user_id, rating) values (:O1, :UA, 5);
insert into public.feedback(organization_id, user_id, rating) values (:O1, :UB, 1);
insert into public.safety_moment_views(user_id) values (:UA);
insert into public.safety_moment_views(user_id) values (:UB);
select 'B5 A sees own views', count(*) from public.safety_moment_views;
-- B6 branding presets are admin-only: engineer refused
insert into public.branding_presets(organization_id, name, created_by) values (:O1, 'eng', :UA);
-- B7 templates: global + own org, never org2's
select 'B7 A sees templates', string_agg(id, ',' order by id) from public.templates;
-- B8 portfolios are per user: A sees none of B's; cannot insert as B
select 'B8 A sees portfolios', count(*) from public.portfolios;
insert into public.portfolios(user_id, name) values (:UB, 'forged');
-- B9 project_members: own row only, so is_project_member-style checks stay exact
select 'B9 A sees project_members', count(*) from public.project_members;
-- B10 dead table: signed-in user refused outright now
select 'B10 A reads payment_audit_log', count(*) from public.payment_audit_log;
-- B11 org2 owner sees only org2 and cannot touch org1
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select 'B11 B sees permits', count(*) from public.work_permits;
update public.work_permits set title = 'hijack' where organization_id = :O1;
select 'B11 org1 permits hijacked (expect 0)', count(*) from public.work_permits where title = 'hijack';
insert into public.branding_presets(organization_id, name, created_by) values (:O2, 'owner preset', :UB);
select 'B11 B sees own preset', count(*) from public.branding_presets;
-- B12 invited (not active) member sees nothing
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select 'B12 invited sees permits', count(*) from public.work_permits;
-- B13 super admin reads across orgs, cannot write into an org it is not in
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000e';
select 'B13 super admin sees permits', count(*) from public.work_permits;
insert into public.work_permits(organization_id, title) values (:O1, 'sa write');
reset role;
-- B14 anon still has nothing
set role anon;
select 'B14 anon read', count(*) from public.work_permits;
reset role;
\endif
