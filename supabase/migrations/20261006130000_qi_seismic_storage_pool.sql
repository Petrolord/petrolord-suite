-- =============================================================================
-- Seismic storage tiers, owner-approved 2026-10-06: pooled organisation quota,
-- the tier catalogue, and the grant from a paid quote.
-- docs/scope/QI-STATUS.md ("Q0b storage tiers: pricing and pooling")
-- -----------------------------------------------------------------------------
-- Approved tiers (USD per month): Project 250 GiB $99, Survey 1 TiB $299,
-- Basin 5 TiB $999 (offered once full-resolution volumes move to external
-- object storage), above 5 TiB quoted at $150 per TiB. Everyone keeps the
-- included 20 GiB per seismic user.
--
-- Until now the quota and the usage were both per user, so a tier gave EVERY
-- member of the organisation the full amount. From this migration a tiered
-- organisation shares one pool:
--
--   pool quota = the tier + 20 GiB for each active member
--   pool usage = everything the organisation's active members hold in the
--                seismic bucket
--
-- A user in several tiered organisations draws on the one with the largest
-- tier. A user with no active tier keeps the per-user 20 GiB and their own
-- usage, exactly as before. A tier past its active_until no longer counts:
-- uploads are refused once usage is over the 20 GiB floor, and data stays
-- readable (the approved cancellation policy: read-only, then deletion by
-- staff after 30 days; nothing here deletes data).
--
--   * seismic_storage_tiers gains tier_key, active_until, source_quote_id.
--   * seismic_storage_pool_org(uid)      service role: the pooling org or null
--   * seismic_storage_quota_bytes_for    service role: pooled quota
--   * seismic_storage_usage_bytes_for    service role: pooled usage
--   * seismic_storage_usage_bytes()      caller: pooled usage (bucket policy)
--   * seismic_storage_summary()          caller: what the storage meter shows
--   * seismic_storage_set_tier(...)      service role: grant or change a tier
--                                        from the catalogue (staff, payment)
--   * pricing_config 'seismic_storage_tiers': the catalogue, single source
--     for the quote builder, generate-quote and seismic_storage_set_tier.
--
-- The bucket's INSERT policy is unchanged: it already compares
-- seismic_storage_usage_bytes() with seismic_storage_quota_bytes(), which now
-- both answer for the pool. organization_members is read, never changed.
-- =============================================================================

alter table public.seismic_storage_tiers
    add column if not exists tier_key text,
    add column if not exists active_until timestamptz,
    add column if not exists source_quote_id uuid;

do $$ begin
  alter table public.seismic_storage_tiers
    add constraint seismic_storage_tiers_tier_key_check
    check (tier_key is null or tier_key in ('project', 'survey', 'basin', 'custom'));
exception when duplicate_object then null; end $$;

-- The catalogue. available = false: priced and approved, not yet offered in the
-- quote builder (Basin waits for external object storage).
insert into public.pricing_config (key, value) values (
  'seismic_storage_tiers',
  '{"included_gib_per_user": 20,
    "custom_price_per_tib_usd": 150,
    "tiers": [
      {"key": "project", "label": "Project", "quota_gib": 250,  "price_usd": 99,  "available": true,
       "fits": "One 120 km2 post-stack QI study"},
      {"key": "survey",  "label": "Survey",  "quota_gib": 1024, "price_usd": 299, "available": true,
       "fits": "A QI study with prestack gathers, or a regional post-stack 3D"},
      {"key": "basin",   "label": "Basin",   "quota_gib": 5120, "price_usd": 999, "available": false,
       "fits": "Several regional surveys, or prestack on a large survey"}
    ]}'::jsonb)
on conflict (key) do update set value = excluded.value;

-- The tiered organisation a user draws on, or null.
create or replace function public.seismic_storage_pool_org(p_user_id uuid)
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select t.organization_id
    from public.seismic_storage_tiers t
    join public.organization_members om on om.organization_id = t.organization_id
   where om.user_id = p_user_id
     and coalesce(lower(om.status), 'active') = 'active'
     and (t.active_until is null or t.active_until > now())
   order by t.quota_bytes desc, t.organization_id
   limit 1;
$$;
revoke all on function public.seismic_storage_pool_org(uuid) from public, anon, authenticated;
grant execute on function public.seismic_storage_pool_org(uuid) to service_role;

create or replace function public.seismic_storage_quota_bytes_for(p_user_id uuid)
returns bigint
language sql stable security definer
set search_path = ''
as $$
  with pool as (select public.seismic_storage_pool_org(p_user_id) as org)
  select case
    when pool.org is null then 21474836480::bigint                -- 20 GiB, everyone's floor
    else (select t.quota_bytes from public.seismic_storage_tiers t where t.organization_id = pool.org)
       + 21474836480::bigint * (select count(distinct om.user_id)
                                  from public.organization_members om
                                 where om.organization_id = pool.org
                                   and coalesce(lower(om.status), 'active') = 'active')
  end
  from pool;
$$;
revoke all on function public.seismic_storage_quota_bytes_for(uuid) from public, anon, authenticated;
grant execute on function public.seismic_storage_quota_bytes_for(uuid) to service_role;

