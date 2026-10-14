-- Verify after 20261014120100 (read-only). Expect: add_user_clients = false, open_invite_policies = 0,
-- anon_invitations = false, trigger_needs_token = true, invite_policies = 4.
select (has_function_privilege('anon', 'public.add_user_to_organization(uuid,uuid,text)', 'EXECUTE')
        or has_function_privilege('authenticated', 'public.add_user_to_organization(uuid,uuid,text)', 'EXECUTE')) add_user_clients,
       (select count(*) from pg_policies where schemaname='public' and tablename='invitations'
         and (qual = 'true' or policyname in ('Public can view invitations','Public can update invitation by token','Users can update own invitations'))) open_invite_policies,
       has_table_privilege('anon', 'public.invitations', 'SELECT') anon_invitations,
       (select prosrc like '%invitation_accept_internal%' from pg_proc where oid = 'public.handle_new_user()'::regprocedure) trigger_needs_token,
       (select count(*) from pg_policies where schemaname='public' and tablename='invitations') invite_policies;
