-- Wave 1 / W1.3: culture / GIS layer registry (license blocks, field
-- outlines, pipelines, coastlines) shared by Seismolord and Mapping &
-- Surface Studio. First dividend of the CRS program: features import
-- under a DECLARED CRS and are stored converted to the importer's
-- Project CRS, tagged.
--
-- SHARED-TABLE NOTICE (Petrolord_Database_Conventions): geo_culture is
-- a cross-app geo_* registry and carries the same second-engineer
-- review bar as geo_wells / geo_surfaces.
--
-- The geo_surfaces model exactly: metadata row + org-read RLS, feature
-- geometry as a JSON blob in a private `culture` bucket at
-- {user_id}/{culture_id}/features.json (a coastline can be megabytes —
-- never large jsonb, the brick rule). Private by default; sharing
-- stamps organization_id, the blob inherits via the id in the path.

create table if not exists public.geo_culture (
    id               uuid primary key default gen_random_uuid(),
    user_id          uuid not null references auth.users (id) on delete cascade,
    organization_id  uuid references public.organizations (id) on delete set null,
    name             text not null,
    kind             text not null default 'other',   -- license_block|field_outline|pipeline|coastline|other
    geometry_type    text not null default 'mixed'
        check (geometry_type in ('point', 'polyline', 'polygon', 'mixed')),
    feature_count    integer not null default 0,
    style            jsonb not null default '{}'::jsonb,   -- {color, weight, fill_opacity, label_field}
    crs              text,                                 -- structured tag of the STORED frame
    xy_unit          text,
    crs_provenance   text,
    crs_note         text,
    bbox             jsonb,                                -- {x0,y0,x1,y1} in the stored frame
    provenance       jsonb not null default '{}'::jsonb,   -- source file, declared CRS, counts
    storage_path     text not null,                        -- {user_id}/{culture_id}/features.json
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

comment on table public.geo_culture is
    'Culture/GIS layer registry (W1.3): normalized features as JSON objects in the private culture bucket. Per-user, org-shareable read-only, the geo_surfaces model.';

create index if not exists geo_culture_user_id_idx
    on public.geo_culture (user_id, created_at desc);
create index if not exists geo_culture_organization_id_idx
    on public.geo_culture (organization_id) where organization_id is not null;

alter table public.geo_culture enable row level security;

drop policy if exists "geo_culture_select_own_or_org" on public.geo_culture;
create policy "geo_culture_select_own_or_org"
    on public.geo_culture for select
    using (
      auth.uid() = user_id
      or (organization_id is not null and public.is_org_member(organization_id))
    );

drop policy if exists "geo_culture_insert_own" on public.geo_culture;
create policy "geo_culture_insert_own"
    on public.geo_culture for insert
    with check (
      auth.uid() = user_id
      and (organization_id is null or public.is_org_member(organization_id))
    );

drop policy if exists "geo_culture_update_own" on public.geo_culture;
create policy "geo_culture_update_own"
    on public.geo_culture for update
    using (auth.uid() = user_id)
    with check (
      auth.uid() = user_id
      and (organization_id is null or public.is_org_member(organization_id))
    );

drop policy if exists "geo_culture_delete_own" on public.geo_culture;
create policy "geo_culture_delete_own"
    on public.geo_culture for delete
    using (auth.uid() = user_id);

-- ---- private `culture` storage bucket -------------------------------------
-- Owner-path writes; reads for the owner OR members of the org a SHARED
-- owning layer belongs to (id resolved from path segment 2 by TEXT
-- comparison — never a ::uuid cast of path input; objects.name
-- qualified so the subquery binds the OBJECT name).

insert into storage.buckets (id, name, public)
values ('culture', 'culture', false)
on conflict (id) do nothing;

drop policy if exists "culture_objects_insert_own" on storage.objects;
create policy "culture_objects_insert_own"
    on storage.objects for insert
    with check (
      bucket_id = 'culture'
      and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists "culture_objects_select_own_or_org" on storage.objects;
create policy "culture_objects_select_own_or_org"
    on storage.objects for select
    using (
      bucket_id = 'culture'
      and (
        (storage.foldername(name))[1] = auth.uid()::text
        or exists (
          select 1 from public.geo_culture c
          where c.id::text = (storage.foldername(objects.name))[2]
            and c.organization_id is not null
            and public.is_org_member(c.organization_id)
        )
      )
    );

drop policy if exists "culture_objects_update_own" on storage.objects;
create policy "culture_objects_update_own"
    on storage.objects for update
    using (
      bucket_id = 'culture'
      and (storage.foldername(name))[1] = auth.uid()::text
    )
    with check (
      bucket_id = 'culture'
      and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists "culture_objects_delete_own" on storage.objects;
create policy "culture_objects_delete_own"
    on storage.objects for delete
    using (
      bucket_id = 'culture'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
