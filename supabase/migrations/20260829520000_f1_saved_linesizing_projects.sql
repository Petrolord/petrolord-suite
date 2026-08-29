-- Facilities F1 — Pipeline & Line Sizing Studio persistence:
-- saved_linesizing_projects on the saved_<app>_projects convention
-- (owner-scoped RLS, payload in inputs_data). The payload is INPUTS
-- ONLY (fluid, duty, pipe, profile segments, wall case, pigging
-- settings): results are re-derived on load so a reopened study
-- answers with today's engines rather than yesterday's numbers.
-- Safe pre-deploy (new table, no tile change), idempotent.

create table if not exists public.saved_linesizing_projects (
    id uuid primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    project_name text not null,
    inputs_data jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.saved_linesizing_projects enable row level security;

do $$
begin
    begin
        create policy "Users can manage their own line sizing studies"
            on public.saved_linesizing_projects for all
            using (auth.uid() = user_id)
            with check (auth.uid() = user_id);
    exception when duplicate_object then null;
    end;
end $$;
