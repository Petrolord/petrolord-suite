-- QI round 3 (2026-10-15): a link import that the link's server answers by
-- byte ranges registers the link (qi_datasets.meta.link) and stores no
-- object, so it must not count against the user's raw-store allowance.
-- Same signature, grants and security as 20261005130000_qi_datasets.sql;
-- only rows without meta.link are summed. Idempotent; no begin/commit.
create or replace function public.qi_user_storage_bytes(p_user_id uuid)
returns bigint
language sql stable security definer
set search_path = public
as $$
  select coalesce(sum(bytes), 0)::bigint from public.qi_datasets
   where user_id = p_user_id and status in ('uploading', 'uploaded')
     and not (meta ? 'link');
$$;
revoke all on function public.qi_user_storage_bytes(uuid) from public, anon, authenticated;
grant execute on function public.qi_user_storage_bytes(uuid) to service_role;
