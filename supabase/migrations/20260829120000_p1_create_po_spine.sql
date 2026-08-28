-- Production P1 (Production-ROADMAP.md §5): the po_* production data
-- spine. Org-scoped, RLS-enabled, migration-first — the tables every
-- downstream production app reads (Surveillance P2, Allocation P3, lift
-- studios P4-P7, Network P11, Intervention P12).
--
-- Sharing model = the geo_wells registry model (20260713100000), the
-- suite's house pattern for shared org data: rows are private by
-- default; the owner may stamp organization_id on the PARENT
-- (po_fields) to share the whole field read-only with an organization;
-- children inherit visibility through the parent join; writes are
-- owner-only everywhere. Membership checks go through
-- public.is_org_member (organization_members, see membership
-- consolidation).
--
-- Well identity: po_wells rows are the module's well handles. `name` is
-- the as-imported label (CSV files arrive with names); geo_well_id is
-- the wellsRegistry linkage (geo_wells) so production data joins
-- subsurface data by id, never by free-text name. Downstream apps key
-- on po_wells.id / geo_well_id; the label is display only.
--
-- Units follow the VRR ledger convention: liquids stb (bbl), gas Mscf,
-- rates stb/d and Mscf/d, pressures psia. The CSV importer
-- (src/utils/production/csvImport.js) normalizes units at the boundary.
--
-- Idempotent; safe pre-deploy (creates empty tables, activates no tile).

-- ---- po_fields (parent: the org-shareable container) ----------------------

