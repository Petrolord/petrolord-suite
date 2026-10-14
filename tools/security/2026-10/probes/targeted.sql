-- Targeted probes (2026-10), run AFTER the migrations inside the same rolled-back transaction.
-- org A = Lordsway Energy 1ace6b81-f133-4d42-a0fe-56960e8d71ed ; org B = Lekki Peculiar School 9f582a00-fb23-40bc-98ab-6d1919dfc336
create function pg_temp.t(p_persona text, p_probe text, p_sql text, p_expect text) returns void language plpgsql as $f$
declare r text;
begin
  perform pg_temp.become(p_persona);
  r := pg_temp.q(p_sql);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  insert into _p values ('probe', p_persona, p_probe,
    case when r like p_expect then 'PASS ' else 'FAIL ' end || r || '  (expect ' || p_expect || ')');
end $f$;
grant execute on all functions in schema pg_temp to public;

-- anon
select pg_temp.t('anon','add_user_to_organization',
  $$select public.add_user_to_organization('02dbca6c-7816-4b74-972c-be4fbd6e2753','9f582a00-fb23-40bc-98ab-6d1919dfc336','owner')::text$$, 'ERR 42501');
select pg_temp.t('anon','get_users_for_organization',
  $$select count(*)::text from public.get_users_for_organization('1ace6b81-f133-4d42-a0fe-56960e8d71ed')$$, 'ERR 42501');
select pg_temp.t('anon','read invitations', $$select count(*)::text from public.invitations$$, 'ERR 42501');
select pg_temp.t('anon','read payment_audit_log', $$select count(*)::text from public.payment_audit_log$$, 'ERR 42501');
select pg_temp.t('anon','write studio_users', $$with x as (delete from public.studio_users returning 1) select count(*)::text from x$$, 'ERR 42501');
select pg_temp.t('anon','insert user_notifications',
  $$with x as (insert into public.user_notifications(user_id,title,message) values ('02dbca6c-7816-4b74-972c-be4fbd6e2753','x','y') returning 1) select count(*)::text from x$$, 'ERR 42501');
select pg_temp.t('anon','list quotes bucket', $$select count(*)::text from storage.objects where bucket_id='quotes'$$, '0');
select pg_temp.t('anon','NAPE lead insert (form shape)',
  $$insert into public.event_leads(event,name,phone,company,role,interests,consent,consent_text,source,user_agent)
     values ('NAPE 2026','Probe Visitor','2348012345678','Probe Co','Engineer',array['seismic'],true,'I agree','qr','probe')$$, 'OK');
select pg_temp.t('anon','NAPE quiz state', $$select coalesce(public.event_quiz_state(null)::text,'null')$$, '%');
select pg_temp.t('anon','invitation lookup by token', $$select coalesce(public.get_invitation_by_token('00000000-0000-0000-0000-000000000000')::text,'null')$$, 'null');
select pg_temp.t('anon','public QR resolve', $$select count(*)::text from public.resolve_qr_token('00000000-0000-0000-0000-000000000000')$$, '0');
select pg_temp.t('anon','pricing catalogue read', $$select (count(*) >= 0)::text from public.pricing_tiers$$, 'true');

-- member (org A)
select pg_temp.t('member','sees colleagues', $$select (count(*) > 1)::text from public.organization_members where organization_id='1ace6b81-f133-4d42-a0fe-56960e8d71ed'$$, 'true');
select pg_temp.t('member','no invitation tokens visible', $$select count(*)::text from public.organization_members where invitation_token is not null and user_id is distinct from auth.uid()$$, '0');
select pg_temp.t('member','self-promote is_super_admin',
  $$with x as (update public.users set is_super_admin = true where id = auth.uid() returning 1) select count(*)::text from x$$, 'ERR 42501');
select pg_temp.t('member','move own users.organization_id',
  $$with x as (update public.users set organization_id = '9f582a00-fb23-40bc-98ab-6d1919dfc336' where id = auth.uid() returning 1) select count(*)::text from x$$, 'ERR 42501');
select pg_temp.t('member','grant self HSE premium (subscribed_modules)',
  $$with x as (update public.users set subscribed_modules = array['hse_premium'] where id = auth.uid() returning 1) select count(*)::text from x$$, 'ERR 42501');
