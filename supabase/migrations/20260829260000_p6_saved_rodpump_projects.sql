-- P6 (Rod Pump Design Studio): design persistence on the
-- saved_<app>_projects convention (vrr/nodal/surveillance/allocation/
-- gaslift/esp pattern) — owner-scoped RLS, payload in inputs_data.
--
-- Like P4 and P5 this is a design tool rather than a data tool: the
-- well model (fluid, inflow, trajectory), the duty, the surface unit
-- and pump, and the rod taper ARE the project, so they are the
-- payload. The optional link to a spine well is stored as ids only;
-- the production data itself stays in the org-scoped po_* tables and
-- is never copied into a design row.
--
-- Safe to apply ahead of the app deploy (new table, no tile change);
-- idempotent.

create table if not exists public.saved_rodpump_projects (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references auth.users (id) on delete cascade,
    project_name  text not null,
    inputs_data   jsonb not null,
    results_data  jsonb,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

comment on table public.saved_rodpump_projects is
    'Production P6: Rod Pump Design Studio designs (well model, duty, surface unit and pump, rod taper). Owner-scoped; production data stays in the po_* spine.';

create index if not exists saved_rodpump_projects_user_id_idx
    on public.saved_rodpump_projects (user_id, updated_at desc);

alter table public.saved_rodpump_projects enable row level security;

drop policy if exists "rodpump_owner_all" on public.saved_rodpump_projects;
create policy "rodpump_owner_all"
    on public.saved_rodpump_projects for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
