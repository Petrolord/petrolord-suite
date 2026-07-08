-- Waterflood Efficiency Dashboard — project persistence.
-- Follows the Suite's saved_<app>_projects convention (owner-scoped RLS,
-- unioned into get_all_my_projects). Load restores inputs_data only; results
-- are a pure function of inputs (the client-side engine) and are stored only
-- for the My Projects preview.
--
-- Deploy: run this against the project database (Supabase SQL editor or
-- `supabase db push`). It is idempotent.

create table if not exists public.saved_waterflood_projects (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references auth.users (id) on delete cascade,
    project_name  text not null,
    inputs_data   jsonb not null,
    results_data  jsonb,
    created_at    timestamptz not null default now()
);

create index if not exists saved_waterflood_projects_user_id_idx
    on public.saved_waterflood_projects (user_id, created_at desc);

alter table public.saved_waterflood_projects enable row level security;

-- Owner-scoped policies: a user may only see and mutate their own rows.
drop policy if exists "waterflood_select_own" on public.saved_waterflood_projects;
create policy "waterflood_select_own"
    on public.saved_waterflood_projects for select
    using (auth.uid() = user_id);

drop policy if exists "waterflood_insert_own" on public.saved_waterflood_projects;
create policy "waterflood_insert_own"
    on public.saved_waterflood_projects for insert
    with check (auth.uid() = user_id);

drop policy if exists "waterflood_update_own" on public.saved_waterflood_projects;
create policy "waterflood_update_own"
    on public.saved_waterflood_projects for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "waterflood_delete_own" on public.saved_waterflood_projects;
create policy "waterflood_delete_own"
    on public.saved_waterflood_projects for delete
    using (auth.uid() = user_id);

-- Surface Waterflood projects in the central "My Projects" view by adding this
-- UNION branch to public.get_all_my_projects() (see
-- src/database/functions/get_all_my_projects.sql), then CREATE OR REPLACE it:
--
--   UNION ALL
--   SELECT id, project_name, created_at, 'waterflood_dashboard' AS app_type,
--          results_data AS project_data, inputs_data, results_data
--   FROM public.saved_waterflood_projects WHERE user_id = auth.uid()
