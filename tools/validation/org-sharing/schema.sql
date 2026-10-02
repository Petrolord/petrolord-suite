-- Scratch-Postgres stand-in for the org-sharing dry run and pentest
-- (tools/validation/org-sharing/run.sh). NEVER applied to a Supabase database.
--
-- GENERATED from a read-only catalog read of the live project on 2026-10-02
-- (pg_attribute, pg_constraint, pg_policies, pg_trigger): the thirteen tables
-- the two migrations touch, with the columns, defaults, checks, foreign keys,
-- triggers, policies and grants they had BEFORE the migrations. Roles,
-- auth.uid(), organizations, organization_members and the SECURITY DEFINER
-- membership helpers are the stand-ins of
-- tools/validation/suite-unit-settings/schema.sql; storage.objects is a stub
-- with the three live `wells` bucket policies.
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
create table auth.users (id uuid primary key);
-- Supabase's definition: the sub claim of the request's JWT
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;
create table public.organizations (id uuid primary key, name text);
create table public.organization_members (
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  full_name text, role text, status text default 'active');
create or replace function public.is_org_member(org_id uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.organization_members om
    where om.organization_id = is_org_member.org_id and om.user_id = auth.uid()
      and coalesce(lower(om.status), 'active') = 'active');
$$;
create or replace function public.has_org_role(org_id uuid, roles text[]) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.organization_members om
    where om.organization_id = has_org_role.org_id and om.user_id = auth.uid()
      and coalesce(lower(om.status), 'active') = 'active' and om.role = any (has_org_role.roles));
$$;
create or replace function public.is_org_admin_of(check_org_id uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select public.has_org_role(check_org_id, array['owner','admin','org_admin','super_admin']);
$$;
create or replace function public.get_my_claim(claim text) returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> claim, '')::text;
$$;
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
-- Supabase's default privileges: new public tables and functions are granted in full
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
-- referenced only
create table public.quickvol_workspaces (id uuid primary key default gen_random_uuid());
create table public.geo_strat_units (id uuid primary key default gen_random_uuid());

create table public.seismic_projects (
    id uuid default gen_random_uuid() not null,
    user_id uuid not null,
    name text not null,
    description text,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    schema_version integer default 1 not null,
    app_build text,
    engine_version text,
    constraint seismic_projects_pkey PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
alter table public.seismic_projects enable row level security;
create policy "seismic_projects_delete_own" on public.seismic_projects for delete using ((auth.uid() = user_id));
create policy "seismic_projects_insert_own" on public.seismic_projects for insert with check ((auth.uid() = user_id));
create policy "seismic_projects_select_own" on public.seismic_projects for select using ((auth.uid() = user_id));
create policy "seismic_projects_update_own" on public.seismic_projects for update using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));

create table public.em_models (
    id uuid default gen_random_uuid() not null,
    user_id uuid not null,
    name text not null,
    definition jsonb default '{}'::jsonb not null,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    crs text,
    schema_version integer default 1 not null,
    app_build text,
    engine_version text,
    constraint em_models_pkey PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
alter table public.em_models enable row level security;
create policy "em_models_delete_own" on public.em_models for delete using ((auth.uid() = user_id));
create policy "em_models_insert_own" on public.em_models for insert with check ((auth.uid() = user_id));
create policy "em_models_select_own" on public.em_models for select using ((auth.uid() = user_id));
create policy "em_models_update_own" on public.em_models for update using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));

create table public.saved_quickvol_projects (
    id uuid default gen_random_uuid() not null,
    user_id uuid not null,
    project_name text not null,
    mode text default 'deterministic'::text not null,
    inputs_data jsonb not null,
    results_data jsonb,
    file_names jsonb,
    created_at timestamp with time zone default now() not null,
    workspace_id uuid,
    schema_version integer default 1 not null,
    app_build text,
    engine_version text,
    constraint saved_quickvol_projects_pkey PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES auth.users(id),
    FOREIGN KEY (workspace_id) REFERENCES public.quickvol_workspaces(id)
);
alter table public.saved_quickvol_projects enable row level security;
create policy "Allow admin full access" on public.saved_quickvol_projects for all using ((get_my_claim('user_role'::text) = 'admin'::text)) with check ((get_my_claim('user_role'::text) = 'admin'::text));
create policy "Users can manage their own data" on public.saved_quickvol_projects for all using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy "quickvol_delete_own" on public.saved_quickvol_projects for delete using ((auth.uid() = user_id));
create policy "quickvol_insert_own" on public.saved_quickvol_projects for insert with check ((auth.uid() = user_id));
create policy "quickvol_select_own" on public.saved_quickvol_projects for select using ((auth.uid() = user_id));
create policy "quickvol_update_own" on public.saved_quickvol_projects for update using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));

