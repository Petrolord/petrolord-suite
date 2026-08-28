-- P7 (Gas Well Performance Studio): analysis persistence on the
-- saved_<app>_projects convention — owner-scoped RLS, payload in
-- inputs_data.
--
-- The payload holds the well description (which also lives on the
-- shared po_well_models record when the analysis is linked to a well),
-- the producing conditions the analysis was run at, the forecast range
-- and the plunger inputs. The conditions are DELIBERATELY not on the
-- shared record: a wellhead pressure is what the well was doing on the
-- day, not what the well is, and two analyses of one well are entitled
-- to differ.
--
-- Safe to apply ahead of the app deploy (new table, no tile change);
-- idempotent.

create table if not exists public.saved_gaswell_projects (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references auth.users (id) on delete cascade,
    project_name  text not null,
    inputs_data   jsonb not null,
    results_data  jsonb,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

comment on table public.saved_gaswell_projects is
    'Production P7: Gas Well Performance Studio analyses (well model, producing conditions, forecast range, plunger inputs). Owner-scoped; production data stays in the po_* spine.';

create index if not exists saved_gaswell_projects_user_id_idx
    on public.saved_gaswell_projects (user_id, updated_at desc);

alter table public.saved_gaswell_projects enable row level security;

drop policy if exists "gaswell_owner_all" on public.saved_gaswell_projects;
create policy "gaswell_owner_all"
    on public.saved_gaswell_projects for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
