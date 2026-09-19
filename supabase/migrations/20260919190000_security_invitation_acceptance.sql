-- =============================================================================
-- SECURITY: token-validated invitation acceptance (shared tables)
-- -----------------------------------------------------------------------------
-- OWNER-RUN. SECOND ENGINEER REVIEW REQUIRED: touches the shared tables
-- organization_members and invitations, and the signup trigger
-- handle_new_user() that both the Suite and HSE depend on.
-- Rehearsal, dry run and apply: tools/security/invitation-acceptance/.
--
-- Three doors let any signed-up user (or anyone at all) join any
-- organization with a role of their choosing. This closes all three at the
-- database, so it holds even if an edge function or client is wrong:
--
--   1. public.add_user_to_organization(p_user_id, p_org_id, p_role):
--      SECURITY DEFINER, EXECUTE for anon/authenticated, no checks at all.
--      -> EXECUTE revoked from public, anon, authenticated (service_role
--         kept; no service-role caller exists, the body is left as is).
--         Replaced for clients by public.accept_invitation(p_token).
--
--   2. handle_new_user() trusted the signup metadata: organization_id made
--      the new account an ACTIVE member of that org, with metadata role
--      (default 'owner'). supabase.auth.signUp() lets any caller set that
--      metadata. -> an existing organization is joined ONLY with an
--      invitation token that validates (below); an organization_id without
--      one is refused. The role always comes from the invitation; the
--      creator of a new organization is always 'owner'.
--
--   3. public.invitations had "Public can view invitations" (SELECT
--      USING true) and "Public can update invitation by token" (UPDATE
--      USING true) for PUBLIC, plus "Users can update own invitations"
--      (any column, including org_id and role, for the invitee). Anyone
--      could read every token and rewrite any invitation.
--      -> those three policies dropped; anon loses all table privileges;
--         org admins (is_org_admin_of) and platform super admins manage
--         their org's invitations; nobody else can read a token. Acceptance,
--         the pre-signup lookup and declining go only through the
--         token-taking SECURITY DEFINER functions below.
--
-- Also: public.enable_hse_for_organization(p_user_id) trusted the caller's
-- p_user_id; it now acts for auth.uid() only (p_user_id kept for signature
-- compatibility and must be null or equal auth.uid()), and anon loses
-- EXECUTE.
--
-- Validation rules (public.invitation_accept_internal, used by both the
-- signed-in RPC and the signup trigger):
--   * the caller is a real auth user (auth.uid() for the RPC, NEW.id in the
--     trigger), and the invitee email matches that user's auth email,
--     case-insensitively;
--   * the token names a PENDING, UNEXPIRED invitation (public.invitations,
--     the HSE flow) or an 'invited', unexpired organization_members row
--     (organization_members.invitation_token, the Suite flow);
--   * public.invitations rows must have been issued by someone who is,
--     at acceptance time, an active owner/admin/org_admin/super_admin
--     member of that org (or a platform super admin); an 'owner' invitation
--     needs an owner (or super admin) inviter; 'super_admin' is never
--     granted by invitation;
--   * the membership gets the INVITATION's role; an existing active
--     membership is never changed (no downgrade, no upgrade);
--   * the invitation is marked accepted in the same transaction, under a
--     row lock, so a token is used exactly once; repeating the call as the
--     same user returns status 'already_accepted' instead of failing.
-- Tokens stay stored as uuids (122 random bits) because the org-admin
-- "copy invite link" needs them; lookup is an equality match on a unique
-- index, which exposes nothing beyond found / not found.
--
-- ORDER: sorts after PR #535's 20260919160000 (A) and 20260919170000 (B)
-- and before the held 20260919200000 PS0 seed. It does not depend on A or
-- B and they do not touch these objects; every statement is idempotent
-- (create or replace, drop policy if exists, revoke/grant, if not exists),
-- so it applies cleanly before, between or after them, and twice.
--
-- DEPLOY ORDER (see tools/security/invitation-acceptance/apply.sh):
--   1. deploy the Suite edge fn accept-employee-invitation from this PR
--      (works with the OLD trigger too), and HSE's hse-invite-user;
--   2. apply this migration;
--   3. upload the HSE SPA build from the HSE PR (it calls the new RPCs).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. add_user_to_organization: clients lose EXECUTE (same as the stop-gap
--    20260919180000; repeated here so this file stands alone).
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.add_user_to_organization(uuid, uuid, text)') is not null then
    revoke execute on function public.add_user_to_organization(uuid, uuid, text) from public, anon, authenticated;
    grant execute on function public.add_user_to_organization(uuid, uuid, text) to service_role;
    comment on function public.add_user_to_organization(uuid, uuid, text) is
      'DEPRECATED 2026-09-19 (security): no validation of any kind. Clients use accept_invitation(token). service_role only.';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2. invitations: one token per row, inviter stamped from the session.
