-- Behavioural probes for the invitation-acceptance fix. run.sh runs this
-- three times: PHASE=live (stubs only: the negative controls, proving each
-- hole is real in the live shape), PHASE=stopgap (after
-- 20260919180000), PHASE=fixed (after 20260919190000, applied twice).
-- Output (stdout + stderr) is diffed against probes.expected*.
\set ON_ERROR_STOP 0
\set VERBOSITY terse

-- ---------------------------------------------------------------- fixtures
-- Each phase builds its own users/orgs (emails carry the phase name) so the
-- phases do not collide. Users are created through the real trigger, as a
-- signup does.
reset role;
insert into auth.users (email, raw_user_meta_data) values
  (:'PHASE' || '-owner@o1.test',    jsonb_build_object('organization_name', 'O1 ' || :'PHASE', 'full_name', 'Owner One')),
  (:'PHASE' || '-stranger@x.test',  jsonb_build_object('full_name', 'Stranger')),
  (:'PHASE' || '-invitee@x.test',   jsonb_build_object('full_name', 'Invitee')),
  (:'PHASE' || '-wrong@x.test',     jsonb_build_object('full_name', 'Wrong Email'));
select id as uo from auth.users where email = :'PHASE' || '-owner@o1.test' \gset
select id as us from auth.users where email = :'PHASE' || '-stranger@x.test' \gset
select id as ui from auth.users where email = :'PHASE' || '-invitee@x.test' \gset
select id as uw from auth.users where email = :'PHASE' || '-wrong@x.test' \gset
select organization_id as o1 from public.organization_members where user_id = :'uo' \gset
select organization_id as oi from public.organization_members where user_id = :'ui' \gset
-- an admin (not owner) of O1
insert into auth.users (email, raw_user_meta_data) values (:'PHASE' || '-admin@o1.test', '{"full_name":"Admin One"}');
select id as ua from auth.users where email = :'PHASE' || '-admin@o1.test' \gset
insert into public.organization_members (organization_id, user_id, full_name, email, role, status, joined_at)
  values (:'o1', :'ua', 'Admin One', :'PHASE' || '-admin@o1.test', 'admin', 'active', now());
-- one pending invitation for the invitee, issued by the admin
insert into public.invitations (org_id, email, role, invited_by, status, app_context)
  values (:'o1', :'PHASE' || '-invitee@x.test', 'member', :'ua', 'pending', 'hse');
select token as tok from public.invitations where email = :'PHASE' || '-invitee@x.test' \gset
select 'fixtures', :'PHASE', (select count(*) from public.organizations) > 0 as orgs_ok;

\if :{?LIVE}
-- ======================================================== live (holes open)
-- N1 anon makes the stranger OWNER of O1 through add_user_to_organization
set role anon;
select 'N1 anon add_user_to_organization' as probe, true as ran from (select public.add_user_to_organization(:'us', :'o1', 'owner')) x;
reset role;
select 'N1 stranger role in O1', role, status from public.organization_members where organization_id = :'o1' and user_id = :'us';
delete from public.organization_members where organization_id = :'o1' and user_id = :'us';
-- N2 anon reads every invitation token and rewrites the role
set role anon;
select 'N2 anon reads tokens', count(*) from public.invitations where token is not null;
update public.invitations set role = 'owner' where email = :'PHASE' || '-invitee@x.test';
reset role;
select 'N2 invitation role after anon update', role from public.invitations where email = :'PHASE' || '-invitee@x.test';
update public.invitations set role = 'member' where email = :'PHASE' || '-invitee@x.test';
-- N3 a plain sign-up with organization_id metadata becomes OWNER of O1
insert into auth.users (email, raw_user_meta_data)
  values (:'PHASE' || '-signup-attacker@x.test', jsonb_build_object('organization_id', :'o1', 'role', 'owner'));
select 'N3 signup attacker role in O1', role, status from public.organization_members
  where organization_id = :'o1' and email = :'PHASE' || '-signup-attacker@x.test';
