-- Seismolord Phase 5: cross-app surface handoff registry.
--
-- Replaces (does NOT resurrect) the broken data-exchange /
-- shared_data_registry machinery: product-prefixed table, user-scoped
-- RLS, consumed directly by ReservoirCalc Pro's import dialog.
--
-- The surface file itself (XYZ text — the one format RCP's SurfaceParser
-- reads reliably today) lives in the seismic bucket at
-- {user_id}/exports/{id}.xyz, OUTSIDE any volume directory so deleting a
-- volume never deletes a handed-off surface. volume_id/horizon_id are
-- SET NULL on delete for the same reason; the provenance jsonb carries a
-- permanent copy of names, parameters and stats.

create table if not exists public.seismic_exported_surfaces (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references auth.users (id) on delete cascade,
    volume_id     uuid references public.seismic_volumes (id) on delete set null,
    horizon_id    uuid references public.seismic_horizons (id) on delete set null,
    name          text not null,
    format        text not null default 'xyz',
    domain        text not null,               -- 'depth_ft' | 'twt_ms' (z negative-down)
    storage_path  text not null,
    provenance    jsonb not null,
    created_at    timestamptz not null default now()
);

comment on table public.seismic_exported_surfaces is
    'Seismolord surfaces handed off to other suite apps (ReservoirCalc Pro reads these).';

create index if not exists seismic_exported_surfaces_user_id_idx
    on public.seismic_exported_surfaces (user_id, created_at desc);

alter table public.seismic_exported_surfaces enable row level security;

drop policy if exists "seismic_exported_surfaces_select_own" on public.seismic_exported_surfaces;
create policy "seismic_exported_surfaces_select_own"
    on public.seismic_exported_surfaces for select
    using (auth.uid() = user_id);

drop policy if exists "seismic_exported_surfaces_insert_own" on public.seismic_exported_surfaces;
create policy "seismic_exported_surfaces_insert_own"
    on public.seismic_exported_surfaces for insert
    with check (auth.uid() = user_id);

drop policy if exists "seismic_exported_surfaces_delete_own" on public.seismic_exported_surfaces;
create policy "seismic_exported_surfaces_delete_own"
    on public.seismic_exported_surfaces for delete
    using (auth.uid() = user_id);
