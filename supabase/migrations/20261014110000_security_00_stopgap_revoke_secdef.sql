-- =============================================================================
-- SECURITY 00 (2026-10-14): STOP-GAP. Client EXECUTE off the SECURITY DEFINER
-- functions that anyone could exploit. Tiny, standalone.
-- APPLIED 2026-10-14 by the owner (verified: tools/security/2026-10/verify/00_stopgap.sql,
-- all 8 rows anon_x=false, auth_x=false except get_users_for_organization, svc_x=true).
-- The consolidated fix (01-05, docs/security/RUNBOOK-2026-10.md) follows.
--
-- Read live 2026-10-14 (has_function_privilege, pg_get_functiondef):
--   add_user_to_organization(p_user_id, p_org_id, p_role)
--       anon + authenticated EXECUTE, no checks at all: anyone can make any
--       account OWNER of any organization. -> service_role only.
--   get_users_for_organization(org_id)
--       anon EXECUTE: any org's member e-mails and last sign-in times.
--       -> anon off (the super admin console calls it signed in; 05 adds an
--       org-admin check inside).
--   enable_hse_for_organization(p_user_id)
--       trusts p_user_id; no caller in Suite or HSE code. -> service_role only.
--   can_user_access_app, get_user_subscribed_modules, check_hse_access,
--   get_app_seat_usage_db, get_constraint_def
--       read another user's / org's entitlements or the schema for any id;
--       no caller in Suite or HSE code. -> service_role only.
--
-- Impact: the only client caller of any of these is HSE
-- inviteUserService.acceptInvitation -> add_user_to_organization. Until the
-- HSE upload in the runbook, accepting an HSE invitation shows an error at
-- the "join organization" step. A NEW invitee's account is still joined by
-- the signup trigger (handle_new_user reads the metadata), so only the
-- error message and the "existing account accepts" path are affected.
-- Pending, unexpired HSE invitations on 2026-10-14: 0 (11 pending, all
-- expired 2026-10-01). Suite Employees-page invitations do not use these
-- functions.
--
-- Idempotent. No begin/commit inside.
-- ROLLBACK (re-opens the holes):
--   grant execute on function public.add_user_to_organization(uuid, uuid, text) to anon, authenticated;
--   (same for the others: grant execute ... to anon, authenticated)
-- =============================================================================

do $$
declare f text;
begin
  -- service_role only
  foreach f in array array[
    'public.add_user_to_organization(uuid, uuid, text)',
    'public.enable_hse_for_organization(uuid)',
    'public.can_user_access_app(uuid, text)',
    'public.get_user_subscribed_modules(uuid)',
    'public.check_hse_access(uuid)',
    'public.get_app_seat_usage_db(uuid, text)',
    'public.get_constraint_def(text)'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('revoke execute on function %s from public, anon, authenticated', f);
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;

  -- signed-in only
  if to_regprocedure('public.get_users_for_organization(uuid)') is not null then
    revoke execute on function public.get_users_for_organization(uuid) from public, anon;
    grant execute on function public.get_users_for_organization(uuid) to authenticated, service_role;
  end if;
end $$;
