-- Compatibility probes for migration 01 ALONE (run between BEGIN and ROLLBACK, after 01).
-- Proves every live signup path still works and the new token paths work.
create temp table _c (probe text, result text) on commit drop;
grant all on _c to public;
do $d$
declare r text; v_tok uuid := gen_random_uuid(); v_stok text := 'probe-' || gen_random_uuid()::text;
  A uuid := '1ace6b81-f133-4d42-a0fe-56960e8d71ed';
  ADMIN uuid := '0b403d59-ea61-4809-9429-a692bca9214b';
begin
  -- (a) legacy HSE / old accept-employee-invitation signup: metadata organization_id + role
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at, email_confirmed_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'probe-legacy@example.com',
          jsonb_build_object('organization_id', A, 'role', 'member', 'primary_app', 'hse'), '{}', now(), now(), now());
  select role || '/' || status into r from public.organization_members where email = 'probe-legacy@example.com' and organization_id = A;
  insert into _c values ('legacy metadata join still works after 01', case when r = 'member/active' then 'PASS ' else 'FAIL ' end || coalesce(r, 'none'));

  -- (b) new HSE page: invitation_token of a public.invitations row
  insert into public.invitations (org_id, email, role, token, status, expires_at, invited_by)
  values (A, 'probe-hse@example.com', 'member', v_tok, 'pending', now() + interval '7 days', ADMIN);
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at, email_confirmed_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'probe-hse@example.com',
          jsonb_build_object('invitation_token', v_tok::text, 'primary_app', 'hse'), '{}', now(), now(), now());
  select om.role || '/' || om.status || '/' || i.status into r from public.organization_members om, public.invitations i
   where om.email = 'probe-hse@example.com' and om.organization_id = A and i.token = v_tok;
  insert into _c values ('HSE token signup joins with the invitation role', case when r = 'member/active/accepted' then 'PASS ' else 'FAIL ' end || coalesce(r, 'none'));

  -- (c) new Suite function: organization_members.invitation_token
  insert into public.organization_members (organization_id, email, full_name, role, status, invitation_token, invitation_expires_at, created_at, updated_at)
  values (A, 'probe-suite@example.com', 'Probe', 'engineer', 'invited', v_stok, now() + interval '7 days', now(), now());
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at, email_confirmed_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'probe-suite@example.com',
          jsonb_build_object('invitation_token', v_stok, 'role', 'owner', 'primary_app', 'suite'), '{}', now(), now(), now());
  select role || '/' || status into r from public.organization_members where email = 'probe-suite@example.com' and organization_id = A;
  insert into _c values ('Suite token signup gets the invited role, ignores metadata role', case when r = 'engineer/active' then 'PASS ' else 'FAIL ' end || coalesce(r, 'none'));

  -- (d) fresh signup
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at, email_confirmed_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'probe-fresh@example.com',
          jsonb_build_object('organization_name', 'Probe Fresh Co', 'full_name', 'Probe'), '{}', now(), now(), now());
  select om.role into r from public.organization_members om join public.organizations o on o.id = om.organization_id
   where om.email = 'probe-fresh@example.com' and o.name = 'Probe Fresh Co';
  insert into _c values ('fresh signup creates own org as owner', case when r = 'owner' then 'PASS ' else 'FAIL ' end || coalesce(r, 'none'));

  -- (e) existing account accepts by RPC (org B member invited into A)
  insert into public.invitations (org_id, email, role, token, status, expires_at, invited_by)
  values (A, 'ndifreke.usoro@peculiarschools.com', 'member', gen_random_uuid(), 'pending', now() + interval '7 days', ADMIN);
end $d$;

select set_config('request.jwt.claims', '{"sub":"19db244f-eb02-461a-b6f9-813d65c8e259","role":"authenticated"}', true);
set local role authenticated;
insert into _c select 'existing account accepts by RPC',
  (select case when x->>'status' = 'accepted' and x->>'role' = 'member' then 'PASS ' else 'FAIL ' end || x::text
     from (select public.accept_invitation((select token::text from public.invitations
             where email = 'ndifreke.usoro@peculiarschools.com' and status = 'pending' limit 1)) x) s);
reset role;
select * from _c;
