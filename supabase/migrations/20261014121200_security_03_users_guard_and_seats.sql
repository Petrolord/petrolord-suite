-- =============================================================================
-- SECURITY 03 of 05 (2026-10): public.users privileged columns, seat RPCs,
-- invitation tokens in organization_members.
-- Needs 01 (platform_admins, is_super_admin() from the table).
-- APPLY AFTER the edge function deploys in RUNBOOK step 2 (those functions
-- stop reading users.is_super_admin / user_metadata). Runbook:
-- docs/security/RUNBOOK-2026-10.md. Supersedes PR #538 20260919195000
-- sections C, D, E, re-verified against production 2026-10-14:
--   * "Users can update their own data" is still UPDATE USING (auth.uid() = id)
--     with no column guard; anon and authenticated hold table-wide UPDATE, so
--     any signed-in user can set is_super_admin, organization_id or
--     subscribed_modules (the HSE premium gate) on their own row;
--   * assign_app_seat / unassign_app_seat still read users.is_super_admin;
--   * view_organization_members still shows 'invited' rows, with their
--     invitation_token, to every member of the org.
-- No client code writes public.users today (Suite and HSE main, 2026-10-14:
-- selects only), so the guard breaks nothing.
--
--   C. users: client INSERT/UPDATE/DELETE revoked; UPDATE granted back on the
--      four preference columns; a BEFORE trigger refuses any other column
--      change by anon/authenticated (SECURITY DEFINER functions run as their
--      owner and are unaffected). users.is_super_admin becomes a mirror of
--      platform_admins kept in sync by trigger.
--   D. assign_app_seat / unassign_app_seat use public.is_super_admin().
--   E. 'invited' organization_members rows (they carry the token) are visible
--      to org admins, platform admins and the invited user only.
--
-- Idempotent. No begin/commit inside.
-- ROLLBACK: docs/security/RUNBOOK-2026-10.md step R3.
-- =============================================================================

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

