-- Stand-ins for the live objects the invitation-acceptance fix touches, for
-- a scratch PostgreSQL 16 only (run.sh). NEVER run against a Supabase
-- project. Generated from the live catalogue 2026-09-19: table shapes
-- (the columns the functions use), unique keys, the six live invitations
-- policies and grants, the helper bodies, and the LIVE bodies of
-- add_user_to_organization, enable_hse_for_organization and
-- handle_new_user (pg_get_functiondef, md5 a9f27ca3... for the trigger)
-- with its on_auth_user_created trigger. Function EXECUTE defaults to
-- PUBLIC and table grants to anon/authenticated/service_role, as on
-- Supabase.
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), instance_id uuid, aud text, role text, email text unique, raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now(), updated_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;

create table public.organizations (id uuid primary key default gen_random_uuid(), name text not null, contact_email text, created_at timestamptz not null default now(), subscription_tier text default 'free', created_by uuid, subscription_status text default 'active', setup_completed boolean default false, hse_status text default 'NONE', suite_status text default 'NONE', created_via text default 'admin', organization_type text default 'customer', is_internal boolean not null default false);
create table public.users (id uuid primary key, email text, primary_app text default 'hse', subscribed_modules text[] default array['hse'], last_accessed_app text default 'hse', app_preferences jsonb default '{}', created_at timestamptz default now(), updated_at timestamptz default now(), organization_id uuid, raw_user_meta_data jsonb, is_super_admin boolean default false);
create table public.organization_members (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, user_id uuid references auth.users(id) on delete set null, full_name text not null, email text not null, role text not null, status text not null, invited_at timestamptz, joined_at timestamptz, invitation_token text, invitation_expires_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now(), can_request_access boolean, unique (organization_id, email));
create table public.departments (id uuid primary key default gen_random_uuid(), organization_id uuid not null, name text not null);
create table public.invitations (id uuid primary key default gen_random_uuid(), org_id uuid references public.organizations(id) on delete cascade, email text not null, first_name text, last_name text, role text not null, department_id uuid references public.departments(id), token uuid default gen_random_uuid(), status text default 'pending', created_at timestamptz default now(), expires_at timestamptz default (now() + interval '7 days'), accepted_at timestamptz, invited_by uuid references auth.users(id), app_context text default 'suite');
create table public.organization_apps (id uuid primary key default gen_random_uuid(), organization_id uuid not null, app_id text not null, module_id text not null, seats_allocated integer not null, seats_used integer default 0, status text default 'ACTIVE', created_at timestamp default now(), unique (organization_id, app_id));
create table public.purchased_modules (id uuid primary key default gen_random_uuid(), organization_id uuid, module_id text, module_name text, purchase_date timestamptz default now(), status text, seats_allocated integer default 0, subscription_status text default 'active', auto_renew boolean default true);
create table public.user_points_summary (id uuid primary key default gen_random_uuid(), user_id uuid not null unique, organization_id uuid not null, total_points integer default 0, points_earned integer default 0, points_redeemed integer default 0, created_at timestamptz default now(), updated_at timestamptz default now());
create table public.user_profiles (id uuid primary key, org_id uuid, full_name text, updated_at timestamptz default now());
create table public.app_activity_log (id uuid primary key default gen_random_uuid(), user_id uuid, app_name text not null, action text not null, "timestamp" timestamptz default now());

