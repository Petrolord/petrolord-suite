-- NA4 (Nodal Analysis Studio, docs/scope/NodalAnalysisStudio-STATUS.md):
-- project persistence on the saved_<app>_projects convention.
--
-- A legacy saved_nodal_analysis_projects table already exists in the live
-- database (Horizons-era scaffold used by the old Integrated Asset
-- Modeler example; one historical row) with the right shape except
-- updated_at, and with owner RLS already enforced ("Users can manage
-- their own data": auth.uid() = user_id, plus an admin policy). This
-- migration is therefore ADDITIVE: it creates the table only on fresh
-- environments, adds the missing updated_at column, adds the listing
-- index, and guarantees the owner policy exists. Existing policies and
-- rows are preserved. Safe to apply ahead of the app deploy (no tile
-- involved); idempotent. The studio tile migration is separate and
-- deploy-gated (NA5).

create table if not exists public.saved_nodal_analysis_projects (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references auth.users (id) on delete cascade,
    project_name  text not null,
    inputs_data   jsonb not null,
    results_data  jsonb,
    created_at    timestamptz not null default now()
);

alter table public.saved_nodal_analysis_projects
    add column if not exists updated_at timestamptz not null default now();

create index if not exists saved_nodal_analysis_projects_user_id_idx
    on public.saved_nodal_analysis_projects (user_id, updated_at desc);

alter table public.saved_nodal_analysis_projects enable row level security;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where tablename = 'saved_nodal_analysis_projects'
          and qual = '(auth.uid() = user_id)'
    ) then
        create policy "nodal_analysis_owner_all"
            on public.saved_nodal_analysis_projects for all
            using (auth.uid() = user_id)
            with check (auth.uid() = user_id);
    end if;
end $$;
