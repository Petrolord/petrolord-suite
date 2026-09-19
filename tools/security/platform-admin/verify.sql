-- READ-ONLY state report for the platform-admin fix (apply.sh verify; the
-- script wraps it in begin/rollback). Works before and after the migration.
-- ONE result row (supabase db query shows only the last result set).
-- Prints flags, counts and the platform admin list (Petrolord staff emails,
-- for the owner to confirm); no customer row contents.
with pa as (
  select to_regclass('public.platform_admins') is not null as present
)
select
  (select present from pa) as platform_admins_table,
  case when (select present from pa)
       then (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.platform_admins', false, true, '')))[1]::text::int
  end as platform_admins_rows,
  (select count(*) from public.users where is_super_admin) as users_flag_true,
  (select p.prosrc ilike '%platform_admins%' from pg_proc p where p.oid = 'public.is_super_admin()'::regprocedure) as helper_reads_platform_admins,
  has_table_privilege('authenticated', 'public.users', 'UPDATE') as auth_users_table_update,
  has_column_privilege('authenticated', 'public.users', 'is_super_admin', 'UPDATE') as auth_update_is_super_admin,
  has_column_privilege('authenticated', 'public.users', 'subscribed_modules', 'UPDATE') as auth_update_subscribed_modules,
  has_column_privilege('authenticated', 'public.users', 'primary_app', 'UPDATE') as auth_update_primary_app,
  has_table_privilege('anon', 'public.users', 'SELECT') as anon_select_users,
  exists (select 1 from pg_trigger where tgrelid = 'public.users'::regclass and tgname = 'users_guard_privileged_columns') as users_guard_trigger,
  (select with_check is not null from pg_policies where schemaname = 'public' and tablename = 'users' and policyname = 'Users can update their own data') as users_update_with_check,
  (select p.prosrc not ilike '%u.is_super_admin%' from pg_proc p where p.oid = 'public.assign_app_seat(uuid,text,uuid)'::regprocedure) as assign_seat_uses_helper,
  (select p.prosrc not ilike '%u.is_super_admin%' from pg_proc p where p.oid = 'public.unassign_app_seat(uuid,text,uuid)'::regprocedure) as unassign_seat_uses_helper,
  (select qual ilike '%invited%' from pg_policies where schemaname = 'public' and tablename = 'organization_members' and policyname = 'view_organization_members') as member_policy_hides_invited,
  -- Who is a platform admin (after the migration), for the owner to confirm.
  -- query_to_xml keeps this runnable before the table exists.
  case when to_regclass('public.platform_admins') is null then '(platform_admins not present yet)'
  else array_to_string(xpath('//e/text()', query_to_xml(
    $q$select pa.email || case when u.email_confirmed_at is null then ' (UNCONFIRMED)' else '' end
             || ', last sign-in ' || coalesce(u.last_sign_in_at::date::text, 'never') as e
         from public.platform_admins pa join auth.users u on u.id = pa.user_id order by pa.email$q$,
    false, false, ''))::text[], '; ')
  end as platform_admins;
