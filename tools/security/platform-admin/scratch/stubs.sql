-- Stand-ins for the live objects the platform-admin security fix touches, for
-- a scratch PostgreSQL 16 only (run.sh). NEVER run against a Supabase
-- project. Generated from the live catalogue 2026-09-19: table shapes (the
-- columns the functions use), the live public.users and organization_members
-- policies and table-wide grants, two representative is_super_admin()
-- policies (organizations), and the LIVE bodies (pg_get_functiondef) of
-- is_super_admin, has_org_role, is_org_admin_of, is_org_member, my_org_id,
-- get_my_org_ids, enable_hse_for_organization, assign_app_seat and
-- unassign_app_seat. Function EXECUTE defaults to PUBLIC and table grants to
-- anon/authenticated/service_role, as on Supabase.
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), instance_id uuid, aud text, role text, updated_at timestamptz default now(), email text unique, email_confirmed_at timestamptz default now(),
  raw_user_meta_data jsonb default '{}'::jsonb, raw_app_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now(), last_sign_in_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to service_role;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;

create table public.organizations (id uuid primary key default gen_random_uuid(), name text, contact_email text, created_at timestamptz default now(),
  created_by uuid, subscription_status text default 'active', hse_status text default 'NONE', suite_status text default 'NONE', is_hse_only_legacy boolean default false);
create table public.users (id uuid primary key, email text, primary_app text default 'hse', subscribed_modules text[] default array['hse'],
  last_accessed_app text default 'hse', app_preferences jsonb default '{}', created_at timestamptz default now(), updated_at timestamptz default now(),
  organization_id uuid, raw_user_meta_data jsonb, is_super_admin boolean default false);
create table public.organization_members (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null, full_name text, email text not null, role text not null, status text not null,
  invited_at timestamptz, joined_at timestamptz, invitation_token text, invitation_expires_at timestamptz, created_at timestamptz default now(),
  updated_at timestamptz default now(), can_request_access boolean, unique (organization_id, email));
create table public.purchased_modules (id uuid primary key default gen_random_uuid(), organization_id uuid, module_id text, app_id text, module_name text,
  purchase_date timestamptz default now(), expiry_date timestamptz, status text, seats_allocated integer default 0, subscription_status text default 'active', auto_renew boolean default true);
create table public.organization_apps (id uuid primary key default gen_random_uuid(), organization_id uuid, app_id text, module_id text, seats_allocated integer,
  seats_used integer default 0, status text default 'ACTIVE', created_at timestamp default now());
create table public.app_seat_assignments (id uuid primary key default gen_random_uuid(), organization_id uuid, app_id text, user_id uuid, seat_number integer,
  assigned_by uuid, is_admin_seat boolean default false, is_locked boolean default false, reassigned_from_admin boolean default false,
  created_at timestamptz default now(), updated_at timestamptz default now());
create table public.app_activity_log (id uuid primary key default gen_random_uuid(), user_id uuid, app_name text, action text, "timestamp" timestamptz default now());

-- live: public.is_super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
    BEGIN
        RETURN (
            SELECT auth.uid() IN (
                SELECT id FROM auth.users WHERE email = ANY(ARRAY['info@petrolord.com','ayoasaolu@gmail.com','ayodejiasaolu1@gmail.com'])
            )
        );
    END;
$function$;

-- live: public.has_org_role
CREATE OR REPLACE FUNCTION public.has_org_role(org_id uuid, roles text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.organization_members om
    where om.organization_id = has_org_role.org_id
      and om.user_id = auth.uid()
      and coalesce(lower(om.status), 'active') = 'active'
      and om.role = any (has_org_role.roles)
  );
$function$;

