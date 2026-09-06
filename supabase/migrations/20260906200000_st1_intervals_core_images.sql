-- Stratigraphy Studio ST1: lithology, core and facies
-- (docs/scope/Stratigraphy-PLAN.md section 6, approved 2026-09-06).
--
-- 1. geo_wells_intervals: "a named thing between two depths on a well",
--    one table for every interval kind (lithology, core_description,
--    facies, electrofacies, environment, motif, systems_tract,
--    biozone_interval). Kind-specific fields live in `properties`; `code`
--    and `label` are the only typed ones (plan section 10: review refuses
--    new columns that serve one kind).
-- 2. geo_wells_core_images: depth-registered core photographs stored in
--    the existing private `wells` bucket under the owner path
--    {user_id}/{well_id}/core/{id}.{ext}; the bucket's owner-path and
--    org-read policies already cover that path (20260713100000).
-- Both are registry children of geo_wells with the geo_wells_tops RLS
-- pattern (visibility via the well, owner-only writes) and the PP0
-- state-version columns. Idempotent. Log in MIGRATIONS.md.

-- ---- geo_wells_intervals ---------------------------------------------------

create table if not exists public.geo_wells_intervals (
    id             uuid primary key default gen_random_uuid(),
    well_id        uuid not null references public.geo_wells (id) on delete cascade,
    kind           text not null
        check (kind in ('lithology', 'core_description', 'facies', 'electrofacies', 'environment', 'motif', 'systems_tract', 'biozone_interval')),
    top_md_m       double precision not null,
    base_md_m      double precision not null,
    code           text not null,                          -- lithology code, facies name, motif, tract code, biozone
    label          text,                                   -- display name when it differs from the code
    properties     jsonb not null default '{}'::jsonb,     -- grain_size, sorting, structures, colour, description, stacking, scheme ...
    source         text not null default 'interpretation'
        check (source in ('core', 'cuttings', 'log', 'interpretation', 'import')),
    interpreter    text,
    schema_version integer not null default 1,
    app_build      text,
    engine_version text,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now(),
    constraint geo_wells_intervals_depth_order check (base_md_m > top_md_m)
);

comment on table public.geo_wells_intervals is
    'Interval logs per well (Stratigraphy Studio ST1): lithology, core description, facies, electrofacies, environment, log motif, systems tract, biozone range. MD in metres below KB. Overlaps are refused per kind by the engine, not the database (a lithology and a facies interval may overlap).';

create index if not exists geo_wells_intervals_well_id_idx on public.geo_wells_intervals (well_id);
create index if not exists geo_wells_intervals_well_kind_idx on public.geo_wells_intervals (well_id, kind, top_md_m);

alter table public.geo_wells_intervals enable row level security;

drop policy if exists "geo_wells_intervals_select_via_well" on public.geo_wells_intervals;
create policy "geo_wells_intervals_select_via_well"
    on public.geo_wells_intervals for select
    using (exists (select 1 from public.geo_wells w where w.id = well_id));

drop policy if exists "geo_wells_intervals_insert_own" on public.geo_wells_intervals;
create policy "geo_wells_intervals_insert_own"
    on public.geo_wells_intervals for insert
    with check (exists (
      select 1 from public.geo_wells w where w.id = well_id and w.user_id = auth.uid()
    ));

drop policy if exists "geo_wells_intervals_update_own" on public.geo_wells_intervals;
create policy "geo_wells_intervals_update_own"
    on public.geo_wells_intervals for update
    using (exists (
      select 1 from public.geo_wells w where w.id = well_id and w.user_id = auth.uid()
    ))
    with check (exists (
      select 1 from public.geo_wells w where w.id = well_id and w.user_id = auth.uid()
    ));

drop policy if exists "geo_wells_intervals_delete_own" on public.geo_wells_intervals;
create policy "geo_wells_intervals_delete_own"
    on public.geo_wells_intervals for delete
    using (exists (
      select 1 from public.geo_wells w where w.id = well_id and w.user_id = auth.uid()
    ));

-- ---- geo_wells_core_images -------------------------------------------------

create table if not exists public.geo_wells_core_images (
    id             uuid primary key default gen_random_uuid(),
    well_id        uuid not null references public.geo_wells (id) on delete cascade,
    top_md_m       double precision not null,
    base_md_m      double precision not null,
    storage_path   text not null,                          -- {user_id}/{well_id}/core/{id}.{ext} in the private wells bucket
    content_type   text not null default 'image/jpeg',
    caption        text,
    width          integer,
    height         integer,
    bytes          integer not null default 0,
    schema_version integer not null default 1,
    app_build      text,
    engine_version text,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now(),
    constraint geo_wells_core_images_depth_order check (base_md_m > top_md_m),
    constraint geo_wells_core_images_bytes check (bytes >= 0 and bytes <= 5242880)   -- 5 MB per image (owner decision 2026-09-06)
);

comment on table public.geo_wells_core_images is
    'Depth-registered core photographs (Stratigraphy Studio ST1). Objects live in the private wells bucket under the owner path; 5 MB per image and 200 MB per well, the second cap enforced by the service.';

create index if not exists geo_wells_core_images_well_id_idx on public.geo_wells_core_images (well_id, top_md_m);

alter table public.geo_wells_core_images enable row level security;

drop policy if exists "geo_wells_core_images_select_via_well" on public.geo_wells_core_images;
create policy "geo_wells_core_images_select_via_well"
    on public.geo_wells_core_images for select
    using (exists (select 1 from public.geo_wells w where w.id = well_id));

drop policy if exists "geo_wells_core_images_insert_own" on public.geo_wells_core_images;
create policy "geo_wells_core_images_insert_own"
    on public.geo_wells_core_images for insert
    with check (exists (
      select 1 from public.geo_wells w where w.id = well_id and w.user_id = auth.uid()
    ));

drop policy if exists "geo_wells_core_images_update_own" on public.geo_wells_core_images;
create policy "geo_wells_core_images_update_own"
    on public.geo_wells_core_images for update
    using (exists (
      select 1 from public.geo_wells w where w.id = well_id and w.user_id = auth.uid()
    ))
    with check (exists (
      select 1 from public.geo_wells w where w.id = well_id and w.user_id = auth.uid()
    ));

drop policy if exists "geo_wells_core_images_delete_own" on public.geo_wells_core_images;
create policy "geo_wells_core_images_delete_own"
    on public.geo_wells_core_images for delete
    using (exists (
      select 1 from public.geo_wells w where w.id = well_id and w.user_id = auth.uid()
    ));
