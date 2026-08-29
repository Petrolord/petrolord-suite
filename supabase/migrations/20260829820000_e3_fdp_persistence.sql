-- Economics E3 — FDP Accelerator persistence.
--
-- The FDP Accelerator kept a development plan in this browser's
-- localStorage and nowhere else: it was lost with the cache, invisible
-- from any other machine, and could not be shared with the team who has
-- to review it. A field development plan is the last thing that should
-- live in a browser cache.
--
-- Follows the saved_<app>_projects convention (owner-scoped RLS with
-- WITH CHECK, whole plan payload in inputs_data). Safe pre-deploy,
-- idempotent: the app keeps a local draft buffer and degrades to a
-- stated "run the migration" message without this table.

create table if not exists public.saved_fdp_projects (
    id uuid primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    project_name text not null,
    inputs_data jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.saved_fdp_projects enable row level security;

do $$
begin
    begin
        create policy "Users can manage their own development plans"
            on public.saved_fdp_projects for all
            using (auth.uid() = user_id)
            with check (auth.uid() = user_id);
    exception when duplicate_object then null;
    end;
end $$;
