-- Demo org licences: module_name is the module slug (2026-10-08).
--
-- NOT APPLIED. File only; the owner applies it.
--
-- 20261008090000 wrote module_name from modules.name ("Geoscience &
-- Analytics", "Reservoir Management"). Purchases write the module SLUG
-- there (manual_verify_quote: module_name = v_module_slug), and the module
-- hub guard (usePurchasedModules / AppRoute) matches the hub route
-- ("geoscience", "reservoir") against it. With the display names the demo
-- org could open the apps but not the Geoscience and Reservoir hub pages.
--
-- Updates the demo org's two module rows only. Idempotent. No structure
-- change.

update public.purchased_modules pm
   set module_name = m.slug
  from public.modules m
 where pm.module_uuid = m.id
   and pm.app_uuid is null
   and m.slug in ('geoscience', 'reservoir')
   and pm.module_name is distinct from m.slug
   and pm.organization_id = (
     select om.organization_id
       from auth.users u
       join public.organization_members om on om.user_id = u.id and coalesce(om.status, 'active') = 'active'
      where lower(u.email) = 'demo@petrolord.com'
      limit 1
   );
