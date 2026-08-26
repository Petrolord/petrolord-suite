-- Drilling D1 (Torque & Drag Studio) data model — Drilling-ROADMAP.md §4 D1.
-- Three tables in the wp_* family (20260825220000 patterns):
--
--   wp_wellbore_geometry  module-wide hole/casing geometry spine, ONE row per
--                         wellbore (D2 hydraulics and the D6 casing upgrade
--                         consume the same rows). hole_sections jsonb, SI
--                         metres: [{from_md_m, to_md_m, hole_id_m, cased,
--                         casing_od_m, casing_id_m, casing_weight_kgm,
--                         grade, description}].
--   wp_td_cases           a T&D scenario: drillstring, mud, friction,
--                         operations config, keyed to wellbore + design.
--   wp_td_runs            immutable run history (the wp_ac_runs shape:
--                         insert-own + delete-own, NO update policy).
--
-- Sharing model identical to the rest of wp_*: private by default, the SITE
-- carries organization_id; org access is read-only via the join chain,
-- writes are owner-only. All lengths SI metres; depth-unit conversion for
-- ft wellbores happens in the UI at the boundary. Idempotent, safe
-- pre-deploy (no tile change here; the tile ships deploy-gated at TD3).

create table if not exists public.wp_wellbore_geometry (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references auth.users (id) on delete cascade,
    wellbore_id   uuid not null references public.wp_wellbores (id) on delete cascade,
    hole_sections jsonb not null default '[]'::jsonb,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    unique (wellbore_id)
);

alter table public.wp_wellbore_geometry enable row level security;

drop policy if exists "wp_wellbore_geometry_select_via_site" on public.wp_wellbore_geometry;
create policy "wp_wellbore_geometry_select_via_site"
    on public.wp_wellbore_geometry for select
    using (exists (
      select 1
      from public.wp_wellbores w
      join public.wp_sites s on s.id = w.site_id
      where w.id = wp_wellbore_geometry.wellbore_id
        and (s.user_id = auth.uid()
             or (s.organization_id is not null and public.is_org_member(s.organization_id)))
    ));

drop policy if exists "wp_wellbore_geometry_write_own" on public.wp_wellbore_geometry;
create policy "wp_wellbore_geometry_write_own"
    on public.wp_wellbore_geometry for all
    using (auth.uid() = user_id)
    with check (
      auth.uid() = user_id
      and exists (select 1 from public.wp_wellbores w
                  where w.id = wp_wellbore_geometry.wellbore_id and w.user_id = auth.uid())
    );

create table if not exists public.wp_td_cases (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references auth.users (id) on delete cascade,
    wellbore_id uuid not null references public.wp_wellbores (id) on delete cascade,
    design_id   uuid references public.wp_designs (id) on delete set null,
    name        text not null default 'Case 1',
    string      jsonb not null default '[]'::jsonb,
    mud         jsonb not null default '{}'::jsonb,
    friction    jsonb not null default '{}'::jsonb,
    operations  jsonb not null default '{}'::jsonb,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create index if not exists wp_td_cases_wellbore_idx
    on public.wp_td_cases (wellbore_id, created_at desc);

alter table public.wp_td_cases enable row level security;

drop policy if exists "wp_td_cases_select_via_site" on public.wp_td_cases;
create policy "wp_td_cases_select_via_site"
    on public.wp_td_cases for select
    using (exists (
      select 1
      from public.wp_wellbores w
      join public.wp_sites s on s.id = w.site_id
      where w.id = wp_td_cases.wellbore_id
        and (s.user_id = auth.uid()
             or (s.organization_id is not null and public.is_org_member(s.organization_id)))
    ));

drop policy if exists "wp_td_cases_write_own" on public.wp_td_cases;
create policy "wp_td_cases_write_own"
    on public.wp_td_cases for all
    using (auth.uid() = user_id)
    with check (
      auth.uid() = user_id
      and exists (select 1 from public.wp_wellbores w
                  where w.id = wp_td_cases.wellbore_id and w.user_id = auth.uid())
    );

create table if not exists public.wp_td_runs (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid not null references auth.users (id) on delete cascade,
    case_id        uuid not null references public.wp_td_cases (id) on delete cascade,
    design_id      uuid references public.wp_designs (id) on delete set null,
    params         jsonb not null,
    results        jsonb not null,
    summary        jsonb not null,
    engine_version text,
    created_at     timestamptz not null default now()
);

create index if not exists wp_td_runs_case_idx
    on public.wp_td_runs (case_id, created_at desc);

alter table public.wp_td_runs enable row level security;

drop policy if exists "wp_td_runs_select_via_site" on public.wp_td_runs;
create policy "wp_td_runs_select_via_site"
    on public.wp_td_runs for select
    using (exists (
      select 1
      from public.wp_td_cases c
      join public.wp_wellbores w on w.id = c.wellbore_id
      join public.wp_sites s on s.id = w.site_id
      where c.id = wp_td_runs.case_id
        and (s.user_id = auth.uid()
             or (s.organization_id is not null and public.is_org_member(s.organization_id)))
    ));

drop policy if exists "wp_td_runs_insert_own" on public.wp_td_runs;
create policy "wp_td_runs_insert_own"
    on public.wp_td_runs for insert
    with check (
      auth.uid() = user_id
      and exists (select 1 from public.wp_td_cases c
                  where c.id = wp_td_runs.case_id and c.user_id = auth.uid())
    );

drop policy if exists "wp_td_runs_delete_own" on public.wp_td_runs;
create policy "wp_td_runs_delete_own"
    on public.wp_td_runs for delete
    using (auth.uid() = user_id);
