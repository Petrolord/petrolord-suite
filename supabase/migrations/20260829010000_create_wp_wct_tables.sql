-- Drilling D11 (Well Cost & Time Estimator) data model —
-- Drilling-ROADMAP.md §4 D11, fresh slug well-cost-time. Two tables in
-- the wp_* family (D1-D10 patterns verbatim).
--
--   wp_wct_cases  a cost & time estimate: program (ordered activities
--                 with drill/trip/casing/flat closed-form inputs +
--                 nptFrac), costs (AFE items per-day/per-meter/lump
--                 with tangible/intangible category + contingency
--                 fraction), risk (Monte Carlo iterations/seed +
--                 uncertainty dists sampled by the canonical suite
--                 module), params. ct_case_id optionally links the D6
--                 casing design for tangibles context.
--   wp_wct_runs   immutable run history (insert-own + delete-own, NO
--                 update policy).
--
-- USD/m/hours in storage. Idempotent, safe pre-deploy (tile seed HELD
-- under the single-upload gate).

create table if not exists public.wp_wct_cases (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid not null references auth.users (id) on delete cascade,
    wellbore_id    uuid not null references public.wp_wellbores (id) on delete cascade,
    design_id      uuid references public.wp_designs (id) on delete set null,
    ct_case_id     uuid references public.wp_ct_cases (id) on delete set null,
    name           text not null default 'Estimate 1',
    program        jsonb not null default '{}'::jsonb,
    costs          jsonb not null default '{}'::jsonb,
    risk           jsonb not null default '{}'::jsonb,
    params         jsonb not null default '{}'::jsonb,
    notes          text,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

create index if not exists wp_wct_cases_wellbore_idx
    on public.wp_wct_cases (wellbore_id, created_at desc);

alter table public.wp_wct_cases enable row level security;

drop policy if exists "wp_wct_cases_select_via_site" on public.wp_wct_cases;
create policy "wp_wct_cases_select_via_site"
    on public.wp_wct_cases for select
    using (exists (
      select 1
      from public.wp_wellbores w
      join public.wp_sites s on s.id = w.site_id
      where w.id = wp_wct_cases.wellbore_id
        and (s.user_id = auth.uid()
             or (s.organization_id is not null and public.is_org_member(s.organization_id)))
    ));

drop policy if exists "wp_wct_cases_write_own" on public.wp_wct_cases;
create policy "wp_wct_cases_write_own"
    on public.wp_wct_cases for all
    using (auth.uid() = user_id)
    with check (
      auth.uid() = user_id
      and exists (select 1 from public.wp_wellbores w
                  where w.id = wp_wct_cases.wellbore_id and w.user_id = auth.uid())
    );

create table if not exists public.wp_wct_runs (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid not null references auth.users (id) on delete cascade,
    case_id        uuid not null references public.wp_wct_cases (id) on delete cascade,
    design_id      uuid references public.wp_designs (id) on delete set null,
    params         jsonb not null,
    results        jsonb not null,
    summary        jsonb not null,
    engine_version text,
    created_at     timestamptz not null default now()
);

create index if not exists wp_wct_runs_case_idx
    on public.wp_wct_runs (case_id, created_at desc);

alter table public.wp_wct_runs enable row level security;

drop policy if exists "wp_wct_runs_select_via_site" on public.wp_wct_runs;
create policy "wp_wct_runs_select_via_site"
    on public.wp_wct_runs for select
    using (exists (
      select 1
      from public.wp_wct_cases c
      join public.wp_wellbores w on w.id = c.wellbore_id
      join public.wp_sites s on s.id = w.site_id
      where c.id = wp_wct_runs.case_id
        and (s.user_id = auth.uid()
             or (s.organization_id is not null and public.is_org_member(s.organization_id)))
    ));

drop policy if exists "wp_wct_runs_insert_own" on public.wp_wct_runs;
create policy "wp_wct_runs_insert_own"
    on public.wp_wct_runs for insert
    with check (
      auth.uid() = user_id
      and exists (select 1 from public.wp_wct_cases c
                  where c.id = wp_wct_runs.case_id and c.user_id = auth.uid())
    );

drop policy if exists "wp_wct_runs_delete_own" on public.wp_wct_runs;
create policy "wp_wct_runs_delete_own"
    on public.wp_wct_runs for delete
    using (auth.uid() = user_id);
