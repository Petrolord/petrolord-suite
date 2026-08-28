-- P8 (Choke & Wellhead Performance Studio): analysis persistence on the
-- saved_<app>_projects convention — owner-scoped RLS, payload in
-- inputs_data.
--
-- The payload holds the well description (which also lives on the
-- shared po_well_models record when the analysis is linked to a well),
-- the bean and line conditions, the flowline and its erosional C
-- factor, and the envelope range. Those conditions are DELIBERATELY
-- not on the shared record: a bean size and a line pressure are what
-- the well was doing on the day, not what the well is.
--
-- A fitted coefficient set is deliberately NOT stored either. It is a
-- RESULT of the well tests on the spine at the time it was run, so
-- reopening an analysis re-fits from the tests that are there now
-- rather than showing yesterday's answer as if it were current.
--
-- Safe to apply ahead of the app deploy (new table, no tile change);
-- idempotent.

create table if not exists public.saved_choke_projects (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references auth.users (id) on delete cascade,
    project_name  text not null,
    inputs_data   jsonb not null,
    results_data  jsonb,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

comment on table public.saved_choke_projects is
    'Production P8: Choke & Wellhead Performance Studio analyses (well model, bean and line conditions, flowline and erosional C factor, envelope range). Owner-scoped; production data stays in the po_* spine and fitted coefficients are re-derived from it.';

create index if not exists saved_choke_projects_user_id_idx
    on public.saved_choke_projects (user_id, updated_at desc);

alter table public.saved_choke_projects enable row level security;

drop policy if exists "choke_owner_all" on public.saved_choke_projects;
create policy "choke_owner_all"
    on public.saved_choke_projects for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
