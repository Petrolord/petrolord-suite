-- Behavioural probes for the platform-admin fix (scratch Postgres only).
-- run.sh runs this with PHASE=live (stubs + fixtures only: the negative
-- controls, proving each hole is real in the live shape) and PHASE=fixed
-- (after 20260919195000, applied twice). Every row prints what was observed,
-- what the phase expects, and PASS/FAIL; the last row counts failures.
-- Output is diffed against probes.expected.
\set ON_ERROR_STOP 1
\set VERBOSITY terse
\pset pager off

reset role;
select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claims', '', false) \g /dev/null
drop table if exists _r;
create temp table _r (n int, probe text, observed text, expected text);
grant all on _r to public;

-- run a statement as a role/user, answer 'ok' or 'denied <sqlstate>'
create or replace function pg_temp.try_as(p_role text, p_sub text, p_sql text, p_claims jsonb default null)
returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  perform set_config('request.jwt.claims', coalesce(p_claims, jsonb_build_object('sub', p_sub, 'role', p_role))::text, true);
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
    v := 'ok';
  exception when others then
    v := 'denied ' || sqlstate;
  end;
  execute 'reset role';
  return v;
end $$;

-- evaluate a scalar query as a role/user
create or replace function pg_temp.eval_as(p_role text, p_sub text, p_sql text, p_claims jsonb default null)
returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  perform set_config('request.jwt.claims', coalesce(p_claims, jsonb_build_object('sub', p_sub, 'role', p_role))::text, true);
  execute format('set local role %I', p_role);
  begin
    execute p_sql into v;
  exception when others then
    v := 'denied ' || sqlstate;
  end;
  execute 'reset role';
  return v;
end $$;

\set U '''c0000000-0000-0000-0000-000000000001'''
\set A '''a0000000-0000-0000-0000-000000000001'''
\set A2 '''a0000000-0000-0000-0000-000000000002'''
\set A3 '''a0000000-0000-0000-0000-000000000003'''
\set SUP '''a0000000-0000-0000-0000-000000000004'''
\set OW '''b0000000-0000-0000-0000-000000000001'''
\set M '''b0000000-0000-0000-0000-000000000002'''
\set T '''b0000000-0000-0000-0000-000000000004'''
\set O1 '''00000000-0000-0000-0000-0000000000a1'''
\set O2 '''00000000-0000-0000-0000-0000000000a2'''
select (:'PHASE' = 'live') as live \gset

-- ---- users row self-update ---------------------------------------------------
insert into _r select 1, 'stranger sets own users.is_super_admin = true',
  pg_temp.try_as('authenticated', :U, $q$update public.users set is_super_admin = true where id = auth.uid()$q$),
  case when :'live'::boolean then 'ok' else 'denied 42501' end;
insert into _r select 2, '... and the flag is then true',
  (select is_super_admin::text from public.users where id = :U),
  case when :'live'::boolean then 'true' else 'false' end;
update public.users set is_super_admin = false where id = :U;
insert into _r select 3, 'stranger sets own users.organization_id',
  pg_temp.try_as('authenticated', :U, format($q$update public.users set organization_id = %L where id = auth.uid()$q$, :O2)),
  case when :'live'::boolean then 'ok' else 'denied 42501' end;
insert into _r select 4, 'stranger sets own users.subscribed_modules (HSE premium gate)',
  pg_temp.try_as('authenticated', :U, $q$update public.users set subscribed_modules = array['hse_paid'] where id = auth.uid()$q$),
  case when :'live'::boolean then 'ok' else 'denied 42501' end;
insert into _r select 5, 'stranger sets own users.email',
  pg_temp.try_as('authenticated', :U, $q$update public.users set email = 'newhire@x.test' where id = auth.uid()$q$),
  case when :'live'::boolean then 'ok' else 'denied 42501' end;
update public.users set organization_id = null, subscribed_modules = array['hse'], email = 'stranger@x.test' where id = :U;
insert into _r select 6, 'stranger updates own users.primary_app (allowed)',
  pg_temp.try_as('authenticated', :U, $q$update public.users set primary_app = 'suite', app_preferences = '{"x":1}' where id = auth.uid()$q$),
  'ok';
