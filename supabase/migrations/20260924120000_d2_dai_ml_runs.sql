-- Data & AI D2: ML Workbench persistence, dai_ml_runs (HELD).
--
-- The module's second table, on the dai_* prefix (DataAI-ROADMAP.md), with
-- the shape and rules of dai_qc_runs (20260923130000, D1), which are
-- ps_lopa_studies' (20260919210000, Process Safety PS1).
--
-- An ML run belongs to the ORGANIZATION. A model and its held-out scores are
-- read by the people who later use its predictions (a predicted curve in the
-- wells registry names the run), so it is scoped to the organization.
--
-- What a row holds: payload is the run's INPUTS (the wells or the uploaded
-- table it read, and the spec as typed: task, target or label rule,
-- features and transforms, model, validation scheme, seeds; for an upload
-- the columns, capped by the app) and summary is the record of what the run
-- found when it was saved (pooled and per-fold held-out scores, rows, wells,
-- a fingerprint of the numbers fitted, the engine version). Every result on
-- screen is recomputed by the vendored engine (engines/dataai/ml.js) when a
-- run opens; the fingerprint tells the app whether the data has changed.
-- source and task are lifted out of the payload for the list view.
--
-- Membership is organization_members, through the helper functions the live
-- database already has (as dai_qc_runs uses them):
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
-- Owner-run: supabase db query --linked -f supabase/migrations/20260924120000_d2_dai_ml_runs.sql

begin;

create table if not exists public.dai_ml_runs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  source          text,
  task            text,
  payload         jsonb not null,
  summary         jsonb,
  schema_version  integer,
  app_build       text,
  created_by      uuid default auth.uid() references auth.users(id) on delete set null,
  updated_by      uuid default auth.uid() references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint dai_ml_runs_name_check check (length(btrim(name)) > 0),
  constraint dai_ml_runs_source_check check (source is null or source in ('wells', 'upload')),
  constraint dai_ml_runs_task_check check (task is null or task in ('regression', 'classification')),
  constraint dai_ml_runs_payload_check check (jsonb_typeof(payload) = 'object'),
  constraint dai_ml_runs_summary_check check (summary is null or jsonb_typeof(summary) = 'object')
);

comment on table public.dai_ml_runs is
  'ML Workbench runs (Data & AI D2), one row per run, scoped to the organization. payload holds the inputs; summary is the record of what the run found when saved. Results are recomputed by engines/dataai/ml.js on open.';
comment on column public.dai_ml_runs.payload is
  'The run inputs as the app serializes them ({ name, schema, source, dataRef, snapshot, spec }). snapshot is present only for an uploaded file.';
comment on column public.dai_ml_runs.summary is
  'What the run found when it was saved: task, target, features, model, validation scheme, pooled and per-fold held-out scores, rows, wells, a fingerprint of the numbers fitted, engine version, ranAt.';

create index if not exists dai_ml_runs_org_updated_idx
  on public.dai_ml_runs (organization_id, updated_at desc);

create or replace function public.dai_ml_runs_guard()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'An ML run cannot move to another organization'
      using errcode = '42501';
  end if;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists dai_ml_runs_guard on public.dai_ml_runs;
create trigger dai_ml_runs_guard
  before update on public.dai_ml_runs
  for each row execute function public.dai_ml_runs_guard();

revoke all on table public.dai_ml_runs from anon;
grant select, insert, update, delete on table public.dai_ml_runs to authenticated;

alter table public.dai_ml_runs enable row level security;

drop policy if exists dai_ml_runs_select on public.dai_ml_runs;
create policy dai_ml_runs_select on public.dai_ml_runs
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin());

drop policy if exists dai_ml_runs_insert on public.dai_ml_runs;
create policy dai_ml_runs_insert on public.dai_ml_runs
  for insert to authenticated
  with check (
    (public.is_org_member(organization_id) and created_by = auth.uid())
    or public.is_super_admin()
  );

drop policy if exists dai_ml_runs_update on public.dai_ml_runs;
create policy dai_ml_runs_update on public.dai_ml_runs
  for update to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin())
  with check (public.is_org_member(organization_id) or public.is_super_admin());

drop policy if exists dai_ml_runs_delete on public.dai_ml_runs;
create policy dai_ml_runs_delete on public.dai_ml_runs
  for delete to authenticated
  using (
    created_by = auth.uid()
    or public.has_org_role(organization_id, array['owner', 'admin'])
    or public.is_super_admin()
  );

commit;
