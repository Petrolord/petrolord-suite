-- Drilling D5 (Geomechanics & Wellbore Stability Studio) data model —
-- Drilling-ROADMAP.md §4 D5, the owner-locked MEM-under-Drilling rebuild.
-- Two tables in the wp_* family (D1-D4 patterns verbatim).
--
--   wp_gm_cases  a MEM case: log source (geo_well + mnemonic overrides +
--                pore-pressure source choice) and geomechanical parameters
--                (nu, Biot alpha, friction angle, tensile strength,
--                tectonic strains, SHmax azimuth, regime, k0 override,
--                UCS correlation, lithology seed).
--   wp_gm_runs   immutable run history (insert-own + delete-own, NO
--                update policy).
--
-- Log curves live in geo_wells_logs (the shared registry) and are read via
-- RLS there; computed SHMIN/SHMAX/UCS curves publish back under the
-- gm-1.0.0 contract. Sharing identical to wp_*. SI in storage. Idempotent,
-- safe pre-deploy (tile HELD at G3 under the single-upload gate).

create table if not exists public.wp_gm_cases (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references auth.users (id) on delete cascade,
    wellbore_id uuid not null references public.wp_wellbores (id) on delete cascade,
    design_id   uuid references public.wp_designs (id) on delete set null,
    name        text not null default 'Case 1',
    source      jsonb not null default '{}'::jsonb,
    params      jsonb not null default '{}'::jsonb,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create index if not exists wp_gm_cases_wellbore_idx
    on public.wp_gm_cases (wellbore_id, created_at desc);

alter table public.wp_gm_cases enable row level security;

drop policy if exists "wp_gm_cases_select_via_site" on public.wp_gm_cases;
create policy "wp_gm_cases_select_via_site"
    on public.wp_gm_cases for select
    using (exists (
      select 1
      from public.wp_wellbores w
      join public.wp_sites s on s.id = w.site_id
      where w.id = wp_gm_cases.wellbore_id
        and (s.user_id = auth.uid()
             or (s.organization_id is not null and public.is_org_member(s.organization_id)))
    ));

drop policy if exists "wp_gm_cases_write_own" on public.wp_gm_cases;
create policy "wp_gm_cases_write_own"
    on public.wp_gm_cases for all
    using (auth.uid() = user_id)
    with check (
      auth.uid() = user_id
      and exists (select 1 from public.wp_wellbores w
                  where w.id = wp_gm_cases.wellbore_id and w.user_id = auth.uid())
    );

create table if not exists public.wp_gm_runs (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid not null references auth.users (id) on delete cascade,
    case_id        uuid not null references public.wp_gm_cases (id) on delete cascade,
    design_id      uuid references public.wp_designs (id) on delete set null,
    params         jsonb not null,
    results        jsonb not null,
    summary        jsonb not null,
    engine_version text,
    created_at     timestamptz not null default now()
);

create index if not exists wp_gm_runs_case_idx
    on public.wp_gm_runs (case_id, created_at desc);

alter table public.wp_gm_runs enable row level security;

drop policy if exists "wp_gm_runs_select_via_site" on public.wp_gm_runs;
create policy "wp_gm_runs_select_via_site"
    on public.wp_gm_runs for select
    using (exists (
      select 1
      from public.wp_gm_cases c
      join public.wp_wellbores w on w.id = c.wellbore_id
      join public.wp_sites s on s.id = w.site_id
      where c.id = wp_gm_runs.case_id
        and (s.user_id = auth.uid()
             or (s.organization_id is not null and public.is_org_member(s.organization_id)))
    ));

drop policy if exists "wp_gm_runs_insert_own" on public.wp_gm_runs;
create policy "wp_gm_runs_insert_own"
    on public.wp_gm_runs for insert
    with check (
      auth.uid() = user_id
      and exists (select 1 from public.wp_gm_cases c
                  where c.id = wp_gm_runs.case_id and c.user_id = auth.uid())
    );

drop policy if exists "wp_gm_runs_delete_own" on public.wp_gm_runs;
create policy "wp_gm_runs_delete_own"
    on public.wp_gm_runs for delete
    using (auth.uid() = user_id);
