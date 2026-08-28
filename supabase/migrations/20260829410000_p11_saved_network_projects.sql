-- P11 (Production Network Studio): network persistence on the
-- saved_<app>_projects convention — owner-scoped RLS, payload in
-- inputs_data.
--
-- The payload holds the topology (nodes and the lines between them),
-- each well's shared description plus the duty it is flowing at, and
-- the line geometry. The SOLUTION is not stored: pressures and rates
-- are re-derived on load, because a saved answer against a network
-- somebody has since edited is worse than no answer.
--
-- Node POSITIONS are not stored either, and there are none to store.
-- The drawing is laid out by depth from the delivery point, because a
-- gathering system flows one way and its arrangement is a fact about
-- the topology rather than something a user should have to keep.
--
-- Safe to apply ahead of the app deploy (new table, no tile change);
-- idempotent.

create table if not exists public.saved_network_projects (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references auth.users (id) on delete cascade,
    project_name  text not null,
    inputs_data   jsonb not null,
    results_data  jsonb,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

comment on table public.saved_network_projects is
    'Production P11: Production Network Studio gathering networks (topology, per-well shared descriptions and duties, line geometry, sweep range). Owner-scoped; the solved pressures and rates are re-derived on load, and production data stays in the po_* spine.';

create index if not exists saved_network_projects_user_id_idx
    on public.saved_network_projects (user_id, updated_at desc);

alter table public.saved_network_projects enable row level security;

drop policy if exists "network_owner_all" on public.saved_network_projects;
create policy "network_owner_all"
    on public.saved_network_projects for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
