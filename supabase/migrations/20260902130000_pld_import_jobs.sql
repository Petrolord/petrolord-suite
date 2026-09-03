-- Project Portability PP2 (docs/scope/ProjectPortability-PLAN.md §4.5):
-- import jobs and the old-to-new id map.
--
-- pld_import_jobs   one row per import of a .pld package: who imported it,
--                   into which scope, the manifest it carried, progress and
--                   outcome. Resumable: a failed job is retried by job id and
--                   already-written items are skipped.
-- pld_import_items  the provenance ledger: for every row the importer
--                   created, the table, the id it had in the package and the
--                   id it has now. This is how "where did this well come
--                   from" is answered without adding a column to every table.
--
-- Product-prefixed (pld_) per the database conventions; owner-scoped RLS.
-- The importer treats these tables as best effort: if they are absent (this
-- migration not yet applied) the import still runs, without resume, and
-- says so in its summary.

create table if not exists public.pld_import_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  package_id uuid not null,
  package_name text,
  package_version integer not null,
  platform_sha text,
  source_user_id uuid,
  source_organization_id uuid,
  source_organization_name text,
  manifest jsonb not null,
  status text not null default 'running' check (status in ('running', 'done', 'failed', 'cancelled')),
  rows_planned integer not null default 0,
  rows_written integer not null default 0,
  blobs_planned integer not null default 0,
  blobs_written integer not null default 0,
  notes jsonb not null default '[]'::jsonb,
  error text,
  schema_version integer not null default 1,
  app_build text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists pld_import_jobs_user_idx on public.pld_import_jobs (user_id, created_at desc);
create index if not exists pld_import_jobs_package_idx on public.pld_import_jobs (package_id);

create table if not exists public.pld_import_items (
  id bigserial primary key,
  job_id uuid not null references public.pld_import_jobs(id) on delete cascade,
  table_name text not null,
  old_id uuid not null,
  new_id uuid not null,
  created_at timestamptz not null default now(),
  unique (job_id, table_name, old_id)
);

create index if not exists pld_import_items_new_idx on public.pld_import_items (table_name, new_id);

alter table public.pld_import_jobs enable row level security;
alter table public.pld_import_items enable row level security;

drop policy if exists pld_import_jobs_owner on public.pld_import_jobs;
create policy pld_import_jobs_owner on public.pld_import_jobs
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists pld_import_items_owner on public.pld_import_items;
create policy pld_import_items_owner on public.pld_import_items
  for all to authenticated
  using (exists (select 1 from public.pld_import_jobs j where j.id = job_id and j.user_id = auth.uid()))
  with check (exists (select 1 from public.pld_import_jobs j where j.id = job_id and j.user_id = auth.uid()));

comment on table public.pld_import_jobs is 'PP2: one row per .pld package import; resumable by id.';
comment on table public.pld_import_items is 'PP2: old-to-new id ledger for every row an import created.';
