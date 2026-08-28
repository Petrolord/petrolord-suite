-- P12 (Well Intervention Planner): plan persistence on the
-- saved_<app>_projects convention — owner-scoped RLS, payload in
-- inputs_data.
--
-- The payload holds the well description (which also lives on the
-- shared po_well_models record when the plan is linked to a well), the
-- damage and drainage geometry, the duty the well is on today, the
-- diagnostic settings, the treatment being sized, and the economic
-- assumptions.
--
-- The DIAGNOSIS is not stored. It is derived from the production
-- history on the spine, and that history grows: a plan reopened in six
-- months should be read against the data there is then, not against a
-- mechanism that was true when it was saved. Storing it would let a
-- stale coning verdict block a shutoff that the newer history no longer
-- supports.
--
-- Safe to apply ahead of the app deploy (new table, no tile change);
-- idempotent.

create table if not exists public.saved_intervention_projects (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references auth.users (id) on delete cascade,
    project_name  text not null,
    inputs_data   jsonb not null,
    results_data  jsonb,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

comment on table public.saved_intervention_projects is
    'Production P12: Well Intervention Planner plans (well model, damage and drainage geometry, current duty, diagnostic settings, treatment and economics). Owner-scoped; the Chan diagnosis is re-derived from the po_* spine history on load rather than stored, so a reopened plan is read against the data there is now.';

create index if not exists saved_intervention_projects_user_id_idx
    on public.saved_intervention_projects (user_id, updated_at desc);

alter table public.saved_intervention_projects enable row level security;

drop policy if exists "intervention_owner_all" on public.saved_intervention_projects;
create policy "intervention_owner_all"
    on public.saved_intervention_projects for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
