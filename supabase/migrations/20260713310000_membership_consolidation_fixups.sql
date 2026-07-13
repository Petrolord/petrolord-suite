-- ============================================================================
-- MEMBERSHIP CONSOLIDATION — second-engineer review fixups (PR #63).
-- Findings from the adversarial review of 20260713300000:
--
-- R1 (regression): the legacy "Super Admins can manage all org users" policy
--    died with organization_users, and the canonical organization_members
--    policies had no is_super_admin() arm — super admins lost cross-org
--    member visibility/management (SuperAdminConsole members tab, OrgDetail,
--    OrgTeam edit/delete showing false-success toasts, impersonation reads).
--    Fix: is_super_admin() arms on all four policies.
-- K6 (risk): update/insert policies put no constraint on the NEW row's role,
--    so any org admin could self-grant role='super_admin' (which passes every
--    generated super_admin role array and confers purge protection).
--    Fix: WITH CHECK forbids writing role='super_admin' unless the caller is
--    a platform super admin.
-- K1 (risk): handle_new_super_admin() was rewritten to overwrite role =
--    'super_admin' (legacy only set the separate user_role column) — a latent
--    booby trap since ~14 rewritten policies use role arrays without
--    'super_admin'. The function is attached to NO trigger (verified live).
--    Fix: drop it; platform super-admin-ness lives in is_super_admin() /
--    users.is_super_admin, not in membership roles.
-- ============================================================================

begin;

drop policy "view_organization_members" on public.organization_members;
create policy "view_organization_members" on public.organization_members
  as permissive for select
  to public
  using ((auth.uid() = user_id)
         or public.is_org_member(organization_id)
         or public.is_super_admin());

drop policy "insert_organization_members" on public.organization_members;
create policy "insert_organization_members" on public.organization_members
  as permissive for insert
  to public
  with check (
    (public.has_org_role(organization_id, array['admin','org_admin','owner','super_admin'])
     or public.is_super_admin())
    and (public.is_super_admin() or role <> 'super_admin')
  );

drop policy "update_organization_members" on public.organization_members;
create policy "update_organization_members" on public.organization_members
  as permissive for update
  to public
  using (public.has_org_role(organization_id, array['admin','org_admin','owner','super_admin'])
         or public.is_super_admin())
  with check (public.is_super_admin() or role <> 'super_admin');

drop policy "delete_organization_members" on public.organization_members;
create policy "delete_organization_members" on public.organization_members
  as permissive for delete
  to public
  using (public.has_org_role(organization_id, array['admin','org_admin','owner','super_admin'])
         or public.is_super_admin());

drop function if exists public.handle_new_super_admin();

commit;
