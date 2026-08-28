-- P9 (Artificial Lift Advisor): study persistence on the
-- saved_<app>_projects convention — owner-scoped RLS, payload in
-- inputs_data.
--
-- The payload holds the well description (which also lives on the
-- shared po_well_models record when the study is linked to a well),
-- the duty the comparison was run at, and the facility answers. The
-- last two are DELIBERATELY not on the shared record: a target rate is
-- a decision and a compressor is a facility, and neither is a property
-- of the well.
--
-- The design pass itself is not stored. It is a result of the well
-- record and the duty at the time it ran, and re-deriving it is cheap
-- next to showing a stale comparison as if it were current.
--
-- Safe to apply ahead of the app deploy (new table, no tile change);
-- idempotent.

create table if not exists public.saved_liftadvisor_projects (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references auth.users (id) on delete cascade,
    project_name  text not null,
    inputs_data   jsonb not null,
    results_data  jsonb,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

comment on table public.saved_liftadvisor_projects is
    'Production P9: Artificial Lift Advisor studies (well model, duty, facility answers). Owner-scoped; the design comparison is re-derived rather than stored.';

create index if not exists saved_liftadvisor_projects_user_id_idx
    on public.saved_liftadvisor_projects (user_id, updated_at desc);

alter table public.saved_liftadvisor_projects enable row level security;

drop policy if exists "liftadvisor_owner_all" on public.saved_liftadvisor_projects;
create policy "liftadvisor_owner_all"
    on public.saved_liftadvisor_projects for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
