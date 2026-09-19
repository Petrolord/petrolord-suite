-- Behavioural probe for the PRODUCTION dry run. apply.sh wraps it as
--   begin; <migration body>; <this file>; rollback;
-- so every synthetic user, org and membership it creates is rolled back.
-- It prints flags and counts only (no customer row contents) and ends with
-- ONE result row (supabase db query shows only the last result set):
-- 'ALL <n> PROBES PASS' or the list of failing probes.
create temp table _probe (n int, probe text, ok boolean, detail text) on commit drop;

create function pg_temp.try_as(p_role text, p_sub uuid, p_sql text, p_claims jsonb default null)
returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_sub::text, ''), true);
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

create function pg_temp.eval_as(p_role text, p_sub uuid, p_sql text, p_claims jsonb default null)
returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_sub::text, ''), true);
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

do $$
declare
  v_sfx text := replace(gen_random_uuid()::text, '-', '');
  v_s uuid := gen_random_uuid();     -- synthetic stranger (signs up normally)
  v_v uuid := gen_random_uuid();     -- synthetic viewer in the stranger's org
  v_s_email text := 'dryrun-pa-stranger-' || v_sfx || '@invalid.test';
  v_v_email text := 'dryrun-pa-viewer-' || v_sfx || '@invalid.test';
  v_s_org uuid;
  v_org uuid; v_app text;            -- a real org with an active purchased app
  v_admins int; v_admins_true int; v_mirror int;
  v_r text;
