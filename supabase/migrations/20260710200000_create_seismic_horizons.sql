-- Seismolord Phase 3: horizon registry.
--
-- The row holds identity + provenance + statistics only; the pick grid
-- itself (float32 nIl x nXl, 1.0E+30 nulls) lives in Storage at
-- seismic/{user_id}/{volume_id}/horizons/{horizon_id}.f32 under the
-- owner-path RLS from Phase 0 — plan-of-record decision #8: large arrays
-- never go into multi-MB jsonb rows.
--
-- User-scoped RLS, house pattern. Deleting a volume cascades its horizon
-- rows; the client service also removes the storage blobs.

create table if not exists public.seismic_horizons (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references auth.users (id) on delete cascade,
    volume_id     uuid not null references public.seismic_volumes (id) on delete cascade,
    name          text not null,
    domain        text not null default 'twt_ms',
    snap_mode     text not null default 'peak',
    seed          jsonb,
    params        jsonb,
    stats         jsonb,
    storage_path  text not null,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

comment on table public.seismic_horizons is
    'Seismolord horizon registry; pick grids live in the seismic bucket at storage_path.';
comment on column public.seismic_horizons.domain is
    'Vertical domain of the stored picks (twt_ms for time volumes).';

create index if not exists seismic_horizons_user_id_idx
    on public.seismic_horizons (user_id, created_at desc);
create index if not exists seismic_horizons_volume_id_idx
    on public.seismic_horizons (volume_id);

alter table public.seismic_horizons enable row level security;

drop policy if exists "seismic_horizons_select_own" on public.seismic_horizons;
create policy "seismic_horizons_select_own"
    on public.seismic_horizons for select
    using (auth.uid() = user_id);

drop policy if exists "seismic_horizons_insert_own" on public.seismic_horizons;
create policy "seismic_horizons_insert_own"
    on public.seismic_horizons for insert
    with check (auth.uid() = user_id);

drop policy if exists "seismic_horizons_update_own" on public.seismic_horizons;
create policy "seismic_horizons_update_own"
    on public.seismic_horizons for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "seismic_horizons_delete_own" on public.seismic_horizons;
create policy "seismic_horizons_delete_own"
    on public.seismic_horizons for delete
    using (auth.uid() = user_id);
