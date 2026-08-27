-- Drilling D6 (Casing & Tubing Design Studio) data model —
-- Drilling-ROADMAP.md §4 D6, the casing-tubing-design-pro upgrade.
-- Two tables in the wp_* family (D1-D5 patterns verbatim).
--
--   wp_ct_cases  a design case: strings (casing/tubing sections in SI with
--                catalog refs + computed ratings snapshot), environment
--                (mud/temp/PPFG source or override), load_cases (canonical
--                per-case params), packer, safety_factors.
--   wp_ct_runs   immutable run history (insert-own + delete-own, NO
--                update policy).
--
-- Trajectory comes from the definitive wp_designs stations; PPFG hints from
-- published pp-1.0.0 curves via geo_wells RLS. SI in storage. Idempotent,
-- safe pre-deploy (tile update HELD under the single-upload gate).

create table if not exists public.wp_ct_cases (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid not null references auth.users (id) on delete cascade,
    wellbore_id    uuid not null references public.wp_wellbores (id) on delete cascade,
    design_id      uuid references public.wp_designs (id) on delete set null,
    name           text not null default 'Case 1',
    strings        jsonb not null default '{}'::jsonb,
    environment    jsonb not null default '{}'::jsonb,
    load_cases     jsonb not null default '[]'::jsonb,
    packer         jsonb not null default '{}'::jsonb,
    safety_factors jsonb not null default '{}'::jsonb,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

create index if not exists wp_ct_cases_wellbore_idx
    on public.wp_ct_cases (wellbore_id, created_at desc);

alter table public.wp_ct_cases enable row level security;

drop policy if exists "wp_ct_cases_select_via_site" on public.wp_ct_cases;
create policy "wp_ct_cases_select_via_site"
    on public.wp_ct_cases for select
    using (exists (
      select 1
      from public.wp_wellbores w
      join public.wp_sites s on s.id = w.site_id
      where w.id = wp_ct_cases.wellbore_id
        and (s.user_id = auth.uid()
             or (s.organization_id is not null and public.is_org_member(s.organization_id)))
    ));

drop policy if exists "wp_ct_cases_write_own" on public.wp_ct_cases;
create policy "wp_ct_cases_write_own"
    on public.wp_ct_cases for all
    using (auth.uid() = user_id)
    with check (
      auth.uid() = user_id
      and exists (select 1 from public.wp_wellbores w
                  where w.id = wp_ct_cases.wellbore_id and w.user_id = auth.uid())
    );

create table if not exists public.wp_ct_runs (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid not null references auth.users (id) on delete cascade,
    case_id        uuid not null references public.wp_ct_cases (id) on delete cascade,
    design_id      uuid references public.wp_designs (id) on delete set null,
    params         jsonb not null,
    results        jsonb not null,
    summary        jsonb not null,
    engine_version text,
    created_at     timestamptz not null default now()
);

create index if not exists wp_ct_runs_case_idx
    on public.wp_ct_runs (case_id, created_at desc);

alter table public.wp_ct_runs enable row level security;

drop policy if exists "wp_ct_runs_select_via_site" on public.wp_ct_runs;
create policy "wp_ct_runs_select_via_site"
    on public.wp_ct_runs for select
    using (exists (
      select 1
      from public.wp_ct_cases c
      join public.wp_wellbores w on w.id = c.wellbore_id
      join public.wp_sites s on s.id = w.site_id
      where c.id = wp_ct_runs.case_id
        and (s.user_id = auth.uid()
             or (s.organization_id is not null and public.is_org_member(s.organization_id)))
    ));

drop policy if exists "wp_ct_runs_insert_own" on public.wp_ct_runs;
create policy "wp_ct_runs_insert_own"
    on public.wp_ct_runs for insert
    with check (
      auth.uid() = user_id
      and exists (select 1 from public.wp_ct_cases c
                  where c.id = wp_ct_runs.case_id and c.user_id = auth.uid())
    );

drop policy if exists "wp_ct_runs_delete_own" on public.wp_ct_runs;
create policy "wp_ct_runs_delete_own"
    on public.wp_ct_runs for delete
    using (auth.uid() = user_id);