-- N4 anon enables HSE on O1 acting as its owner
set role anon;
select 'N4 anon enable_hse_for_organization(owner id)' as probe, true as ran from (select public.enable_hse_for_organization(:'uo')) x;
reset role;
\endif

\if :{?STOPGAP}
-- ======================================================== after the stop-gap
set role anon;
select 'S1 anon add_user_to_organization', public.add_user_to_organization(:'us', :'o1', 'owner');
reset role;
set role authenticated;
set request.jwt.claim.sub = :'us';
select 'S2 authenticated add_user_to_organization', public.add_user_to_organization(:'us', :'o1', 'owner');
reset role;
select 'S3 stranger rows in O1', count(*) from public.organization_members where organization_id = :'o1' and user_id = :'us';
set role service_role;
select 'S4 service_role still may execute', has_function_privilege('service_role', 'public.add_user_to_organization(uuid,uuid,text)', 'execute');
reset role;
\endif

\if :{?FIXED}
-- ======================================================== after the full fix
-- F1 anon: no add_user, no accept, no table access; token lookup only
set role anon;
select 'F1a anon add_user_to_organization', public.add_user_to_organization(:'us', :'o1', 'owner');
select 'F1b anon accept_invitation', public.accept_invitation(:'tok');
select 'F1c anon select invitations', count(*) from public.invitations;
update public.invitations set role = 'owner';
select 'F1d anon get_invitation_by_token(valid)', (public.get_invitation_by_token(:'tok')) ->> 'role' as role,
       (public.get_invitation_by_token(:'tok')) ? 'token' as leaks_token;
select 'F1e anon get_invitation_by_token(bogus)', public.get_invitation_by_token('00000000-0000-0000-0000-000000000000') is null as is_null,
       public.get_invitation_by_token('not-a-uuid') is null as bad_text_null;
select 'F1f anon enable_hse_for_organization', public.enable_hse_for_organization(:'uo');
reset role;

-- F2 signed-in stranger: cannot join, choose a role, read or rewrite invitations
set role authenticated;
set request.jwt.claim.sub = :'us';
select 'F2a stranger add_user_to_organization', public.add_user_to_organization(:'us', :'o1', 'owner');
select 'F2b stranger sees invitations', count(*) from public.invitations;
update public.invitations set role = 'owner', org_id = :'o1';
select 'F2c stranger accept someone else''s token', public.accept_invitation(:'tok');
insert into public.invitations (org_id, email, role) values (:'o1', :'PHASE' || '-stranger@x.test', 'admin');
select 'F2e stranger enable_hse as the owner', public.enable_hse_for_organization(:'uo');
reset role;
select 'F2f stranger rows in O1', count(*) from public.organization_members where organization_id = :'o1' and user_id = :'us';
select 'F2g invitation untouched', role, status, org_id = :'o1' as same_org from public.invitations where token = :'tok';

-- F3 sign-up attacks: organization_id without a token, a bogus token, a
-- real token under the wrong email
insert into auth.users (email, raw_user_meta_data)
  values (:'PHASE' || '-signup-attacker@x.test', jsonb_build_object('organization_id', :'o1', 'role', 'owner'));
insert into auth.users (email, raw_user_meta_data)
  values (:'PHASE' || '-signup-attacker2@x.test', jsonb_build_object('organization_id', :'o1', 'invitation_token', gen_random_uuid()));
insert into auth.users (email, raw_user_meta_data)
  values (:'PHASE' || '-signup-attacker3@x.test', jsonb_build_object('invitation_token', :'tok'));
select 'F3 attacker accounts created', count(*) from auth.users where email like :'PHASE' || '-signup-attacker%';
select 'F3 attacker rows in O1', count(*) from public.organization_members where organization_id = :'o1' and email like :'PHASE' || '-signup-attacker%';
-- a normal sign-up still works, is owner of its own new org, even if it asks for super_admin
insert into auth.users (email, raw_user_meta_data)
  values (:'PHASE' || '-newco@x.test', jsonb_build_object('organization_name', 'NewCo', 'role', 'super_admin'));
