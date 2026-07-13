-- Mapping & Surface Studio G4.2 (docs/scope/MappingSurfaceStudio-PLAN.md,
-- approved 2026-07-13).
--
-- SHARED-TABLE NOTICE (Petrolord_Database_Conventions): geo_surfaces is
-- the cross-app surface registry — it becomes load-bearing for
-- ReservoirCalc Pro volumetrics and any later mapping consumer, so it
-- carries the same second-engineer review bar as the other geo_* tables.
--
-- geo_surfaces GENERALIZES the Seismolord-only seismic_exported_surfaces
-- (Phase 5) into the shared registry, following the geo_wells model:
-- metadata row + org-read RLS, and the grid itself as a little-endian
-- float32 blob in a new private `surfaces` bucket at
-- {user_id}/{surface_id}/grid.f32 (never large jsonb — the brick rule).
-- Row-major nx*ny grid; world x = origin_x + c*dx, y = origin_y + r*dy;
-- null_value 1e30 (the shared export sentinel). Private by default;
-- "share with organization" stamps organization_id, children (the grid
-- object) inherit via the surface id in the object path.

create table if not exists public.geo_surfaces (
    id               uuid primary key default gen_random_uuid(),
    user_id          uuid not null references auth.users (id) on delete cascade,
    organization_id  uuid references public.organizations (id) on delete set null,
    name             text not null,
    kind             text not null default 'structure',   -- structure|isochore|attribute|imported
    origin_x         double precision not null,
    origin_y         double precision not null,
    nx               integer not null,
    ny               integer not null,
    dx               double precision not null,
    dy               double precision not null,
    rotation_deg     double precision not null default 0,
    z_domain         text not null default 'depth',        -- depth|time|attribute
    z_unit           text,
    null_value       double precision not null default 1e30,
    crs_note         text,
    provenance       jsonb not null default '{}'::jsonb,   -- source app/record, gridding params, control-point count
    storage_path     text not null,                        -- {user_id}/{surface_id}/grid.f32
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    constraint geo_surfaces_dims check (nx > 1 and ny > 1)
);

comment on table public.geo_surfaces is
    'Shared surface registry (Mapping & Surface Studio G4): row-major nx*ny grids as float32 objects in the private surfaces bucket. Per-user, org-shareable read-only. Generalizes seismic_exported_surfaces.';

create index if not exists geo_surfaces_user_id_idx
    on public.geo_surfaces (user_id, created_at desc);
create index if not exists geo_surfaces_organization_id_idx
    on public.geo_surfaces (organization_id) where organization_id is not null;

alter table public.geo_surfaces enable row level security;

drop policy if exists "geo_surfaces_select_own_or_org" on public.geo_surfaces;
create policy "geo_surfaces_select_own_or_org"
    on public.geo_surfaces for select
    using (
      auth.uid() = user_id
      or (organization_id is not null and public.is_org_member(organization_id))
    );

drop policy if exists "geo_surfaces_insert_own" on public.geo_surfaces;
create policy "geo_surfaces_insert_own"
    on public.geo_surfaces for insert
    with check (
      auth.uid() = user_id
      and (organization_id is null or public.is_org_member(organization_id))
    );

drop policy if exists "geo_surfaces_update_own" on public.geo_surfaces;
create policy "geo_surfaces_update_own"
    on public.geo_surfaces for update
    using (auth.uid() = user_id)
    with check (
      auth.uid() = user_id
      and (organization_id is null or public.is_org_member(organization_id))
    );

drop policy if exists "geo_surfaces_delete_own" on public.geo_surfaces;
create policy "geo_surfaces_delete_own"
    on public.geo_surfaces for delete
    using (auth.uid() = user_id);

-- ---- private `surfaces` storage bucket ------------------------------------
-- Owner-path writes; reads for the owner OR members of the org a SHARED
-- owning surface belongs to. Surface id resolved from the object path by
-- TEXT comparison against foldername[2] (the wells-bucket pattern —
-- never a ::uuid cast of path input; objects.name qualified so the
-- correlated subquery binds the OBJECT name, not geo_surfaces.name).

insert into storage.buckets (id, name, public)
values ('surfaces', 'surfaces', false)
on conflict (id) do nothing;

drop policy if exists "surfaces_objects_insert_own" on storage.objects;
create policy "surfaces_objects_insert_own"
    on storage.objects for insert
    with check (
      bucket_id = 'surfaces'
      and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists "surfaces_objects_select_own_or_org" on storage.objects;
create policy "surfaces_objects_select_own_or_org"
    on storage.objects for select
    using (
      bucket_id = 'surfaces'
      and (
        (storage.foldername(name))[1] = auth.uid()::text
        or exists (
          select 1 from public.geo_surfaces s
          where s.id::text = (storage.foldername(objects.name))[2]
            and s.organization_id is not null
            and public.is_org_member(s.organization_id)
        )
      )
    );

drop policy if exists "surfaces_objects_update_own" on storage.objects;
create policy "surfaces_objects_update_own"
    on storage.objects for update
    using (
      bucket_id = 'surfaces'
      and (storage.foldername(name))[1] = auth.uid()::text
    )
    with check (
      bucket_id = 'surfaces'
      and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists "surfaces_objects_delete_own" on storage.objects;
create policy "surfaces_objects_delete_own"
    on storage.objects for delete
    using (
      bucket_id = 'surfaces'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
