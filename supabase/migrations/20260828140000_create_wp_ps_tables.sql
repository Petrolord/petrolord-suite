-- Drilling D8 (Perforation & Sand Control Designer) data model —
-- Drilling-ROADMAP.md §4 D8, fresh slug perforation-sand-control.
-- Two tables in the wp_* family (D1-D7 patterns verbatim).
--
--   wp_ps_cases  a perforation/sand-control case: interval (top/bottom
--                MD), sieve (points[] cumulative-retained + source), gun
--                (catalog snapshot + overrides), params (reservoir
--                k/anisotropy/re/rw/fluid, crushed zone, sanding boost,
--                gravel/screen mode), notes. ct_case_id/cd_case_id link
--                the D6 casing program and D7 completion for clearance.
--   wp_ps_runs   immutable run history (insert-own + delete-own, NO
--                update policy).
--
-- Trajectory context from the definitive wp_designs stations; stress/
-- strength curves from published gm-1.0.0 + pp-1.0.0 logs via geo_wells
-- RLS. SI in storage. Idempotent, safe pre-deploy (tile seed HELD under
-- the single-upload gate).

create table if not exists public.wp_ps_cases (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid not null references auth.users (id) on delete cascade,
    wellbore_id    uuid not null references public.wp_wellbores (id) on delete cascade,
    design_id      uuid references public.wp_designs (id) on delete set null,
    ct_case_id     uuid references public.wp_ct_cases (id) on delete set null,
    cd_case_id     uuid references public.wp_cd_cases (id) on delete set null,
    name           text not null default 'Perforation 1',
    interval       jsonb not null default '{}'::jsonb,
    sieve          jsonb not null default '{}'::jsonb,
    gun            jsonb not null default '{}'::jsonb,
    params         jsonb not null default '{}'::jsonb,
    notes          text,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

create index if not exists wp_ps_cases_wellbore_idx
    on public.wp_ps_cases (wellbore_id, created_at desc);

alter table public.wp_ps_cases enable row level security;

drop policy if exists "wp_ps_cases_select_via_site" on public.wp_ps_cases;
create policy "wp_ps_cases_select_via_site"
    on public.wp_ps_cases for select
    using (exists (
      select 1
      from public.wp_wellbores w
      join public.wp_sites s on s.id = w.site_id
      where w.id = wp_ps_cases.wellbore_id
        and (s.user_id = auth.uid()
             or (s.organization_id is not null and public.is_org_member(s.organization_id)))
    ));

drop policy if exists "wp_ps_cases_write_own" on public.wp_ps_cases;
create policy "wp_ps_cases_write_own"
    on public.wp_ps_cases for all
    using (auth.uid() = user_id)
    with check (
      auth.uid() = user_id
      and exists (select 1 from public.wp_wellbores w
                  where w.id = wp_ps_cases.wellbore_id and w.user_id = auth.uid())
    );

create table if not exists public.wp_ps_runs (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid not null references auth.users (id) on delete cascade,
    case_id        uuid not null references public.wp_ps_cases (id) on delete cascade,
    design_id      uuid references public.wp_designs (id) on delete set null,
    params         jsonb not null,
    results        jsonb not null,
    summary        jsonb not null,
    engine_version text,
    created_at     timestamptz not null default now()
);

create index if not exists wp_ps_runs_case_idx
    on public.wp_ps_runs (case_id, created_at desc);

alter table public.wp_ps_runs enable row level security;

drop policy if exists "wp_ps_runs_select_via_site" on public.wp_ps_runs;
create policy "wp_ps_runs_select_via_site"
    on public.wp_ps_runs for select
    using (exists (
      select 1
      from public.wp_ps_cases c
      join public.wp_wellbores w on w.id = c.wellbore_id
      join public.wp_sites s on s.id = w.site_id
      where c.id = wp_ps_runs.case_id
        and (s.user_id = auth.uid()
             or (s.organization_id is not null and public.is_org_member(s.organization_id)))
    ));

drop policy if exists "wp_ps_runs_insert_own" on public.wp_ps_runs;
create policy "wp_ps_runs_insert_own"
    on public.wp_ps_runs for insert
    with check (
      auth.uid() = user_id
      and exists (select 1 from public.wp_ps_cases c
                  where c.id = wp_ps_runs.case_id and c.user_id = auth.uid())
    );

drop policy if exists "wp_ps_runs_delete_own" on public.wp_ps_runs;
create policy "wp_ps_runs_delete_own"
    on public.wp_ps_runs for delete
    using (auth.uid() = user_id);