-- live: public.is_org_admin_of
CREATE OR REPLACE FUNCTION public.is_org_admin_of(check_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.has_org_role(check_org_id,
                             array['owner','admin','org_admin','super_admin']);
$function$;

-- live: public.is_org_member
CREATE OR REPLACE FUNCTION public.is_org_member(org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.organization_members om
    where om.organization_id = is_org_member.org_id
      and om.user_id = auth.uid()
      and coalesce(lower(om.status), 'active') = 'active'
  );
$function$;

-- live: public.my_org_id
CREATE OR REPLACE FUNCTION public.my_org_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select om.organization_id
  from public.organization_members om
  where om.user_id = auth.uid()
    and coalesce(lower(om.status), 'active') = 'active'
  order by om.joined_at nulls last, om.created_at
  limit 1;
$function$;

-- live: public.get_my_org_ids
CREATE OR REPLACE FUNCTION public.get_my_org_ids()
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(ARRAY_AGG(organization_id), ARRAY[]::uuid[])
  FROM public.organization_members
  WHERE user_id = auth.uid();
$function$;

-- live: public.enable_hse_for_organization
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
$function$;

-- live: public.assign_app_seat
CREATE OR REPLACE FUNCTION public.assign_app_seat(p_organization_id uuid, p_app_id text, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_caller       uuid := auth.uid();
  v_is_admin     boolean;
  v_app_active   boolean;
  v_cap          integer;
  v_used         integer;
  v_next         integer;
begin
  -- 1. Authorize caller (server-side call has no JWT -> auth.uid() null -> allow).
  v_is_admin :=
       v_caller is null
    or exists (select 1 from public.users u
                where u.id = v_caller and u.is_super_admin is true)
    or exists (select 1 from public.organization_members om
                where om.user_id = v_caller and om.organization_id = p_organization_id
                  and coalesce(lower(om.status),'active') = 'active'
                  and om.role = any (array['owner','admin','org_admin','super_admin']));

  if not v_is_admin then
    return jsonb_build_object('status','error','reason','not_authorized');
  end if;

  -- 2. App must be purchased & active for the org; read its cap (NULL = unlimited).
  select true, pm.seats_allocated
    into v_app_active, v_cap
    from public.purchased_modules pm
   where pm.organization_id = p_organization_id
     and pm.app_id = p_app_id
     and pm.status = 'active'
   order by pm.seats_allocated desc nulls first
   limit 1;

  if not coalesce(v_app_active, false) then
    return jsonb_build_object('status','error','reason','app_not_purchased');
  end if;

  -- 3. Target must be a member of the org.
  if not exists (
        select 1 from public.organization_members
         where organization_id = p_organization_id and user_id = p_user_id
        union all
        select 1 from public.users
         where organization_id = p_organization_id and id = p_user_id
  ) then
    return jsonb_build_object('status','error','reason','user_not_member');
  end if;

  -- 4. Idempotent: already assigned -> success no-op.
  if exists (select 1 from public.app_seat_assignments
              where organization_id = p_organization_id and app_id = p_app_id and user_id = p_user_id) then
    return jsonb_build_object('status','success','already_assigned',true);
  end if;

  -- 5. Cap check (NULL cap = unlimited).
  select count(*) into v_used
    from public.app_seat_assignments
   where organization_id = p_organization_id and app_id = p_app_id;

  if v_cap is not null and v_used >= v_cap then
    return jsonb_build_object('status','error','reason','seat_limit_reached',
                              'allocated', v_cap, 'used', v_used);
  end if;

  -- 6. Assign: next seat number = max+1.
  select coalesce(max(seat_number),0) + 1 into v_next
    from public.app_seat_assignments
   where organization_id = p_organization_id and app_id = p_app_id;

  insert into public.app_seat_assignments
        (organization_id, app_id, user_id, seat_number, assigned_by, is_admin_seat, created_at, updated_at)
  values (p_organization_id, p_app_id, p_user_id, v_next, v_caller, false, now(), now());

  return jsonb_build_object('status','success','seat_number',v_next,
                            'allocated', v_cap, 'used', v_used + 1);
end;
$function$;

-- live: public.unassign_app_seat
CREATE OR REPLACE FUNCTION public.unassign_app_seat(p_organization_id uuid, p_app_id text, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_caller   uuid := auth.uid();
  v_is_admin boolean;
  v_removed  integer;
begin
  v_is_admin :=
       v_caller is null
    or exists (select 1 from public.users u
                where u.id = v_caller and u.is_super_admin is true)
    or exists (select 1 from public.organization_members om
                where om.user_id = v_caller and om.organization_id = p_organization_id
                  and coalesce(lower(om.status),'active') = 'active'
                  and om.role = any (array['owner','admin','org_admin','super_admin']));

  if not v_is_admin then
    return jsonb_build_object('status','error','reason','not_authorized');
  end if;

  delete from public.app_seat_assignments
   where organization_id = p_organization_id and app_id = p_app_id and user_id = p_user_id;
  get diagnostics v_removed = row_count;

  return jsonb_build_object('status','success','removed', v_removed);
end;
$function$;

-- live public.users RLS
alter table public.users enable row level security;
create policy "Users can update their own data" on public.users for update using (auth.uid() = id);
create policy "Users can view their own data" on public.users for select using (auth.uid() = id);
-- live organization_members RLS
alter table public.organization_members enable row level security;
create policy view_organization_members on public.organization_members for select using ((auth.uid() = user_id) or is_org_member(organization_id) or is_super_admin());
create policy insert_organization_members on public.organization_members for insert with check ((has_org_role(organization_id, array['admin','org_admin','owner','super_admin']) or is_super_admin()) and (is_super_admin() or (role <> 'super_admin')));
create policy update_organization_members on public.organization_members for update using (has_org_role(organization_id, array['admin','org_admin','owner','super_admin']) or is_super_admin()) with check (is_super_admin() or (role <> 'super_admin'));
create policy delete_organization_members on public.organization_members for delete using (has_org_role(organization_id, array['admin','org_admin','owner','super_admin']) or is_super_admin());
-- live organizations RLS (two of the 100+ is_super_admin() policies)
alter table public.organizations enable row level security;
create policy "Super Admins can manage all organizations" on public.organizations for all using (is_super_admin());
create policy "Users can view their own organization" on public.organizations for select using (is_super_admin() or (id = any (get_my_org_ids())));

-- SIMPLIFIED signup trigger (NOT the live handle_new_user body, which is long
-- and is being replaced by PR #537): like the live one it is SECURITY DEFINER
-- and, for a plain signup, creates an own organization with the user as
-- owner and the public.users row. Only dryrun-probe.sql relies on it, so the
-- prod probe can also run here.
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  insert into public.organizations (name, created_by) values (coalesce(new.raw_user_meta_data->>'full_name', new.email) || ' org', new.id) returning id into v_org;
  insert into public.organization_members (organization_id, user_id, full_name, email, role, status, joined_at)
    values (v_org, new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), new.email, 'owner', 'active', now());
  insert into public.users (id, email, organization_id) values (new.id, new.email, v_org);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row
  when (new.email like 'dryrun-%') execute function public.handle_new_user();
