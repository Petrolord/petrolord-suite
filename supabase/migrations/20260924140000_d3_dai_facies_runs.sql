-- Data & AI D3: Electrofacies Studio persistence, dai_facies_runs (HELD).
--
-- The module's third table, on the dai_* prefix (DataAI-ROADMAP.md), with
-- the shape and rules of dai_ml_runs (20260924120000, D2) and dai_qc_runs
-- (20260923130000, D1), which are ps_lopa_studies' (20260919210000, PS1).
--
-- A facies run belongs to the ORGANIZATION. A facies log written to a well
-- names the run in its provenance and is read by the people who later use
-- that log, so the run is scoped to the organization.
--
-- What a row holds: payload is the run's INPUTS (the wells or the uploaded
-- table it read, and the spec as typed: logs and transforms, depth window,
-- thinning, the core facies source, scaling, and every method's settings
-- with its seeds; for an upload the columns, capped by the app) and summary
-- is the record of what the runs found when it was saved (per method the
-- settings and the headline scores against the core, rows, wells, a
-- fingerprint of the numbers clustered, the engine version). Every result on
-- screen is recomputed by the vendored engine (engines/dataai/cluster.js)
-- when a run is rerun; the fingerprint tells the app whether the data has
-- changed. source is lifted out of the payload for the list view.
--
-- Membership is organization_members, through the helper functions the live
-- database already has (as dai_ml_runs uses them):
--   is_org_member(org_id)        an active membership of that organization
--   has_org_role(org_id, roles)  an active membership with one of the roles
--   is_super_admin()             the platform super admins
--
-- Rules:
--   read, insert, update  any active member of the run's organization
--   insert                created_by must be the caller (it defaults to them)
--   delete                the author, or an owner or admin of the organization
--   organization_id       cannot change after insert; created_by and
--                         created_at are kept by the trigger whatever an
--                         update sends
--
-- RLS from the start with explicit grants to `authenticated` and nothing to
-- anon. schema_version and app_build are the PP0 state stamp columns
-- (20260902120000) that src/lib/stateVersion.js writes. No shared table is
-- touched.
--
-- Idempotent: safe to re-run. Not deploy-gated: the table can exist before
-- the app ships. The app degrades to a "run the migration" message without it.
--
-- Owner-run: supabase db query --linked -f supabase/migrations/20260924140000_d3_dai_facies_runs.sql

begin;

create table if not exists public.dai_facies_runs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  source          text,
  payload         jsonb not null,
  summary         jsonb,
  schema_version  integer,
  app_build       text,
  created_by      uuid default auth.uid() references auth.users(id) on delete set null,
  updated_by      uuid default auth.uid() references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint dai_facies_runs_name_check check (length(btrim(name)) > 0),
  constraint dai_facies_runs_source_check check (source is null or source in ('wells', 'upload')),
  constraint dai_facies_runs_payload_check check (jsonb_typeof(payload) = 'object'),
  constraint dai_facies_runs_summary_check check (summary is null or jsonb_typeof(summary) = 'object')
);

comment on table public.dai_facies_runs is
  'Electrofacies Studio runs (Data & AI D3), one row per run, scoped to the organization. payload holds the inputs; summary is the record of what the runs found when saved. Results are recomputed by engines/dataai/cluster.js on rerun.';
comment on column public.dai_facies_runs.payload is
  'The run inputs as the app serializes them ({ name, schema, source, dataRef, snapshot, spec }). snapshot is present only for an uploaded file.';
comment on column public.dai_facies_runs.summary is
  'What the runs found when saved: logs, scaling, core facies source, per method the settings and scores against the core, rows, wells, a fingerprint of the numbers clustered, engine version, ranAt.';

create index if not exists dai_facies_runs_org_updated_idx
  on public.dai_facies_runs (organization_id, updated_at desc);

create or replace function public.dai_facies_runs_guard()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'A facies run cannot move to another organization'
      using errcode = '42501';
  end if;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists dai_facies_runs_guard on public.dai_facies_runs;
create trigger dai_facies_runs_guard
  before update on public.dai_facies_runs
  for each row execute function public.dai_facies_runs_guard();

revoke all on table public.dai_facies_runs from anon;
grant select, insert, update, delete on table public.dai_facies_runs to authenticated;

alter table public.dai_facies_runs enable row level security;

drop policy if exists dai_facies_runs_select on public.dai_facies_runs;
create policy dai_facies_runs_select on public.dai_facies_runs
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin());

drop policy if exists dai_facies_runs_insert on public.dai_facies_runs;
create policy dai_facies_runs_insert on public.dai_facies_runs
  for insert to authenticated
  with check (
    (public.is_org_member(organization_id) and created_by = auth.uid())
    or public.is_super_admin()
  );

drop policy if exists dai_facies_runs_update on public.dai_facies_runs;
create policy dai_facies_runs_update on public.dai_facies_runs
  for update to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin())
  with check (public.is_org_member(organization_id) or public.is_super_admin());

drop policy if exists dai_facies_runs_delete on public.dai_facies_runs;
create policy dai_facies_runs_delete on public.dai_facies_runs
  for delete to authenticated
  using (
    created_by = auth.uid()
    or public.has_org_role(organization_id, array['owner', 'admin'])
    or public.is_super_admin()
  );

commit;