select 'F3b normal signup', om.role, o.name, o.id <> :'o1' as own_org from public.organization_members om
  join public.organizations o on o.id = om.organization_id where om.email = :'PHASE' || '-newco@x.test';

-- F4 wrong-email user cannot accept
set role authenticated;
set request.jwt.claim.sub = :'uw';
select 'F4 wrong email accept', public.accept_invitation(:'tok');
reset role;

-- F5 the right invitee joins with the invitation's role, exactly once
set role authenticated;
set request.jwt.claim.sub = :'ui';
select 'F5a invitee accept', public.accept_invitation(:'tok') ->> 'status' as status;
select 'F5b invitee accept again', public.accept_invitation(:'tok') ->> 'status' as status;
select 'F5c invitee accept upper-cased token', public.accept_invitation(upper(:'tok')) ->> 'status' as status;
reset role;
select 'F5d invitee rows in O1', count(*), min(role), min(status) from public.organization_members where organization_id = :'o1' and user_id = :'ui';
select 'F5e invitation', status, accepted_at is not null as stamped from public.invitations where token = :'tok';
select 'F5f invitee still owns own org', role from public.organization_members where organization_id = :'oi' and user_id = :'ui';
-- used token, other user (same email impossible): stranger gets the email error, wrong user too
set role authenticated;
set request.jwt.claim.sub = :'uw';
select 'F5g used token, other user', public.accept_invitation(:'tok');
reset role;

-- F6 admins manage invitations; role guard; inviter stamped
set role authenticated;
set request.jwt.claim.sub = :'ua';
insert into public.invitations (org_id, email, role) values (:'o1', :'PHASE' || '-new2@x.test', 'supervisor');
insert into public.invitations (org_id, email, role) values (:'o1', :'PHASE' || '-exp@x.test', 'member');
insert into public.invitations (org_id, email, role) values (:'o1', :'PHASE' || '-dec@x.test', 'member');
select 'F6a admin sees O1 invitations', count(*) from public.invitations;
select 'F6b inviter stamped', bool_and(invited_by = :'ua') from public.invitations where email like :'PHASE' || '-%@x.test' and status = 'pending';
insert into public.invitations (org_id, email, role) values (:'o1', :'PHASE' || '-own@x.test', 'owner');
insert into public.invitations (org_id, email, role) values (:'o1', :'PHASE' || '-sa@x.test', 'super_admin');
insert into public.invitations (org_id, email, role, invited_by) values (:'o1', :'PHASE' || '-forged@x.test', 'member', :'uo');
insert into public.invitations (org_id, email, role) values (:'oi', :'PHASE' || '-other-org@x.test', 'member');
update public.invitations set role = 'admin' where email = :'PHASE' || '-new2@x.test';
update public.invitations set role = 'super_admin' where email = :'PHASE' || '-new2@x.test';
update public.invitations set role = 'supervisor' where email = :'PHASE' || '-new2@x.test';
select 'F6c admin role edit', role from public.invitations where email = :'PHASE' || '-new2@x.test';
delete from public.invitations where email = :'PHASE' || '-nonexistent@x.test';
reset role;
-- owner may invite an owner
set role authenticated;
set request.jwt.claim.sub = :'uo';
insert into public.invitations (org_id, email, role) values (:'o1', :'PHASE' || '-coowner@x.test', 'owner');
select 'F6d owner sees O1 invitations', count(*) from public.invitations;
reset role;
-- the invitee sees no invitation rows (not even their own) and so no tokens
set role authenticated;
set request.jwt.claim.sub = :'ui';
select 'F6e invitee reads invitations', count(*) from public.invitations;
update public.invitations set role = 'owner', status = 'pending' where lower(email) = lower(:'PHASE' || '-invitee@x.test');
reset role;

