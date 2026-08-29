-- Facilities F5 — Separator & Slug Catcher Studio persistence:
-- saved_separator_projects on the saved_<app>_projects convention
-- (owner-scoped RLS with WITH CHECK, payload in inputs_data, inputs
-- only). The predecessor app had NO persistence at all. Safe
-- pre-deploy, idempotent.

create table if not exists public.saved_separator_projects (
    id uuid primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    project_name text not null,
    inputs_data jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.saved_separator_projects enable row level security;

do $$
begin
    begin
        create policy "Users can manage their own separator studies"
            on public.saved_separator_projects for all
            using (auth.uid() = user_id)
            with check (auth.uid() = user_id);
    exception when duplicate_object then null;
    end;
end $$;
