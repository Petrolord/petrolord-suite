-- =============================================================================
-- QI Build Programme, phase Q0b-4: seismic storage tiers per organization
-- docs/scope/QI-PLAN.md (Q0b), docs/scope/QI-STATUS.md
-- -----------------------------------------------------------------------------
-- Large surveys from NAPE engagements need more than the flat 20 GiB per user.
-- An organization can now be given a seismic storage tier; a user's quota is
-- the largest tier among the organizations they are an active member of, and
-- never below the 20 GiB everyone has today.
--
--   * seismic_storage_tiers: one row per organization (quota_bytes, label).
--     Members can read their organization's row; there are no client write
--     policies (tiers are set by Petrolord staff with the service role, from
--     the pricing decision).
--   * seismic_storage_quota_bytes_for(uid): the quota for a named user;
--     service role only (the seismic worker checks quota with it).
--   * seismic_storage_quota_bytes(): was a constant 20 GiB; now the CALLER's
--     quota. The seismic bucket's INSERT policy already calls it, so the
--     authoritative gate follows the tier with no policy change, and the
--     client's friendly pre-check reads the same figure.
--
-- The table is empty after this migration, so every quota stays 20 GiB until
-- a tier is set. organization_members is read, not changed.
-- =============================================================================

create table if not exists public.seismic_storage_tiers (
    organization_id uuid primary key references public.organizations (id) on delete cascade,
    quota_bytes     bigint not null check (quota_bytes >= 21474836480),
    label           text check (label is null or char_length(label) <= 80),
    updated_at      timestamptz not null default now(),
    updated_by      uuid
);

alter table public.seismic_storage_tiers enable row level security;

drop policy if exists "seismic_storage_tiers_select_member" on public.seismic_storage_tiers;
create policy "seismic_storage_tiers_select_member"
    on public.seismic_storage_tiers for select
    using (public.is_org_member(organization_id));

revoke all on public.seismic_storage_tiers from anon;
revoke insert, update, delete, truncate, references, trigger on public.seismic_storage_tiers from authenticated;
grant select on public.seismic_storage_tiers to authenticated;

create or replace function public.seismic_storage_quota_bytes_for(p_user_id uuid)
returns bigint
language sql stable security definer
set search_path = ''
as $$
  select greatest(
    21474836480::bigint,                                   -- 20 GiB, everyone's floor
    coalesce((
      select max(t.quota_bytes)
        from public.seismic_storage_tiers t
        join public.organization_members om on om.organization_id = t.organization_id
       where om.user_id = p_user_id
         and coalesce(lower(om.status), 'active') = 'active'), 0));
$$;
revoke all on function public.seismic_storage_quota_bytes_for(uuid) from public, anon, authenticated;
grant execute on function public.seismic_storage_quota_bytes_for(uuid) to service_role;

-- The caller's quota (was: immutable 20 GiB). Used by the seismic bucket's
-- INSERT policy and the client's pre-check; with no tiers it still returns
-- 20 GiB. A caller without a user (the service role) gets the floor; the
-- worker uses seismic_storage_quota_bytes_for(uid) instead.
create or replace function public.seismic_storage_quota_bytes()
returns bigint
language sql stable security definer
set search_path = ''
as $$
  select public.seismic_storage_quota_bytes_for(auth.uid());
$$;
grant execute on function public.seismic_storage_quota_bytes() to authenticated;

comment on table public.seismic_storage_tiers is
  'Seismic storage tier per organization (QI Q0b-4). A member''s quota is the largest tier of their organizations, never below 20 GiB. Set by Petrolord staff.';
