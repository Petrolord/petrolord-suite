-- =============================================================================
-- Organization data export (self-service offboarding, phase 1)
-- -----------------------------------------------------------------------------
-- An org admin can request a full export of their organization's data from
-- /dashboard/data-export. The org-export edge function drives the export; this
-- migration provides its database surface:
--
--   * org_export_jobs        - job/status registry (org admins read, service
--                              role writes)
--   * org-exports bucket     - private; holds the finished zip + blob manifest.
--                              NO storage.objects policies on purpose: only the
--                              service role touches it, delivery is exclusively
--                              via short-lived signed URLs minted by the edge
--                              function after re-checking org-admin role.
--   * read-only catalog/dump RPCs (service_role only), reusing the same
--     catalog-driven discovery as admin_purge_test_orgs (20260613120000):
--     ~162 public tables reference organizations(id) and a hand-written list
--     would rot. Descendant tables with neither organization_id nor user_id
--     (e.g. geo_wells_logs -> geo_wells) are reached by the edge function
--     walking export_fk_edges() from already-exported row ids, mirroring the
--     purge function's orphan sweep in reverse.
--
-- Redaction: export_dump_rows strips any column whose name matches
-- token|secret|password|api_key, so credentials and invitation tokens
-- (organization_members.invitation_token) never leave the database.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Job registry
-- ---------------------------------------------------------------------------
create table if not exists public.org_export_jobs (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations (id) on delete cascade,
    requested_by    uuid references auth.users (id) on delete set null,
    status          text not null default 'processing',   -- processing | completed | failed
    table_counts    jsonb,          -- { table_name: rows, ... }
    total_rows      bigint,
    blob_count      integer,
    blob_bytes      bigint,
    file_path       text,           -- org-exports object key; null after expiry cleanup
    manifest_path   text,           -- standalone copy of manifest.json for the UI
    error_message   text,
    created_at      timestamptz not null default now(),
    completed_at    timestamptz,
    expires_at      timestamptz
);

create index if not exists org_export_jobs_org_created_idx
    on public.org_export_jobs (organization_id, created_at desc);

alter table public.org_export_jobs enable row level security;

-- Org admins can see their org's jobs. All writes go through the service role
-- (edge function), which bypasses RLS, so no insert/update/delete policies.
drop policy if exists "Org admins read export jobs" on public.org_export_jobs;
create policy "Org admins read export jobs" on public.org_export_jobs
  for select
  using (public.has_org_role(organization_id,
                             array['owner','admin','org_admin','super_admin']));

comment on table public.org_export_jobs is
  'Organization data-export jobs (org-export edge function). Zips live in the '
  'private org-exports bucket and expire after 7 days.';

