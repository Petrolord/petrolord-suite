-- Well Design Studio WD1 (program approved 2026-08-25): the
-- migration-managed data model that replaces the legacy hand-created
-- wells/well_targets/trajectory_plans/anticollision_checks tables
-- (zero repo DDL, per-user only, no CRS; left untouched — a client-side
-- one-time importer reads them, and a later cleanup wave drops them).
--
-- Hierarchy (Compass EDM flattened): SITE (pad; the share root, CRS
-- context, slot template) > WELLBORE (wellhead, datum, north reference,
-- optional geo_wells bridge, sidetrack parent) > DESIGN (versioned
-- plan; segments + computed stations; one definitive per wellbore).
-- Site-scoped TARGETS are reusable across designs. SURVEYS hold actual
-- runs per wellbore. SURVEY_PROGRAMS assign instruments per interval
-- (one row per design). AC_RUNS cache immutable anti-collision results.
--
-- Column vocabulary mirrors geo_wells where meanings match (crs,
-- xy_unit, crs_provenance; deviation-style jsonb station arrays).
-- Sharing = the proven registry pattern: private by default; sharing
-- stamps organization_id on the SITE; every child inherits visibility
-- through its site; org access is READ-ONLY, writes stay owner-only.
--
-- Depths/lengths are stored in SI metres (registry convention); the
-- app converts at the boundary for ft-unit wellbores. Station jsonb
-- rows: {md, inc, azi} in metres/degrees, azimuth GRID north.
--
-- No data backfill; brand-new tables. Idempotent, safe pre-deploy
-- (no client reads these until the WD1 build ships).

-- ---- sites (share root) ---------------------------------------------------

