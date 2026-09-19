-- Process Safety PS1: LOPA & SIL Studio persistence, ps_lopa_studies (HELD).
--
-- The module's first table, on the ps_* prefix (ProcessSafety-ROADMAP.md).
--
-- A LOPA study belongs to the ORGANIZATION. A safety study is a shared
-- engineering record, revalidated years later by people who did not write
-- it, so it is scoped to the organization the way the Assurance registers
-- are, and the saved_<app>_projects convention (one owner per row) does not
-- fit. Only the inputs are stored, as one jsonb payload; every result is
-- recomputed by the vendored engine on open.
--
-- Membership is organization_members, through the helper functions the
-- live database already has (read 2026-09-19, pg_get_functiondef):
--   is_org_member(org_id)        an active membership of that organization
--   has_org_role(org_id, roles)  an active membership with one of the roles
--   is_super_admin()             the platform super admins
-- is_org_member is used here rather than my_org_id(), which returns ONE of
-- the caller's memberships: a member of two organizations can then work in
-- either, and the app filters to the one selected.
--
-- Rules:
--   read, insert, update  any active member of the study's organization
--   insert                created_by must be the caller (it defaults to them)
--   delete                the author, or an owner or admin of the organization
--   organization_id       cannot change after insert (a study never moves
--                         between organizations); created_by and created_at
--                         are kept by the trigger whatever an update sends
--
-- RLS from the start with explicit grants to `authenticated` and nothing to
-- anon, as AS3 onward do. schema_version and app_build are the PP0 state
-- stamp columns (20260902120000) that src/lib/stateVersion.js writes.
--
-- Idempotent: safe to re-run. Not deploy-gated: the table can exist before
-- the app ships. The app degrades to a "run the migration" message without it.
--
-- Owner-run: supabase db query --linked -f supabase/migrations/20260919210000_ps1_lopa_studies.sql

begin;

create table if not exists public.ps_lopa_studies (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  payload         jsonb not null,
  schema_version  integer,
  app_build       text,
  created_by      uuid default auth.uid() references auth.users(id) on delete set null,
  updated_by      uuid default auth.uid() references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint ps_lopa_studies_name_check check (length(btrim(name)) > 0),
  constraint ps_lopa_studies_payload_check check (jsonb_typeof(payload) = 'object')
);

comment on table public.ps_lopa_studies is
  'LOPA & SIL Studio studies (Process Safety PS1), one row per study, scoped to the organization. payload holds the inputs only; results are recomputed by engines/hse/lopa.js on open.';
comment on column public.ps_lopa_studies.payload is
  'The study inputs as the app serializes them ({ name, schema, study: { scenarios, activeScenarioId } }). No computed result is stored.';

create index if not exists ps_lopa_studies_org_updated_idx
  on public.ps_lopa_studies (organization_id, updated_at desc);

-- A study never changes organization, and its author and creation time are
-- facts about the past. updated_by follows the caller.
create or replace function public.ps_lopa_studies_guard()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'A LOPA study cannot move to another organization'
      using errcode = '42501';
  end if;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists ps_lopa_studies_guard on public.ps_lopa_studies;
create trigger ps_lopa_studies_guard
  before update on public.ps_lopa_studies
  for each row execute function public.ps_lopa_studies_guard();

revoke all on table public.ps_lopa_studies from anon;
grant select, insert, update, delete on table public.ps_lopa_studies to authenticated;

alter table public.ps_lopa_studies enable row level security;

drop policy if exists ps_lopa_studies_select on public.ps_lopa_studies;
create policy ps_lopa_studies_select on public.ps_lopa_studies
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin());

drop policy if exists ps_lopa_studies_insert on public.ps_lopa_studies;
create policy ps_lopa_studies_insert on public.ps_lopa_studies
  for insert to authenticated
  with check (
    (public.is_org_member(organization_id) and created_by = auth.uid())
    or public.is_super_admin()
  );

drop policy if exists ps_lopa_studies_update on public.ps_lopa_studies;
create policy ps_lopa_studies_update on public.ps_lopa_studies
  for update to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin())
  with check (public.is_org_member(organization_id) or public.is_super_admin());

drop policy if exists ps_lopa_studies_delete on public.ps_lopa_studies;
create policy ps_lopa_studies_delete on public.ps_lopa_studies
  for delete to authenticated
  using (
    created_by = auth.uid()
    or public.has_org_role(organization_id, array['owner', 'admin'])
    or public.is_super_admin()
  );

commit;