-- F7 expired token fails
update public.invitations set expires_at = now() - interval '1 minute' where email = :'PHASE' || '-exp@x.test';
insert into auth.users (email, raw_user_meta_data) values (:'PHASE' || '-exp@x.test', '{}');
select id as ue from auth.users where email = :'PHASE' || '-exp@x.test' \gset
select token as tok_exp from public.invitations where email = :'PHASE' || '-exp@x.test' \gset
set role authenticated;
set request.jwt.claim.sub = :'ue';
select 'F7 expired accept', public.accept_invitation(:'tok_exp');
select 'F7b expired lookup', public.get_invitation_by_token(:'tok_exp') is null as is_null;
reset role;

-- F8 decline by token holder (anon), then the token is dead
select token as tok_dec from public.invitations where email = :'PHASE' || '-dec@x.test' \gset
set role anon;
select 'F8a anon decline', public.decline_invitation(:'tok_dec');
select 'F8b decline again', public.decline_invitation(:'tok_dec');
reset role;
insert into auth.users (email, raw_user_meta_data) values (:'PHASE' || '-dec@x.test', '{}');
select id as ud from auth.users where email = :'PHASE' || '-dec@x.test' \gset
set role authenticated;
set request.jwt.claim.sub = :'ud';
select 'F8c accept declined', public.accept_invitation(:'tok_dec');
reset role;
set role authenticated;
set request.jwt.claim.sub = :'ua';
delete from public.invitations where token = :'tok_dec';
reset role;
select 'F8d admin deleted declined invitation', count(*) from public.invitations where token = :'tok_dec';

-- F9 NEW user signs up through an HSE invitation (the metadata the HSE
-- page sends); asking for owner does not matter, the invitation's role wins,
-- no new org is created, the invitation is consumed
select token as tok_new from public.invitations where email = :'PHASE' || '-new2@x.test' \gset
select count(*) as orgs_before from public.organizations \gset
select count(*) as apps_before from public.organization_apps \gset
insert into auth.users (email, raw_user_meta_data)
  values (:'PHASE' || '-new2@x.test', jsonb_build_object('invitation_token', :'tok_new', 'organization_id', :'o1', 'role', 'owner', 'primary_app', 'hse', 'full_name', 'New Two'));
select 'F9a new invitee', om.role, om.status, om.full_name from public.organization_members om where om.organization_id = :'o1' and om.email = :'PHASE' || '-new2@x.test';
select 'F9b orgs created', count(*) - :orgs_before from public.organizations;
select 'F9c invitation', status from public.invitations where token = :'tok_new';
select 'F9d users.organization_id is O1', organization_id = :'o1' from public.users where email = :'PHASE' || '-new2@x.test';
select 'F9e apps provisioned by invitee', count(*) - :apps_before from public.organization_apps;

-- F10 Suite flow: an 'invited' organization_members row, token in the
-- metadata (what accept-employee-invitation now sends)
insert into public.organization_members (organization_id, full_name, email, role, status, invited_at, invitation_token, invitation_expires_at)
  values (:'o1', 'Suite Invitee', :'PHASE' || '-suite@x.test', 'engineer', 'invited', now(), 'suite-tok-' || :'PHASE', now() + interval '7 days');
insert into auth.users (email, raw_user_meta_data)
  values (:'PHASE' || '-suite@x.test', jsonb_build_object('organization_id', :'o1', 'role', 'owner', 'invitation_token', 'suite-tok-' || :'PHASE', 'primary_app', 'suite'));
select 'F10a suite invitee', role, status, invitation_token is null as token_cleared, user_id is not null as linked
  from public.organization_members where organization_id = :'o1' and email = :'PHASE' || '-suite@x.test';
-- expired Suite invite refused
insert into public.organization_members (organization_id, full_name, email, role, status, invited_at, invitation_token, invitation_expires_at)
  values (:'o1', 'Late', :'PHASE' || '-late@x.test', 'engineer', 'invited', now(), 'late-tok-' || :'PHASE', now() - interval '1 minute');
insert into auth.users (email, raw_user_meta_data)
  values (:'PHASE' || '-late@x.test', jsonb_build_object('organization_id', :'o1', 'invitation_token', 'late-tok-' || :'PHASE'));
select 'F10b late suite invitee account', count(*) from auth.users where email = :'PHASE' || '-late@x.test';