begin
  -- platform admins and the mirror
  select count(*) into v_admins from public.platform_admins;
  insert into _probe values (1, 'platform_admins seeded', v_admins >= 1, v_admins::text);
  select count(*) into v_admins_true from public.platform_admins pa
   where pg_temp.eval_as('authenticated', pa.user_id, 'select public.is_super_admin()::text') = 'true';
  insert into _probe values (2, 'every platform admin passes is_super_admin()', v_admins_true = v_admins, v_admins_true::text);
  select count(*) into v_mirror from public.users where is_super_admin;
  insert into _probe values (3, 'users.is_super_admin mirrors platform_admins', v_mirror = v_admins, v_mirror::text);

  -- a synthetic stranger signs up (live handle_new_user runs)
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
  values (v_s, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_s_email,
          '{"full_name":"Dry Run PA Stranger"}', now(), now(), now());
  insert into _probe values (4, 'signup still creates the public.users row (definer path)',
    exists (select 1 from public.users where id = v_s), null);

  v_r := pg_temp.try_as('authenticated', v_s, 'update public.users set is_super_admin = true where id = auth.uid()');
  insert into _probe values (5, 'stranger cannot set users.is_super_admin', v_r like 'denied%', v_r);
  v_r := pg_temp.try_as('authenticated', v_s, 'update public.users set subscribed_modules = array[''hse_paid''] where id = auth.uid()');
  insert into _probe values (6, 'stranger cannot set users.subscribed_modules', v_r like 'denied%', v_r);
  v_r := pg_temp.try_as('authenticated', v_s, format('update public.users set organization_id = %L where id = auth.uid()', gen_random_uuid()));
  insert into _probe values (7, 'stranger cannot set users.organization_id', v_r like 'denied%', v_r);
  v_r := pg_temp.try_as('authenticated', v_s, 'update public.users set email = ''x@invalid.test'' where id = auth.uid()');
  insert into _probe values (8, 'stranger cannot set users.email', v_r like 'denied%', v_r);
  v_r := pg_temp.try_as('authenticated', v_s, 'update public.users set last_accessed_app = ''suite'' where id = auth.uid()');
  insert into _probe values (9, 'stranger can still set last_accessed_app', v_r = 'ok', v_r);

  update auth.users set raw_user_meta_data = raw_user_meta_data || '{"is_super_admin": true}' where id = v_s;
  v_r := pg_temp.eval_as('authenticated', v_s, 'select public.is_super_admin()::text',
    jsonb_build_object('sub', v_s, 'role', 'authenticated', 'is_super_admin', true, 'user_role', 'admin',
      'user_metadata', jsonb_build_object('is_super_admin', true), 'app_metadata', jsonb_build_object('is_super_admin', true)));
  insert into _probe values (10, 'metadata + JWT claims grant nothing', v_r = 'false', v_r);

  update public.users set is_super_admin = true where id = v_s;   -- as if self-set before the fix
  v_r := pg_temp.eval_as('authenticated', v_s, 'select public.is_super_admin()::text');
  insert into _probe values (11, 'a stale users flag grants nothing', v_r = 'false', v_r);

  v_r := pg_temp.eval_as('authenticated', v_s, 'select count(*)::text from public.platform_admins');
  insert into _probe values (12, 'stranger cannot read platform_admins', v_r like 'denied%', v_r);
  v_r := pg_temp.try_as('authenticated', v_s, format('insert into public.platform_admins (user_id) values (%L)', v_s));
  insert into _probe values (13, 'stranger cannot insert into platform_admins', v_r like 'denied%', v_r);
  v_r := pg_temp.eval_as('anon', null, 'select count(*)::text from public.users');
  insert into _probe values (14, 'anon cannot read public.users', v_r like 'denied%', v_r);

  -- seat RPCs against a real org with an active app (nothing is inserted:
  -- the stranger is refused, the admin targets a random non-member)
  select pm.organization_id, pm.app_id into v_org, v_app from public.purchased_modules pm
   where pm.status = 'active' and pm.app_id is not null order by pm.purchase_date limit 1;
  v_r := pg_temp.eval_as('authenticated', v_s, format('select public.assign_app_seat(%L, %L, %L)->>''reason''', v_org, v_app, v_s));
  insert into _probe values (15, 'self-flagged stranger assign_app_seat refused', v_org is null or v_r = 'not_authorized', coalesce(v_r, 'no org'));
  v_r := pg_temp.eval_as('authenticated', v_s, format('select public.unassign_app_seat(%L, %L, %L)->>''reason''', v_org, v_app, v_s));
  insert into _probe values (16, 'self-flagged stranger unassign_app_seat refused', v_org is null or v_r = 'not_authorized', coalesce(v_r, 'no org'));
  v_r := pg_temp.eval_as('authenticated', (select user_id from public.platform_admins order by granted_at limit 1),
    format('select public.assign_app_seat(%L, %L, %L)->>''reason''', v_org, v_app, gen_random_uuid()));
  insert into _probe values (17, 'platform admin passes the seat authorization', v_org is null or v_r is distinct from 'not_authorized', coalesce(v_r, 'no org'));
  update public.users set is_super_admin = false where id = v_s;

  -- pending invitation tokens: owner sees, viewer does not
  select om.organization_id into v_s_org from public.organization_members om
   where om.user_id = v_s and om.role = 'owner' limit 1;
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
  values (v_v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_v_email,
          '{"full_name":"Dry Run PA Viewer"}', now(), now(), now());
  delete from public.organization_members where user_id = v_v;   -- drop the viewer's own signup org membership
  insert into public.organization_members (organization_id, user_id, full_name, email, role, status, joined_at)
  values (v_s_org, v_v, 'Viewer', v_v_email, 'viewer', 'active', now());
  insert into public.organization_members (organization_id, full_name, email, role, status, invited_at, invitation_token, invitation_expires_at)
  values (v_s_org, 'Invitee', 'dryrun-pa-invitee-' || v_sfx || '@invalid.test', 'admin', 'invited', now(), 'dryrun-' || v_sfx, now() + interval '1 day');
  v_r := pg_temp.eval_as('authenticated', v_v, format('select count(*)::text from public.organization_members where organization_id = %L and invitation_token is not null', v_s_org));
  insert into _probe values (18, 'viewer cannot see pending invitation tokens', v_s_org is not null and v_r = '0', v_r);
  v_r := pg_temp.eval_as('authenticated', v_v, format('select count(*)::text from public.organization_members where organization_id = %L and status = ''active''', v_s_org));
  insert into _probe values (19, 'viewer still sees active members', v_r = '2', v_r);
  v_r := pg_temp.eval_as('authenticated', v_s, format('select count(*)::text from public.organization_members where organization_id = %L and invitation_token is not null', v_s_org));
  insert into _probe values (20, 'owner sees the pending invitation', v_r = '1', v_r);
end $$;

select case when count(*) filter (where not ok) = 0
            then 'ALL ' || count(*) || ' PROBES PASS'
            else 'FAILED: ' || string_agg(n || ' ' || probe || ' [' || coalesce(detail, '') || ']', '; ' order by n) filter (where not ok)
       end as result
  from _probe;
