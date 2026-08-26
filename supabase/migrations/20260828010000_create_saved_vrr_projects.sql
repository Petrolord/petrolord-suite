-- V1 (Voidage Replacement Monitor upgrade, docs/scope/
-- VoidageReplacementMonitor-STATUS.md): project persistence on the
-- saved_<app>_projects convention (waterflood-design/dca pattern):
-- owner-scoped RLS, payload in inputs_data (fvf + periods; results are a
-- pure function of inputs and are recomputed on load). Safe to apply ahead
-- of the app deploy (no tile involved); idempotent.

create table if not exists public.saved_vrr_projects (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references auth.users (id) on delete cascade,
    project_name  text not null,
    inputs_data   jsonb not null,
    results_data  jsonb,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

create index if not exists saved_vrr_projects_user_id_idx
    on public.saved_vrr_projects (user_id, updated_at desc);

alter table public.saved_vrr_projects enable row level security;

drop policy if exists "vrr_owner_all" on public.saved_vrr_projects;
create policy "vrr_owner_all"
    on public.saved_vrr_projects for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
