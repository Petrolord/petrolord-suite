-- Seismolord: registry of seismic volumes a user has loaded.
-- Walking-skeleton scope: metadata only. Actual volume data (bricks/manifests)
-- lives in the private 'seismic' Storage bucket; storage_path points into it.
-- RLS is user-scoped (auth.uid() = user_id), matching the suite's app-table
-- convention (see saved_waterflood_projects).

create table if not exists public.seismic_volumes (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references auth.users (id) on delete cascade,
    name          text not null,
    description   text,
    storage_path  text,
    survey_meta   jsonb,
    status        text not null default 'registered',
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

comment on table public.seismic_volumes is
    'Seismolord seismic volume registry; volume data lives in the seismic Storage bucket at storage_path.';
comment on column public.seismic_volumes.survey_meta is
    'Survey geometry: inline/xline ranges, sample interval, CRS, trace-header byte mappings.';

create index if not exists seismic_volumes_user_id_idx
    on public.seismic_volumes (user_id, created_at desc);

alter table public.seismic_volumes enable row level security;

drop policy if exists "seismic_volumes_select_own" on public.seismic_volumes;
create policy "seismic_volumes_select_own"
    on public.seismic_volumes for select
    using (auth.uid() = user_id);

drop policy if exists "seismic_volumes_insert_own" on public.seismic_volumes;
create policy "seismic_volumes_insert_own"
    on public.seismic_volumes for insert
    with check (auth.uid() = user_id);

drop policy if exists "seismic_volumes_update_own" on public.seismic_volumes;
create policy "seismic_volumes_update_own"
    on public.seismic_volumes for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "seismic_volumes_delete_own" on public.seismic_volumes;
create policy "seismic_volumes_delete_own"
    on public.seismic_volumes for delete
    using (auth.uid() = user_id);
