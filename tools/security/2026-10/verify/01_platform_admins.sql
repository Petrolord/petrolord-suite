-- Verify after 20261014121000 (read-only). Expect: admins = 3 (the three confirmed emails),
-- is_super_admin_reads_table = true, rpcs = 5, anon_accept = false, anon_lookup = true.
select (select count(*) from public.platform_admins) admins,
       (select string_agg(email, ', ' order by email) from public.platform_admins) emails,
       (select prosrc like '%platform_admins%' from pg_proc where oid = 'public.is_super_admin()'::regprocedure) is_super_admin_reads_table,
       (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in
         ('accept_invitation','get_invitation_by_token','decline_invitation','invitation_role_allowed','invitation_accept_internal')) rpcs,
       has_function_privilege('anon', 'public.accept_invitation(text)', 'EXECUTE') anon_accept,
       has_function_privilege('anon', 'public.get_invitation_by_token(text)', 'EXECUTE') anon_lookup;
