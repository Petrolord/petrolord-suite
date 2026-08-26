-- Drilling D2 (Drilling Fluids & Hydraulics Studio) data model —
-- Drilling-ROADMAP.md §4 D2. Two tables in the wp_* family (the D1
-- 20260826120000 patterns verbatim); hole/casing geometry is NOT duplicated
-- here: D2 reads the shared wp_wellbore_geometry spine created at D1.
--
--   wp_hyd_cases  a hydraulics scenario: mud (density + Fann readings +
--                 model choice), drillstring (D1 component shape), flow
--                 config (rate, nozzles, surface line loss), trip config
--                 and cuttings params. Keyed to wellbore + design.
--   wp_hyd_runs   immutable run history (wp_td_runs shape: insert-own +
--                 delete-own, NO update policy).
--
-- Sharing identical to wp_*: private by default, org read-only via the
-- site, writes owner-only. SI units in storage; UI converts. Idempotent,
-- safe pre-deploy (the tile ships HELD at H3 per the single-upload gate).

create table if not exists public.wp_hyd_cases (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references auth.users (id) on delete cascade,
    wellbore_id uuid not null references public.wp_wellbores (id) on delete cascade,
    design_id   uuid references public.wp_designs (id) on delete set null,
    name        text not null default 'Case 1',
    mud         jsonb not null default '{}'::jsonb,
    string      jsonb not null default '[]'::jsonb,
    flow        jsonb not null default '{}'::jsonb,
    trip        jsonb not null default '{}'::jsonb,
    cuttings    jsonb not null default '{}'::jsonb,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create index if not exists wp_hyd_cases_wellbore_idx
    on public.wp_hyd_cases (wellbore_id, created_at desc);

alter table public.wp_hyd_cases enable row level security;

drop policy if exists "wp_hyd_cases_select_via_site" on public.wp_hyd_cases;
create policy "wp_hyd_cases_select_via_site"
    on public.wp_hyd_cases for select
    using (exists (
      select 1
      from public.wp_wellbores w
      join public.wp_sites s on s.id = w.site_id
      where w.id = wp_hyd_cases.wellbore_id
        and (s.user_id = auth.uid()
             or (s.organization_id is not null and public.is_org_member(s.organization_id)))
    ));

drop policy if exists "wp_hyd_cases_write_own" on public.wp_hyd_cases;
create policy "wp_hyd_cases_write_own"
    on public.wp_hyd_cases for all
    using (auth.uid() = user_id)
    with check (
      auth.uid() = user_id
      and exists (select 1 from public.wp_wellbores w
                  where w.id = wp_hyd_cases.wellbore_id and w.user_id = auth.uid())
    );

create table if not exists public.wp_hyd_runs (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid not null references auth.users (id) on delete cascade,
    case_id        uuid not null references public.wp_hyd_cases (id) on delete cascade,
    design_id      uuid references public.wp_designs (id) on delete set null,
    params         jsonb not null,
    results        jsonb not null,
    summary        jsonb not null,
    engine_version text,
    created_at     timestamptz not null default now()
);

create index if not exists wp_hyd_runs_case_idx
    on public.wp_hyd_runs (case_id, created_at desc);

alter table public.wp_hyd_runs enable row level security;

drop policy if exists "wp_hyd_runs_select_via_site" on public.wp_hyd_runs;
create policy "wp_hyd_runs_select_via_site"
    on public.wp_hyd_runs for select
    using (exists (
      select 1
      from public.wp_hyd_cases c
      join public.wp_wellbores w on w.id = c.wellbore_id
      join public.wp_sites s on s.id = w.site_id
      where c.id = wp_hyd_runs.case_id
        and (s.user_id = auth.uid()
             or (s.organization_id is not null and public.is_org_member(s.organization_id)))
    ));

drop policy if exists "wp_hyd_runs_insert_own" on public.wp_hyd_runs;
create policy "wp_hyd_runs_insert_own"
    on public.wp_hyd_runs for insert
    with check (
      auth.uid() = user_id
      and exists (select 1 from public.wp_hyd_cases c
                  where c.id = wp_hyd_runs.case_id and c.user_id = auth.uid())
    );

drop policy if exists "wp_hyd_runs_delete_own" on public.wp_hyd_runs;
create policy "wp_hyd_runs_delete_own"
    on public.wp_hyd_runs for delete
    using (auth.uid() = user_id);
