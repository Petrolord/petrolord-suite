-- Seismolord wells Phase W1: well registry.
--
-- Wells are PER-USER and volume-independent (Seismolord-WELLS-PLAN.md
-- design decision #1, owner sign-off 2026-07-11): a well exists in
-- world coordinates and appears on any survey that contains it via the
-- measured affine — so deliberately NO FK to seismic_volumes.
--
-- Deviation/tops/checkshots are compact jsonb (the fault-sticks
-- precedent, plan decision #2): a deviation survey is a few KB of
-- stations, never the multi-MB grids the blob rule protects against.
-- Shapes:
--   deviation:  [{ "md": m, "inc": deg, "azi": deg }, ...]  md ascending
--   tops:       [{ "name": text, "md": m }, ...]
--   checkshots: [{ "tvdss_m": m, "twt_ms": ms }, ...]       strictly monotonic
-- Depth conventions: TVD positive down below KB; TVDss = TVD - kb_m
-- (positive down below the datum, which is the seismic datum).

create table if not exists public.seismic_wells (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references auth.users (id) on delete cascade,
    name          text not null,
    uwi           text,
    surface_x     double precision not null,
    surface_y     double precision not null,
    kb_m          double precision not null default 0,
    td_md_m       double precision,
    deviation     jsonb not null default '[]'::jsonb,
    tops          jsonb not null default '[]'::jsonb,
    checkshots    jsonb not null default '[]'::jsonb,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

comment on table public.seismic_wells is
    'Seismolord wells (per-user, volume-independent; world coordinates; compact jsonb payloads).';

create index if not exists seismic_wells_user_id_idx
    on public.seismic_wells (user_id, created_at desc);

alter table public.seismic_wells enable row level security;

drop policy if exists "seismic_wells_select_own" on public.seismic_wells;
create policy "seismic_wells_select_own"
    on public.seismic_wells for select
    using (auth.uid() = user_id);

drop policy if exists "seismic_wells_insert_own" on public.seismic_wells;
create policy "seismic_wells_insert_own"
    on public.seismic_wells for insert
    with check (auth.uid() = user_id);

drop policy if exists "seismic_wells_update_own" on public.seismic_wells;
create policy "seismic_wells_update_own"
    on public.seismic_wells for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "seismic_wells_delete_own" on public.seismic_wells;
create policy "seismic_wells_delete_own"
    on public.seismic_wells for delete
    using (auth.uid() = user_id);
