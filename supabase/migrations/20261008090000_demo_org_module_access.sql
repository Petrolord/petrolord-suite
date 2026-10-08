-- Demo org licences for the AI-narrated demo videos (2026-10-08;
-- owner-approved demo account, plan "AI-narrated demo videos").
--
-- NOT APPLIED. File only; the owner applies it.
--
-- The "Petrolord Demo" org was created through the normal Signup page by
-- demo@petrolord.com. This grants it the Geoscience module (Petrophysics
-- Studio and the rest) and the Reservoir module (ReservoirCalc Pro picks up
-- the published Petrophysics zone in video 3), as two module-level
-- purchased_modules rows: active, no expiry, no auto-renew, no quote. This is
-- the same row shape a paid module purchase writes; get-user-entitlements
-- grants every app in a module row's module.
--
-- Why not organizations.is_internal: that changes a shared table (second
-- engineer rule) and would also keep the org out of offboarding for good.
--
-- No table structure changes. The org is found from the demo user's active
-- membership, not a typed id. Idempotent: a module already granted is
-- skipped. Refuses if the demo user or its org is missing.
--
-- Note: admin_purge_test_orgs (manual, dry-run by default, not scheduled)
-- would list this org after 60 days without a sign-in. The recordings sign
-- in on every take; anyone running that purge should leave "Petrolord Demo"
-- out.

do $$
declare
  v_org uuid;
  m record;
begin
  select om.organization_id into v_org
    from auth.users u
    join public.organization_members om on om.user_id = u.id and coalesce(om.status, 'active') = 'active'
   where lower(u.email) = 'demo@petrolord.com'
   limit 1;
  if v_org is null then
    raise exception 'demo@petrolord.com has no active organization membership; sign the demo account up first.';
  end if;

  for m in select id, name from public.modules where slug in ('geoscience', 'reservoir') loop
    if exists (select 1 from public.purchased_modules
                where organization_id = v_org and module_uuid = m.id and app_uuid is null and status = 'active') then
      continue;
    end if;
    insert into public.purchased_modules
      (organization_id, module_id, module_uuid, module_name, status, subscription_status,
       seats_allocated, auto_renew, expiry_date)
    values
      (v_org, m.id, m.id, m.name, 'active', 'active', 5, false, null);
  end loop;

  if (select count(*) from public.purchased_modules
       where organization_id = v_org and app_uuid is null and status = 'active'
         and module_uuid in (select id from public.modules where slug in ('geoscience', 'reservoir'))) < 2 then
    raise exception 'Expected the Geoscience and Reservoir modules to be granted to the demo org.';
  end if;
end $$;
