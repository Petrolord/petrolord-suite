-- Well Data Manager G1.1 (docs/scope/WellDataManager-PLAN.md, approved
-- 2026-07-12): the SHARED subsurface well registry every geoscience app
-- reads, plus the suite's single membership choke point.
--
-- SHARED-TABLE NOTICE (Petrolord_Database_Conventions): wells_* is
-- cross-product infrastructure — schema changes here carry the same
-- second-engineer review bar as organizations/users.
--
-- Design (locked in the plan):
--   wells        header + deviation/checkshots as compact jsonb (the
--                proven seismic_wells shapes — a survey is a few KB and
--                is always consumed whole)
--   wells_tops   NORMALIZED rows: Well Correlation (G3) queries and
--                propagates tops ACROSS wells, and each pick carries
--                provenance
--   wells_logs   LAS curve metadata; samples live as little-endian
--                float32 objects in the private `wells` bucket under
--                {user_id}/{well_id}/logs/{log_id}.f32 — never large
--                jsonb (the Seismolord brick rule)
--   sharing      private by default (organization_id null); an explicit
--                share stamps the owner's org id on the WELL; children
--                inherit visibility through the well row. v1 sharing is
--                READ-ONLY for org members; every write stays
--                owner-only.
--
-- is_org_member(org): SECURITY DEFINER so RLS can consult the
-- membership tables regardless of their own policies; STABLE; fixed
-- search_path. It is THE only place policies ask "is auth.uid() in org
-- X" — when the suite-level membership consolidation lands (roadmap
-- §6.1, scheduled alongside G5), this function shrinks to one query and
-- no policy changes.
--
-- jsonb payload shapes + depth conventions match seismic_wells:
--   deviation:  [{ "md": m, "inc": deg, "azi": deg }, ...]  md ascending
--   checkshots: [{ "tvdss_m": m, "twt_ms": ms }, ...]       strictly monotonic
-- Internal units are SI (metres); ft inputs convert at import with the
-- factor recorded in provenance. crs_note/units_note record what the
-- coordinates mean — no silent assumptions.
--
-- Storage note: the `wells` bucket has no server-side quota yet (log
-- curves are small); revisit alongside G1.2 if profiling disagrees.

-- ---- membership helper --------------------------------------------------
--
-- PRE-EXISTING FUNCTION, DELIBERATE BODY UPGRADE: is_org_member(org_id)
-- already exists (EPE/econ work) checking ONLY organization_members —
-- exactly the single-table inconsistency Geoscience-ROADMAP.md §6.1
-- exists to fix. ~55 policies across the epe schema and econ_* tables
-- call it; replacing the BODY (parameter name kept — Postgres forbids
-- renaming) upgrades them all to the consistent three-table membership
-- view in one step. Live behavioral delta at migration time: +1 user
-- provisioned only via organization_users; the new active-status filter
-- excludes nobody (all live membership rows are 'active').

create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.organization_users ou
      where ou.organization_id = is_org_member.org_id
        and ou.user_id = auth.uid()
        and coalesce(lower(ou.status), 'active') = 'active'
    )
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = is_org_member.org_id
        and om.user_id = auth.uid()
        and coalesce(lower(om.status), 'active') = 'active'
    )
    or exists (
      select 1 from public.org_members m
      where m.org_id = is_org_member.org_id
        and m.user_id = auth.uid()
    );
$$;

comment on function public.is_org_member(uuid) is
  'True when auth.uid() is an active member of the organization, checked across all three legacy membership tables. The ONLY membership predicate RLS policies may use (Geoscience-ROADMAP.md §6.1). Consumers: wells_*, epe.*, econ_*.';

grant execute on function public.is_org_member(uuid) to authenticated;

-- ---- wells (parent) -------------------------------------------------------

