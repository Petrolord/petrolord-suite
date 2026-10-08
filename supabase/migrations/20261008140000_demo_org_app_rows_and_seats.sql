-- Demo org licences: the shape of a real full-module purchase (2026-10-08).
--
-- NOT APPLIED. File only; the owner applies it.
--
-- 20261008090000 gave the "Petrolord Demo" org module-level rows only. A real
-- purchase (manual_verify_quote) writes one row per app plus the module row,
-- and the admin assigns seats per app (Seat Management lists app rows only).
-- With module rows alone the apps opened (get-user-entitlements grants every
-- app in a module row) but every tile on the Geoscience and Reservoir hubs
-- showed "Locked" (the hub reads per-user seats), and seats could not be
-- assigned. Some checks (master_apps RLS) also treat a NULL expiry as lapsed.
--
-- For the demo org only:
--   1. the two module rows get expiry 2099-12-31 (no NULL);
--   2. one active row per built, Active app in Geoscience and Reservoir,
--      5 seats, expiry 2099-12-31, no auto-renew, no quote;
--   3. a seat on each of those apps for demo@petrolord.com.
-- No structure change. Idempotent (unique (org, app_id) and
-- (org, app_id, seat_number) respected with NOT EXISTS).

do $$
declare
  v_user uuid;
  v_org uuid;
begin
  select u.id, om.organization_id into v_user, v_org
    from auth.users u
    join public.organization_members om on om.user_id = u.id and coalesce(om.status, 'active') = 'active'
   where lower(u.email) = 'demo@petrolord.com'
   limit 1;
  if v_org is null then
    raise exception 'demo@petrolord.com has no active organization membership.';
  end if;

  update public.purchased_modules pm
     set expiry_date = '2099-12-31T00:00:00Z'
    from public.modules m
   where pm.organization_id = v_org and pm.app_uuid is null and pm.module_uuid = m.id
     and m.slug in ('geoscience', 'reservoir');

  insert into public.purchased_modules
    (organization_id, app_id, app_uuid, module_id, module_uuid, module_name,
     seats_allocated, status, subscription_status, auto_renew, expiry_date)
  select v_org, a.id::text, a.id, m.id::text, m.id, m.slug,
         5, 'active', 'active', false, '2099-12-31T00:00:00Z'
    from public.master_apps a
    join public.modules m on m.id = a.module_id
   where m.slug in ('geoscience', 'reservoir')
     and a.status = 'Active' and a.is_built
     and not exists (select 1 from public.purchased_modules x where x.organization_id = v_org and x.app_id = a.id::text);

  insert into public.app_seat_assignments (organization_id, app_id, user_id, seat_number, assigned_by, is_admin_seat)
  select v_org, a.id::text, v_user, 1, v_user, true
    from public.master_apps a
    join public.modules m on m.id = a.module_id
   where m.slug in ('geoscience', 'reservoir')
     and a.status = 'Active' and a.is_built
     and not exists (select 1 from public.app_seat_assignments s where s.organization_id = v_org and s.app_id = a.id::text and s.user_id = v_user)
     and not exists (select 1 from public.app_seat_assignments s where s.organization_id = v_org and s.app_id = a.id::text and s.seat_number = 1);
end $$;
