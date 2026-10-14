-- Verify after 20261014121400 (read-only). Expect: user_role_policies = 0, true_write_policies = 0 (writes
-- with USING/CHECK true on tenant tables), recursive_fixed = true, get_users_checks = true, storage_open = 0.
select (select count(*) from pg_policies where schemaname='public'
          and (coalesce(qual,'') like '%user_role%' or coalesce(with_check,'') like '%user_role%')) user_role_policies,
       (select count(*) from pg_policies where schemaname='public' and cmd in ('INSERT','UPDATE','DELETE','ALL')
          and tablename not in ('event_leads','nextgen_registrations','demo_requests')
          and (coalesce(qual,'') = 'true' or coalesce(with_check,'') = 'true')
          and roles::text not like '%service_role%') true_write_policies,
       (select count(*) = 0 from pg_policies where schemaname='public' and tablename='petrophysics_team_members'
          and qual like '%FROM petrophysics_team_members%') recursive_fixed,
       (select prosrc like '%is_org_admin_of%' from pg_proc where oid='public.get_users_for_organization(uuid)'::regprocedure) get_users_checks,
       (select count(*) from pg_policies where schemaname='storage' and policyname in
          ('Allow authenticated users to manage billing docs','Public Access to Quotes','Auth Users Upload Quotes',
           'Public Access to Org Assets','Admins View Proofs')) storage_open;
