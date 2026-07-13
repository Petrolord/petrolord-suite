-- Petrophysics Studio G2.2 (docs/scope/PetrophysicsStudio-PLAN.md,
-- approved 2026-07-13).
--
-- SHARED-TABLE NOTICE (Petrolord_Database_Conventions): geo_wells_zones
-- joins the G1 registry family — it becomes load-bearing for Well
-- Correlation (G3) and Mapping (G4), so it carries the same
-- second-engineer review bar as the other geo_wells_* tables.
--
-- geo_wells_zones — named depth intervals per well, normalized (like
--   tops: G3/G4 query zones ACROSS wells by name). `properties` jsonb
--   is the PUBLISHED petrophysical summary (phi_avg, sw_avg, vsh_avg,
--   ntg, net_m + cutoff/method provenance) written by an explicit
--   "publish" action in Petrophysics Studio — compact and consumed
--   whole (the fault-sticks precedent). RLS is exactly the
--   geo_wells_tops pattern: children inherit the well's visibility;
--   writes stay owner-only (v1 org sharing is read-only, locked G1).
--
-- petro_projects — Petrophysics Studio's app-private workspace state
--   (parameter sets, track layouts, crossplot defs, facies polygons —
--   all small jsonb; plan decision 2: facies are interpretive state,
--   app-private in v1). Product-prefixed, owner-only RLS, NO org
--   sharing in v1.

-- ---- geo_wells_zones (shared registry child) -------------------------------

create table if not exists public.geo_wells_zones (
    id           uuid primary key default gen_random_uuid(),
    well_id      uuid not null references public.geo_wells (id) on delete cascade,
    name         text not null,
    top_md_m     double precision not null,
    base_md_m    double precision not null,
    properties   jsonb not null default '{}'::jsonb,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),
    constraint geo_wells_zones_interval check (base_md_m > top_md_m)
);

comment on table public.geo_wells_zones is
    'Named depth zones per well (normalized for cross-well queries, like tops). properties = published petrophysical summary jsonb (Petrophysics Studio G2; consumed by G3 correlation / G4 mapping / volumetrics). MD in metres below KB.';

create index if not exists geo_wells_zones_well_id_idx on public.geo_wells_zones (well_id);
create index if not exists geo_wells_zones_name_idx on public.geo_wells_zones (name);

alter table public.geo_wells_zones enable row level security;

-- child visibility = parent visibility (the geo_wells_tops pattern):
-- the subquery runs under the caller's own geo_wells RLS.
drop policy if exists "geo_wells_zones_select_via_well" on public.geo_wells_zones;
create policy "geo_wells_zones_select_via_well"
    on public.geo_wells_zones for select
    using (exists (select 1 from public.geo_wells w where w.id = well_id));

drop policy if exists "geo_wells_zones_insert_own" on public.geo_wells_zones;
create policy "geo_wells_zones_insert_own"
    on public.geo_wells_zones for insert
    with check (exists (
      select 1 from public.geo_wells w where w.id = well_id and w.user_id = auth.uid()
    ));

drop policy if exists "geo_wells_zones_update_own" on public.geo_wells_zones;
create policy "geo_wells_zones_update_own"
    on public.geo_wells_zones for update
    using (exists (
      select 1 from public.geo_wells w where w.id = well_id and w.user_id = auth.uid()
    ))
    with check (exists (
      select 1 from public.geo_wells w where w.id = well_id and w.user_id = auth.uid()
    ));

drop policy if exists "geo_wells_zones_delete_own" on public.geo_wells_zones;
create policy "geo_wells_zones_delete_own"
    on public.geo_wells_zones for delete
    using (exists (
      select 1 from public.geo_wells w where w.id = well_id and w.user_id = auth.uid()
    ));

-- ---- petro_projects (app-private workspace state) ---------------------------

create table if not exists public.petro_projects (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid not null references auth.users (id) on delete cascade,
    name         text not null,
    well_ids     uuid[] not null default '{}',
    params       jsonb not null default '{}'::jsonb,
    layouts      jsonb not null default '{}'::jsonb,
    crossplots   jsonb not null default '{}'::jsonb,
    facies       jsonb not null default '{}'::jsonb,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

comment on table public.petro_projects is
    'Petrophysics Studio workspace state (parameter sets, track layouts, crossplot defs, facies polygons — small jsonb). Owner-only; well_ids reference geo_wells but visibility of the wells themselves is always re-checked through geo_wells RLS at read time.';

create index if not exists petro_projects_user_id_idx
    on public.petro_projects (user_id, updated_at desc);

alter table public.petro_projects enable row level security;

drop policy if exists "petro_projects_select_own" on public.petro_projects;
create policy "petro_projects_select_own"
    on public.petro_projects for select
    using (auth.uid() = user_id);

drop policy if exists "petro_projects_insert_own" on public.petro_projects;
create policy "petro_projects_insert_own"
    on public.petro_projects for insert
    with check (auth.uid() = user_id);

drop policy if exists "petro_projects_update_own" on public.petro_projects;
create policy "petro_projects_update_own"
    on public.petro_projects for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "petro_projects_delete_own" on public.petro_projects;
create policy "petro_projects_delete_own"
    on public.petro_projects for delete
    using (auth.uid() = user_id);