select pg_temp.t('member','edit own preferences still works',
  $$with x as (update public.users set app_preferences = app_preferences, last_accessed_app = last_accessed_app where id = auth.uid() returning 1) select count(*)::text from x$$, '1');
select pg_temp.t('member','is_super_admin()', $$select public.is_super_admin()::text$$, 'false');
select pg_temp.t('member','list org users (not admin)', $$select count(*)::text from public.get_users_for_organization('1ace6b81-f133-4d42-a0fe-56960e8d71ed')$$, 'ERR 42501');
select pg_temp.t('member','bogus invitation token', $$select public.accept_invitation('not-a-token')::text$$, 'ERR 22023');
select pg_temp.t('member','notify a colleague (org A)',
  $$insert into public.user_notifications(user_id,organization_id,title,message,created_by) values ('0b403d59-ea61-4809-9429-a692bca9214b','1ace6b81-f133-4d42-a0fe-56960e8d71ed','x','y',auth.uid())$$, 'OK');
select pg_temp.t('member','notify an outsider (org B user)',
  $$with x as (insert into public.user_notifications(user_id,organization_id,title,message) values ('19db244f-eb02-461a-b6f9-813d65c8e259','9f582a00-fb23-40bc-98ab-6d1919dfc336','x','y') returning 1) select count(*)::text from x$$, 'ERR 42501');
select pg_temp.t('member','create invitation (not admin)',
  $$with x as (insert into public.invitations(org_id,email,role,token,status,expires_at) values ('1ace6b81-f133-4d42-a0fe-56960e8d71ed','probe@example.com','member',gen_random_uuid(),'pending',now()+interval '7 days') returning 1) select count(*)::text from x$$, 'ERR 42501');

-- org admin (org A)
select pg_temp.t('orgadmin','list own org users', $$select (count(*) > 1)::text from public.get_users_for_organization('1ace6b81-f133-4d42-a0fe-56960e8d71ed')$$, 'true');
select pg_temp.t('orgadmin','list other org users', $$select count(*)::text from public.get_users_for_organization('9f582a00-fb23-40bc-98ab-6d1919dfc336')$$, 'ERR 42501');
select pg_temp.t('orgadmin','invite member to own org',
  $$with x as (insert into public.invitations(org_id,email,role,token,status,expires_at) values ('1ace6b81-f133-4d42-a0fe-56960e8d71ed','probe@example.com','member',gen_random_uuid(),'pending',now()+interval '7 days') returning 1) select count(*)::text from x$$, '1');
select pg_temp.t('orgadmin','invite an owner (admin is not owner)',
  $$with x as (insert into public.invitations(org_id,email,role,token,status,expires_at) values ('1ace6b81-f133-4d42-a0fe-56960e8d71ed','probe2@example.com','owner',gen_random_uuid(),'pending',now()+interval '7 days') returning 1) select count(*)::text from x$$, 'ERR 42501');
select pg_temp.t('orgadmin','invite into another org',
  $$with x as (insert into public.invitations(org_id,email,role,token,status,expires_at) values ('9f582a00-fb23-40bc-98ab-6d1919dfc336','probe3@example.com','member',gen_random_uuid(),'pending',now()+interval '7 days') returning 1) select count(*)::text from x$$, 'ERR 42501');
select pg_temp.t('orgadmin','sees own org invitations', $$select (count(*) >= 1)::text from public.invitations where org_id='1ace6b81-f133-4d42-a0fe-56960e8d71ed'$$, 'true');
select pg_temp.t('orgadmin','is_super_admin()', $$select public.is_super_admin()::text$$, 'false');

-- platform admin
select pg_temp.t('platform','is_super_admin()', $$select public.is_super_admin()::text$$, 'true');
select pg_temp.t('platform','list any org users', $$select (count(*) > 1)::text from public.get_users_for_organization('9f582a00-fb23-40bc-98ab-6d1919dfc336')$$, 'true');
select pg_temp.t('platform','reads quotes bucket listing', $$select (count(*) > 0)::text from storage.objects where bucket_id='quotes'$$, 'true');

-- org B member aiming at org A
select pg_temp.t('orgB','read org A members', $$select count(*)::text from public.organization_members where organization_id='1ace6b81-f133-4d42-a0fe-56960e8d71ed'$$, '0');
select pg_temp.t('orgB','read org A invitations', $$select count(*)::text from public.invitations where org_id='1ace6b81-f133-4d42-a0fe-56960e8d71ed'$$, '0');
select pg_temp.t('orgB','join org A via add_user_to_organization',
  $$select public.add_user_to_organization(auth.uid(),'1ace6b81-f133-4d42-a0fe-56960e8d71ed','owner')::text$$, 'ERR 42501');
