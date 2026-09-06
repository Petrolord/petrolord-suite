-- Stratigraphy Studio ST0: the stratigraphic framework
-- (docs/scope/Stratigraphy-PLAN.md section 6, approved 2026-09-06).
--
-- 1. geo_strat_units: the stratigraphic column (group > formation > member
--    > bed), per user, org-shareable read-only, the geo_surfaces RLS
--    pattern. Carries the PP0 state-version columns like every registry
--    table (20260902120500).
-- 2. geo_wells_tops gains the typed-surface fields: surface_type (the
--    Catuneanu codes, single source packages/engines/engines/stratigraphy/
--    vocabulary.js SURFACE_CODES, guarded by a jest test that reads this
--    file), unit_id, confidence, age_ma, notes. All additive; existing rows
--    read as formation_top with nulls elsewhere and no consumer changes
--    behaviour until it opts in.
--
-- Shared registry tables: second-engineer review (Geoscience-ROADMAP.md
-- section 3). Idempotent. Apply staging-first; log in MIGRATIONS.md.

-- ---- geo_strat_units -------------------------------------------------------

create table if not exists public.geo_strat_units (
    id               uuid primary key default gen_random_uuid(),
    user_id          uuid not null references auth.users (id) on delete cascade,
    organization_id  uuid references public.organizations (id) on delete set null,
    name             text not null,
    rank             text not null default 'formation'
        check (rank in ('group', 'formation', 'member', 'bed')),
    parent_id        uuid references public.geo_strat_units (id) on delete set null,
    order_index      integer,                              -- position among siblings, youngest first
    age_top_ma       double precision,
    age_base_ma      double precision,
    colour           text,                                 -- #rrggbb for column fills
    lithology        text,                                 -- dominant lithology code (ST1 vocabulary)
    notes            text,
    schema_version   integer not null default 1,
    app_build        text,
    engine_version   text,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    constraint geo_strat_units_age_order
        check (age_top_ma is null or age_base_ma is null or age_base_ma >= age_top_ma),
    constraint geo_strat_units_not_own_parent
        check (parent_id is null or parent_id <> id)
);

comment on table public.geo_strat_units is
    'Stratigraphic column (Stratigraphy Studio ST0): lithostratigraphic units with rank, parent, sibling order, ages in Ma and a colour. Per user, org-shareable read-only. Tops reference a unit through geo_wells_tops.unit_id.';

create index if not exists geo_strat_units_user_id_idx
    on public.geo_strat_units (user_id, created_at desc);
create index if not exists geo_strat_units_parent_id_idx
    on public.geo_strat_units (parent_id) where parent_id is not null;
create index if not exists geo_strat_units_organization_id_idx
    on public.geo_strat_units (organization_id) where organization_id is not null;

alter table public.geo_strat_units enable row level security;

drop policy if exists "geo_strat_units_select_own_or_org" on public.geo_strat_units;
create policy "geo_strat_units_select_own_or_org"
    on public.geo_strat_units for select
    using (
      auth.uid() = user_id
      or (organization_id is not null and public.is_org_member(organization_id))
    );

drop policy if exists "geo_strat_units_insert_own" on public.geo_strat_units;
create policy "geo_strat_units_insert_own"
    on public.geo_strat_units for insert
    with check (
      auth.uid() = user_id
      and (organization_id is null or public.is_org_member(organization_id))
    );

drop policy if exists "geo_strat_units_update_own" on public.geo_strat_units;
create policy "geo_strat_units_update_own"
    on public.geo_strat_units for update
    using (auth.uid() = user_id)
    with check (
      auth.uid() = user_id
      and (organization_id is null or public.is_org_member(organization_id))
    );

drop policy if exists "geo_strat_units_delete_own" on public.geo_strat_units;
create policy "geo_strat_units_delete_own"
    on public.geo_strat_units for delete
    using (auth.uid() = user_id);

-- ---- geo_wells_tops: typed surfaces -----------------------------------------

alter table public.geo_wells_tops
    add column if not exists surface_type text not null default 'formation_top',
    add column if not exists unit_id      uuid references public.geo_strat_units (id) on delete set null,
    add column if not exists confidence   text,
    add column if not exists age_ma       double precision,
    add column if not exists notes        text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'geo_wells_tops_surface_type_check') then
    alter table public.geo_wells_tops add constraint geo_wells_tops_surface_type_check
      check (surface_type in ('formation_top', 'SU', 'CC', 'BSFR', 'RSME', 'MRS', 'TRS', 'MFS', 'unconformity', 'biozone'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'geo_wells_tops_confidence_check') then
    alter table public.geo_wells_tops add constraint geo_wells_tops_confidence_check
      check (confidence is null or confidence in ('high', 'medium', 'low'));
  end if;
end $$;

create index if not exists geo_wells_tops_unit_id_idx
    on public.geo_wells_tops (unit_id) where unit_id is not null;

comment on column public.geo_wells_tops.surface_type is
    'Catuneanu surface type (Stratigraphy Studio ST0): formation_top (default, lithostratigraphic), SU, CC, BSFR, RSME, MRS, TRS, MFS, unconformity, biozone. Exxon names are display-only.';
comment on column public.geo_wells_tops.unit_id is
    'The stratigraphic unit this top is the top of (geo_strat_units), null when untyped.';
comment on column public.geo_wells_tops.confidence is
    'Pick confidence: high, medium or low; null when not stated.';
comment on column public.geo_wells_tops.age_ma is
    'Age of the surface in Ma (biozone datums, dated surfaces); null when unknown.';
