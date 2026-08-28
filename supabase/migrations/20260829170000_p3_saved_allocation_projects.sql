-- P3 (Production Allocation Studio): analysis-state persistence on the
-- saved_<app>_projects convention (vrr/nodal/surveillance pattern) —
-- owner-scoped RLS, payload in inputs_data.
--
-- The payload holds ANALYSIS state only (selected field, period range,
-- allocation basis and settings, test QC thresholds). The production
-- data, the metered totals and the allocation factors themselves live
-- in the org-scoped po_* spine, never in a project row.
--
-- Safe to apply ahead of the app deploy (new table, no tile change);
-- idempotent.

create table if not exists public.saved_allocation_projects (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references auth.users (id) on delete cascade,
    project_name  text not null,
    inputs_data   jsonb not null,
    results_data  jsonb,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

create index if not exists saved_allocation_projects_user_id_idx
    on public.saved_allocation_projects (user_id, updated_at desc);

alter table public.saved_allocation_projects enable row level security;

drop policy if exists "allocation_owner_all" on public.saved_allocation_projects;
create policy "allocation_owner_all"
    on public.saved_allocation_projects for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
