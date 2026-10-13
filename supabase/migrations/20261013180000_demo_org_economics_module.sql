-- Demo org licences: the Economics module (2026-10-13; owner-approved, for
-- the Petroleum Economics Studio demo videos and lessons).
--
-- The "Petrolord Demo" org holds Geoscience, Reservoir and Drilling
-- (20261008090000, 20261008120000, 20261008140000, 20261013120000). This
-- grants Economics in the same shape as a real full-module purchase, as
-- 20261013120000 did for Drilling:
--   1. one module row: module_name = slug, active, 5 seats, expiry
--      2099-12-31, no auto-renew, no quote;
--   2. one active row per built, Active Economics app, same terms;
--   3. a seat on each of those apps for demo@petrolord.com.
-- No structure change. Idempotent (an existing module row, app row or seat
-- is skipped). Refuses if the demo account, the Economics module or
-- Petroleum Economics Studio (catalogue slug epe-suite) is missing.

do $$
declare
  v_user uuid;
  v_org uuid;
  v_mod record;
begin
  select u.id, om.organization_id into v_user, v_org
    from auth.users u
    join public.organization_members om on om.user_id = u.id and coalesce(om.status, 'active') = 'active'
   where lower(u.email) = 'demo@petrolord.com'
   limit 1;
  if v_org is null then
    raise exception 'demo@petrolord.com has no active organization membership.';
  end if;

  select id, slug into v_mod from public.modules where slug = 'economics';
  if v_mod.id is null then
    raise exception 'No module with slug economics.';
  end if;
  if not exists (select 1 from public.master_apps
                  where slug = 'epe-suite' and module_id = v_mod.id and status = 'Active' and is_built) then
    raise exception 'Petroleum Economics Studio (slug epe-suite) is not a built, Active app in the Economics module.';
  end if;

  if not exists (select 1 from public.purchased_modules
                  where organization_id = v_org and module_uuid = v_mod.id and app_uuid is null and status = 'active') then
    insert into public.purchased_modules
      (organization_id, module_id, module_uuid, module_name, status, subscription_status,
       seats_allocated, auto_renew, expiry_date)
    values
      (v_org, v_mod.id, v_mod.id, v_mod.slug, 'active', 'active', 5, false, '2099-12-31T00:00:00Z');
  end if;

  insert into public.purchased_modules
    (organization_id, app_id, app_uuid, module_id, module_uuid, module_name,
     seats_allocated, status, subscription_status, auto_renew, expiry_date)
  select v_org, a.id::text, a.id, v_mod.id::text, v_mod.id, v_mod.slug,
         5, 'active', 'active', false, '2099-12-31T00:00:00Z'
    from public.master_apps a
   where a.module_id = v_mod.id and a.status = 'Active' and a.is_built
     and not exists (select 1 from public.purchased_modules x where x.organization_id = v_org and x.app_id = a.id::text);

  insert into public.app_seat_assignments (organization_id, app_id, user_id, seat_number, assigned_by, is_admin_seat)
  select v_org, a.id::text, v_user, 1, v_user, true
    from public.master_apps a
   where a.module_id = v_mod.id and a.status = 'Active' and a.is_built
     and not exists (select 1 from public.app_seat_assignments s where s.organization_id = v_org and s.app_id = a.id::text and s.user_id = v_user)
     and not exists (select 1 from public.app_seat_assignments s where s.organization_id = v_org and s.app_id = a.id::text and s.seat_number = 1);
end $$;
