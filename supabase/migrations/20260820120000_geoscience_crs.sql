-- Petrel-grade CRS program, Phase 2 (plan approved 2026-08-20): the
-- structured CRS layer the geoscience registries never had. Closes the
-- "CRS/units debt" named in docs/scope/Geoscience-ROADMAP.md.
--
-- Tag vocabulary (shared with src/lib/crs and packages/engines/lib/crs):
--   'EPSG:<code>'   catalog CRS (e.g. EPSG:32631)
--   'CUSTOM:<uuid>' user-defined; proj4/WKT definition lives in
--                   geoscience_settings.custom_defs under that uuid
--   'LOCAL'         deliberate local/engineering grid, untransformable
--   'UNKNOWN'       explicit don't-know; NULL means the same for legacy
--                   rows (no backfill — the UI badges, never blocks)
--
-- Convert-on-import invariant: once the Phase 3-5 doors land, `crs`
-- records the owner's PROJECT CRS at import time and coordinates are
-- stored in it; `crs_provenance` records what the user declared (native
-- CRS, native coordinates/affine, transform, residuals, date) so any
-- later reprojection restarts from native and error never accumulates.
--
-- geoscience_settings is the Petrel "project CRS" home (owner decision
-- 2026-08-20: per-user, org-readable — there is no project entity).
-- One row per user; org members can read it (the geo_wells sharing
-- pattern) but only the owner writes. The Project CRS lock (free to
-- change until CRS-tagged data exists, then reproject-or-block) is
-- enforced in the app layer, which alone can count tagged rows cheaply.
--
-- NOT shared-table scope: geo_*/seismic_*/em_* are product tables; the
-- organizations/users/invitations/onboarding review bar does not apply.
-- Idempotent throughout.

-- ---- project CRS settings ----------------------------------------------

create table if not exists public.geoscience_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  project_crs text,
  project_crs_name text,
  project_xy_unit text not null default 'm',
  custom_defs jsonb not null default '{}'::jsonb,
  crs_set_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.geoscience_settings is
  'Per-user geoscience workspace settings; project_crs is the Petrel-style Project CRS every import converts into.';
comment on column public.geoscience_settings.project_crs is
  'EPSG:<code> | CUSTOM:<uuid> | LOCAL; null until the user chooses.';
comment on column public.geoscience_settings.custom_defs is
  'CUSTOM CRS definitions: {"<uuid>": {"name", "proj4", "wkt"?, "unit"}}.';

alter table public.geoscience_settings enable row level security;

drop policy if exists geoscience_settings_select_own_or_org on public.geoscience_settings;
create policy geoscience_settings_select_own_or_org
  on public.geoscience_settings for select
  using (
    user_id = auth.uid()
    or (organization_id is not null and public.is_org_member(organization_id))
  );

drop policy if exists geoscience_settings_insert_own on public.geoscience_settings;
create policy geoscience_settings_insert_own
  on public.geoscience_settings for insert
  with check (user_id = auth.uid());

drop policy if exists geoscience_settings_update_own on public.geoscience_settings;
create policy geoscience_settings_update_own
  on public.geoscience_settings for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists geoscience_settings_delete_own on public.geoscience_settings;
create policy geoscience_settings_delete_own
  on public.geoscience_settings for delete
  using (user_id = auth.uid());

-- ---- structured CRS on the registries -----------------------------------

alter table public.geo_wells
  add column if not exists crs text,
  add column if not exists xy_unit text,
  add column if not exists crs_provenance jsonb;

comment on column public.geo_wells.crs is
  'CRS the stored surface_x/surface_y are IN (project CRS at import). NULL = unknown (legacy); crs_note stays free-text context.';
comment on column public.geo_wells.crs_provenance is
  'What the importer declared: {declared_crs, declared_x, declared_y, declared_unit, azimuth_ref, transform, date}.';

alter table public.geo_surfaces
  add column if not exists crs text,
  add column if not exists xy_unit text,
  add column if not exists crs_provenance jsonb;

comment on column public.geo_surfaces.crs is
  'CRS the grid frame (origin_x/origin_y/dx/dy) is IN. NULL = unknown (legacy).';

alter table public.seismic_volumes
  add column if not exists crs text;

comment on column public.seismic_volumes.crs is
  'CRS of the survey affine world coordinates (project CRS at import). Native CRS + native affine live in survey_meta.crs. NULL = unknown (legacy).';

alter table public.em_models
  add column if not exists crs text;

comment on column public.em_models.crs is
  'CRS of the model frame, stamped from the input surfaces at build. NULL = unknown (legacy).';
