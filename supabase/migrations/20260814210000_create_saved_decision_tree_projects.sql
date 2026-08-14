-- D3 (Economics-ROADMAP.md): Decision Tree Builder persistence.
-- The saved_<app>_projects convention (scenario-hub/waterflood pattern):
-- owner-scoped RLS, payload in inputs_data (the tree JSON; EMV results are
-- a pure function of inputs and are recomputed on load). Safe to apply
-- ahead of the app deploy (no tile involved); idempotent.

create table if not exists public.saved_decision_tree_projects (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references auth.users (id) on delete cascade,
    project_name  text not null,
    inputs_data   jsonb not null,
    results_data  jsonb,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

create index if not exists saved_decision_tree_projects_user_id_idx
    on public.saved_decision_tree_projects (user_id, updated_at desc);

alter table public.saved_decision_tree_projects enable row level security;

drop policy if exists "decision_tree_owner_all" on public.saved_decision_tree_projects;
create policy "decision_tree_owner_all"
    on public.saved_decision_tree_projects for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