create or replace function public.seismic_storage_usage_bytes_for(p_user_id uuid)
returns bigint
language sql stable security definer
set search_path = ''
as $$
  with pool as (select public.seismic_storage_pool_org(p_user_id) as org)
  select coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint
    from storage.objects o, pool
   where o.bucket_id = 'seismic'
     and (
       (pool.org is null and (storage.foldername(o.name))[1] = p_user_id::text)
       or (pool.org is not null and (storage.foldername(o.name))[1] in (
             select om.user_id::text
               from public.organization_members om
              where om.organization_id = pool.org
                and coalesce(lower(om.status), 'active') = 'active'))
     );
$$;
revoke all on function public.seismic_storage_usage_bytes_for(uuid) from public, anon, authenticated;
grant execute on function public.seismic_storage_usage_bytes_for(uuid) to service_role;

-- The caller's usage, as the bucket policy counts it. With a tier this is the
-- pool's total (an aggregate of the caller's own organisation; no per-user
-- figures leave the database).
create or replace function public.seismic_storage_usage_bytes()
returns bigint
language sql stable security definer
set search_path = ''
as $$
  select public.seismic_storage_usage_bytes_for(auth.uid());
$$;
revoke all on function public.seismic_storage_usage_bytes() from public, anon;
grant execute on function public.seismic_storage_usage_bytes() to authenticated;

-- What the storage meter shows the caller.
create or replace function public.seismic_storage_summary()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  with pool as (select public.seismic_storage_pool_org(auth.uid()) as org)
  select jsonb_build_object(
    'used_bytes',  public.seismic_storage_usage_bytes_for(auth.uid()),
    'quota_bytes', public.seismic_storage_quota_bytes_for(auth.uid()),
    'pooled',      pool.org is not null,
    'organization_id', pool.org,
    'organization_name', (select o.name from public.organizations o where o.id = pool.org),
    'tier_key',    (select t.tier_key from public.seismic_storage_tiers t where t.organization_id = pool.org),
    'tier_label',  (select t.label from public.seismic_storage_tiers t where t.organization_id = pool.org),
    'active_until', (select t.active_until from public.seismic_storage_tiers t where t.organization_id = pool.org),
    'members', (select count(distinct om.user_id) from public.organization_members om
                 where om.organization_id = pool.org and coalesce(lower(om.status), 'active') = 'active'))
  from pool;
$$;
revoke all on function public.seismic_storage_summary() from public, anon;
grant execute on function public.seismic_storage_summary() to authenticated;

-- Grant or change an organisation's tier from the catalogue. 'custom' takes an
-- explicit size (above 5 TiB, quoted). A later active_until never shortens an
-- existing one (a top-up or a second finalizer cannot cut a paid term).
create or replace function public.seismic_storage_set_tier(
  p_organization_id uuid,
  p_tier_key text,
  p_active_until timestamptz default null,
  p_source_quote_id uuid default null,
  p_custom_quota_bytes bigint default null)
returns public.seismic_storage_tiers
language plpgsql security definer
set search_path = ''
as $$
declare
  v_cat jsonb;
  v_quota bigint;
  v_label text;
  v_row public.seismic_storage_tiers;
begin
  if p_tier_key = 'custom' then
    if p_custom_quota_bytes is null or p_custom_quota_bytes <= 5497558138880 then
      raise exception 'A custom tier needs an explicit size above 5 TiB.';
    end if;
    v_quota := p_custom_quota_bytes;
    v_label := 'Custom ' || round(p_custom_quota_bytes / 1099511627776.0, 1) || ' TiB';
  else
    select t into v_cat
      from public.pricing_config c, jsonb_array_elements(c.value -> 'tiers') t
     where c.key = 'seismic_storage_tiers' and t ->> 'key' = p_tier_key;
    if v_cat is null then raise exception 'Unknown seismic storage tier: %.', p_tier_key; end if;
    v_quota := (v_cat ->> 'quota_gib')::bigint * 1073741824;
    v_label := v_cat ->> 'label';
  end if;

  insert into public.seismic_storage_tiers as s
         (organization_id, quota_bytes, label, tier_key, active_until, source_quote_id, updated_at)
  values (p_organization_id, v_quota, v_label, p_tier_key, p_active_until, p_source_quote_id, now())
  on conflict (organization_id) do update
     set quota_bytes = excluded.quota_bytes,
         label = excluded.label,
         tier_key = excluded.tier_key,
         active_until = case
           when s.active_until is null or excluded.active_until is null then excluded.active_until
           else greatest(s.active_until, excluded.active_until) end,
         source_quote_id = coalesce(excluded.source_quote_id, s.source_quote_id),
         updated_at = now()
  returning * into v_row;
  return v_row;
end $$;
revoke all on function public.seismic_storage_set_tier(uuid, text, timestamptz, uuid, bigint) from public, anon, authenticated;
grant execute on function public.seismic_storage_set_tier(uuid, text, timestamptz, uuid, bigint) to service_role;

comment on table public.seismic_storage_tiers is
  'Seismic storage tier per organization (owner-approved 2026-10-06). The organization shares one pool: the tier plus 20 GiB per active member, counted against everything its active members hold. Set by seismic_storage_set_tier (payment or staff).';
