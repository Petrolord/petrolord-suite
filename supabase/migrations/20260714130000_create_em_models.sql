-- Earth Modeling G8.3 (docs/scope/EarthModeling-PLAN.md, decision 2).
--
-- em_models — Earth Modeling's app-private model DEFINITIONS: the
-- ordered geo_surfaces stack, tie-top names, zone table (registry-zone
-- mapping), fault polygons (world-XY vertex rings — no shared fault
-- registry exists yet, plan decision 1), population methods and
-- variogram parameters. Small jsonb; grids are deterministic outputs
-- recomputed on load, never blobbed. Owner-only in every direction
-- (the rp_projects / petro_projects pattern). Surface ids reference
-- geo_surfaces but surface visibility is always re-checked through
-- geo_surfaces RLS at read time.
--
-- Named em_models (not em_projects) because the live DB carries a
-- LEGACY ORPHAN FAMILY from the pre-G8 EarthModelStudio/
-- SubsurfaceStudio era — 15 em_* and 11 ss_* tables with no repo
-- migrations (all em_* empty; ss_projects/ss_assets/ss_jobs hold a few
-- stale demo rows). Those drops are owner-gated cleanup (the bf_*
-- pattern), tracked in EarthModeling-STATUS.md; this migration does
-- not touch them.

create table if not exists public.em_models (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid not null references auth.users (id) on delete cascade,
    name         text not null,
    definition   jsonb not null default '{}'::jsonb,  -- surfaceIds, topNames, zones, faultPolygons, methods, krige
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

comment on table public.em_models is
    'Earth Modeling model definitions (surface stack, zones, fault polygons, population methods — small jsonb; computed grids are never stored). Owner-only; referenced geo_surfaces visibility is re-checked through geo_surfaces RLS at read time.';

create index if not exists em_models_user_id_idx
    on public.em_models (user_id, updated_at desc);

alter table public.em_models enable row level security;

drop policy if exists "em_models_select_own" on public.em_models;
create policy "em_models_select_own"
    on public.em_models for select
    using (auth.uid() = user_id);

drop policy if exists "em_models_insert_own" on public.em_models;
create policy "em_models_insert_own"
    on public.em_models for insert
    with check (auth.uid() = user_id);

drop policy if exists "em_models_update_own" on public.em_models;
create policy "em_models_update_own"
    on public.em_models for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "em_models_delete_own" on public.em_models;
create policy "em_models_delete_own"
    on public.em_models for delete
    using (auth.uid() = user_id);