insert into _r select 7, 'stranger inserts a users row',
  pg_temp.try_as('authenticated', :U, $q$insert into public.users (id, email, is_super_admin) values (gen_random_uuid(), 'x@x.test', true)$q$),
  'denied 42501';
insert into _r select 8, 'anon updates any users row',
  pg_temp.try_as('anon', null, $q$update public.users set is_super_admin = true$q$),
  case when :'live'::boolean then 'ok' else 'denied 42501' end;
update public.users set is_super_admin = (email in ('info@petrolord.com', 'ayoasaolu@gmail.com', 'ayodejiasaolu1@gmail.com')) where :'live'::boolean;

-- ---- metadata and JWT claims grant nothing ----------------------------------
update auth.users set raw_user_meta_data = '{"is_super_admin": true, "role": "super_admin"}' where id = :U;
insert into _r select 9, 'stranger with user_metadata + JWT claims is_super_admin=true',
  pg_temp.eval_as('authenticated', :U, 'select public.is_super_admin()::text',
    jsonb_build_object('sub', :U, 'role', 'authenticated', 'is_super_admin', true, 'user_role', 'admin',
      'user_metadata', jsonb_build_object('is_super_admin', true, 'role', 'super_admin'),
      'app_metadata', jsonb_build_object('is_super_admin', true, 'role', 'super_admin'))),
  'false';
update auth.users set raw_user_meta_data = '{}' where id = :U;
update public.users set is_super_admin = true where id = :U;   -- as if the hole had been used before the fix
insert into _r select 10, 'stranger whose users flag is already true: is_super_admin()',
  pg_temp.eval_as('authenticated', :U, 'select public.is_super_admin()::text'), 'false';

-- ---- real admins keep access --------------------------------------------------
insert into _r select 11, 'info@petrolord.com is_super_admin()', pg_temp.eval_as('authenticated', :A, 'select public.is_super_admin()::text'), 'true';
insert into _r select 12, 'ayoasaolu@gmail.com is_super_admin()', pg_temp.eval_as('authenticated', :A2, 'select public.is_super_admin()::text'), 'true';
insert into _r select 13, 'UNCONFIRMED allow-list address is_super_admin()', pg_temp.eval_as('authenticated', :A3, 'select public.is_super_admin()::text'),
  case when :'live'::boolean then 'true' else 'false' end;
insert into _r select 14, 'support@petrolord.com is_super_admin() (never was, in SQL)', pg_temp.eval_as('authenticated', :SUP, 'select public.is_super_admin()::text'), 'false';
insert into _r select 15, 'admin reads another tenant''s organization', pg_temp.eval_as('authenticated', :A, format('select count(*)::text from public.organizations where id = %L', :O2)), '1';
insert into _r select 16, 'stranger reads another tenant''s organization', pg_temp.eval_as('authenticated', :U, format('select count(*)::text from public.organizations where id = %L', :O2)), '0';

-- ---- seat RPCs ----------------------------------------------------------------
insert into _r select 17, 'self-flagged stranger assign_app_seat in O2',
  pg_temp.eval_as('authenticated', :U, format($q$select public.assign_app_seat(%L, 'dca', %L)->>'status'$q$, :O2, :T)),
  case when :'live'::boolean then 'success' else 'error' end;
delete from public.app_seat_assignments;
insert into _r select 18, 'self-flagged stranger unassign_app_seat in O2',
  pg_temp.eval_as('authenticated', :U, format($q$select public.unassign_app_seat(%L, 'dca', %L)->>'status'$q$, :O2, :T)),
  case when :'live'::boolean then 'success' else 'error' end;
insert into _r select 19, 'platform admin assign_app_seat in O2',
  pg_temp.eval_as('authenticated', :A, format($q$select public.assign_app_seat(%L, 'dca', %L)->>'status'$q$, :O2, :T)), 'success';
delete from public.app_seat_assignments;
update public.users set is_super_admin = false where id = :U;

-- ---- pending invitation tokens -----------------------------------------------
insert into _r select 20, 'viewer of O1 sees the pending admin invitation token',
  pg_temp.eval_as('authenticated', :M, format('select count(*)::text from public.organization_members where organization_id = %L and invitation_token is not null', :O1)),
  case when :'live'::boolean then '1' else '0' end;
