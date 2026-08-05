-- Promo code management UI: platform super admins manage suite_promo_codes
-- from /admin/promo-codes with the normal client, so they need RLS policies
-- (the table was created service-role only). is_super_admin() is the existing
-- helper (email allow-list) already arming the organization_members policies.
-- Customers still cannot touch the table: no other policies exist.

drop policy if exists suite_promo_codes_super_admin_all on public.suite_promo_codes;
create policy suite_promo_codes_super_admin_all on public.suite_promo_codes
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());
