-- Integration & Risking G5.2 (docs/scope/IntegrationRisking-PLAN.md,
-- approved 2026-07-13).
--
-- rcp_prospects — ReservoirCalc Pro's app-private prospect inventory:
-- geologic risk factors, a snapshot of the volumetric inputs / MC
-- result, and the risked outputs. Small jsonb, owner-only in every
-- direction (the petro_projects pattern). Not a shared registry — a
-- prospect is one user's risking workspace; the VOLUMES it references
-- come from the shared registries (geo_wells_zones / geo_surfaces), but
-- the risk assessment itself is private.

create table if not exists public.rcp_prospects (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid not null references auth.users (id) on delete cascade,
    name         text not null,
    pg_factors   jsonb not null default '{}'::jsonb,   -- {trap,reservoir,charge,seal,other}
    inputs       jsonb not null default '{}'::jsonb,   -- volumetric input snapshot + geo refs
    risked       jsonb not null default '{}'::jsonb,   -- {pg, risked_mean, success p90/p50/p10}
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

comment on table public.rcp_prospects is
    'ReservoirCalc Pro prospect inventory (Integration & Risking G5): Pg factors, volumetric input snapshot, risked outputs. Owner-only.';

create index if not exists rcp_prospects_user_id_idx
    on public.rcp_prospects (user_id, updated_at desc);

alter table public.rcp_prospects enable row level security;

drop policy if exists "rcp_prospects_select_own" on public.rcp_prospects;
create policy "rcp_prospects_select_own"
    on public.rcp_prospects for select
    using (auth.uid() = user_id);

drop policy if exists "rcp_prospects_insert_own" on public.rcp_prospects;
create policy "rcp_prospects_insert_own"
    on public.rcp_prospects for insert
    with check (auth.uid() = user_id);

drop policy if exists "rcp_prospects_update_own" on public.rcp_prospects;
create policy "rcp_prospects_update_own"
    on public.rcp_prospects for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "rcp_prospects_delete_own" on public.rcp_prospects;
create policy "rcp_prospects_delete_own"
    on public.rcp_prospects for delete
    using (auth.uid() = user_id);
