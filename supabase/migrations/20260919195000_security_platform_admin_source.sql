-- =============================================================================
-- 20260919195000_security_platform_admin_source.sql
-- SECURITY. NOT APPLIED. SECOND ENGINEER REVIEW REQUIRED (shared tables:
-- users, organization_members; new shared table platform_admins).
-- Owner-run via tools/security/platform-admin/apply.sh (verify / dry-run /
-- apply). Never hand-apply to production.
--
-- WHAT WAS WRONG (verified read-only against production 2026-09-19)
--   1. public.users."Users can update their own data" is UPDATE USING
--      (auth.uid() = id) with no column guard, and anon/authenticated hold
--      table-wide UPDATE. Any signed-in user could set is_super_admin = true,
--      organization_id, subscribed_modules (the HSE premium gate reads it) or
--      email on their own row.
--   2. That flag, and auth user_metadata.is_super_admin (settable by anyone
--      with supabase.auth.updateUser({ data })), were trusted as platform
--      admin by edge functions (org-export, org-offboard, generate-quote,
--      invite-employee, admin-cleanup-test-data, and the never-committed
--      admin-delete-organization / admin-grant-user-app-access /
--      admin-suspend-org / admin-update-org-entitlements, which took the
--      admin id from the REQUEST BODY with verify_jwt off) and by SQL
--      assign_app_seat / unassign_app_seat.
--   3. organization_members.invitation_token of pending invitations was
--      readable by every member of the org (view_organization_members), so a
--      viewer could redeem an admin invitation meant for someone else.
--
-- WHAT THIS DOES
--   A. public.platform_admins: THE source of platform-admin truth. RLS on, no
--      policies, no anon/authenticated grants: only service_role and SECURITY
--      DEFINER SQL can read or write it. Seeded with the three accounts that
--      public.is_super_admin() already recognised by email (confirmed
--      addresses only). Nothing else is migrated: see the owner report.
--   B. public.is_super_admin() reads platform_admins (it read an email
--      allow-list). Same signature, so every RLS policy and function that
--      calls it (100+ policies, storage, hse.has_org_access, the siblings in
--      PRs #535 / #537) moves with it, whatever order they are applied in.
--   C. public.users: privileged columns can no longer be written by clients.
--      Table-wide INSERT/UPDATE/DELETE revoked from anon/authenticated,
--      UPDATE granted back on the four preference columns only, plus a
--      BEFORE INSERT OR UPDATE trigger that rejects any other column change
--      from anon/authenticated (robust to later GRANT drift; SECURITY DEFINER
--      functions such as handle_new_user and enable_hse_for_organization run
--      as their owner and are unaffected). users.is_super_admin becomes a
--      read-only mirror of platform_admins, kept in sync by a trigger.
--   D. assign_app_seat / unassign_app_seat use public.is_super_admin().
--   E. view_organization_members: rows still in status 'invited' (they carry
--      the invitation token) are visible to org admins, platform admins and
--      the invited user only, not to every member.
--
-- Independent of apply order with 20260919160000/170000 (#535) and
-- 20260919180000/190000 (#537): none of them defines is_super_admin(),
-- platform_admins, or the users / view_organization_members objects touched
-- here, and every statement is idempotent (if not exists, create or replace,
-- drop ... if exists). Sorts before the held 20260919200000 PS0 seed.
--
-- ROLLBACK: tools/security/platform-admin/rollback.sql (restores the previous
-- is_super_admin body, users grants/policy and the member policy; leaves the
-- platform_admins table in place, harmless).
-- =============================================================================

begin;

-- ---- A. platform_admins -----------------------------------------------------
create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,                       -- informational, at grant time
  granted_at timestamptz not null default now(),
  granted_by text,
  note       text
);
comment on table public.platform_admins is
  'Platform (Petrolord staff) super admins. THE source of truth for public.is_super_admin() and every edge function admin check. service_role only; grant/revoke via tools/security/platform-admin/apply.sh.';

alter table public.platform_admins enable row level security;
revoke all on table public.platform_admins from public, anon, authenticated;
grant select, insert, update, delete on table public.platform_admins to service_role;

-- The owner confirmed list (2026-09-19 report). These are exactly the accounts
-- public.is_super_admin() recognised before this migration; each also has
-- users.is_super_admin = true in production. Confirmed addresses only.
insert into public.platform_admins (user_id, email, granted_by, note)
select u.id, lower(u.email), 'migration 20260919195000',
       'seeded from the previous is_super_admin() email allow-list'
  from auth.users u
 where lower(u.email) in ('info@petrolord.com', 'ayoasaolu@gmail.com', 'ayodejiasaolu1@gmail.com')
   and u.email_confirmed_at is not null
on conflict (user_id) do nothing;

do $$
begin
  if not exists (select 1 from public.platform_admins) then
    raise exception 'platform_admins is empty after the seed: refusing to lock every platform admin out';
  end if;
end $$;

-- ---- B. the helper ------------------------------------------------------------
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid());
$$;
comment on function public.is_super_admin() is
  'Platform super admin = a row in public.platform_admins (security fix 20260919195000). Never user_metadata, never users.is_super_admin.';

-- ---- C. public.users column guard -------------------------------------------
revoke insert, update, delete, truncate, references, trigger on table public.users from anon, authenticated;
revoke select on table public.users from anon;
grant update (primary_app, last_accessed_app, app_preferences, updated_at) on table public.users to authenticated;

create or replace function public.users_guard_privileged_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  -- the only columns a signed-in user may change on their own row
  v_self_editable constant text[] := array['primary_app', 'last_accessed_app', 'app_preferences', 'updated_at'];
begin
  -- Only client roles are policed. SECURITY DEFINER functions (handle_new_user,
  -- enable_hse_for_organization, ...) run as their owner; service_role is the
  -- server.
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    raise exception 'permission denied: public.users rows are created by the server'
      using errcode = '42501';
  end if;
  if (to_jsonb(new) - v_self_editable) is distinct from (to_jsonb(old) - v_self_editable) then
    raise exception 'permission denied: only % may be changed on public.users', array_to_string(v_self_editable, ', ')
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists users_guard_privileged_columns on public.users;
create trigger users_guard_privileged_columns
  before insert or update on public.users
  for each row execute function public.users_guard_privileged_columns();

drop policy if exists "Users can update their own data" on public.users;
create policy "Users can update their own data" on public.users
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- users.is_super_admin: kept (old clients select it) as a read-only MIRROR.
comment on column public.users.is_super_admin is
  'DEPRECATED mirror of public.platform_admins, maintained by trigger. NOT authority: use public.is_super_admin().';

update public.users u
   set is_super_admin = exists (select 1 from public.platform_admins pa where pa.user_id = u.id)
 where u.is_super_admin is distinct from exists (select 1 from public.platform_admins pa where pa.user_id = u.id);

create or replace function public.platform_admins_mirror()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.users u
     set is_super_admin = exists (select 1 from public.platform_admins pa where pa.user_id = u.id)
   where u.id = coalesce(new.user_id, old.user_id);
  return null;
end;
$$;
revoke all on function public.platform_admins_mirror() from public, anon, authenticated;

drop trigger if exists platform_admins_mirror on public.platform_admins;
create trigger platform_admins_mirror
  after insert or update or delete on public.platform_admins
  for each row execute function public.platform_admins_mirror();

-- ---- D. seat RPCs -------------------------------------------------------------
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
    or public.is_super_admin()   -- platform_admins; was users.is_super_admin (self-settable)
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
    or public.is_super_admin()   -- platform_admins; was users.is_super_admin (self-settable)
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

-- ---- E. invitation tokens are not for every member ---------------------------
drop policy if exists view_organization_members on public.organization_members;
create policy view_organization_members on public.organization_members
  for select
  using (
       auth.uid() = user_id
    or public.is_super_admin()
    or public.is_org_admin_of(organization_id)
    or (public.is_org_member(organization_id)
        and coalesce(lower(status), 'active') <> 'invited')
  );

commit;
