-- P2 (Production Surveillance Studio, docs/scope/
-- ProductionOperations-STATUS.md): analysis-state persistence on the
-- saved_<app>_projects convention (vrr/nodal pattern) — owner-scoped
-- RLS, payload in inputs_data.
--
-- The payload holds ANALYSIS state only (selected field id, exception
-- thresholds, trend and decline picks). The production data itself
-- lives in the org-scoped po_* spine
-- (20260829120000_p1_create_po_spine.sql) and is never copied into a
-- project row, so two engineers surveilling one field share the data
-- and keep their own settings.
--
-- Safe to apply ahead of the app deploy (new table, no tile change);
-- idempotent.

create table if not exists public.saved_surveillance_projects (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references auth.users (id) on delete cascade,
    project_name  text not null,
    inputs_data   jsonb not null,
    results_data  jsonb,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

create index if not exists saved_surveillance_projects_user_id_idx
    on public.saved_surveillance_projects (user_id, updated_at desc);

alter table public.saved_surveillance_projects enable row level security;

drop policy if exists "surveillance_owner_all" on public.saved_surveillance_projects;
create policy "surveillance_owner_all"
    on public.saved_surveillance_projects for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