insert into _r select 21, 'viewer of O1 still sees the active members',
  pg_temp.eval_as('authenticated', :M, format($q$select count(*)::text from public.organization_members where organization_id = %L and status = 'active'$q$, :O1)), '2';
insert into _r select 22, 'owner of O1 sees the pending invitation',
  pg_temp.eval_as('authenticated', :OW, format('select count(*)::text from public.organization_members where organization_id = %L and invitation_token is not null', :O1)), '1';
insert into _r select 23, 'platform admin sees the pending invitation',
  pg_temp.eval_as('authenticated', :A, format('select count(*)::text from public.organization_members where organization_id = %L and invitation_token is not null', :O1)), '1';
insert into _r select 24, 'stranger sees no O1 members',
  pg_temp.eval_as('authenticated', :U, format('select count(*)::text from public.organization_members where organization_id = %L', :O1)), '0';

-- ---- SECURITY DEFINER server paths still write privileged columns ----------
insert into _r select 25, 'owner enable_hse_for_organization (definer writes subscribed_modules)',
  pg_temp.try_as('authenticated', :OW, format('select public.enable_hse_for_organization(%L)', :OW)), 'ok';
insert into _r select 26, '... and it wrote them', (select ('hse_free' = any(subscribed_modules))::text from public.users where id = :OW), 'true';
update public.users set subscribed_modules = array['hse'], primary_app = 'hse', app_preferences = '{}' where id in (:U, :OW);

-- ---- platform_admins itself (fixed phase only) -----------------------------
\if :live
\else
insert into _r select 30, 'stranger selects platform_admins', pg_temp.eval_as('authenticated', :U, 'select count(*)::text from public.platform_admins'), 'denied 42501';
insert into _r select 31, 'stranger inserts self into platform_admins',
  pg_temp.try_as('authenticated', :U, format('insert into public.platform_admins (user_id) values (%L)', :U)), 'denied 42501';
insert into _r select 32, 'admin selects platform_admins (server-only table)', pg_temp.eval_as('authenticated', :A, 'select count(*)::text from public.platform_admins'), 'denied 42501';
insert into _r select 33, 'anon selects platform_admins', pg_temp.eval_as('anon', null, 'select count(*)::text from public.platform_admins'), 'denied 42501';
insert into _r select 34, 'service_role reads platform_admins', pg_temp.eval_as('service_role', null, 'select count(*)::text from public.platform_admins'), '2';
insert into _r select 35, 'seeded exactly the confirmed allow-list accounts',
  (select string_agg(email, ',' order by email) from public.platform_admins), 'ayoasaolu@gmail.com,info@petrolord.com';
insert into _r select 36, 'users.is_super_admin mirrors platform_admins',
  (select string_agg(email, ',' order by email) from public.users where is_super_admin), 'ayoasaolu@gmail.com,info@petrolord.com';
insert into _r select 37, 'service_role revokes info@ (delete row)',
  pg_temp.try_as('service_role', null, format('delete from public.platform_admins where user_id = %L', :A)), 'ok';
insert into _r select 38, '... info@ is_super_admin() after revoke', pg_temp.eval_as('authenticated', :A, 'select public.is_super_admin()::text'), 'false';
insert into _r select 39, '... mirror follows', (select is_super_admin::text from public.users where id = :A), 'false';
insert into _r select 40, 'service_role grants support@ (insert row)',
  pg_temp.try_as('service_role', null, format('insert into public.platform_admins (user_id, email) values (%L, %L)', :SUP, 'support@petrolord.com')), 'ok';
insert into _r select 41, '... support@ is_super_admin() after grant', pg_temp.eval_as('authenticated', :SUP, 'select public.is_super_admin()::text'), 'true';
insert into _r select 42, 'anon selects public.users', pg_temp.eval_as('anon', null, 'select count(*)::text from public.users'), 'denied 42501';
-- restore the seeded state
delete from public.platform_admins where user_id = :SUP;
insert into public.platform_admins (user_id, email, granted_by) values (:A, 'info@petrolord.com', 'rehearsal restore') on conflict do nothing;
\endif

select n, probe, observed, expected, case when observed is not distinct from expected then 'PASS' else 'FAIL' end as result
  from _r order by n;
select :'PHASE' as phase, count(*) as probes, count(*) filter (where observed is distinct from expected) as failures from _r;