create table public.rcp_prospects (
    id uuid default gen_random_uuid() not null,
    user_id uuid not null,
    name text not null,
    pg_factors jsonb default '{}'::jsonb not null,
    inputs jsonb default '{}'::jsonb not null,
    risked jsonb default '{}'::jsonb not null,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    schema_version integer default 1 not null,
    app_build text,
    engine_version text,
    constraint rcp_prospects_pkey PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
alter table public.rcp_prospects enable row level security;
create policy "rcp_prospects_delete_own" on public.rcp_prospects for delete using ((auth.uid() = user_id));
create policy "rcp_prospects_insert_own" on public.rcp_prospects for insert with check ((auth.uid() = user_id));
create policy "rcp_prospects_select_own" on public.rcp_prospects for select using ((auth.uid() = user_id));
create policy "rcp_prospects_update_own" on public.rcp_prospects for update using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));

create table public.rp_projects (
    id uuid default gen_random_uuid() not null,
    user_id uuid not null,
    name text not null,
    well_ids uuid[] default '{}'::uuid[] not null,
    scenarios jsonb default '[]'::jsonb not null,
    rock jsonb default '{}'::jsonb not null,
    avo jsonb default '{}'::jsonb not null,
    wedge jsonb default '{}'::jsonb not null,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    schema_version integer default 1 not null,
    app_build text,
    engine_version text,
    constraint rp_projects_pkey PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
alter table public.rp_projects enable row level security;
create policy "rp_projects_delete_own" on public.rp_projects for delete using ((auth.uid() = user_id));
create policy "rp_projects_insert_own" on public.rp_projects for insert with check ((auth.uid() = user_id));
create policy "rp_projects_select_own" on public.rp_projects for select using ((auth.uid() = user_id));
create policy "rp_projects_update_own" on public.rp_projects for update using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));

create table public.geo_correlation_sections (
    id uuid default gen_random_uuid() not null,
    user_id uuid not null,
    name text not null,
    well_ids uuid[] default '{}'::uuid[] not null,
    datum jsonb default '{"mode": "structural"}'::jsonb not null,
    track_layout jsonb default '{}'::jsonb not null,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    schema_version integer default 1 not null,
    app_build text,
    engine_version text,
    constraint geo_correlation_sections_pkey PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
alter table public.geo_correlation_sections enable row level security;
create policy "geo_correlation_sections_delete_own" on public.geo_correlation_sections for delete using ((auth.uid() = user_id));
create policy "geo_correlation_sections_insert_own" on public.geo_correlation_sections for insert with check ((auth.uid() = user_id));
create policy "geo_correlation_sections_select_own" on public.geo_correlation_sections for select using ((auth.uid() = user_id));
create policy "geo_correlation_sections_update_own" on public.geo_correlation_sections for update using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));

