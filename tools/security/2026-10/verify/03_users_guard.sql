-- Verify after 20261014120200 (read-only). Expect: guard_trigger = 1, auth_update_is_super_admin = false,
-- auth_update_app_preferences = true, mirror_ok = true (exactly the platform_admins have the flag),
-- seats_use_helper = 2.
select (select count(*) from pg_trigger where tgname = 'users_guard_privileged_columns') guard_trigger,
       has_column_privilege('authenticated', 'public.users', 'is_super_admin', 'UPDATE') auth_update_is_super_admin,
       has_column_privilege('authenticated', 'public.users', 'app_preferences', 'UPDATE') auth_update_app_preferences,
       not exists (select 1 from public.users u where u.is_super_admin is distinct from
                   exists (select 1 from public.platform_admins pa where pa.user_id = u.id)) mirror_ok,
       (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('assign_app_seat','unassign_app_seat')
          and prosrc like '%public.is_super_admin()%') seats_use_helper;