-- ---------------------------------------------------------------------------
-- 2. Private bucket for finished exports (service-role access only)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('org-exports', 'org-exports', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Table denylist shared by the catalog/dump/count RPCs.
--    Platform-internal tables that must never appear in a customer export.
-- ---------------------------------------------------------------------------
create or replace function public.export_table_allowed(p_table text)
returns boolean
language sql stable
as $$
  select p_table not in ('promo_codes', 'suite_promo_codes', 'org_export_jobs')
     and p_table !~* 'secret';
$$;

revoke all on function public.export_table_allowed(text) from public, anon, authenticated;
grant execute on function public.export_table_allowed(text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Catalog: every public BASE TABLE with its single-column uuid PK (if any),
--    org-scoping column (organization_id/org_id or FK -> organizations), and
--    owner column (user_id, or a single-column FK -> auth.users).
-- ---------------------------------------------------------------------------
-- pg_catalog, not information_schema: the info-schema views took ~30 s per
-- call at this schema size (~430 tables), which multiplied across an export's
-- hundreds of RPC calls. Only uuid columns are reported anywhere below:
-- export_dump_rows takes uuid[] and rejects non-uuid columns, so reporting
-- one would abort the whole export.
create or replace function public.export_table_catalog()
returns table (table_name text, pk_column text, org_column text, user_column text)
language sql stable security definer
set search_path = public
as $$
  with tbl as (
    select c.oid, c.relname::text as table_name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and c.relname <> 'organizations'
       and public.export_table_allowed(c.relname::text)
  ),
  uuid_cols as (
    select a.attrelid, a.attname::text as column_name, a.attnum
      from pg_attribute a
      join tbl t on t.oid = a.attrelid
     where a.attnum > 0 and not a.attisdropped
       and a.atttypid = 'uuid'::regtype
  ),
  pk as (
    select i.indrelid as oid, u.column_name
      from pg_index i
      join uuid_cols u on u.attrelid = i.indrelid and u.attnum = i.indkey[0]
     where i.indisprimary and i.indnatts = 1   -- single-column uuid PKs only
  ),
  org_cols as (
    select u.attrelid as oid, u.column_name
      from uuid_cols u
     where u.column_name in ('organization_id', 'org_id')
    union
    select con.conrelid, u.column_name
      from pg_constraint con
      join pg_class pc on pc.oid = con.confrelid
      join pg_namespace pn on pn.oid = pc.relnamespace
      join uuid_cols u on u.attrelid = con.conrelid and u.attnum = con.conkey[1]
     where con.contype = 'f' and array_length(con.conkey, 1) = 1
       and pn.nspname = 'public' and pc.relname = 'organizations'
  )
  select t.table_name,
         (select p.column_name from pk p where p.oid = t.oid limit 1),
         (select min(o.column_name) from org_cols o where o.oid = t.oid),
         (select min(u.column_name) from uuid_cols u
           where u.attrelid = t.oid and u.column_name = 'user_id')
    from tbl t;
$$;

revoke all on function public.export_table_catalog() from public, anon, authenticated;
grant execute on function public.export_table_catalog() to service_role;

-- ---------------------------------------------------------------------------
-- 5. Single-column FK graph within public (child -> parent), same shape as the
--    purge function's _fk temp table. Drives the descendant sweep.
-- ---------------------------------------------------------------------------
create or replace function public.export_fk_edges()
returns table (child_table text, child_column text, parent_table text, parent_column text)
language sql stable security definer
set search_path = public
as $$
  select cc.relname::text, ca.attname::text, pc.relname::text, pa.attname::text
    from pg_constraint con
    join pg_class cc     on cc.oid = con.conrelid
    join pg_namespace cn on cn.oid = cc.relnamespace
    join pg_class pc     on pc.oid = con.confrelid
    join pg_namespace pn on pn.oid = pc.relnamespace
    join pg_attribute ca on ca.attrelid = con.conrelid  and ca.attnum = con.conkey[1]
    join pg_attribute pa on pa.attrelid = con.confrelid and pa.attnum = con.confkey[1]
   where con.contype = 'f'
     and array_length(con.conkey, 1) = 1     -- single-column FKs only
     and cn.nspname = 'public'
     and pn.nspname = 'public'
     and ca.atttypid = 'uuid'::regtype       -- uuid FK columns only
     and public.export_table_allowed(cc.relname::text);
$$;

revoke all on function public.export_fk_edges() from public, anon, authenticated;
grant execute on function public.export_fk_edges() to service_role;

-- ---------------------------------------------------------------------------
-- 6. Row dump. Validates the (table, column) pair against the catalog rules,
--    redacts secret-shaped columns, pages by ctid for a stable-enough order
--    within a single export run (the edge function cross-checks totals with
--    export_count_rows and fails the job on mismatch).
-- ---------------------------------------------------------------------------
create or replace function public.export_dump_rows(
  p_table  text,
  p_column text,
  p_ids    uuid[],
  p_offset integer default 0,
  p_limit  integer default 1000
)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_reloid oid;
  v_redact text[];
  v_limit  integer := least(greatest(coalesce(p_limit, 1000), 1), 2000);
  v_out    jsonb;
begin
  -- (table, column) must be a real public BASE TABLE with a uuid column of
  -- that name; anything else is a caller bug, not a request to honor.
  -- pg_catalog lookups (info-schema was ~100x slower; see catalog note).
  select c.oid into v_reloid
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = p_table and c.relkind = 'r';
  if v_reloid is null or not public.export_table_allowed(p_table) then
    raise exception 'export_dump_rows: table % is not exportable', p_table;
  end if;

  if not exists (
    select 1 from pg_attribute a
     where a.attrelid = v_reloid and a.attname = p_column
       and a.attnum > 0 and not a.attisdropped
       and a.atttypid = 'uuid'::regtype
  ) then
    raise exception 'export_dump_rows: %.% is not a uuid column', p_table, p_column;
  end if;

  select coalesce(array_agg(a.attname::text), '{}')
    into v_redact
    from pg_attribute a
   where a.attrelid = v_reloid and a.attnum > 0 and not a.attisdropped
     and a.attname ~* '(token|secret|password|api_key)';

  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t) - $2), ''[]''::jsonb)
       from (select * from public.%I
              where %I = any ($1)
              order by ctid
              offset %s limit %s) t',
    p_table, p_column, greatest(coalesce(p_offset, 0), 0), v_limit
  ) into v_out using p_ids, v_redact;

  return v_out;
end;
$$;

revoke all on function public.export_dump_rows(text, text, uuid[], integer, integer)
  from public, anon, authenticated;
grant execute on function public.export_dump_rows(text, text, uuid[], integer, integer)
  to service_role;

-- ---------------------------------------------------------------------------
-- 7. Independent row count for the post-dump verification pass.
-- ---------------------------------------------------------------------------
create or replace function public.export_count_rows(
  p_table  text,
  p_column text,
  p_ids    uuid[]
)
returns bigint
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_count bigint;
begin
  if not exists (
    select 1 from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = p_table and c.relkind = 'r'
       and a.attname = p_column and a.attnum > 0 and not a.attisdropped
       and a.atttypid = 'uuid'::regtype
  ) then
    raise exception 'export_count_rows: %.% is not a uuid column', p_table, p_column;
  end if;

  execute format('select count(*) from public.%I where %I = any ($1)', p_table, p_column)
    into v_count using p_ids;
  return v_count;
end;
$$;

revoke all on function public.export_count_rows(text, text, uuid[])
  from public, anon, authenticated;
grant execute on function public.export_count_rows(text, text, uuid[])
  to service_role;