-- F11 an invitation written without an admin inviter (the unauthenticated
-- legacy edge functions, service role) cannot be redeemed
-- a service-role request carries no user JWT, so auth.uid() is null
set request.jwt.claim.sub = '';
set role service_role;
insert into public.invitations (org_id, email, role, status) values (:'o1', :'PHASE' || '-legacy@x.test', 'admin', 'pending');
select 'F11 legacy row has no inviter', invited_by is null from public.invitations where email = :'PHASE' || '-legacy@x.test';
reset role;
select token as tok_leg from public.invitations where email = :'PHASE' || '-legacy@x.test' \gset
insert into auth.users (email, raw_user_meta_data) values (:'PHASE' || '-legacy@x.test', '{}');
select id as ul from auth.users where email = :'PHASE' || '-legacy@x.test' \gset
set role authenticated;
set request.jwt.claim.sub = :'ul';
select 'F11 inviter-less invitation', public.accept_invitation(:'tok_leg');
reset role;
-- an admin who has since been demoted cannot vouch any more either
update public.organization_members set role = 'member' where user_id = :'ua' and organization_id = :'o1';
insert into public.invitations (org_id, email, role, invited_by, status) values (:'o1', :'PHASE' || '-legacy@x.test', 'member', :'ua', 'pending');
select token as tok_dem from public.invitations where email = :'PHASE' || '-legacy@x.test' and invited_by = :'ua' \gset
set role authenticated;
set request.jwt.claim.sub = :'ul';
select 'F11b demoted inviter', public.accept_invitation(:'tok_dem');
reset role;
update public.organization_members set role = 'admin' where user_id = :'ua' and organization_id = :'o1';

-- F12 owner-role invitation from the owner works; an active member keeps
-- their role when accepting a lesser invitation
select token as tok_co from public.invitations where email = :'PHASE' || '-coowner@x.test' \gset
insert into auth.users (email, raw_user_meta_data) values (:'PHASE' || '-coowner@x.test', jsonb_build_object('invitation_token', :'tok_co'));
select 'F12a co-owner', role from public.organization_members where organization_id = :'o1' and email = :'PHASE' || '-coowner@x.test';
set role authenticated;
set request.jwt.claim.sub = :'ua';
insert into public.invitations (org_id, email, role) values (:'o1', :'PHASE' || '-admin@o1.test', 'member');
reset role;
select token as tok_self from public.invitations where email = :'PHASE' || '-admin@o1.test' \gset
set role authenticated;
set request.jwt.claim.sub = :'ua';
select 'F12b admin accepts member invite', public.accept_invitation(:'tok_self') ->> 'status' as status;
reset role;
select 'F12c admin role kept', role from public.organization_members where organization_id = :'o1' and user_id = :'ua';

-- F13 enable_hse_for_organization: own org admin OK; someone else's id refused
set role authenticated;
set request.jwt.claim.sub = :'uo';
select 'F13a owner enable (null id)' as probe, true as ran from (select public.enable_hse_for_organization(null)) x;
select 'F13b owner enable (own id)' as probe, true as ran from (select public.enable_hse_for_organization(:'uo')) x;
select 'F13c owner enable (other id)', public.enable_hse_for_organization(:'ua');
reset role;

-- F14 grants as they will be checked on prod
select 'F14 grants',
  has_function_privilege('anon', 'public.add_user_to_organization(uuid,uuid,text)', 'execute') as anon_add,
  has_function_privilege('authenticated', 'public.add_user_to_organization(uuid,uuid,text)', 'execute') as auth_add,
  has_function_privilege('anon', 'public.accept_invitation(text)', 'execute') as anon_accept,
  has_function_privilege('authenticated', 'public.accept_invitation(text)', 'execute') as auth_accept,
  has_function_privilege('authenticated', 'public.invitation_accept_internal(text,uuid,text,text)', 'execute') as auth_internal,
  has_function_privilege('anon', 'public.enable_hse_for_organization(uuid)', 'execute') as anon_hse,
  has_table_privilege('anon', 'public.invitations', 'select') as anon_inv_select;
\endif
