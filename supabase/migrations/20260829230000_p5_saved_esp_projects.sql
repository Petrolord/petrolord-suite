-- P5 (ESP Design Studio): design persistence on the
-- saved_<app>_projects convention (vrr/nodal/surveillance/allocation/
-- gaslift pattern) — owner-scoped RLS, payload in inputs_data.
--
-- Like P4 and unlike the P2/P3 studios this app is a design tool rather
-- than a data tool: the well model (fluid, inflow, completion,
-- trajectory), the duty, the pump and stage curve selection and the
-- motor and cable inputs ARE the project, so they are the payload. The
-- optional link to a spine well is stored as ids only; the production
-- data itself stays in the org-scoped po_* tables and is never copied
-- into a design row.
--
-- Safe to apply ahead of the app deploy (new table, no tile change);
-- idempotent.

create table if not exists public.saved_esp_projects (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references auth.users (id) on delete cascade,
    project_name  text not null,
    inputs_data   jsonb not null,
    results_data  jsonb,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

comment on table public.saved_esp_projects is
    'Production P5: ESP Design Studio designs (well model, duty, pump curve selection, motor and cable). Owner-scoped; production data stays in the po_* spine.';

create index if not exists saved_esp_projects_user_id_idx
    on public.saved_esp_projects (user_id, updated_at desc);

alter table public.saved_esp_projects enable row level security;

drop policy if exists "esp_owner_all" on public.saved_esp_projects;
create policy "esp_owner_all"
    on public.saved_esp_projects for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