select pg_temp.t('orgB','enable_hse as org A owner', $$select public.enable_hse_for_organization('1d5bc4bf-5bf3-4349-8319-b20e9ffb1c39')::text$$, 'ERR 42501');
select pg_temp.t('orgB','assign seat in org A', $$select public.assign_app_seat('1ace6b81-f133-4d42-a0fe-56960e8d71ed','qi-studio',auth.uid())->>'reason'$$, 'not_authorized');
select pg_temp.t('orgB','read org A geo_wells', $$select count(*)::text from public.geo_wells where organization_id='1ace6b81-f133-4d42-a0fe-56960e8d71ed'$$, '0');
select pg_temp.t('orgB','read org A branding', $$select count(*)::text from public.organization_branding where organization_id='1ace6b81-f133-4d42-a0fe-56960e8d71ed'$$, '0');

-- demo account flows (read-only)
select pg_temp.t('demo','sees own org', $$select count(*)::text from public.organizations where id='6c8a72e9-b399-419b-934e-32f15b6245c7'$$, '1');
select pg_temp.t('demo','licensed modules readable', $$select (count(*) > 0)::text from public.purchased_modules where organization_id='6c8a72e9-b399-419b-934e-32f15b6245c7'$$, 'true');
select pg_temp.t('demo','own seats readable', $$select (count(*) > 0)::text from public.app_seat_assignments where user_id=auth.uid()$$, 'true');
select pg_temp.t('demo','catalogue readable', $$select (count(*) > 0)::text from public.master_apps$$, 'true');
select pg_temp.t('demo','Ekene wells readable', $$select (count(*) > 0)::text from public.geo_wells$$, 'true');
select pg_temp.t('demo','Ekene surfaces readable', $$select (count(*) > 0)::text from public.geo_surfaces$$, 'true');

-- signup trigger (postgres role; rows discarded by the rollback; GoTrue sends nothing)
do $d$
declare r text; v_tok text := 'probe-' || gen_random_uuid()::text;
begin
  begin
    insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at, email_confirmed_at)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'probe-hijack@example.com', jsonb_build_object('organization_id','1ace6b81-f133-4d42-a0fe-56960e8d71ed','role','owner'), '{}'::jsonb, now(), now(), now());
    r := 'joined (BAD)';
  exception when others then r := 'ERR ' || sqlstate;
  end;
  insert into _p values ('probe','signup','metadata organization_id without token', case when r like 'ERR%' then 'PASS ' else 'FAIL ' end || r);

  begin
    insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at, email_confirmed_at)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'probe-newco@example.com', jsonb_build_object('organization_name','Probe Co','full_name','Probe'), '{}'::jsonb, now(), now(), now());
    select om.role into r from public.organization_members om where om.email = 'probe-newco@example.com';
  exception when others then r := 'ERR ' || sqlstate || ' ' || sqlerrm;
  end;
  insert into _p values ('probe','signup','fresh signup creates own org as owner', case when r = 'owner' then 'PASS ' else 'FAIL ' end || coalesce(r,'none'));

  begin
    insert into public.organization_members (organization_id, email, full_name, role, status, invitation_token, invitation_expires_at, created_at, updated_at)
    values ('1ace6b81-f133-4d42-a0fe-56960e8d71ed', 'probe-invitee@example.com', 'Probe Invitee', 'engineer', 'invited', v_tok, now() + interval '7 days', now(), now());
    insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at, email_confirmed_at)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'probe-invitee@example.com', jsonb_build_object('invitation_token', v_tok, 'role', 'owner', 'primary_app', 'suite'), '{}'::jsonb, now(), now(), now());
    select om.role || '/' || om.status into r from public.organization_members om
     where om.email = 'probe-invitee@example.com' and om.organization_id = '1ace6b81-f133-4d42-a0fe-56960e8d71ed';
  exception when others then r := 'ERR ' || sqlstate || ' ' || sqlerrm;
  end;
  insert into _p values ('probe','signup','Suite invitation token signup gets the invited role', case when r = 'engineer/active' then 'PASS ' else 'FAIL ' end || coalesce(r,'none'));
end $d$;