-- live helpers
create function public.is_super_admin() returns boolean language plpgsql security definer as $$ begin return (select auth.uid() in (select id from auth.users where email = any(array['info@petrolord.com','ayoasaolu@gmail.com','ayodejiasaolu1@gmail.com']))); end $$;
create function public.has_org_role(org_id uuid, roles text[]) returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.organization_members om where om.organization_id = has_org_role.org_id and om.user_id = auth.uid() and coalesce(lower(om.status), 'active') = 'active' and om.role = any (has_org_role.roles)) $$;
create function public.is_org_admin_of(check_org_id uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.has_org_role(check_org_id, array['owner','admin','org_admin','super_admin']) $$;
create function public.is_org_member(org_id uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.organization_members om where om.organization_id = is_org_member.org_id and om.user_id = auth.uid() and coalesce(lower(om.status), 'active') = 'active') $$;

-- live invitations RLS
alter table public.invitations enable row level security;
create policy "Org admins create invitations" on public.invitations for insert with check (org_id in (select organization_members.organization_id from organization_members where organization_members.user_id = auth.uid() and organization_members.role = any (array['owner','admin','org_admin','super_admin'])));
create policy "Org admins delete invitations" on public.invitations for delete using (org_id in (select organization_members.organization_id from organization_members where organization_members.user_id = auth.uid() and organization_members.role = any (array['owner','admin','org_admin','super_admin'])));
create policy "Org admins view invitations" on public.invitations for select using (org_id in (select organization_members.organization_id from organization_members where organization_members.user_id = auth.uid() and organization_members.role = any (array['owner','admin','org_admin','super_admin'])));
create policy "Public can update invitation by token" on public.invitations for update using (true);
create policy "Public can view invitations" on public.invitations for select using (true);
create policy "Users can update own invitations" on public.invitations for update to authenticated using (email = (select (auth.jwt() ->> 'email')));
-- live organization_members RLS
alter table public.organization_members enable row level security;
create policy view_organization_members on public.organization_members for select using ((auth.uid() = user_id) or is_org_member(organization_id) or is_super_admin());
create policy insert_organization_members on public.organization_members for insert with check ((has_org_role(organization_id, array['admin','org_admin','owner','super_admin']) or is_super_admin()) and (is_super_admin() or (role <> 'super_admin')));
create policy update_organization_members on public.organization_members for update using (has_org_role(organization_id, array['admin','org_admin','owner','super_admin']) or is_super_admin()) with check (is_super_admin() or (role <> 'super_admin'));
create policy delete_organization_members on public.organization_members for delete using (has_org_role(organization_id, array['admin','org_admin','owner','super_admin']) or is_super_admin());

-- live add_user_to_organization / enable_hse_for_organization / handle_new_user
CREATE OR REPLACE FUNCTION public.add_user_to_organization(p_user_id uuid, p_org_id uuid, p_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_email text;
  v_name text;
begin
  if exists (select 1 from public.organization_members
             where organization_id = p_org_id and user_id = p_user_id) then
    return;
  end if;
  select au.email, coalesce(au.raw_user_meta_data->>'full_name', au.email)
    into v_email, v_name
  from auth.users au where au.id = p_user_id;
  if v_email is null then
    raise exception 'add_user_to_organization: user % not found', p_user_id;
  end if;
  insert into public.organization_members
    (organization_id, user_id, full_name, email, role, status, joined_at,
     created_at, updated_at)
  values (p_org_id, p_user_id, v_name, v_email, coalesce(p_role, 'member'),
          'active', now(), now(), now())
  on conflict (organization_id, email)
  do update set user_id = excluded.user_id,
                role = excluded.role,
                status = 'active',
                joined_at = coalesce(public.organization_members.joined_at, now()),
                updated_at = now();
end;
$function$
;
CREATE OR REPLACE FUNCTION public.enable_hse_for_organization(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_id uuid;
  v_role text;
begin
  select om.organization_id, om.role into v_org_id, v_role
  from public.organization_members om
  where om.user_id = p_user_id
    and coalesce(lower(om.status), 'active') = 'active'
  limit 1;
  if v_org_id is null then
    raise exception 'User does not belong to an organization';
  end if;
  if v_role not in ('owner', 'admin', 'org_admin', 'super_admin') then
    raise exception 'Only organization admins can enable HSE';
  end if;
  -- Previous body updated organizations.hse_enabled / subscribed_modules /
  -- modules — columns renamed *_legacy in the organizations renovation, so it
  -- has been erroring at runtime. Modern provisioning mirrors
  -- handle_new_user: hse_status flag + organization_apps + purchased_modules.
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
  values (p_user_id, 'suite', 'enable_hse_free', now());
end;
$function$
;
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
  meta_role TEXT;
BEGIN
  BEGIN
    RAISE LOG 'handle_new_user: Starting for user %', NEW.id;

    -- Read metadata, with sensible defaults for any missing keys
    org_id           := (NEW.raw_user_meta_data->>'organization_id')::UUID;
    org_name         := COALESCE(NEW.raw_user_meta_data->>'organization_name', NEW.email);
    meta_full_name   := COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User');
    meta_primary_app := COALESCE(NEW.raw_user_meta_data->>'primary_app', 'suite');
    meta_role        := COALESCE(NEW.raw_user_meta_data->>'role', 'owner');

    -- Defensive: clamp primary_app to known values
    IF meta_primary_app NOT IN ('suite', 'hse') THEN
      meta_primary_app := 'suite';
    END IF;

    -- ------------------------------------------------------------------------
    -- 1a. If signup flow (no org_id passed in metadata), create the org
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

    -- ------------------------------------------------------------------------
    -- 1c. Add the user as an organization member (NEW table: organization_members)
    --     Replaces the deprecated organization_users insert.
    --     For signup creator: status='active', role='owner', joined NOW.
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
        meta_role,                                         -- 'owner'
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
$function$
;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
