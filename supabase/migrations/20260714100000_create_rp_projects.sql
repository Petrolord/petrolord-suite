-- Rock Physics Studio G6.2 (docs/scope/RockPhysicsStudio-PLAN.md,
-- approved 2026-07-13, locked decision 4).
--
-- rp_projects — Rock Physics Studio's app-private workspace state:
-- fluid scenarios (Batzle-Wang inputs / manual K_fl overrides), rock
-- model (mineral fractions, curve picks, interval), AVO interface
-- setup and wedge parameters. Small jsonb, owner-only in every
-- direction (the petro_projects pattern). No publish-back in v1:
-- well_ids reference geo_wells but visibility of the wells themselves
-- is always re-checked through geo_wells RLS at read time.

create table if not exists public.rp_projects (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid not null references auth.users (id) on delete cascade,
    name         text not null,
    well_ids     uuid[] not null default '{}',
    scenarios    jsonb not null default '[]'::jsonb,  -- fluid scenario table (BW inputs, sats, overrides)
    rock         jsonb not null default '{}'::jsonb,  -- mineral fractions, curve picks, interval
    avo          jsonb not null default '{}'::jsonb,  -- interface source (zone/top/manual), angles
    wedge        jsonb not null default '{}'::jsonb,  -- freq, dt, max thickness, rc source
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

comment on table public.rp_projects is
    'Rock Physics Studio workspace state (fluid scenarios, rock model, AVO interface setup, wedge parameters — small jsonb). Owner-only; well_ids reference geo_wells but well visibility is always re-checked through geo_wells RLS at read time.';

create index if not exists rp_projects_user_id_idx
    on public.rp_projects (user_id, updated_at desc);

alter table public.rp_projects enable row level security;

drop policy if exists "rp_projects_select_own" on public.rp_projects;
create policy "rp_projects_select_own"
    on public.rp_projects for select
    using (auth.uid() = user_id);

drop policy if exists "rp_projects_insert_own" on public.rp_projects;
create policy "rp_projects_insert_own"
    on public.rp_projects for insert
    with check (auth.uid() = user_id);

drop policy if exists "rp_projects_update_own" on public.rp_projects;
create policy "rp_projects_update_own"
    on public.rp_projects for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "rp_projects_delete_own" on public.rp_projects;
create policy "rp_projects_delete_own"
    on public.rp_projects for delete
    using (auth.uid() = user_id);
