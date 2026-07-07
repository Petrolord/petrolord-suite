-- =============================================================================
-- Per-app seat assignment RPCs: assign_app_seat / unassign_app_seat
-- -----------------------------------------------------------------------------
-- Model (per-app seats):
--   * The CAP for an app lives in purchased_modules.seats_allocated (the app-level
--     row, app_id set, status='active'), written by manual_verify_quote from the
--     quote's per-app seat count.
--   * app_seat_assignments.user_id is NOT NULL, so seats are NOT pre-created. A row
--     exists only when a seat is actually assigned to a member. "Seats used" =
--     count(rows for org+app); assign = insert, unassign = delete. (Matches how
--     ModuleAccess.jsx and usePurchasedModules.js already read the table.)
--
-- These are SECURITY DEFINER so they can enforce guards the table's RLS can't:
--   * caller must be an org admin (any of organization_users/organization_members/
--     org_members with owner/admin/org_admin/super_admin) or a super-admin, OR a
--     server-side/service_role call (auth.uid() is null);
--   * the target user must be a member of the org;
--   * the app must be purchased & active for the org;
--   * the per-app cap (seats_allocated; NULL = unlimited) must not be exceeded.
-- Idempotent: assigning an already-seated user is a success no-op.
-- Returns JSONB { status: 'success'|'error', ... }.
-- =============================================================================

create or replace function public.assign_app_seat(
  p_organization_id uuid,
  p_app_id          text,
  p_user_id         uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
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
    or exists (select 1 from public.organization_users ou
                where ou.user_id = v_caller and ou.organization_id = p_organization_id
                  and coalesce(ou.user_role, ou.role) = any (array['owner','admin','org_admin','super_admin']))
    or exists (select 1 from public.organization_members om
                where om.user_id = v_caller and om.organization_id = p_organization_id
                  and om.role = any (array['owner','admin','org_admin','super_admin']))
    or exists (select 1 from public.org_members gm
                where gm.user_id = v_caller and gm.org_id = p_organization_id
                  and gm.role = any (array['owner','admin','org_admin','super_admin']));

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

  -- 3. Target must be a member of the org (any role, any linking table).
  if not exists (
        select 1 from public.organization_members where organization_id = p_organization_id and user_id = p_user_id
        union all
        select 1 from public.organization_users   where organization_id = p_organization_id and user_id = p_user_id
        union all
        select 1 from public.org_members          where org_id = p_organization_id and user_id = p_user_id
        union all
        select 1 from public.users                where organization_id = p_organization_id and id = p_user_id
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
$$;

create or replace function public.unassign_app_seat(
  p_organization_id uuid,
  p_app_id          text,
  p_user_id         uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller   uuid := auth.uid();
  v_is_admin boolean;
  v_removed  integer;
begin
  v_is_admin :=
       v_caller is null
    or exists (select 1 from public.users u
                where u.id = v_caller and u.is_super_admin is true)
    or exists (select 1 from public.organization_users ou
                where ou.user_id = v_caller and ou.organization_id = p_organization_id
                  and coalesce(ou.user_role, ou.role) = any (array['owner','admin','org_admin','super_admin']))
    or exists (select 1 from public.organization_members om
                where om.user_id = v_caller and om.organization_id = p_organization_id
                  and om.role = any (array['owner','admin','org_admin','super_admin']))
    or exists (select 1 from public.org_members gm
                where gm.user_id = v_caller and gm.org_id = p_organization_id
                  and gm.role = any (array['owner','admin','org_admin','super_admin']));

  if not v_is_admin then
    return jsonb_build_object('status','error','reason','not_authorized');
  end if;

  delete from public.app_seat_assignments
   where organization_id = p_organization_id and app_id = p_app_id and user_id = p_user_id;
  get diagnostics v_removed = row_count;

  return jsonb_build_object('status','success','removed', v_removed);
end;
$$;

alter function public.assign_app_seat(uuid, text, uuid)   owner to postgres;
alter function public.unassign_app_seat(uuid, text, uuid) owner to postgres;

revoke all on function public.assign_app_seat(uuid, text, uuid)   from public, anon;
revoke all on function public.unassign_app_seat(uuid, text, uuid) from public, anon;
grant execute on function public.assign_app_seat(uuid, text, uuid)   to authenticated, service_role;
grant execute on function public.unassign_app_seat(uuid, text, uuid) to authenticated, service_role;

comment on function public.assign_app_seat(uuid, text, uuid) is
  'Assigns an org member to a seat in a purchased app. Admin/service only; enforces membership + per-app cap (purchased_modules.seats_allocated). Idempotent.';
comment on function public.unassign_app_seat(uuid, text, uuid) is
  'Removes a member from a seat in an app. Admin/service only. Frees one seat.';
