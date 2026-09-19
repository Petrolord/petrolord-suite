-- Behavioural probe for the PRODUCTION dry run. apply.sh wraps it as
--   begin; <migration body>; <this file>; rollback;
-- so every synthetic user, org, invitation and membership it creates is
-- rolled back. It prints flags only (no live row contents). Each case
-- records PASS/FAIL into a temp table; a refused call is caught so one
-- refusal does not abort the transaction.
create temp table _probe (n int, probe text, ok boolean, detail text) on commit drop;

do $$
declare
  v_org uuid;          -- a real org with an active owner
  v_owner uuid;
  v_inv uuid := gen_random_uuid();  -- synthetic invitee
  v_str uuid := gen_random_uuid();  -- synthetic stranger
  v_tok uuid;
  v_role text;
  v_res jsonb;
  v_state text;
  v_n int;
  v_sfx text := replace(gen_random_uuid()::text, '-', '');
  v_inv_email text := 'dryrun-invitee-' || v_sfx || '@invalid.test';
  v_str_email text := 'dryrun-stranger-' || v_sfx || '@invalid.test';
  v_att_email text := 'dryrun-attacker-' || v_sfx || '@invalid.test';

begin
  select om.organization_id, om.user_id into v_org, v_owner
    from public.organization_members om
   where om.role = 'owner' and coalesce(lower(om.status), 'active') = 'active' and om.user_id is not null
   order by om.created_at limit 1;

  -- synthetic stranger signs up normally (new trigger: own org, owner)
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_str, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_str_email,
          '{"full_name":"Dry Run Stranger"}', now(), now());
  select count(*) into v_n from public.organization_members where user_id = v_str and role = 'owner';
  insert into _probe values (1, 'normal signup creates own org as owner', v_n = 1, v_n::text);

  -- D2 signup naming a real org without a token is refused
  begin
    insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_att_email,
            jsonb_build_object('organization_id', v_org, 'role', 'owner'), now(), now());
    insert into _probe values (2, 'signup with organization_id and no token refused', false, 'ACCEPTED');
  exception when others then
    insert into _probe values (2, 'signup with organization_id and no token refused', sqlerrm like '%requires a valid invitation%', 'refused');
  end;

  -- D3 signed-in stranger cannot call add_user_to_organization
  perform set_config('request.jwt.claim.sub', v_str::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_str, 'role', 'authenticated', 'email', v_str_email)::text, true);
  execute 'set local role authenticated';
  begin
    perform public.add_user_to_organization(v_str, v_org, 'owner');
    v_state := 'EXECUTED';
  exception when insufficient_privilege then
    v_state := 'denied';
  end;
  -- D4 and cannot read any invitation
  select count(*) into v_n from public.invitations;
  execute 'reset role';
  insert into _probe values (3, 'stranger add_user_to_organization denied', v_state = 'denied', v_state);
  insert into _probe values (4, 'stranger reads 0 invitations', v_n = 0, v_n::text);

  -- D5 anon cannot read invitations or call accept_invitation
  execute 'set local role anon';
  begin
    select count(*) into v_n from public.invitations;
    v_state := 'READABLE';
  exception when insufficient_privilege then
    v_state := 'denied';
  end;
  execute 'reset role';
  insert into _probe values (5, 'anon select invitations denied', v_state = 'denied', v_state);

  -- D6 a real owner invites a synthetic email (as the SPA would, as owner)
  insert into public.invitations (org_id, email, role, invited_by, status, app_context)
  values (v_org, v_inv_email, 'member', v_owner, 'pending', 'hse')
  returning token into v_tok;

  -- D7 the stranger (wrong email) cannot accept it
  perform set_config('request.jwt.claim.sub', v_str::text, true);
  execute 'set local role authenticated';
  begin
    perform public.accept_invitation(v_tok::text);
    v_state := 'ACCEPTED';
  exception when others then
    v_state := sqlerrm;
  end;
  execute 'reset role';
  insert into _probe values (7, 'wrong-email user cannot accept', v_state like '%different email%', left(v_state, 60));

  -- D8 the invitee signs up with the token (HSE new-user path) and asks for owner
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_inv, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_inv_email,
          jsonb_build_object('invitation_token', v_tok, 'organization_id', v_org, 'role', 'owner', 'primary_app', 'hse'), now(), now());
  select role into v_role from public.organization_members where organization_id = v_org and user_id = v_inv and status = 'active';
  insert into _probe values (8, 'invitee joined with the INVITATION role', v_role = 'member', v_role);
  select status into v_state from public.invitations where token = v_tok;
  insert into _probe values (9, 'invitation consumed', v_state = 'accepted', v_state);

  -- D10 accepting again is idempotent, membership stays single
  perform set_config('request.jwt.claim.sub', v_inv::text, true);
  execute 'set local role authenticated';
  v_res := public.accept_invitation(v_tok::text);
  execute 'reset role';
  select count(*) into v_n from public.organization_members where organization_id = v_org and user_id = v_inv;
  insert into _probe values (10, 'repeat accept is idempotent, one membership', v_res->>'status' = 'already_accepted' and v_n = 1, (v_res->>'status') || '/' || v_n);

  -- D11 the org owner still sees and manages the org's invitations
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.invitations where token = v_tok;
  update public.invitations set status = 'revoked' where token = v_tok;
  get diagnostics v_n = row_count;
  execute 'reset role';
  insert into _probe values (11, 'owner can read and update own org invitation', v_n = 1, v_n::text);

  -- D12 enable_hse_for_organization refuses another user's id
  perform set_config('request.jwt.claim.sub', v_str::text, true);
  execute 'set local role authenticated';
  begin
    perform public.enable_hse_for_organization(v_owner);
    v_state := 'EXECUTED';
  exception when others then
    v_state := 'refused';
  end;
  execute 'reset role';
  insert into _probe values (12, 'enable_hse_for_organization(other id) refused', v_state = 'refused', v_state);
end $$;

-- one result set (the Supabase CLI prints only the last one)
select n, probe, case when ok then 'PASS' else 'FAIL' end as result, detail from _probe
union all
select 99, 'SUMMARY', case when bool_and(ok) and count(*) = 11 then 'ALL 11 PROBES PASS' else 'PROBE FAILURE' end, count(*)::text from _probe
order by 1;
