-- Drilling D3 (Well Control Studio) data model — Drilling-ROADMAP.md §4 D3.
-- Two tables in the wp_* family (D1/D2 patterns verbatim); geometry comes
-- from the shared wp_wellbore_geometry spine.
--
--   wp_wc_cases  a well-control scenario: drillstring (D1 shape), mud,
--                pump (output per stroke + slow-circulating-rate table),
--                shoe (MD + LOT/frac EMW), kick inputs (SIDPP/SICP/pit
--                gain/influx density/kick intensity).
--   wp_wc_runs   immutable run history (insert-own + delete-own, NO
--                update policy).
--
-- Sharing identical to wp_*: private by default, org read-only via the
-- site, writes owner-only. SI in storage. Idempotent, safe pre-deploy
-- (tile HELD at W3 under the single-upload gate).

create table if not exists public.wp_wc_cases (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references auth.users (id) on delete cascade,
    wellbore_id uuid not null references public.wp_wellbores (id) on delete cascade,
    design_id   uuid references public.wp_designs (id) on delete set null,
    name        text not null default 'Case 1',
    string      jsonb not null default '[]'::jsonb,
    mud         jsonb not null default '{}'::jsonb,
    pump        jsonb not null default '{}'::jsonb,
    shoe        jsonb not null default '{}'::jsonb,
    kick        jsonb not null default '{}'::jsonb,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create index if not exists wp_wc_cases_wellbore_idx
    on public.wp_wc_cases (wellbore_id, created_at desc);

alter table public.wp_wc_cases enable row level security;

drop policy if exists "wp_wc_cases_select_via_site" on public.wp_wc_cases;
create policy "wp_wc_cases_select_via_site"
    on public.wp_wc_cases for select
    using (exists (
      select 1
      from public.wp_wellbores w
      join public.wp_sites s on s.id = w.site_id
      where w.id = wp_wc_cases.wellbore_id
        and (s.user_id = auth.uid()
             or (s.organization_id is not null and public.is_org_member(s.organization_id)))
    ));

drop policy if exists "wp_wc_cases_write_own" on public.wp_wc_cases;
create policy "wp_wc_cases_write_own"
    on public.wp_wc_cases for all
    using (auth.uid() = user_id)
    with check (
      auth.uid() = user_id
      and exists (select 1 from public.wp_wellbores w
                  where w.id = wp_wc_cases.wellbore_id and w.user_id = auth.uid())
    );

create table if not exists public.wp_wc_runs (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid not null references auth.users (id) on delete cascade,
    case_id        uuid not null references public.wp_wc_cases (id) on delete cascade,
    design_id      uuid references public.wp_designs (id) on delete set null,
    params         jsonb not null,
    results        jsonb not null,
    summary        jsonb not null,
    engine_version text,
    created_at     timestamptz not null default now()
);

create index if not exists wp_wc_runs_case_idx
    on public.wp_wc_runs (case_id, created_at desc);

alter table public.wp_wc_runs enable row level security;

drop policy if exists "wp_wc_runs_select_via_site" on public.wp_wc_runs;
create policy "wp_wc_runs_select_via_site"
    on public.wp_wc_runs for select
    using (exists (
      select 1
      from public.wp_wc_cases c
      join public.wp_wellbores w on w.id = c.wellbore_id
      join public.wp_sites s on s.id = w.site_id
      where c.id = wp_wc_runs.case_id
        and (s.user_id = auth.uid()
             or (s.organization_id is not null and public.is_org_member(s.organization_id)))
    ));

drop policy if exists "wp_wc_runs_insert_own" on public.wp_wc_runs;
create policy "wp_wc_runs_insert_own"
    on public.wp_wc_runs for insert
    with check (
      auth.uid() = user_id
      and exists (select 1 from public.wp_wc_cases c
                  where c.id = wp_wc_runs.case_id and c.user_id = auth.uid())
    );

drop policy if exists "wp_wc_runs_delete_own" on public.wp_wc_runs;
create policy "wp_wc_runs_delete_own"
    on public.wp_wc_runs for delete
    using (auth.uid() = user_id);