create table if not exists public.wp_sites (
    id               uuid primary key default gen_random_uuid(),
    user_id          uuid not null references auth.users (id) on delete cascade,
    organization_id  uuid references public.organizations (id) on delete set null,
    name             text not null,
    description      text,
    crs              text,
    xy_unit          text,
    crs_provenance   jsonb,
    crs_note         text,
    origin_x         double precision,
    origin_y         double precision,
    north_reference  text not null default 'grid'
                     check (north_reference in ('grid', 'true')),
    default_ground_elev_m double precision,
    slots            jsonb not null default '[]'::jsonb,
    lease_lines      jsonb not null default '[]'::jsonb,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

comment on table public.wp_sites is
    'Well Design Studio site/pad: CRS context, slot template, lease lines; the org-share root for all wp_* children (WD1).';

create index if not exists wp_sites_user_id_idx
    on public.wp_sites (user_id, created_at desc);
create index if not exists wp_sites_organization_id_idx
    on public.wp_sites (organization_id) where organization_id is not null;

alter table public.wp_sites enable row level security;

drop policy if exists "wp_sites_select_own_or_org" on public.wp_sites;
create policy "wp_sites_select_own_or_org"
    on public.wp_sites for select
    using (
      auth.uid() = user_id
      or (organization_id is not null and public.is_org_member(organization_id))
    );

drop policy if exists "wp_sites_insert_own" on public.wp_sites;
create policy "wp_sites_insert_own"
    on public.wp_sites for insert
    with check (
      auth.uid() = user_id
      and (organization_id is null or public.is_org_member(organization_id))
    );

drop policy if exists "wp_sites_update_own" on public.wp_sites;
create policy "wp_sites_update_own"
    on public.wp_sites for update
    using (auth.uid() = user_id)
    with check (
      auth.uid() = user_id
      and (organization_id is null or public.is_org_member(organization_id))
    );

drop policy if exists "wp_sites_delete_own" on public.wp_sites;
create policy "wp_sites_delete_own"
    on public.wp_sites for delete
    using (auth.uid() = user_id);

-- ---- wellbores ------------------------------------------------------------

create table if not exists public.wp_wellbores (
    id                 uuid primary key default gen_random_uuid(),
    user_id            uuid not null references auth.users (id) on delete cascade,
    site_id            uuid not null references public.wp_sites (id) on delete cascade,
    parent_wellbore_id uuid references public.wp_wellbores (id) on delete set null,
    geo_well_id        uuid references public.geo_wells (id) on delete set null,
    name               text not null,
    uwi                text,
    slot_name          text,
    head_x             double precision,
    head_y             double precision,
    kb_elev_m          double precision not null default 0,
    ground_elev_m      double precision,
    water_depth_m      double precision,
    depth_unit         text not null default 'm' check (depth_unit in ('m', 'ft')),
    azimuth_reference  text not null default 'grid'
                       check (azimuth_reference in ('grid', 'true', 'magnetic')),
    grid_convergence_deg numeric,
    mag_declination_deg  numeric,
    mag_model          jsonb,
    status             text not null default 'planning'
                       check (status in ('planning', 'drilling', 'completed', 'abandoned')),
    notes              text,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now()
);

comment on table public.wp_wellbores is
    'Well Design Studio wellbore: wellhead in site CRS, datum elevations, north reference, optional geo_wells bridge, sidetrack parent (WD1).';

create index if not exists wp_wellbores_site_id_idx on public.wp_wellbores (site_id);
create index if not exists wp_wellbores_geo_well_id_idx
    on public.wp_wellbores (geo_well_id) where geo_well_id is not null;

alter table public.wp_wellbores enable row level security;

drop policy if exists "wp_wellbores_select_via_site" on public.wp_wellbores;
create policy "wp_wellbores_select_via_site"
    on public.wp_wellbores for select
    using (exists (
      select 1 from public.wp_sites s
      where s.id = wp_wellbores.site_id
        and (s.user_id = auth.uid()
             or (s.organization_id is not null and public.is_org_member(s.organization_id)))
    ));

drop policy if exists "wp_wellbores_write_own" on public.wp_wellbores;
create policy "wp_wellbores_write_own"
    on public.wp_wellbores for all
    using (auth.uid() = user_id)
    with check (
      auth.uid() = user_id
      and exists (select 1 from public.wp_sites s
                  where s.id = wp_wellbores.site_id and s.user_id = auth.uid())
    );

-- ---- designs (versioned plans) -------------------------------------------

create table if not exists public.wp_designs (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references auth.users (id) on delete cascade,
    wellbore_id   uuid not null references public.wp_wellbores (id) on delete cascade,
    name          text not null,
    revision      integer not null default 1,
    status        text not null default 'draft'
                  check (status in ('draft', 'definitive', 'archived')),
    profile_type  text,
    tie_on        jsonb,
    segments      jsonb not null default '[]'::jsonb,
    stations      jsonb not null default '[]'::jsonb,
    station_interval_m numeric not null default 30,
    target_ids    uuid[] not null default '{}',
    vs_azimuth_deg numeric,
    error_model   jsonb,
    engine_version text,
    published_geo_well_id uuid references public.geo_wells (id) on delete set null,
    published_at  timestamptz,
    notes         text,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

comment on table public.wp_designs is
    'Well Design Studio versioned trajectory plan: solver segments + computed station cache; at most one definitive design per wellbore (WD1).';

create index if not exists wp_designs_wellbore_id_idx on public.wp_designs (wellbore_id);
create unique index if not exists wp_designs_one_definitive_per_wellbore
    on public.wp_designs (wellbore_id) where status = 'definitive';

alter table public.wp_designs enable row level security;

drop policy if exists "wp_designs_select_via_site" on public.wp_designs;
create policy "wp_designs_select_via_site"
    on public.wp_designs for select
    using (exists (
      select 1
      from public.wp_wellbores w
      join public.wp_sites s on s.id = w.site_id
      where w.id = wp_designs.wellbore_id
        and (s.user_id = auth.uid()
             or (s.organization_id is not null and public.is_org_member(s.organization_id)))
    ));

drop policy if exists "wp_designs_write_own" on public.wp_designs;
create policy "wp_designs_write_own"
    on public.wp_designs for all
    using (auth.uid() = user_id)
    with check (
      auth.uid() = user_id
      and exists (select 1 from public.wp_wellbores w
                  where w.id = wp_designs.wellbore_id and w.user_id = auth.uid())
    );

-- ---- targets (site-scoped, reusable) --------------------------------------

create table if not exists public.wp_targets (
    id               uuid primary key default gen_random_uuid(),
    user_id          uuid not null references auth.users (id) on delete cascade,
    site_id          uuid not null references public.wp_sites (id) on delete cascade,
    parent_target_id uuid references public.wp_targets (id) on delete set null,
    name             text not null,
    kind             text not null default 'point'
                     check (kind in ('point', 'circle', 'ellipse', 'polygon')),
    category         text not null default 'geological'
                     check (category in ('geological', 'drillers')),
    center_x         double precision not null,
    center_y         double precision not null,
    tvdss_m          double precision not null,
    geometry         jsonb,
    dip_deg          numeric,
    dip_azimuth_deg  numeric,
    provenance       jsonb,
    color            text,
    notes            text,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

comment on table public.wp_targets is
    'Well Design Studio target: point/circle/ellipse/polygon at TVDSS in site CRS; geological or drillers; provenance for geo-registry picks (WD1).';

create index if not exists wp_targets_site_id_idx on public.wp_targets (site_id);

alter table public.wp_targets enable row level security;

drop policy if exists "wp_targets_select_via_site" on public.wp_targets;
create policy "wp_targets_select_via_site"
    on public.wp_targets for select
    using (exists (
      select 1 from public.wp_sites s
      where s.id = wp_targets.site_id
        and (s.user_id = auth.uid()
             or (s.organization_id is not null and public.is_org_member(s.organization_id)))
    ));

drop policy if exists "wp_targets_write_own" on public.wp_targets;
create policy "wp_targets_write_own"
    on public.wp_targets for all
    using (auth.uid() = user_id)
    with check (
      auth.uid() = user_id
      and exists (select 1 from public.wp_sites s
                  where s.id = wp_targets.site_id and s.user_id = auth.uid())
    );

-- ---- surveys (actual runs) ------------------------------------------------

create table if not exists public.wp_surveys (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid not null references auth.users (id) on delete cascade,
    wellbore_id    uuid not null references public.wp_wellbores (id) on delete cascade,
    name           text not null,
    source         text not null default 'manual'
                   check (source in ('manual', 'csv', 'geo_wells')),
    instrument_toolcode text,
    md_from_m      numeric,
    md_to_m        numeric,
    stations       jsonb not null default '[]'::jsonb,
    computed       jsonb not null default '[]'::jsonb,
    is_in_definitive boolean not null default false,
    imported_from  jsonb,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

comment on table public.wp_surveys is
    'Well Design Studio actual survey run: raw {md,inc,azi} stations + engine-computed cache; composable into the definitive survey (WD1; consumed from WD3).';

create index if not exists wp_surveys_wellbore_id_idx on public.wp_surveys (wellbore_id);

alter table public.wp_surveys enable row level security;

drop policy if exists "wp_surveys_select_via_site" on public.wp_surveys;
create policy "wp_surveys_select_via_site"
    on public.wp_surveys for select
    using (exists (
      select 1
      from public.wp_wellbores w
      join public.wp_sites s on s.id = w.site_id
      where w.id = wp_surveys.wellbore_id
        and (s.user_id = auth.uid()
             or (s.organization_id is not null and public.is_org_member(s.organization_id)))
    ));

drop policy if exists "wp_surveys_write_own" on public.wp_surveys;
create policy "wp_surveys_write_own"
    on public.wp_surveys for all
    using (auth.uid() = user_id)
    with check (
      auth.uid() = user_id
      and exists (select 1 from public.wp_wellbores w
                  where w.id = wp_surveys.wellbore_id and w.user_id = auth.uid())
    );

-- ---- survey programs (one per design) ------------------------------------

create table if not exists public.wp_survey_programs (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references auth.users (id) on delete cascade,
    design_id   uuid not null references public.wp_designs (id) on delete cascade,
    intervals   jsonb not null default '[]'::jsonb,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    unique (design_id)
);

comment on table public.wp_survey_programs is
    'Well Design Studio survey program: instrument toolcode per MD interval for a design (WD1; consumed from WD4).';

alter table public.wp_survey_programs enable row level security;

drop policy if exists "wp_survey_programs_select_via_site" on public.wp_survey_programs;
create policy "wp_survey_programs_select_via_site"
    on public.wp_survey_programs for select
    using (exists (
      select 1
      from public.wp_designs d
      join public.wp_wellbores w on w.id = d.wellbore_id
      join public.wp_sites s on s.id = w.site_id
      where d.id = wp_survey_programs.design_id
        and (s.user_id = auth.uid()
             or (s.organization_id is not null and public.is_org_member(s.organization_id)))
    ));

drop policy if exists "wp_survey_programs_write_own" on public.wp_survey_programs;
create policy "wp_survey_programs_write_own"
    on public.wp_survey_programs for all
    using (auth.uid() = user_id)
    with check (
      auth.uid() = user_id
      and exists (select 1 from public.wp_designs d
                  where d.id = wp_survey_programs.design_id and d.user_id = auth.uid())
    );

-- ---- anti-collision runs (immutable results cache) ------------------------

create table if not exists public.wp_ac_runs (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid not null references auth.users (id) on delete cascade,
    design_id      uuid not null references public.wp_designs (id) on delete cascade,
    reference      text not null default 'plan'
                   check (reference in ('plan', 'survey', 'composite')),
    offsets        jsonb not null,
    params         jsonb not null,
    results        jsonb not null,
    summary        jsonb not null,
    engine_version text,
    created_at     timestamptz not null default now()
);

comment on table public.wp_ac_runs is
    'Well Design Studio anti-collision run history: immutable scan inputs + per-offset series + summary (WD1; written from WD4).';

create index if not exists wp_ac_runs_design_id_idx
    on public.wp_ac_runs (design_id, created_at desc);

alter table public.wp_ac_runs enable row level security;

drop policy if exists "wp_ac_runs_select_via_site" on public.wp_ac_runs;
create policy "wp_ac_runs_select_via_site"
    on public.wp_ac_runs for select
    using (exists (
      select 1
      from public.wp_designs d
      join public.wp_wellbores w on w.id = d.wellbore_id
      join public.wp_sites s on s.id = w.site_id
      where d.id = wp_ac_runs.design_id
        and (s.user_id = auth.uid()
             or (s.organization_id is not null and public.is_org_member(s.organization_id)))
    ));

drop policy if exists "wp_ac_runs_insert_own" on public.wp_ac_runs;
create policy "wp_ac_runs_insert_own"
    on public.wp_ac_runs for insert
    with check (
      auth.uid() = user_id
      and exists (select 1 from public.wp_designs d
                  where d.id = wp_ac_runs.design_id and d.user_id = auth.uid())
    );

drop policy if exists "wp_ac_runs_delete_own" on public.wp_ac_runs;
create policy "wp_ac_runs_delete_own"
    on public.wp_ac_runs for delete
    using (auth.uid() = user_id);
