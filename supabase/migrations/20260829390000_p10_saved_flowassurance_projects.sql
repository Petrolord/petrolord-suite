-- P10 (Flow Assurance Studio): study persistence on the
-- saved_<app>_projects convention — owner-scoped RLS, payload in
-- inputs_data.
--
-- The payload holds the well description (which also lives on the
-- shared po_well_models record when the study is linked to a well), the
-- duty the trace runs at, the choke step, both pipe legs with their
-- coating stacks, and the inhibitor and cooldown settings.
--
-- The duty is DELIBERATELY not on the shared record: a rate, a water
-- cut and a wellhead pressure are what the well was doing on the day,
-- not what the well is. Neither is the pipe: a flowline belongs to the
-- study, not to the well at the other end of it.
--
-- Safe to apply ahead of the app deploy (new table, no tile change);
-- idempotent.

create table if not exists public.saved_flowassurance_projects (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references auth.users (id) on delete cascade,
    project_name  text not null,
    inputs_data   jsonb not null,
    results_data  jsonb,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

comment on table public.saved_flowassurance_projects is
    'Production P10: Flow Assurance Studio trace studies (well model, duty, choke step, flowline and riser with their coating stacks, inhibitor and cooldown settings). Owner-scoped; production data stays in the po_* spine.';

create index if not exists saved_flowassurance_projects_user_id_idx
    on public.saved_flowassurance_projects (user_id, updated_at desc);

alter table public.saved_flowassurance_projects enable row level security;

drop policy if exists "flowassurance_owner_all" on public.saved_flowassurance_projects;
create policy "flowassurance_owner_all"
    on public.saved_flowassurance_projects for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