create table if not exists public.po_fields (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null references auth.users (id) on delete cascade,
    organization_id uuid references public.organizations (id) on delete set null,
    name            text not null,
    description     text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

comment on table public.po_fields is
    'Production data spine P1: field/asset container. Private by default; organization_id shares the whole field read-only with the owner''s org. Children inherit visibility through this row.';

create index if not exists po_fields_user_id_idx
    on public.po_fields (user_id, created_at desc);
create index if not exists po_fields_organization_id_idx
    on public.po_fields (organization_id) where organization_id is not null;

alter table public.po_fields enable row level security;

drop policy if exists "po_fields_select_own_or_org" on public.po_fields;
create policy "po_fields_select_own_or_org"
    on public.po_fields for select
    using (
      auth.uid() = user_id
      or (organization_id is not null and public.is_org_member(organization_id))
    );

drop policy if exists "po_fields_insert_own" on public.po_fields;
create policy "po_fields_insert_own"
    on public.po_fields for insert
    with check (
      auth.uid() = user_id
      -- you may only share to an organization you belong to
      and (organization_id is null or public.is_org_member(organization_id))
    );

drop policy if exists "po_fields_update_own" on public.po_fields;
create policy "po_fields_update_own"
    on public.po_fields for update
    using (auth.uid() = user_id)
    with check (
      auth.uid() = user_id
      and (organization_id is null or public.is_org_member(organization_id))
    );

drop policy if exists "po_fields_delete_own" on public.po_fields;
create policy "po_fields_delete_own"
    on public.po_fields for delete
    using (auth.uid() = user_id);

-- ---- po_wells (well handles + wellsRegistry linkage) ----------------------

create table if not exists public.po_wells (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references auth.users (id) on delete cascade,
    field_id    uuid not null references public.po_fields (id) on delete cascade,
    name        text not null,
    uwi         text,
    geo_well_id uuid references public.geo_wells (id) on delete set null,
    well_type   text not null default 'producer'
                check (well_type in ('producer', 'injector', 'observation', 'other')),
    is_active   boolean not null default true,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    unique (field_id, name)
);

comment on table public.po_wells is
    'Production data spine P1: per-field well handles. name = as-imported label (display only); geo_well_id = wellsRegistry linkage — downstream joins are by id, never free-text.';

create index if not exists po_wells_field_idx
    on public.po_wells (field_id, name);
create index if not exists po_wells_geo_well_idx
    on public.po_wells (geo_well_id) where geo_well_id is not null;

alter table public.po_wells enable row level security;

drop policy if exists "po_wells_select_via_field" on public.po_wells;
create policy "po_wells_select_via_field"
    on public.po_wells for select
    using (exists (
      select 1 from public.po_fields f
      where f.id = po_wells.field_id
        and (f.user_id = auth.uid()
             or (f.organization_id is not null and public.is_org_member(f.organization_id)))
    ));

drop policy if exists "po_wells_write_own" on public.po_wells;
create policy "po_wells_write_own"
    on public.po_wells for all
    using (auth.uid() = user_id)
    with check (
      auth.uid() = user_id
      and exists (select 1 from public.po_fields f
                  where f.id = po_wells.field_id and f.user_id = auth.uid())
    );

-- ---- po_daily_production (the daily ledger) -------------------------------
-- Row schema mirrors the VRR ledger (oil/water/gas + water/gas injection)
-- plus hours_on for downtime accounting. One row per well per day;
-- monthly files import as first-of-month rows (importer warns).

create table if not exists public.po_daily_production (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null references auth.users (id) on delete cascade,
    well_id    uuid not null references public.po_wells (id) on delete cascade,
    prod_date  date not null,
    oil_stb    numeric not null default 0 check (oil_stb >= 0),
    water_stb  numeric not null default 0 check (water_stb >= 0),
    gas_mscf   numeric not null default 0 check (gas_mscf >= 0),
    winj_stb   numeric not null default 0 check (winj_stb >= 0),
    ginj_mscf  numeric not null default 0 check (ginj_mscf >= 0),
    hours_on   numeric check (hours_on >= 0 and hours_on <= 24),
    source     text not null default 'csv',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (well_id, prod_date)
);

comment on table public.po_daily_production is
    'Production data spine P1: daily production/injection ledger. VRR ledger units (stb, Mscf) + hours_on. Upsert key (well_id, prod_date).';

create index if not exists po_daily_production_well_date_idx
    on public.po_daily_production (well_id, prod_date desc);

alter table public.po_daily_production enable row level security;

drop policy if exists "po_daily_production_select_via_field" on public.po_daily_production;
create policy "po_daily_production_select_via_field"
    on public.po_daily_production for select
    using (exists (
      select 1
      from public.po_wells w
      join public.po_fields f on f.id = w.field_id
      where w.id = po_daily_production.well_id
        and (f.user_id = auth.uid()
             or (f.organization_id is not null and public.is_org_member(f.organization_id)))
    ));

drop policy if exists "po_daily_production_write_own" on public.po_daily_production;
create policy "po_daily_production_write_own"
    on public.po_daily_production for all
    using (auth.uid() = user_id)
    with check (
      auth.uid() = user_id
      and exists (select 1 from public.po_wells w
                  where w.id = po_daily_production.well_id and w.user_id = auth.uid())
    );

-- ---- po_well_tests (allocation test basis) --------------------------------

create table if not exists public.po_well_tests (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null references auth.users (id) on delete cascade,
    well_id         uuid not null references public.po_wells (id) on delete cascade,
    test_date       date not null,
    duration_hours  numeric check (duration_hours > 0),
    oil_rate_stbd   numeric not null default 0 check (oil_rate_stbd >= 0),
    water_rate_stbd numeric not null default 0 check (water_rate_stbd >= 0),
    gas_rate_mscfd  numeric not null default 0 check (gas_rate_mscfd >= 0),
    thp_psia        numeric check (thp_psia >= 0),
    choke_64ths     numeric check (choke_64ths > 0),
    is_valid        boolean not null default true,
    comment         text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

comment on table public.po_well_tests is
    'Production data spine P1: well tests (rates stb/d, Mscf/d; THP psia). Feeds P3 allocation factors and Nodal test validation. is_valid = QC flag, set by the P3 studio.';

create index if not exists po_well_tests_well_date_idx
    on public.po_well_tests (well_id, test_date desc);

alter table public.po_well_tests enable row level security;

drop policy if exists "po_well_tests_select_via_field" on public.po_well_tests;
create policy "po_well_tests_select_via_field"
    on public.po_well_tests for select
    using (exists (
      select 1
      from public.po_wells w
      join public.po_fields f on f.id = w.field_id
      where w.id = po_well_tests.well_id
        and (f.user_id = auth.uid()
             or (f.organization_id is not null and public.is_org_member(f.organization_id)))
    ));

drop policy if exists "po_well_tests_write_own" on public.po_well_tests;
create policy "po_well_tests_write_own"
    on public.po_well_tests for all
    using (auth.uid() = user_id)
    with check (
      auth.uid() = user_id
      and exists (select 1 from public.po_wells w
                  where w.id = po_well_tests.well_id and w.user_id = auth.uid())
    );

-- ---- po_deferments (downtime / deferment events) --------------------------

create table if not exists public.po_deferments (
    id                uuid primary key default gen_random_uuid(),
    user_id           uuid not null references auth.users (id) on delete cascade,
    well_id           uuid not null references public.po_wells (id) on delete cascade,
    start_date        date not null,
    end_date          date check (end_date >= start_date),
    category          text not null check (category in (
                        'well', 'reservoir', 'surface_facility', 'export',
                        'planned_maintenance', 'weather', 'regulatory', 'other')),
    cause             text,
    oil_deferred_stb  numeric not null default 0 check (oil_deferred_stb >= 0),
    water_deferred_stb numeric not null default 0 check (water_deferred_stb >= 0),
    gas_deferred_mscf numeric not null default 0 check (gas_deferred_mscf >= 0),
    comment           text,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);

comment on table public.po_deferments is
    'Production data spine P1: downtime/deferment events with cause taxonomy (fixed category + free-text cause). Open events have end_date null. Volumes are totals over the event.';

create index if not exists po_deferments_well_start_idx
    on public.po_deferments (well_id, start_date desc);

alter table public.po_deferments enable row level security;

drop policy if exists "po_deferments_select_via_field" on public.po_deferments;
create policy "po_deferments_select_via_field"
    on public.po_deferments for select
    using (exists (
      select 1
      from public.po_wells w
      join public.po_fields f on f.id = w.field_id
      where w.id = po_deferments.well_id
        and (f.user_id = auth.uid()
             or (f.organization_id is not null and public.is_org_member(f.organization_id)))
    ));

drop policy if exists "po_deferments_write_own" on public.po_deferments;
create policy "po_deferments_write_own"
    on public.po_deferments for all
    using (auth.uid() = user_id)
    with check (
      auth.uid() = user_id
      and exists (select 1 from public.po_wells w
                  where w.id = po_deferments.well_id and w.user_id = auth.uid())
    );

-- ---- po_allocation_factors (per well per month, per phase) ----------------

create table if not exists public.po_allocation_factors (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid not null references auth.users (id) on delete cascade,
    well_id      uuid not null references public.po_wells (id) on delete cascade,
    period_month date not null check (extract(day from period_month) = 1),
    oil_factor   numeric not null default 1 check (oil_factor >= 0),
    water_factor numeric not null default 1 check (water_factor >= 0),
    gas_factor   numeric not null default 1 check (gas_factor >= 0),
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),
    unique (well_id, period_month)
);

comment on table public.po_allocation_factors is
    'Production data spine P1: monthly back-allocation factors per well per phase. period_month is the first of the month. Written by the P3 Allocation Studio; 1.0 = fully allocated.';

create index if not exists po_allocation_factors_well_month_idx
    on public.po_allocation_factors (well_id, period_month desc);

alter table public.po_allocation_factors enable row level security;

drop policy if exists "po_allocation_factors_select_via_field" on public.po_allocation_factors;
create policy "po_allocation_factors_select_via_field"
    on public.po_allocation_factors for select
    using (exists (
      select 1
      from public.po_wells w
      join public.po_fields f on f.id = w.field_id
      where w.id = po_allocation_factors.well_id
        and (f.user_id = auth.uid()
             or (f.organization_id is not null and public.is_org_member(f.organization_id)))
    ));

drop policy if exists "po_allocation_factors_write_own" on public.po_allocation_factors;
create policy "po_allocation_factors_write_own"
    on public.po_allocation_factors for all
    using (auth.uid() = user_id)
    with check (
      auth.uid() = user_id
      and exists (select 1 from public.po_wells w
                  where w.id = po_allocation_factors.well_id and w.user_id = auth.uid())
    );
