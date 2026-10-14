-- Verify after 20261014121300 (read-only). Expect: rls_off = 1 (spatial_ref_sys only), anon_on_rls_off = 1
-- (spatial_ref_sys), anon_any_86 = 0.
select (select count(*) from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p') and not c.relrowsecurity) rls_off,
       (select count(*) from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p') and not c.relrowsecurity
          and has_table_privilege('anon', c.oid, 'SELECT')) anon_on_rls_off,
       (select count(*) from unnest(array['studio_users','payment_audit_log','portfolios','work_permits','templates','apps',
          'safety_moment_views','pm_deliverables','email_templates','badge_definitions']) t
          where has_table_privilege('anon', 'public.'||t, 'SELECT') or has_table_privilege('anon', 'public.'||t, 'INSERT')) anon_any_86;
