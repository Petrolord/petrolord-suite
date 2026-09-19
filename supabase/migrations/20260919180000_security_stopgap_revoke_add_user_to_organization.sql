-- =============================================================================
-- SECURITY STOP-GAP: close add_user_to_organization to clients
-- -----------------------------------------------------------------------------
-- OWNER-RUN. Shared table organization_members is affected, so a second
-- engineer reviews it, but it is one REVOKE and can go in immediately.
--
-- public.add_user_to_organization(p_user_id, p_org_id, p_role) is SECURITY
-- DEFINER, was executable by anon and authenticated, and checks nothing: any
-- caller could upsert an ACTIVE organization_members row, with any role
-- including 'owner', for any user into any organization.
--
-- Its only caller is the HSE SPA (src/services/inviteUserService.js,
-- acceptInvitation, used by /accept-invite/:token). Until the full fix
-- (20260919190000_security_invitation_acceptance.sql plus the HSE client PR)
-- ships, this revoke BREAKS HSE invitation acceptance:
--   * signed-in existing user clicking "Join Team Now": fails with
--     "Failed to join organization: permission denied" and does not join;
--   * new user "Create Account & Join": the account IS created and the
--     signup trigger still joins the org from the signup metadata, but the
--     page then reports "Setup Failed" (the follow-up RPC is refused) and
--     the invitation stays 'pending'.
-- Nothing else calls it: the Suite invite flow (invite-employee /
-- accept-employee-invitation) is service-role and never used it. Live data at
-- 2026-09-19: 0 pending invitations in public.invitations (1 row, accepted).
--
-- This does NOT close the other two doors the full fix closes: signup
-- metadata organization_id/role trusted by handle_new_user, and the
-- unauthenticated hse-invite-user edge function.
--
-- Idempotent, and a no-op if the function has already been dropped.
-- =============================================================================
do $$
begin
  if to_regprocedure('public.add_user_to_organization(uuid, uuid, text)') is not null then
    revoke execute on function public.add_user_to_organization(uuid, uuid, text) from public, anon, authenticated;
    grant execute on function public.add_user_to_organization(uuid, uuid, text) to service_role;
  end if;
end $$;