-- -----------------------------------------------------------------------------
create unique index if not exists invitations_token_key on public.invitations (token);
alter table public.invitations alter column invited_by set default auth.uid();

-- -----------------------------------------------------------------------------
-- 3. The shared acceptance core. Not callable by clients.
-- -----------------------------------------------------------------------------
create or replace function public.invitation_accept_internal(
  p_token text, p_user_id uuid, p_email text, p_full_name text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_token   text := nullif(btrim(p_token), '');
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_uuid    uuid;
  v_inv     public.invitations%rowtype;
  v_om      public.organization_members%rowtype;
  v_role    text;
  v_inviter_role text;
  v_name    text;
  v_admin_roles constant text[] := array['owner', 'admin', 'org_admin', 'super_admin'];
  -- the platform super admins, as public.is_super_admin() defines them
  v_platform_admins constant text[] := array['info@petrolord.com', 'ayoasaolu@gmail.com', 'ayodejiasaolu1@gmail.com'];
  v_invalid constant text := 'This invitation is invalid, has expired or has already been used.';
begin
  if p_user_id is null or v_email = '' then
    raise exception 'Sign in to accept this invitation.' using errcode = '42501';
  end if;
  if v_token is null then
    raise exception '%', v_invalid using errcode = '22023';
  end if;

  -- ---- (a) public.invitations (HSE flow) -----------------------------------
  begin
    v_uuid := v_token::uuid;
  exception when invalid_text_representation then
    v_uuid := null;
  end;

  if v_uuid is not null then
    select * into v_inv from public.invitations where token = v_uuid for update;
  end if;

  if v_inv.id is not null then
    if lower(btrim(v_inv.email)) is distinct from v_email then
      raise exception 'This invitation was sent to a different email address.' using errcode = '42501';
    end if;

    if v_inv.status = 'accepted' then
      select om.role into v_role from public.organization_members om
       where om.organization_id = v_inv.org_id and om.user_id = p_user_id
         and coalesce(lower(om.status), 'active') = 'active';
      if v_role is not null then
        return jsonb_build_object('status', 'already_accepted',
          'organization_id', v_inv.org_id, 'role', v_role);
      end if;
      raise exception '%', v_invalid using errcode = '22023';
    end if;

    if v_inv.status is distinct from 'pending'
       or v_inv.expires_at is null or v_inv.expires_at <= now()
       or v_inv.org_id is null then
      raise exception '%', v_invalid using errcode = '22023';
    end if;

    v_role := v_inv.role;
    if v_role is null or v_role = 'super_admin' then
      raise exception 'This invitation carries a role that cannot be granted by invitation.' using errcode = '42501';
    end if;

    -- The inviter must still hold an admin role in that org (or be a
    -- platform super admin). Rows written by an unauthenticated path have
    -- no valid inviter and are refused here.
    select om.role into v_inviter_role from public.organization_members om
     where om.organization_id = v_inv.org_id and om.user_id = v_inv.invited_by
       and coalesce(lower(om.status), 'active') = 'active'
       and om.role = any (v_admin_roles)
     order by case om.role when 'super_admin' then 0 when 'owner' then 1 else 2 end
     limit 1;
    if v_inviter_role is null and v_inv.invited_by is not null
       and exists (select 1 from auth.users au where au.id = v_inv.invited_by
                   and au.email = any (v_platform_admins)) then
      v_inviter_role := 'super_admin';
    end if;
    if v_inviter_role is null then
      raise exception 'This invitation was not issued by an administrator of the organization.' using errcode = '42501';
    end if;
    if v_role = 'owner' and v_inviter_role not in ('owner', 'super_admin') then
      raise exception 'Only an owner can invite another owner.' using errcode = '42501';
    end if;

    v_name := coalesce(nullif(btrim(p_full_name), ''),
                       nullif(btrim(concat_ws(' ', v_inv.first_name, v_inv.last_name)), ''),
                       v_email);

    -- Existing row for this user or this email in the org?
    select * into v_om from public.organization_members om
     where om.organization_id = v_inv.org_id
       and (om.user_id = p_user_id or lower(om.email) = v_email)
     order by (om.user_id = p_user_id) desc nulls last
     limit 1
     for update;

    if v_om.id is not null and v_om.user_id = p_user_id
       and coalesce(lower(v_om.status), 'active') = 'active' then
      -- Already an active member: keep the role they have.
      update public.invitations set status = 'accepted', accepted_at = now() where id = v_inv.id;
      return jsonb_build_object('status', 'already_member',
        'organization_id', v_inv.org_id, 'role', v_om.role);
    elsif v_om.id is not null then
      update public.organization_members
         set user_id = p_user_id, role = v_role, status = 'active',
             full_name = coalesce(nullif(full_name, ''), v_name),
             joined_at = coalesce(joined_at, now()),
             invitation_token = null, invitation_expires_at = null,
             updated_at = now()
       where id = v_om.id;
    else
      insert into public.organization_members
        (organization_id, user_id, full_name, email, role, status, joined_at, created_at, updated_at)
      values (v_inv.org_id, p_user_id, v_name, v_email, v_role, 'active', now(), now(), now());
    end if;

    update public.invitations set status = 'accepted', accepted_at = now() where id = v_inv.id;
    return jsonb_build_object('status', 'accepted', 'organization_id', v_inv.org_id, 'role', v_role);
  end if;

  -- ---- (b) organization_members.invitation_token (Suite flow) --------------
  select * into v_om from public.organization_members om
   where om.invitation_token = v_token
   for update;

  if v_om.id is null then
    raise exception '%', v_invalid using errcode = '22023';
  end if;
  if lower(btrim(v_om.email)) is distinct from v_email then
    raise exception 'This invitation was sent to a different email address.' using errcode = '42501';
  end if;
  if coalesce(lower(v_om.status), '') <> 'invited'
     or v_om.invitation_expires_at is null or v_om.invitation_expires_at <= now() then
    raise exception '%', v_invalid using errcode = '22023';
  end if;
  if v_om.role = 'super_admin' then
    raise exception 'This invitation carries a role that cannot be granted by invitation.' using errcode = '42501';
  end if;

  update public.organization_members
     set user_id = p_user_id, status = 'active',
         full_name = coalesce(nullif(full_name, ''), nullif(btrim(p_full_name), ''), v_email),
         joined_at = coalesce(joined_at, now()),
         invitation_token = null, invitation_expires_at = null,
         updated_at = now()
   where id = v_om.id;

  return jsonb_build_object('status', 'accepted', 'organization_id', v_om.organization_id, 'role', v_om.role);
end;
$$;

revoke all on function public.invitation_accept_internal(text, uuid, text, text) from public, anon, authenticated, service_role;
comment on function public.invitation_accept_internal(text, uuid, text, text) is
  'Invitation acceptance core (token + invitee email + inviter check, invitation role, single use). Called only by accept_invitation() and handle_new_user().';

-- -----------------------------------------------------------------------------
-- 4. Client RPCs.
-- -----------------------------------------------------------------------------
-- The signed-in invitee accepts. Never takes a user id or a role.
create or replace function public.accept_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_name  text;
begin
  if v_uid is null then
    raise exception 'Sign in to accept this invitation.' using errcode = '42501';
  end if;
  select au.email, au.raw_user_meta_data->>'full_name' into v_email, v_name
    from auth.users au where au.id = v_uid;
  if v_email is null then
    raise exception 'Sign in to accept this invitation.' using errcode = '42501';
  end if;
  return public.invitation_accept_internal(p_token, v_uid, v_email, v_name);
end;
$$;

revoke all on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated, service_role;

-- What the /accept-invite page shows before sign-up. Only for a pending,
-- unexpired invitation, only to the holder of its token, and never the
-- token itself or anything about other invitations.
create or replace function public.get_invitation_by_token(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_uuid uuid;
  v_out  jsonb;
begin
  begin
    v_uuid := nullif(btrim(p_token), '')::uuid;
  exception when invalid_text_representation then
    return null;
  end;
  if v_uuid is null then
    return null;
  end if;
  select jsonb_build_object(
           'id', i.id, 'email', i.email, 'role', i.role,
           'first_name', i.first_name, 'last_name', i.last_name,
           'org_id', i.org_id, 'expires_at', i.expires_at,
           'organizations', jsonb_build_object('name', o.name))
    into v_out
    from public.invitations i
    left join public.organizations o on o.id = i.org_id
   where i.token = v_uuid and i.status = 'pending' and i.expires_at > now();
  return v_out;
end;
$$;

revoke all on function public.get_invitation_by_token(text) from public;
grant execute on function public.get_invitation_by_token(text) to anon, authenticated, service_role;

-- The holder of a pending invitation's token may decline it. Nothing else
-- about the row can be changed this way.
create or replace function public.decline_invitation(p_token text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uuid uuid;
begin
  begin
    v_uuid := nullif(btrim(p_token), '')::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  if v_uuid is null then
    return false;
  end if;
  update public.invitations set status = 'declined'
   where token = v_uuid and status = 'pending';
  return found;
end;
$$;

revoke all on function public.decline_invitation(text) from public;
grant execute on function public.decline_invitation(text) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. invitations RLS: admins manage their org's rows; nobody else sees any.
-- -----------------------------------------------------------------------------
-- Which roles an inviter may hand out (used by the INSERT/UPDATE checks).
create or replace function public.invitation_role_allowed(p_org_id uuid, p_role text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select p_role is not null
     and (p_role <> 'super_admin' or public.is_super_admin())
     and (p_role <> 'owner'
          or public.has_org_role(p_org_id, array['owner', 'super_admin'])
          or public.is_super_admin());
$$;

revoke all on function public.invitation_role_allowed(uuid, text) from public, anon;
grant execute on function public.invitation_role_allowed(uuid, text) to authenticated, service_role;

alter table public.invitations enable row level security;
revoke all on table public.invitations from anon;

drop policy if exists "Public can view invitations" on public.invitations;
drop policy if exists "Public can update invitation by token" on public.invitations;
drop policy if exists "Users can update own invitations" on public.invitations;
drop policy if exists "Org admins view invitations" on public.invitations;
drop policy if exists "Org admins create invitations" on public.invitations;
drop policy if exists "Org admins delete invitations" on public.invitations;
drop policy if exists invitations_admin_select on public.invitations;
drop policy if exists invitations_admin_insert on public.invitations;
drop policy if exists invitations_admin_update on public.invitations;
drop policy if exists invitations_admin_delete on public.invitations;

create policy invitations_admin_select on public.invitations
  for select to authenticated
  using (public.is_org_admin_of(org_id) or public.is_super_admin());

create policy invitations_admin_insert on public.invitations
  for insert to authenticated
  with check ((public.is_org_admin_of(org_id) or public.is_super_admin())
              and invited_by = auth.uid()
              and public.invitation_role_allowed(org_id, role));

create policy invitations_admin_update on public.invitations
  for update to authenticated
  using (public.is_org_admin_of(org_id) or public.is_super_admin())
  with check ((public.is_org_admin_of(org_id) or public.is_super_admin())
              and public.invitation_role_allowed(org_id, role));

create policy invitations_admin_delete on public.invitations
  for delete to authenticated
  using (public.is_org_admin_of(org_id) or public.is_super_admin());

-- -----------------------------------------------------------------------------
-- 6. enable_hse_for_organization: acts for the signed-in user only.
-- -----------------------------------------------------------------------------
create or replace function public.enable_hse_for_organization(p_user_id uuid)
returns void
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_org_id uuid;
  v_role text;
begin
  -- Security fix 2026-09-19: p_user_id was trusted, so anyone could act as
  -- any org admin. It is kept only for signature compatibility.
  if v_uid is null then
    raise exception 'Sign in to enable HSE' using errcode = '42501';
  end if;
  if p_user_id is not null and p_user_id <> v_uid then
    raise exception 'You can only enable HSE for your own organization' using errcode = '42501';
  end if;

  select om.organization_id, om.role into v_org_id, v_role
  from public.organization_members om
  where om.user_id = v_uid
    and coalesce(lower(om.status), 'active') = 'active'
  limit 1;

  if v_org_id is null then
    raise exception 'User does not belong to an organization';
  end if;

  if v_role not in ('owner', 'admin', 'org_admin', 'super_admin') then
    raise exception 'Only organization admins can enable HSE';
  end if;

  update public.organizations set hse_status = 'ACTIVE' where id = v_org_id;

  insert into public.organization_apps
    (organization_id, app_id, module_id, seats_allocated, seats_used, status, created_at)
  select v_org_id, 'hse', 'hse_free', 999, 0, 'ACTIVE', now()
  where not exists (
    select 1 from public.organization_apps
    where organization_id = v_org_id and app_id = 'hse' and module_id = 'hse_free');

  insert into public.purchased_modules
    (organization_id, module_id, module_name, status, subscription_status,
     purchase_date, seats_allocated, auto_renew)
  select v_org_id, 'hse_free', 'HSE Free Tier', 'active', 'active', now(), 999, false
  where not exists (
    select 1 from public.purchased_modules
    where organization_id = v_org_id and module_id = 'hse_free');

  update public.users
  set subscribed_modules = (
        select array_agg(distinct x)
        from unnest(array_append(coalesce(subscribed_modules, array[]::text[]), 'hse_free')) t(x))
  where organization_id = v_org_id;

  insert into public.app_activity_log (user_id, app_name, action, timestamp)
  values (v_uid, 'suite', 'enable_hse_free', now());
end;
$$;

revoke all on function public.enable_hse_for_organization(uuid) from public, anon;
grant execute on function public.enable_hse_for_organization(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 7. handle_new_user: join an existing org only through a valid invitation.
--    Body is the live definition (pg_get_functiondef 2026-09-19, md5
--    a9f27ca36ad22a22e4acbafd1368502b; = 20260806100000) with only:
--      * metadata organization_id/role no longer trusted: an
--        invitation_token in the metadata is validated by
--        invitation_accept_internal (email = NEW.email), which writes the
--        membership with the invitation's role; organization_id without a
--        valid token raises;
--      * a new organization's creator is always 'owner';
--      * joining an existing org does not provision apps or modules into
--        it (1c2 / 1d run for a newly created org only).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  org_id UUID;
  org_name TEXT;
  meta_full_name TEXT;
  meta_primary_app TEXT;
  meta_org_text TEXT;
  meta_invitation_token TEXT;
  v_joined JSONB;
BEGIN
  BEGIN
    RAISE LOG 'handle_new_user: Starting for user %', NEW.id;

    -- Read metadata, with sensible defaults for any missing keys
    meta_org_text         := NULLIF(BTRIM(NEW.raw_user_meta_data->>'organization_id'), '');
    meta_invitation_token := NULLIF(BTRIM(NEW.raw_user_meta_data->>'invitation_token'), '');
    org_name         := COALESCE(NEW.raw_user_meta_data->>'organization_name', NEW.email);
    meta_full_name   := COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User');
    meta_primary_app := COALESCE(NEW.raw_user_meta_data->>'primary_app', 'suite');

    -- Defensive: clamp primary_app to known values
    IF meta_primary_app NOT IN ('suite', 'hse') THEN
      meta_primary_app := 'suite';
    END IF;

    -- ------------------------------------------------------------------------
    -- 1a0. Invitation signup: the token (not the metadata) decides the org
    --      and the role. Raises if the token, email or inviter is not valid.
    -- ------------------------------------------------------------------------
    IF meta_invitation_token IS NOT NULL THEN
      v_joined := public.invitation_accept_internal(
                    meta_invitation_token, NEW.id, NEW.email,
                    NEW.raw_user_meta_data->>'full_name');
      org_id := (v_joined->>'organization_id')::UUID;
      IF meta_org_text IS NOT NULL AND meta_org_text::UUID IS DISTINCT FROM org_id THEN
        RAISE EXCEPTION 'invitation is for a different organization';
      END IF;
    ELSIF meta_org_text IS NOT NULL THEN
      RAISE EXCEPTION 'joining an existing organization requires a valid invitation';
    END IF;

    -- ------------------------------------------------------------------------
    -- 1a. If signup flow (no invitation), create the org
    -- ------------------------------------------------------------------------
    IF org_id IS NULL THEN
      RAISE LOG 'handle_new_user: Creating new organization for user %', NEW.id;

      INSERT INTO public.organizations (
        name,
        contact_email,
        created_by,
        created_via,
        organization_type,
        subscription_tier,
        subscription_status,
        hse_status,
        suite_status,
        setup_completed,
        created_at
      )
      VALUES (
        org_name,
        NEW.email,
        NEW.id,
        'signup',
        'customer',
        'free',
        'active',
        'ACTIVE',                                         -- HSE is free for everyone
        CASE WHEN meta_primary_app = 'suite' THEN 'TRIAL' ELSE 'NONE' END,
        FALSE,                                            -- setup wizard not yet run
        NOW()
      )
      RETURNING id INTO org_id;
    END IF;

    -- ------------------------------------------------------------------------
    -- 1b. Upsert public.users
    -- ------------------------------------------------------------------------
    INSERT INTO public.users (
        id,
        email,
        organization_id,
        primary_app,
        subscribed_modules,
        last_accessed_app,
        app_preferences,
        created_at,
        updated_at
    )
    VALUES (
        NEW.id,
        NEW.email,
        org_id,
        meta_primary_app,
        ARRAY['hse_free']::text[],
        meta_primary_app,
        jsonb_build_object(
          meta_primary_app,
          jsonb_build_object(
            'onboarding_completed', FALSE,
            'preferred_language',   'en',
            'notifications_enabled', TRUE
          )
        ),
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        organization_id = EXCLUDED.organization_id,
        primary_app     = EXCLUDED.primary_app,
        updated_at      = NOW();

    IF v_joined IS NULL THEN
    -- ------------------------------------------------------------------------
    -- 1c. The creator of a new organization joins it as its owner.
    --     (An invitee's membership was written by invitation_accept_internal.)
    -- ------------------------------------------------------------------------
    INSERT INTO public.organization_members (
        organization_id,
        user_id,
        full_name,
        email,
        role,
        status,
        joined_at,
        created_at,
        updated_at
    )
    VALUES (
        org_id,
        NEW.id,
        meta_full_name,
        NEW.email,
        'owner',                                           -- creator, never from metadata
        'active',                                          -- creator joins active, not invited
        NOW(),
        NOW(),
        NOW()
    )
    ON CONFLICT (organization_id, email) DO UPDATE SET
        user_id    = EXCLUDED.user_id,
        full_name  = COALESCE(public.organization_members.full_name, EXCLUDED.full_name),
        status     = 'active',
        joined_at  = COALESCE(public.organization_members.joined_at, NOW()),
        updated_at = NOW();

    -- ------------------------------------------------------------------------
    -- 1c2. Provision app access (NEW table: organization_apps)
    --      Free HSE for every new org. Suite signups also get suite app
    --      provisioned in TRIAL state — actual entitlement gated downstream
    --      by purchased_modules and the org's suite_status.
    -- ------------------------------------------------------------------------
    INSERT INTO public.organization_apps (
        organization_id,
        app_id,
        module_id,
        seats_allocated,
        seats_used,
        status,
        created_at
    )
    VALUES (
        org_id,
        'hse',
        'hse_free',
        999,                                               -- unlimited for free tier
        0,
        'ACTIVE',
        NOW()
    )
    ON CONFLICT (organization_id, app_id) DO NOTHING;

    IF meta_primary_app = 'suite' THEN
      INSERT INTO public.organization_apps (
          organization_id,
          app_id,
          module_id,
          seats_allocated,
          seats_used,
          status,
          created_at
      )
      VALUES (
          org_id,
          'suite',
          'suite_trial',
          5,                                               -- nominal trial seat allocation
          0,
          'ACTIVE',
          NOW()
      )
      ON CONFLICT (organization_id, app_id) DO NOTHING;
    END IF;

    -- ------------------------------------------------------------------------
    -- 1d. Free HSE entitlement record in purchased_modules
    -- ------------------------------------------------------------------------
    INSERT INTO public.purchased_modules (
        organization_id,
        module_id,
        module_name,
        status,
        subscription_status,
        purchase_date,
        seats_allocated,
        auto_renew
    )
    SELECT
        org_id,
        'hse_free',
        'HSE Free Tier',
        'active',
        'active',
        NOW(),
        999,
        FALSE
    WHERE NOT EXISTS (
        SELECT 1 FROM public.purchased_modules
        WHERE organization_id = org_id AND module_id = 'hse_free'
    );
    END IF;

    -- ------------------------------------------------------------------------
    -- 1e. user_points_summary
    -- ------------------------------------------------------------------------
    INSERT INTO public.user_points_summary (
        user_id,
        organization_id,
        total_points,
        points_earned,
        points_redeemed,
        created_at,
        updated_at
    )
    VALUES (
        NEW.id,
        org_id,
        0,
        0,
        0,
        NOW(),
        NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
        organization_id = EXCLUDED.organization_id,
        updated_at      = NOW();

    -- ------------------------------------------------------------------------
    -- 1f. user_profiles
    -- ------------------------------------------------------------------------
    INSERT INTO public.user_profiles (
        id,
        org_id,
        full_name,
        updated_at
    )
    VALUES (
        NEW.id,
        org_id,
        meta_full_name,
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        org_id    = COALESCE(EXCLUDED.org_id, public.user_profiles.org_id),
        full_name = COALESCE(EXCLUDED.full_name, public.user_profiles.full_name);

    RAISE LOG 'handle_new_user: Successfully completed for user % (org %)', NEW.id, org_id;

  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'handle_new_user: ERROR for user % - %', NEW.id, SQLERRM;
    RAISE EXCEPTION 'Failed to initialize user: %', SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

commit;
