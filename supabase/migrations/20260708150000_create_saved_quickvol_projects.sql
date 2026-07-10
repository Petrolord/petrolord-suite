-- ReservoirCalc Pro (the Suite's single volumetrics app) project persistence.
--
-- Reuses the legacy `saved_quickvol_projects` table, which is already unioned
-- into get_all_my_projects (app_type 'quickvol'), so saved projects surface in
-- the central My Projects view with no extra wiring. The full project payload
-- (description, version, inputs, surfaces, unit system) lives inside the
-- inputs_data JSON blob; only project_name and results_data are columns.
--
-- Idempotent: `create table if not exists` is a no-op if the table already
-- exists, and the RLS policies drop-then-create. Deploy via the Supabase SQL
-- editor or `supabase db push`.

create table if not exists public.saved_quickvol_projects (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references auth.users (id) on delete cascade,
    project_name  text not null,
    inputs_data   jsonb not null,
    results_data  jsonb,
    created_at    timestamptz not null default now()
);

create index if not exists saved_quickvol_projects_user_id_idx
    on public.saved_quickvol_projects (user_id, created_at desc);

alter table public.saved_quickvol_projects enable row level security;

-- Owner-scoped policies: a user may only see and mutate their own rows.
drop policy if exists "quickvol_select_own" on public.saved_quickvol_projects;
create policy "quickvol_select_own"
    on public.saved_quickvol_projects for select
    using (auth.uid() = user_id);

drop policy if exists "quickvol_insert_own" on public.saved_quickvol_projects;
create policy "quickvol_insert_own"
    on public.saved_quickvol_projects for insert
    with check (auth.uid() = user_id);

drop policy if exists "quickvol_update_own" on public.saved_quickvol_projects;
create policy "quickvol_update_own"
    on public.saved_quickvol_projects for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "quickvol_delete_own" on public.saved_quickvol_projects;
create policy "quickvol_delete_own"
    on public.saved_quickvol_projects for delete
    using (auth.uid() = user_id);
