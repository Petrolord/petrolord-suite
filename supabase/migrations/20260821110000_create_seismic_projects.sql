-- Seismolord Wave 4 / W4.2: lightweight project containers. A project
-- groups a user's volumes in the explorer (the flat list stays the
-- default — a volume without a project lists as before). Personal
-- organizers: user-scoped RLS, no org column (a SHARED volume still
-- shows under the owner's sharing, projects never leak).
--
-- Deleting a project unfiles its volumes (SET NULL), never deletes data.

create table if not exists public.seismic_projects (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid not null references auth.users (id) on delete cascade,
    name         text not null,
    description  text,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

comment on table public.seismic_projects is
    'Seismolord project containers (W4.2): personal explorer grouping for seismic volumes; deleting one unfiles its volumes.';

create index if not exists seismic_projects_user_id_idx
    on public.seismic_projects (user_id, created_at desc);

alter table public.seismic_projects enable row level security;

drop policy if exists "seismic_projects_select_own" on public.seismic_projects;
create policy "seismic_projects_select_own"
    on public.seismic_projects for select
    using (auth.uid() = user_id);

drop policy if exists "seismic_projects_insert_own" on public.seismic_projects;
create policy "seismic_projects_insert_own"
    on public.seismic_projects for insert
    with check (auth.uid() = user_id);

drop policy if exists "seismic_projects_update_own" on public.seismic_projects;
create policy "seismic_projects_update_own"
    on public.seismic_projects for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "seismic_projects_delete_own" on public.seismic_projects;
create policy "seismic_projects_delete_own"
    on public.seismic_projects for delete
    using (auth.uid() = user_id);

alter table public.seismic_volumes
    add column if not exists project_id uuid references public.seismic_projects (id) on delete set null;

comment on column public.seismic_volumes.project_id is
    'W4.2 explorer grouping: the owner''s project container; null = the flat list. Cleared automatically when the project is deleted.';

create index if not exists seismic_volumes_project_id_idx
    on public.seismic_volumes (project_id) where project_id is not null;
