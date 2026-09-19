-- ROLLBACK for 20260919195000_security_platform_admin_source.sql.
-- OWNER-RUN ONLY, and only if the fix breaks something that cannot wait:
-- it REOPENS the holes (self-set users.is_super_admin, self-set
-- subscribed_modules, seat RPCs trusting the users flag, invitation tokens
-- visible to every member). Restores the exact pre-migration definitions,
-- taken from production with pg_get_functiondef on 2026-09-19. Leaves the
-- platform_admins table in place (unused by anything after this rollback;
-- the edge functions from this PR still read it, so roll THEM back too, or
-- keep the table populated).
begin;

drop trigger if exists platform_admins_mirror on public.platform_admins;
drop function if exists public.platform_admins_mirror();

drop trigger if exists users_guard_privileged_columns on public.users;
drop function if exists public.users_guard_privileged_columns();
grant select, insert, update, delete, truncate, references, trigger on table public.users to anon, authenticated;
drop policy if exists "Users can update their own data" on public.users;
create policy "Users can update their own data" on public.users for update using (auth.uid() = id);
comment on column public.users.is_super_admin is null;

drop policy if exists view_organization_members on public.organization_members;
create policy view_organization_members on public.organization_members for select
  using ((auth.uid() = user_id) or is_org_member(organization_id) or is_super_admin());

-- live is_super_admin() before the fix
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
$function$
;

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
$function$
;

commit;
