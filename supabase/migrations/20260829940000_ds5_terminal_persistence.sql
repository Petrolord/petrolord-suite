-- Midstream & Downstream DS5 — Terminal & Depot Studio persistence.
-- saved_<app>_projects convention (owner-scoped RLS with WITH CHECK).
-- Safe pre-deploy, idempotent.

create table if not exists public.saved_terminal_projects (
    id uuid primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    project_name text not null,
    inputs_data jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.saved_terminal_projects enable row level security;

do $$
begin
    begin
        create policy "Users can manage their own terminal studies"
            on public.saved_terminal_projects for all
            using (auth.uid() = user_id) with check (auth.uid() = user_id);
    exception when duplicate_object then null;
    end;
end $$;