create table public.bf_wells (
    id uuid default gen_random_uuid() not null,
    user_id uuid,
    name text not null,
    location_coords point,
    surface_elevation numeric,
    water_depth numeric,
    stratigraphy jsonb,
    thermal_history jsonb,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    status text default 'not-started'::text,
    calibration_data jsonb default '{}'::jsonb,
    scenarios jsonb default '[]'::jsonb,
    heat_flow jsonb default '{}'::jsonb,
    erosion_events jsonb default '[]'::jsonb not null,
    settings jsonb default '{}'::jsonb not null,
    constraint bf_wells_pkey PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
alter table public.bf_wells enable row level security;
create policy "Users can manage their own wells" on public.bf_wells for all using ((auth.uid() = user_id));
create trigger handle_updated_at_bf_wells before update on public.bf_wells for each row execute function public.set_updated_at();

create table public.geo_wells (
    id uuid default gen_random_uuid() not null,
    user_id uuid not null,
    organization_id uuid,
    name text not null,
    uwi text,
    surface_x double precision not null,
    surface_y double precision not null,
    kb_m double precision default 0 not null,
    td_md_m double precision,
    crs_note text,
    units_note text,
    deviation jsonb default '[]'::jsonb not null,
    checkshots jsonb default '[]'::jsonb not null,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    crs text,
    xy_unit text,
    crs_provenance jsonb,
    checkshots_derived jsonb,
    schema_version integer default 1 not null,
    app_build text,
    engine_version text,
    checkshots_provenance jsonb,
    status text,
    constraint geo_wells_pkey PRIMARY KEY (id),
    constraint geo_wells_status_check CHECK (((status IS NULL) OR (status = ANY (ARRAY['planned'::text, 'drilling'::text, 'oil'::text, 'gas'::text, 'oil_gas'::text, 'water'::text, 'dry'::text, 'injector_water'::text, 'injector_gas'::text, 'suspended'::text, 'abandoned'::text])))),
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
alter table public.geo_wells enable row level security;
create policy "geo_wells_delete_own" on public.geo_wells for delete using ((auth.uid() = user_id));
create policy "geo_wells_insert_own" on public.geo_wells for insert with check (((auth.uid() = user_id) AND ((organization_id IS NULL) OR is_org_member(organization_id))));
create policy "geo_wells_select_own_or_org" on public.geo_wells for select using (((auth.uid() = user_id) OR ((organization_id IS NOT NULL) AND is_org_member(organization_id))));
create policy "geo_wells_update_own" on public.geo_wells for update using ((auth.uid() = user_id)) with check (((auth.uid() = user_id) AND ((organization_id IS NULL) OR is_org_member(organization_id))));

create table public.geo_wells_logs (
    id uuid default gen_random_uuid() not null,
    well_id uuid not null,
    mnemonic text not null,
    description text,
    unit text,
    start_md_m double precision,
    stop_md_m double precision,
    step_m double precision,
    n_samples integer default 0 not null,
    null_count integer default 0 not null,
    source_file text,
    provenance jsonb default '{}'::jsonb not null,
    storage_path text not null,
    created_at timestamp with time zone default now() not null,
    schema_version integer default 1 not null,
    app_build text,
    engine_version text,
    constraint geo_wells_logs_pkey PRIMARY KEY (id),
    FOREIGN KEY (well_id) REFERENCES public.geo_wells(id) ON DELETE CASCADE
);
alter table public.geo_wells_logs enable row level security;
create policy "geo_wells_logs_delete_own" on public.geo_wells_logs for delete using ((EXISTS ( SELECT 1
   FROM geo_wells w
  WHERE ((w.id = geo_wells_logs.well_id) AND (w.user_id = auth.uid())))));
create policy "geo_wells_logs_insert_own" on public.geo_wells_logs for insert with check ((EXISTS ( SELECT 1
   FROM geo_wells w
  WHERE ((w.id = geo_wells_logs.well_id) AND (w.user_id = auth.uid())))));
create policy "geo_wells_logs_select_via_well" on public.geo_wells_logs for select using ((EXISTS ( SELECT 1
   FROM geo_wells w
  WHERE (w.id = geo_wells_logs.well_id))));
create policy "geo_wells_logs_update_own" on public.geo_wells_logs for update using ((EXISTS ( SELECT 1
   FROM geo_wells w
  WHERE ((w.id = geo_wells_logs.well_id) AND (w.user_id = auth.uid()))))) with check ((EXISTS ( SELECT 1
   FROM geo_wells w
  WHERE ((w.id = geo_wells_logs.well_id) AND (w.user_id = auth.uid())))));

create table public.geo_wells_tops (
    id uuid default gen_random_uuid() not null,
    well_id uuid not null,
    name text not null,
    md_m double precision not null,
    interpreter text,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    schema_version integer default 1 not null,
    app_build text,
    engine_version text,
    surface_type text default 'formation_top'::text not null,
    unit_id uuid,
    confidence text,
    age_ma double precision,
    notes text,
    hiatus_to_ma double precision,
    constraint geo_wells_tops_confidence_check CHECK (((confidence IS NULL) OR (confidence = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text])))),
    constraint geo_wells_tops_hiatus_order CHECK (((hiatus_to_ma IS NULL) OR (age_ma IS NULL) OR (hiatus_to_ma > age_ma))),
    constraint geo_wells_tops_pkey PRIMARY KEY (id),
    constraint geo_wells_tops_surface_type_check CHECK ((surface_type = ANY (ARRAY['formation_top'::text, 'SU'::text, 'CC'::text, 'BSFR'::text, 'RSME'::text, 'MRS'::text, 'TRS'::text, 'MFS'::text, 'unconformity'::text, 'biozone'::text]))),
    FOREIGN KEY (unit_id) REFERENCES public.geo_strat_units(id) ON DELETE SET NULL,
    FOREIGN KEY (well_id) REFERENCES public.geo_wells(id) ON DELETE CASCADE
);
alter table public.geo_wells_tops enable row level security;
create policy "geo_wells_tops_delete_own" on public.geo_wells_tops for delete using ((EXISTS ( SELECT 1
   FROM geo_wells w
  WHERE ((w.id = geo_wells_tops.well_id) AND (w.user_id = auth.uid())))));