create table if not exists public.geo_wells (
    id               uuid primary key default gen_random_uuid(),
    user_id          uuid not null references auth.users (id) on delete cascade,
    organization_id  uuid references public.organizations (id) on delete set null,
    name             text not null,
    uwi              text,
    surface_x        double precision not null,
    surface_y        double precision not null,
    kb_m             double precision not null default 0,
    td_md_m          double precision,
    crs_note         text,
    units_note       text,
    deviation        jsonb not null default '[]'::jsonb,
    checkshots       jsonb not null default '[]'::jsonb,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

comment on table public.geo_wells is
    'Shared subsurface well registry (Well Data Manager G1): per-user, org-shareable read-only; world coordinates; compact jsonb deviation/checkshots.';

create index if not exists geo_wells_user_id_idx
    on public.geo_wells (user_id, created_at desc);
create index if not exists geo_wells_organization_id_idx
    on public.geo_wells (organization_id) where organization_id is not null;

alter table public.geo_wells enable row level security;

drop policy if exists "geo_wells_select_own_or_org" on public.geo_wells;
create policy "geo_wells_select_own_or_org"
    on public.geo_wells for select
    using (
      auth.uid() = user_id
      or (organization_id is not null and public.is_org_member(organization_id))
    );

drop policy if exists "geo_wells_insert_own" on public.geo_wells;
create policy "geo_wells_insert_own"
    on public.geo_wells for insert
    with check (
      auth.uid() = user_id
      -- you may only share to an organization you belong to
      and (organization_id is null or public.is_org_member(organization_id))
    );

drop policy if exists "geo_wells_update_own" on public.geo_wells;
create policy "geo_wells_update_own"
    on public.geo_wells for update
    using (auth.uid() = user_id)
    with check (
      auth.uid() = user_id
      and (organization_id is null or public.is_org_member(organization_id))
    );

drop policy if exists "geo_wells_delete_own" on public.geo_wells;
create policy "geo_wells_delete_own"
    on public.geo_wells for delete
    using (auth.uid() = user_id);

-- ---- wells_tops (child, normalized) ---------------------------------------

create table if not exists public.geo_wells_tops (
    id           uuid primary key default gen_random_uuid(),
    well_id      uuid not null references public.geo_wells (id) on delete cascade,
    name         text not null,
    md_m         double precision not null,
    interpreter  text,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

comment on table public.geo_wells_tops is
    'Formation tops (normalized for cross-well queries — G3 correlation picks and propagates by name). md_m is measured depth below KB, metres.';

create index if not exists geo_wells_tops_well_id_idx on public.geo_wells_tops (well_id);
create index if not exists geo_wells_tops_name_idx on public.geo_wells_tops (name);

alter table public.geo_wells_tops enable row level security;

-- child visibility = parent visibility: the subquery on wells runs
-- under the caller's own RLS, so owners see their own and org members
-- see shared — no duplicated org logic here.
drop policy if exists "geo_wells_tops_select_via_well" on public.geo_wells_tops;
create policy "geo_wells_tops_select_via_well"
    on public.geo_wells_tops for select
    using (exists (select 1 from public.geo_wells w where w.id = well_id));

drop policy if exists "geo_wells_tops_insert_own" on public.geo_wells_tops;
create policy "geo_wells_tops_insert_own"
    on public.geo_wells_tops for insert
    with check (exists (
      select 1 from public.geo_wells w where w.id = well_id and w.user_id = auth.uid()
    ));

drop policy if exists "geo_wells_tops_update_own" on public.geo_wells_tops;
create policy "geo_wells_tops_update_own"
    on public.geo_wells_tops for update
    using (exists (
      select 1 from public.geo_wells w where w.id = well_id and w.user_id = auth.uid()
    ))
    with check (exists (
      select 1 from public.geo_wells w where w.id = well_id and w.user_id = auth.uid()
    ));

drop policy if exists "geo_wells_tops_delete_own" on public.geo_wells_tops;
create policy "geo_wells_tops_delete_own"
    on public.geo_wells_tops for delete
    using (exists (
      select 1 from public.geo_wells w where w.id = well_id and w.user_id = auth.uid()
    ));

-- ---- wells_logs (child, metadata; curves in Storage) ----------------------

create table if not exists public.geo_wells_logs (
    id           uuid primary key default gen_random_uuid(),
    well_id      uuid not null references public.geo_wells (id) on delete cascade,
    mnemonic     text not null,
    description  text,
    unit         text,
    start_md_m   double precision,
    stop_md_m    double precision,
    step_m       double precision,          -- null = irregular; depth vector stored as its own object
    n_samples    integer not null default 0,
    null_count   integer not null default 0,
    source_file  text,
    provenance   jsonb not null default '{}'::jsonb,   -- unit conversions, LAS version, import date
    storage_path text not null,             -- {user_id}/{well_id}/logs/{log_id}.f32
    created_at   timestamptz not null default now()
);

comment on table public.geo_wells_logs is
    'LAS curve metadata; float32 samples live in the private wells bucket at storage_path. SI units internally; conversion factors recorded in provenance.';

create index if not exists geo_wells_logs_well_id_idx on public.geo_wells_logs (well_id);

alter table public.geo_wells_logs enable row level security;

drop policy if exists "geo_wells_logs_select_via_well" on public.geo_wells_logs;
create policy "geo_wells_logs_select_via_well"
    on public.geo_wells_logs for select
    using (exists (select 1 from public.geo_wells w where w.id = well_id));

drop policy if exists "geo_wells_logs_insert_own" on public.geo_wells_logs;
create policy "geo_wells_logs_insert_own"
    on public.geo_wells_logs for insert
    with check (exists (
      select 1 from public.geo_wells w where w.id = well_id and w.user_id = auth.uid()
    ));

drop policy if exists "geo_wells_logs_update_own" on public.geo_wells_logs;
create policy "geo_wells_logs_update_own"
    on public.geo_wells_logs for update
    using (exists (
      select 1 from public.geo_wells w where w.id = well_id and w.user_id = auth.uid()
    ))
    with check (exists (
      select 1 from public.geo_wells w where w.id = well_id and w.user_id = auth.uid()
    ));

drop policy if exists "geo_wells_logs_delete_own" on public.geo_wells_logs;
create policy "geo_wells_logs_delete_own"
    on public.geo_wells_logs for delete
    using (exists (
      select 1 from public.geo_wells w where w.id = well_id and w.user_id = auth.uid()
    ));

-- ---- private `wells` storage bucket ---------------------------------------

insert into storage.buckets (id, name, public)
values ('wells', 'wells', false)
on conflict (id) do nothing;

-- Owner-path writes; reads for the owner OR members of the org a
-- SHARED owning well belongs to. The well id is resolved from the
-- object path by TEXT comparison (w.id::text = path segment) — never a
-- ::uuid cast of path input, which errored whole-bucket queries in the
-- legacy seismic policies.

drop policy if exists "wells_objects_insert_own" on storage.objects;
create policy "wells_objects_insert_own"
    on storage.objects for insert
    with check (
      bucket_id = 'wells'
      and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists "wells_objects_select_own_or_org" on storage.objects;
create policy "wells_objects_select_own_or_org"
    on storage.objects for select
    using (
      bucket_id = 'wells'
      and (
        (storage.foldername(name))[1] = auth.uid()::text
        or exists (
          select 1 from public.geo_wells w
          -- objects.name MUST be qualified: unqualified `name` inside
          -- this correlated subquery binds to w.name (the well's name)
          -- and the branch silently never matches (caught by pentest B5a)
          where w.id::text = (storage.foldername(objects.name))[2]
            and w.organization_id is not null
            and public.is_org_member(w.organization_id)
        )
      )
    );

drop policy if exists "wells_objects_update_own" on storage.objects;
create policy "wells_objects_update_own"
    on storage.objects for update
    using (
      bucket_id = 'wells'
      and (storage.foldername(name))[1] = auth.uid()::text
    )
    with check (
      bucket_id = 'wells'
      and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists "wells_objects_delete_own" on storage.objects;
create policy "wells_objects_delete_own"
    on storage.objects for delete
    using (
      bucket_id = 'wells'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
