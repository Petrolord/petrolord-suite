-- Verify after 20261014110000 (read-only). Expect every row anon_x=false; auth_x=false except get_users_for_organization (true); svc_x=true.
select p.oid::regprocedure fn,
       has_function_privilege('anon', p.oid, 'EXECUTE') anon_x,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') auth_x,
       has_function_privilege('service_role', p.oid, 'EXECUTE') svc_x
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('add_user_to_organization','enable_hse_for_organization','can_user_access_app',
                     'get_user_subscribed_modules','check_hse_access','get_app_seat_usage_db',
                     'get_constraint_def','get_users_for_organization')
 order by 1;
