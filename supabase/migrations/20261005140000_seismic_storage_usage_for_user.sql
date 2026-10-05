-- =============================================================================
-- QI Build Programme, phase Q0: seismic storage usage for a named user
-- docs/scope/QI-PLAN.md (locked decision 3), docs/scope/QI-STATUS.md
-- -----------------------------------------------------------------------------
-- The seismic bucket's INSERT policy enforces the per-user quota with
-- seismic_storage_usage_bytes(), which reads the CALLER's folder through
-- auth.uid(). The seismic worker writes with the service role, which bypasses
-- that policy and has no auth.uid(), so it must check the quota itself before
-- it uploads a converted volume. This function returns the same figure for a
-- given user. Service role only: it would otherwise let any signed-in user
-- read another user's usage.
--
-- Read-only over storage.objects; no table, policy or shared object changes.
-- =============================================================================

create or replace function public.seismic_storage_usage_bytes_for(p_user_id uuid)
returns bigint
language sql stable security definer
set search_path = ''
as $$
  select coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint
    from storage.objects o
   where o.bucket_id = 'seismic'
     and (storage.foldername(o.name))[1] = p_user_id::text;
$$;

revoke all on function public.seismic_storage_usage_bytes_for(uuid) from public, anon, authenticated;
grant execute on function public.seismic_storage_usage_bytes_for(uuid) to service_role;

comment on function public.seismic_storage_usage_bytes_for(uuid) is
  'Bytes a user holds in the seismic bucket (same rule as seismic_storage_usage_bytes, for a named user). Service role only; the seismic worker checks the quota with it.';