create policy "geo_wells_tops_insert_own" on public.geo_wells_tops for insert with check ((EXISTS ( SELECT 1
   FROM geo_wells w
  WHERE ((w.id = geo_wells_tops.well_id) AND (w.user_id = auth.uid())))));
create policy "geo_wells_tops_select_via_well" on public.geo_wells_tops for select using ((EXISTS ( SELECT 1
   FROM geo_wells w
  WHERE (w.id = geo_wells_tops.well_id))));
create policy "geo_wells_tops_update_own" on public.geo_wells_tops for update using ((EXISTS ( SELECT 1
   FROM geo_wells w
  WHERE ((w.id = geo_wells_tops.well_id) AND (w.user_id = auth.uid()))))) with check ((EXISTS ( SELECT 1
   FROM geo_wells w
  WHERE ((w.id = geo_wells_tops.well_id) AND (w.user_id = auth.uid())))));

create table public.geo_wells_zones (
    id uuid default gen_random_uuid() not null,
    well_id uuid not null,
    name text not null,
    top_md_m double precision not null,
    base_md_m double precision not null,
    properties jsonb default '{}'::jsonb not null,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    schema_version integer default 1 not null,
    app_build text,
    engine_version text,
    constraint geo_wells_zones_interval CHECK ((base_md_m > top_md_m)),
    constraint geo_wells_zones_pkey PRIMARY KEY (id),
    FOREIGN KEY (well_id) REFERENCES public.geo_wells(id) ON DELETE CASCADE
);
alter table public.geo_wells_zones enable row level security;
create policy "geo_wells_zones_delete_own" on public.geo_wells_zones for delete using ((EXISTS ( SELECT 1
   FROM geo_wells w
  WHERE ((w.id = geo_wells_zones.well_id) AND (w.user_id = auth.uid())))));
create policy "geo_wells_zones_insert_own" on public.geo_wells_zones for insert with check ((EXISTS ( SELECT 1
   FROM geo_wells w
  WHERE ((w.id = geo_wells_zones.well_id) AND (w.user_id = auth.uid())))));
create policy "geo_wells_zones_select_via_well" on public.geo_wells_zones for select using ((EXISTS ( SELECT 1
   FROM geo_wells w
  WHERE (w.id = geo_wells_zones.well_id))));
create policy "geo_wells_zones_update_own" on public.geo_wells_zones for update using ((EXISTS ( SELECT 1
   FROM geo_wells w
  WHERE ((w.id = geo_wells_zones.well_id) AND (w.user_id = auth.uid()))))) with check ((EXISTS ( SELECT 1
   FROM geo_wells w
  WHERE ((w.id = geo_wells_zones.well_id) AND (w.user_id = auth.uid())))));

create table public.geo_wells_intervals (
    id uuid default gen_random_uuid() not null,
    well_id uuid not null,
    kind text not null,
    top_md_m double precision not null,
    base_md_m double precision not null,
    code text not null,
    label text,
    properties jsonb default '{}'::jsonb not null,
    source text default 'interpretation'::text not null,
    interpreter text,
    schema_version integer default 1 not null,
    app_build text,
    engine_version text,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    constraint geo_wells_intervals_depth_order CHECK ((base_md_m > top_md_m)),
    constraint geo_wells_intervals_kind_check CHECK ((kind = ANY (ARRAY['lithology'::text, 'core_description'::text, 'facies'::text, 'electrofacies'::text, 'environment'::text, 'motif'::text, 'systems_tract'::text, 'biozone_interval'::text]))),
    constraint geo_wells_intervals_pkey PRIMARY KEY (id),
    constraint geo_wells_intervals_source_check CHECK ((source = ANY (ARRAY['core'::text, 'cuttings'::text, 'log'::text, 'interpretation'::text, 'import'::text]))),
    FOREIGN KEY (well_id) REFERENCES public.geo_wells(id) ON DELETE CASCADE
);
alter table public.geo_wells_intervals enable row level security;
create policy "geo_wells_intervals_delete_own" on public.geo_wells_intervals for delete using ((EXISTS ( SELECT 1
   FROM geo_wells w
  WHERE ((w.id = geo_wells_intervals.well_id) AND (w.user_id = auth.uid())))));
