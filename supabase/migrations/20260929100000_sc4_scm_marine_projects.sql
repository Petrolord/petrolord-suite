-- Supply Chain SC4: Marine Logistics Planner persistence, scm_marine_projects (HELD).
--
-- The planner saves whole studies on the saved-projects convention
-- (src/utils/savedProjects.js, the shape scm_materials_projects uses for the
-- Materials & Spares Planner beside it): one row per study, owned by the user
-- who made it, the full input state in inputs_data, results recomputed by the
-- vendored engine (engines/supplychain/marineLogistics.js) whenever a study
-- opens.
-- The table takes the product prefix scm_ (supply chain) under the database
-- conventions, and carries the PP0 state-stamp columns (20260902120000)
-- that src/lib/stateVersion.js writes, from the start.
--
-- What a row holds: inputs_data is { name, schema, engine, inputs, modified,
-- id }: the cluster (products, vessels, installations with their demand
-- and voyage cargo, the milk run; the Ekene demo or a pasted data set), the
-- deck and its cargo, the supply base, and every calculation's inputs exactly
-- as typed, with the petrolord-engines commit they ran on (`engine`).
--
-- RLS from the start: the owner reads and writes their own rows (with check).
-- Explicit grants to authenticated; nothing to anon. No shared table touched.
--
-- Idempotent. Not deploy-gated: the table can exist before the app ships, and
-- the app says "run the sc4_scm_marine_projects migration" without it.
-- No begin/commit of its own: `supabase db query -f` runs the file as one
-- implicit transaction, and a dry run can wrap it in begin ... rollback.
--
-- Owner-run: supabase db query --linked -f supabase/migrations/20260929100000_sc4_scm_marine_projects.sql

create table if not exists public.scm_marine_projects (
    id uuid primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    project_name text not null,
    inputs_data jsonb not null,
    schema_version integer not null default 1,
    app_build text,
    engine_version text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint scm_marine_projects_name_check check (length(btrim(project_name)) > 0),
    constraint scm_marine_projects_inputs_check check (jsonb_typeof(inputs_data) = 'object')
);

comment on table public.scm_marine_projects is
  'Marine Logistics Planner studies (Supply Chain SC4), one row per study, owned by its user. inputs_data holds the cluster, the deck, the supply base and every calculation input as typed, with the engine commit. Results are recomputed by engines/supplychain/marineLogistics.js on open.';
comment on column public.scm_marine_projects.schema_version is
  'PP0: row shape version; opened via src/lib/stateVersion.js (migrate up, refuse newer)';

create index if not exists scm_marine_projects_user_updated_idx
    on public.scm_marine_projects (user_id, updated_at desc);

alter table public.scm_marine_projects enable row level security;

do $$
begin
    begin
        create policy "Users can manage their own marine logistics studies"
            on public.scm_marine_projects for all
            using (auth.uid() = user_id) with check (auth.uid() = user_id);
    exception when duplicate_object then null;
    end;
end $$;

revoke all on public.scm_marine_projects from anon;
grant select, insert, update, delete on public.scm_marine_projects to authenticated;
