-- W3 (Waterflood Design Studio, docs/scope/WaterfloodDesignStudio-STATUS.md):
-- project persistence. The saved_<app>_projects convention (scenario-hub/
-- dca/waterflood pattern): owner-scoped RLS, payload in inputs_data
-- (displacement + layer + pattern inputs and scenario snapshots; results are
-- a pure function of inputs and are recomputed on load). Safe to apply ahead
-- of the app deploy (no tile involved); idempotent.

create table if not exists public.saved_waterflood_design_projects (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references auth.users (id) on delete cascade,
    project_name  text not null,
    inputs_data   jsonb not null,
    results_data  jsonb,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

create index if not exists saved_waterflood_design_projects_user_id_idx
    on public.saved_waterflood_design_projects (user_id, updated_at desc);

alter table public.saved_waterflood_design_projects enable row level security;

drop policy if exists "waterflood_design_owner_all" on public.saved_waterflood_design_projects;
create policy "waterflood_design_owner_all"
    on public.saved_waterflood_design_projects for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
