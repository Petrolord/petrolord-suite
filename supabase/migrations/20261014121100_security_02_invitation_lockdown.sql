-- =============================================================================
-- SECURITY 02 of 05 (2026-10): close the three "join any organization" doors.
-- Needs 01 (accept_invitation, invitation_accept_internal, platform_admins).
-- APPLY ONLY AFTER the HSE site upload that calls the 01 RPCs and after the
-- Suite accept-employee-invitation deploy (it passes invitation_token, which
-- the trigger below requires). Runbook: docs/security/RUNBOOK-2026-10.md.
-- Supersedes PR #537 (20260919180000 stop-gap + 20260919190000 sections 1, 2,
-- 5, 6, 7), re-verified against production 2026-10-14: handle_new_user md5
-- a9f27ca36ad22a22e4acbafd1368502b is unchanged since 2026-09-19;
-- add_user_to_organization is still EXECUTE for anon and authenticated with
-- no checks; invitations still has USING (true) SELECT and UPDATE for PUBLIC.
--
--   1. add_user_to_organization(p_user_id, p_org_id, p_role): anyone could
--      make any account OWNER of any organization. EXECUTE revoked from
--      public, anon, authenticated (service_role kept; no caller after the
--      HSE upload).
--   2. invitations.invited_by defaults to the session user.
--   3. invitations: the PUBLIC "view" and "update by token" policies and the
--      invitee "update own" policy (rewrote org_id and role) are dropped;
--      org admins and platform admins manage their org's rows; anon has no
--      table privilege. Lookup, accept and decline go through the 01 RPCs.
--   4. enable_hse_for_organization acts for auth.uid() only.
--   5. handle_new_user(): signup metadata organization_id and role are no
--      longer trusted. An invitation_token in the metadata is validated by
--      invitation_accept_internal (email must match), which writes the
--      membership with the invitation's role; organization_id without a
--      valid token raises; a new organization's creator is always owner.
--
-- Idempotent. No begin/commit inside.
-- ROLLBACK: docs/security/RUNBOOK-2026-10.md step R2 (re-grant
-- add_user_to_organization, restore the previous handle_new_user body from
-- tools/security/2026-10/rollback/handle_new_user.pre.sql and the previous
-- invitation policies). Rolling back re-opens the takeover.
-- =============================================================================

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
-- 2. invitations: inviter stamped from the session.
-- -----------------------------------------------------------------------------
alter table public.invitations alter column invited_by set default auth.uid();

-- -----------------------------------------------------------------------------
-- 3. invitations RLS: admins manage their org's rows; nobody else sees any.
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
-- 4. enable_hse_for_organization: acts for the signed-in user only.
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
  -- Security fix 2026-09-19 (re-checked 2026-10-14): p_user_id was trusted, so anyone could act as
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
-- 5. handle_new_user: join an existing org only through a valid invitation.
--    Body is the live definition (pg_get_functiondef 2026-09-19 (re-checked 2026-10-14), md5
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

