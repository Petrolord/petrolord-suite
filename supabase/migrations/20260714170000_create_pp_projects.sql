-- Pore Pressure Studio P2 (docs/scope/PorePressure-PLAN.md, approved
-- as drafted 2026-07-14).
--
-- pp_projects — the app's private workspace state: method parameters
-- (water depth, densities, NCT, Eaton n / Bowers A-B-U, nu), NCT shale
-- picks, manual calibration points (RFT/MDT), and the input source
-- (a geo_wells id or a Seismolord velocity-model map location). Small
-- jsonb, owner-only in every direction (the rp_projects pattern).
-- well_ids reference geo_wells but visibility of the wells themselves
-- is always re-checked through geo_wells RLS at read time. Published
-- PP/FG/OBG curves go to geo_wells_logs (plan Q4), not here.

create table if not exists public.pp_projects (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid not null references auth.users (id) on delete cascade,
    name         text not null,
    well_ids     uuid[] not null default '{}',
    params       jsonb not null default '{}'::jsonb,  -- depths/densities/NCT/method parameters
    picks        jsonb not null default '[]'::jsonb,  -- NCT shale picks [{z, dt}]
    calibration  jsonb not null default '[]'::jsonb,  -- RFT/MDT points [{z, p, label}]
    source       jsonb not null default '{}'::jsonb,  -- {kind:'well'|'seismic', wellId | volumeId+il+xl}
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

comment on table public.pp_projects is
    'Pore Pressure Studio workspace state (method params, NCT picks, calibration points, input source — small jsonb). Owner-only; well_ids reference geo_wells but well visibility is always re-checked through geo_wells RLS at read time. Published curves live in geo_wells_logs.';

create index if not exists pp_projects_user_id_idx
    on public.pp_projects (user_id, updated_at desc);

alter table public.pp_projects enable row level security;

drop policy if exists "pp_projects_select_own" on public.pp_projects;
create policy "pp_projects_select_own"
    on public.pp_projects for select
    using (auth.uid() = user_id);

drop policy if exists "pp_projects_insert_own" on public.pp_projects;
create policy "pp_projects_insert_own"
    on public.pp_projects for insert
    with check (auth.uid() = user_id);

drop policy if exists "pp_projects_update_own" on public.pp_projects;
create policy "pp_projects_update_own"
    on public.pp_projects for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "pp_projects_delete_own" on public.pp_projects;
create policy "pp_projects_delete_own"
    on public.pp_projects for delete
    using (auth.uid() = user_id);
