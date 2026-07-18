-- WT2 (Well Test Analysis Studio, docs/scope/WellTestAnalysisStudio-STATUS.md):
-- project persistence. The saved_<app>_projects convention (scenario-hub/
-- dca/waterflood pattern): owner-scoped RLS, payload in inputs_data (gauge
-- data, rate history, reservoir/fluid properties, test config and match
-- parameters; analysis results are a pure function of inputs and are
-- recomputed on load). Safe to apply ahead of the app deploy (no tile
-- involved); idempotent.
--
-- Note: the legacy pta_projects table referenced by the deleted mock Well
-- Test Analyzer is handled separately after a live-DB content check (WT2
-- gate; drop only if empty).

create table if not exists public.saved_well_test_projects (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references auth.users (id) on delete cascade,
    project_name  text not null,
    inputs_data   jsonb not null,
    results_data  jsonb,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

create index if not exists saved_well_test_projects_user_id_idx
    on public.saved_well_test_projects (user_id, updated_at desc);

alter table public.saved_well_test_projects enable row level security;

drop policy if exists "well_test_owner_all" on public.saved_well_test_projects;
create policy "well_test_owner_all"
    on public.saved_well_test_projects for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
