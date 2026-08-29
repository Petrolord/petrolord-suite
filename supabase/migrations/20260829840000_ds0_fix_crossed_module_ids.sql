-- Midstream & Downstream DS0 — fix three apps carrying the wrong module_id.
--
-- Found by the DS0 instruction to verify the live schema before seeding a
-- new module. `master_apps.module` is free text, but entitlements are
-- resolved by the `module_id` UUID: get-user-entitlements grants every app
-- whose module_id equals a purchased `module_uuid`
-- (get-user-entitlements/index.ts, "Module Purchase - Grant access to all
-- apps in this module").
--
-- Three apps carried Geoscience's UUID (f44a23a1) while sitting in another
-- module. The consequential one is FDP ACCELERATOR, which is Active and sold:
--
--   * buying Geoscience granted it, giving away a paid Economics app; and
--   * buying Economics did NOT grant it, locking out a customer who had paid
--     for the module the catalog lists it under.
--
-- The other two are Archived Drilling apps, wrong in the same way with less
-- consequence.
--
-- This corrects the data only. No app changes module, no status changes, and
-- nothing is granted that was not already meant to be granted. Safe
-- pre-deploy and idempotent: it matches on the wrong id, so a second run
-- finds nothing.

update public.master_apps
set module_id = (select id from public.modules where slug = 'economics'),
    updated_at = now()
where slug = 'fdp-accelerator'
  and module = 'Economics'
  and module_id = (select id from public.modules where slug = 'geoscience');

update public.master_apps
set module_id = (select id from public.modules where slug = 'drilling'),
    updated_at = now()
where slug in ('pore-pressure-frac-gradient', 'geo-steering-assistant')
  and module = 'Drilling'
  and module_id = (select id from public.modules where slug = 'geoscience');