create policy "geo_wells_intervals_insert_own" on public.geo_wells_intervals for insert with check ((EXISTS ( SELECT 1
   FROM geo_wells w
  WHERE ((w.id = geo_wells_intervals.well_id) AND (w.user_id = auth.uid())))));
create policy "geo_wells_intervals_select_via_well" on public.geo_wells_intervals for select using ((EXISTS ( SELECT 1
   FROM geo_wells w
  WHERE (w.id = geo_wells_intervals.well_id))));
create policy "geo_wells_intervals_update_own" on public.geo_wells_intervals for update using ((EXISTS ( SELECT 1
   FROM geo_wells w
  WHERE ((w.id = geo_wells_intervals.well_id) AND (w.user_id = auth.uid()))))) with check ((EXISTS ( SELECT 1
   FROM geo_wells w
  WHERE ((w.id = geo_wells_intervals.well_id) AND (w.user_id = auth.uid())))));

create table public.geo_wells_core_images (
    id uuid default gen_random_uuid() not null,
    well_id uuid not null,
    top_md_m double precision not null,
    base_md_m double precision not null,
    storage_path text not null,
    content_type text default 'image/jpeg'::text not null,
    caption text,
    width integer,
    height integer,
    bytes integer default 0 not null,
    schema_version integer default 1 not null,
    app_build text,
    engine_version text,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    constraint geo_wells_core_images_bytes CHECK (((bytes >= 0) AND (bytes <= 5242880))),
    constraint geo_wells_core_images_depth_order CHECK ((base_md_m > top_md_m)),
    constraint geo_wells_core_images_pkey PRIMARY KEY (id),
    FOREIGN KEY (well_id) REFERENCES public.geo_wells(id) ON DELETE CASCADE
);
alter table public.geo_wells_core_images enable row level security;
create policy "geo_wells_core_images_delete_own" on public.geo_wells_core_images for delete using ((EXISTS ( SELECT 1
   FROM geo_wells w
  WHERE ((w.id = geo_wells_core_images.well_id) AND (w.user_id = auth.uid())))));
create policy "geo_wells_core_images_insert_own" on public.geo_wells_core_images for insert with check ((EXISTS ( SELECT 1
   FROM geo_wells w
  WHERE ((w.id = geo_wells_core_images.well_id) AND (w.user_id = auth.uid())))));
create policy "geo_wells_core_images_select_via_well" on public.geo_wells_core_images for select using ((EXISTS ( SELECT 1
   FROM geo_wells w
  WHERE (w.id = geo_wells_core_images.well_id))));
create policy "geo_wells_core_images_update_own" on public.geo_wells_core_images for update using ((EXISTS ( SELECT 1
   FROM geo_wells w
  WHERE ((w.id = geo_wells_core_images.well_id) AND (w.user_id = auth.uid()))))) with check ((EXISTS ( SELECT 1
   FROM geo_wells w
  WHERE ((w.id = geo_wells_core_images.well_id) AND (w.user_id = auth.uid())))));

-- storage stub: the live `wells` bucket policies
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
grant all on storage.objects to anon, authenticated, service_role;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1 : array_length(string_to_array(name, '/'), 1) - 1]
$$;
alter table storage.objects enable row level security;
create policy "wells_objects_delete_own" on storage.objects for delete using (((bucket_id = 'wells'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy "wells_objects_insert_own" on storage.objects for insert with check (((bucket_id = 'wells'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy "wells_objects_select_own_or_org" on storage.objects for select using (((bucket_id = 'wells'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR (EXISTS ( SELECT 1
   FROM geo_wells w
  WHERE (((w.id)::text = (storage.foldername(objects.name))[2]) AND (w.organization_id IS NOT NULL) AND is_org_member(w.organization_id)))))));
create policy "wells_objects_update_own" on storage.objects for update using (((bucket_id = 'wells'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))) with check (((bucket_id = 'wells'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
