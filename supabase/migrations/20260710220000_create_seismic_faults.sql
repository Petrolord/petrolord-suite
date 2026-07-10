-- Seismolord Phase 4: fault registry.
--
-- Sticks are stored inline as jsonb, a documented deviation from the
-- horizon blob pattern: a fault is a handful of hand-picked polylines
-- (tens of points, a few KB), not a full-survey grid, so the "no
-- multi-MB jsonb" rule is not at risk. Shape:
--   sticks: [{ "points": [{ "il": <ilIdx>, "xl": <xlIdx>, "s": <sample> }, ...] }, ...]
-- Sample values are sub-sample floats, time increasing downward.
--
-- User-scoped RLS, FK cascade from seismic_volumes — same as horizons.

create table if not exists public.seismic_faults (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references auth.users (id) on delete cascade,
    volume_id     uuid not null references public.seismic_volumes (id) on delete cascade,
    name          text not null,
    sticks        jsonb not null default '[]'::jsonb,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

comment on table public.seismic_faults is
    'Seismolord fault sticks (small jsonb polylines picked on sections).';

create index if not exists seismic_faults_user_id_idx
    on public.seismic_faults (user_id, created_at desc);
create index if not exists seismic_faults_volume_id_idx
    on public.seismic_faults (volume_id);

alter table public.seismic_faults enable row level security;

drop policy if exists "seismic_faults_select_own" on public.seismic_faults;
create policy "seismic_faults_select_own"
    on public.seismic_faults for select
    using (auth.uid() = user_id);

drop policy if exists "seismic_faults_insert_own" on public.seismic_faults;
create policy "seismic_faults_insert_own"
    on public.seismic_faults for insert
    with check (auth.uid() = user_id);

drop policy if exists "seismic_faults_update_own" on public.seismic_faults;
create policy "seismic_faults_update_own"
    on public.seismic_faults for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "seismic_faults_delete_own" on public.seismic_faults;
create policy "seismic_faults_delete_own"
    on public.seismic_faults for delete
    using (auth.uid() = user_id);
