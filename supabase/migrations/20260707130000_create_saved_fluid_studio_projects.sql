-- Fluid Systems & Flow Behavior Studio — project persistence.
-- Follows the Suite's saved_<app>_projects convention (owner-scoped RLS,
-- unioned into get_all_my_projects). Load restores inputs_data only; results
-- are a pure function of inputs and are stored for the My Projects preview.
--
-- Deploy: run this against the project database (Supabase SQL editor or
-- `supabase db push`). It is idempotent.

create table if not exists public.saved_fluid_studio_projects (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references auth.users (id) on delete cascade,
    project_name  text not null,
    inputs_data   jsonb not null,
    results_data  jsonb,
    created_at    timestamptz not null default now()
);

create index if not exists saved_fluid_studio_projects_user_id_idx
    on public.saved_fluid_studio_projects (user_id, created_at desc);

alter table public.saved_fluid_studio_projects enable row level security;

-- Owner-scoped policies: a user may only see and mutate their own rows.
drop policy if exists "fluid_studio_select_own" on public.saved_fluid_studio_projects;
create policy "fluid_studio_select_own"
    on public.saved_fluid_studio_projects for select
    using (auth.uid() = user_id);

drop policy if exists "fluid_studio_insert_own" on public.saved_fluid_studio_projects;
create policy "fluid_studio_insert_own"
    on public.saved_fluid_studio_projects for insert
    with check (auth.uid() = user_id);

drop policy if exists "fluid_studio_update_own" on public.saved_fluid_studio_projects;
create policy "fluid_studio_update_own"
    on public.saved_fluid_studio_projects for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "fluid_studio_delete_own" on public.saved_fluid_studio_projects;
create policy "fluid_studio_delete_own"
    on public.saved_fluid_studio_projects for delete
    using (auth.uid() = user_id);
