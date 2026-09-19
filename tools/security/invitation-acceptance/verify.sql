-- Read-only state report for the invitation-acceptance security fix, as ONE
-- result set (the Supabase CLI prints only the last one). Prints no row
-- contents: flags, counts and policy names only.
--   live today:        add_user_to_organization anon/auth true, 'Public can ...'
--                      policies, trigger_validates false
--   after stop-gap:    add_user_to_organization anon=false auth=false
--   after the fix:     every row shows ok = true
with fns(f, want) as (values
  ('public.add_user_to_organization(uuid,uuid,text)',        'anon=f auth=f service=t'),
  ('public.accept_invitation(text)',                         'anon=f auth=t service=t'),
  ('public.get_invitation_by_token(text)',                   'anon=t auth=t service=t'),
  ('public.decline_invitation(text)',                        'anon=t auth=t service=t'),
  ('public.invitation_accept_internal(text,uuid,text,text)', 'anon=f auth=f service=f'),
  ('public.invitation_role_allowed(uuid,text)',              'anon=f auth=t service=t'),
  ('public.enable_hse_for_organization(uuid)',               'anon=f auth=t service=t')
), fn_state as (
  select f, want,
         case when to_regprocedure(f) is null then 'absent'
              else 'anon=' || left(has_function_privilege('anon', f, 'execute')::text, 1)
                || ' auth=' || left(has_function_privilege('authenticated', f, 'execute')::text, 1)
                || ' service=' || left(has_function_privilege('service_role', f, 'execute')::text, 1)
         end as got
  from fns
), rows(ord, check_name, got, want) as (
  select 1, 'fn ' || f, got, want from fn_state
  union all
  select 2, 'invitations policies',
         coalesce((select string_agg(policyname || '/' || cmd || '/' || roles::text, ', ' order by policyname)
                     from pg_policies where schemaname = 'public' and tablename = 'invitations'), 'none'),
         'invitations_admin_delete/DELETE/{authenticated}, invitations_admin_insert/INSERT/{authenticated}, invitations_admin_select/SELECT/{authenticated}, invitations_admin_update/UPDATE/{authenticated}'
  union all
  select 3, 'invitations USING/CHECK (true) policies',
         (select count(*)::text from pg_policies where schemaname = 'public' and tablename = 'invitations'
            and (qual = 'true' or with_check = 'true')), '0'
  union all
  select 4, 'anon table privileges on invitations',
         (select count(*)::text from information_schema.role_table_grants
           where table_schema = 'public' and table_name = 'invitations' and grantee = 'anon'), '0'
  union all
  select 5, 'invitations_token_key unique index',
         (exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'invitations'
                   and indexname = 'invitations_token_key'))::text, 'true'
  union all
  select 6, 'invitations.invited_by default',
         coalesce((select column_default from information_schema.columns where table_schema = 'public'
                     and table_name = 'invitations' and column_name = 'invited_by'), 'none'), 'auth.uid()'
  union all
  select 7, 'handle_new_user validates invitations',
         (position('invitation_accept_internal' in pg_get_functiondef('public.handle_new_user()'::regprocedure)) > 0)::text, 'true'
  union all
  select 8, 'enable_hse_for_organization uses auth.uid()',
         (position('auth.uid()' in pg_get_functiondef('public.enable_hse_for_organization(uuid)'::regprocedure)) > 0)::text, 'true'
  union all
  select 9, 'LIVE invitations total / pending / pending+unexpired',
         (select count(*) || ' / ' || count(*) filter (where status = 'pending') || ' / '
                 || count(*) filter (where status = 'pending' and expires_at > now()) from public.invitations),
         'info'
  union all
  select 10, 'LIVE Suite invited members total / unexpired',
         (select count(*) || ' / ' || count(*) filter (where invitation_token is not null and invitation_expires_at > now())
            from public.organization_members where lower(status) = 'invited'),
         'info'
)
select check_name, got, want, case when want = 'info' then null else got = want end as ok
from rows order by ord, check_name;
