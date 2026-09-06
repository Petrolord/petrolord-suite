-- Stratigraphy Studio ST2: sequence stratigraphy
-- (docs/scope/Stratigraphy-PLAN.md section 6, approved 2026-09-06).
--
-- 1. strat_projects: Stratigraphy Studio's app-private view state (the
--    geo_correlation_sections pattern, owner-only): which shared section
--    is open, the terminology scheme, the stratigraphic flattening
--    (stretch between two surfaces), the Wheeler view settings.
-- 2. geo_wells_tops gains hiatus_to_ma: for an unconformity, the age of
--    the youngest rock preserved below it (older than age_ma), which the
--    age-depth model and the Wheeler chart need to draw the hiatus.
--    Additive nullable on the shared registry table: second-engineer
--    review, like the ST0 columns.
-- Idempotent. Log in MIGRATIONS.md.

create table if not exists public.strat_projects (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid not null references auth.users (id) on delete cascade,
    name           text not null default 'Default',
    section_id     uuid references public.geo_correlation_sections (id) on delete set null,
    scheme         text not null default 'catuneanu' check (scheme in ('catuneanu', 'exxon')),
    flatten        jsonb not null default '{}'::jsonb,   -- {mode, topName, datumM, upperName, lowerName}
    wheeler        jsonb not null default '{}'::jsonb,   -- {colourBy, showHiatus, ageStep}
    view           jsonb not null default '{}'::jsonb,   -- {view, ghost, shownTops}
    schema_version integer not null default 1,
    app_build      text,
    engine_version text,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

comment on table public.strat_projects is
    'Stratigraphy Studio view state (ST2): the open shared section, terminology scheme, stratigraphic flattening and Wheeler settings. Owner-only; interpretation products themselves are shared registry rows (typed tops, intervals).';

create index if not exists strat_projects_user_id_idx on public.strat_projects (user_id, updated_at desc);

alter table public.strat_projects enable row level security;

drop policy if exists "strat_projects_select_own" on public.strat_projects;
create policy "strat_projects_select_own" on public.strat_projects for select using (auth.uid() = user_id);
drop policy if exists "strat_projects_insert_own" on public.strat_projects;
create policy "strat_projects_insert_own" on public.strat_projects for insert with check (auth.uid() = user_id);
drop policy if exists "strat_projects_update_own" on public.strat_projects;
create policy "strat_projects_update_own" on public.strat_projects for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "strat_projects_delete_own" on public.strat_projects;
create policy "strat_projects_delete_own" on public.strat_projects for delete using (auth.uid() = user_id);

-- ---- geo_wells_tops: the older bound of a hiatus -----------------------------

alter table public.geo_wells_tops
    add column if not exists hiatus_to_ma double precision;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'geo_wells_tops_hiatus_order') then
    alter table public.geo_wells_tops add constraint geo_wells_tops_hiatus_order
      check (hiatus_to_ma is null or age_ma is null or hiatus_to_ma > age_ma);
  end if;
end $$;

comment on column public.geo_wells_tops.hiatus_to_ma is
    'For an unconformity: age (Ma) of the youngest rock preserved below the surface, older than age_ma; the hiatus spans age_ma to hiatus_to_ma (Stratigraphy Studio ST2).';
