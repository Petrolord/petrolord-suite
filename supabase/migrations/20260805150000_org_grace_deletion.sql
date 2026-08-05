-- =============================================================================
-- Organization grace-period deletion (offboarding phase 2)
-- -----------------------------------------------------------------------------
-- An org admin schedules account closure from /dashboard/data-export. The org
-- keeps working for a 30-day grace window (deliberate design choice: members
-- can still export their data and any admin can cancel; reversibility is the
-- whole point of the window). After the window a human-triggered purge
-- (org-offboard edge function; pg_cron is not installed on this project)
-- destroys every org-scoped row, member-owned rows of members who belong to
-- no other real org, their storage folders, and their auth accounts.
--
--   * org_closure_requests  - the schedule + the audit record. Deliberately
--                             carries NO foreign keys: the row must SURVIVE
--                             the purge (it feeds the phase-3 deletion
--                             certificate), so org/user references are plain
--                             uuids plus text snapshots.
--   * admin_purge_org(org, dry_run) - single-org catalog-driven purge,
--                             service-role only, dry-run by default, hard
--                             guards (due closure request, never internal
--                             orgs, never orgs with super-admin members).
--
-- Unlike admin_purge_test_orgs, this purge does NOT use
-- session_replication_role: the postgres role on this project is not a
-- superuser and cannot set it from a service-role call (verified live
-- 2026-08-05; the older purge has the same latent problem). Instead the
-- purge computes the complete doomed row-set up front (transitive closure
-- over single-column FK edges, honoring each edge's delete rule) and then
-- deletes it in constraint-tolerant retry passes with FK enforcement ON.
--
-- Ownership semantics:
--   * Members who also belong to a real shared org (or an internal org)
--     SURVIVE; their assets that were shared into a dying org are UNSHARED
--     (org column set to null), never deleted.
--   * A SOLO org elsewhere (e.g. the personal org handle_new_user creates on
--     self-signup) does not keep an account alive; those solo orgs are purged
--     together with the main one.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Closure requests (schedule + surviving audit record)
-- ---------------------------------------------------------------------------
create table if not exists public.org_closure_requests (
    id                 uuid primary key default gen_random_uuid(),
    organization_id    uuid not null,          -- NO FK on purpose (see header)
    org_name           text not null,          -- snapshot, survives the org
    requested_by       uuid,                   -- plain uuid; user may be purged
    requested_by_email text not null,          -- snapshot for the completion email
    reason             text,
    status             text not null default 'scheduled',
                       -- scheduled | cancelled | purged | failed
    grace_days         integer not null default 30,
    effective_at       timestamptz not null,
    cancelled_by       uuid,
    cancelled_by_email text,
    cancelled_at       timestamptz,
    purged_at          timestamptz,
    purge_report       jsonb,                  -- feeds the phase-3 certificate
    error_message      text,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now()
);

create index if not exists org_closure_requests_org_idx
    on public.org_closure_requests (organization_id, created_at desc);

-- At most one live schedule per org.
create unique index if not exists org_closure_requests_one_scheduled
    on public.org_closure_requests (organization_id)
    where status = 'scheduled';

alter table public.org_closure_requests enable row level security;

-- Every org member may SEE a pending closure (the dashboard banner warns the
-- whole org, not only admins). All writes go through the service role.
drop policy if exists "Org members read closure requests" on public.org_closure_requests;
create policy "Org members read closure requests" on public.org_closure_requests
  for select using (public.is_org_member(organization_id));

comment on table public.org_closure_requests is
  'Grace-period closure schedule + surviving audit record (org-offboard edge '
  'function). No FKs by design: rows outlive the purged organization.';

-- Keep the audit trail out of customer exports and out of the purge itself
-- (export_table_catalog is also the purge''s discovery source).
create or replace function public.export_table_allowed(p_table text)
returns boolean
language sql stable
as $$
  select p_table not in ('promo_codes', 'suite_promo_codes', 'org_export_jobs',
                         'org_closure_requests')
     and p_table !~* 'secret';
$$;

revoke all on function public.export_table_allowed(text) from public, anon, authenticated;
grant execute on function public.export_table_allowed(text) to service_role;

-- ---------------------------------------------------------------------------
-- 2. export_fk_edges gains the FK delete rule (needed to decide whether a
--    child row would block, die, or merely lose its reference). Return-type
--    change requires drop + recreate; the extra column is ignored by the
--    already-deployed org-export consumer.
-- ---------------------------------------------------------------------------
drop function if exists public.export_fk_edges();
create function public.export_fk_edges()
returns table (child_table text, child_column text, parent_table text,
               parent_column text, delete_rule text)
language sql stable security definer
set search_path = public
as $$
  select cc.relname::text, ca.attname::text, pc.relname::text, pa.attname::text,
         case con.confdeltype
           when 'a' then 'NO ACTION'
           when 'r' then 'RESTRICT'
           when 'c' then 'CASCADE'
           when 'n' then 'SET NULL'
           when 'd' then 'SET DEFAULT'
           else con.confdeltype::text
         end
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
-- 3. Single-org purge.
-- ---------------------------------------------------------------------------
create or replace function public.admin_purge_org(
  p_org_id  uuid,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_protected_emails text[] := array[
    'info@petrolord.com',
    'ayoasaolu@gmail.com',
    'ayodejiasaolu1@gmail.com',
    'support@petrolord.com',
    'talent@techtainmentcamp.com'
  ];
  v_req record;
  v_org record;
  v_tbl record;
  v_fk  record;
  v_cnt bigint;
  v_remaining bigint;
  v_pass integer := 0;
  v_progress boolean;
  v_orgs uuid[];
  v_report jsonb;
begin
  -- Guard 1: a DUE closure request must exist ('failed' is retryable; the
  -- edge function marks partial runs failed and re-executes them). The grace
  -- window is enforced here, in the database, not only in the edge function.
  select * into v_req
    from public.org_closure_requests
   where organization_id = p_org_id
     and status in ('scheduled', 'failed')
     and effective_at <= now()
   order by created_at desc
   limit 1;
  if v_req.id is null then
    raise exception 'admin_purge_org: no due scheduled closure request for org %', p_org_id;
  end if;

  select o.id, o.name, o.organization_type, o.is_internal into v_org
    from public.organizations o where o.id = p_org_id;
  if v_org.id is null then
    raise exception 'admin_purge_org: organization % not found (rows may already be purged)', p_org_id;
  end if;

  -- Guard 2: never internal orgs.
  if v_org.organization_type = 'internal' or v_org.is_internal is true then
    raise exception 'admin_purge_org: refusing to purge internal organization %', v_org.name;
  end if;

  -- Guard 3: never orgs with protected / super-admin members.
  create temp table _protected on commit drop as
    select u.id
      from auth.users u
     where lower(u.email) = any (select lower(e) from unnest(v_protected_emails) e)
        or coalesce((u.raw_user_meta_data->>'is_super_admin')::boolean, false)
    union
    select pu.id from public.users pu where pu.is_super_admin is true;

  create temp table _members on commit drop as
    select distinct om.user_id
      from public.organization_members om
     where om.organization_id = p_org_id and om.user_id is not null;

  if exists (select 1 from _members m join _protected p on p.id = m.user_id) then
    raise exception 'admin_purge_org: refusing to purge org %: it has protected/super-admin members', v_org.name;
  end if;

  -- Members whose auth account goes with the org vs members who survive.
  create temp table _other_org_class on commit drop as
    select om.user_id, om.organization_id as org_id,
           (not exists (
              select 1 from public.organization_members om2
               where om2.organization_id = om.organization_id
                 and om2.user_id is not null
                 and om2.user_id <> om.user_id)
            and not exists (
              select 1 from public.organizations o
               where o.id = om.organization_id
                 and (o.organization_type = 'internal' or o.is_internal is true))
           ) as is_solo
      from public.organization_members om
     where om.user_id in (select user_id from _members)
       and om.organization_id <> p_org_id;

  create temp table _auth_to_delete on commit drop as
    select m.user_id from _members m
     where not exists (
             select 1 from _other_org_class c
              where c.user_id = m.user_id and c.is_solo = false
           );

  create temp table _surviving on commit drop as
    select m.user_id from _members m
     where m.user_id not in (select user_id from _auth_to_delete);

  -- Solo orgs of leaving members ride along with the purge (names snapshotted
  -- now; the rows are gone by the time the report is built).
  create temp table _extra_orgs on commit drop as
    select distinct c.org_id, o.name
      from _other_org_class c
      join _auth_to_delete d on d.user_id = c.user_id
      left join public.organizations o on o.id = c.org_id
     where c.is_solo;

  select array[p_org_id] || coalesce(array_agg(org_id), '{}'::uuid[])
    into v_orgs from _extra_orgs;

  -- Discovery: the same pg_catalog catalog the export uses.
  -- org_closure_requests and denylisted platform tables are excluded by
  -- construction; org_export_jobs rows die through the FK closure below.
  create temp table _catalog on commit drop as
    select * from public.export_table_catalog();

  -- org_nullable decides deletion vs unshare semantics: a NULLABLE org
  -- column is a share flag (geo_wells, geo_surfaces) and can be cleared for
  -- surviving owners; a NOT NULL org column means the row is structurally
  -- org-owned (organization_members, invoices) and always dies with the org.
  create temp table _org_tables on commit drop as
    select c.table_name, c.org_column, c.user_column, c.pk_column,
           not a.attnotnull as org_nullable
      from _catalog c
      join pg_class pc on pc.relname = c.table_name
      join pg_namespace pn on pn.oid = pc.relnamespace and pn.nspname = 'public'
      join pg_attribute a on a.attrelid = pc.oid and a.attname = c.org_column
     where c.org_column is not null;

  create temp table _user_tables on commit drop as
    select table_name, user_column, org_column, pk_column
      from _catalog where user_column is not null;

  create temp table _fk on commit drop as
    select * from public.export_fk_edges();

  -- -------------------------------------------------------------------------
  -- Doomed row-set: everything the purge will delete, computed up front so
  -- both the report and the deletion passes share one truth.
  -- -------------------------------------------------------------------------
  create temp table _doomed (tbl text, pk uuid, primary key (tbl, pk)) on commit drop;

  -- Seed A: org-scoped rows of the dying orgs, EXCEPT dual-scoped rows owned
  -- by surviving members (those get unshared instead).
  for v_tbl in select * from _org_tables where pk_column is not null loop
    if v_tbl.user_column is not null and v_tbl.org_nullable then
      execute format(
        'insert into _doomed select %L, %I from public.%I
          where %I = any($1)
            and (%I is null or %I not in (select user_id from _surviving))
          on conflict do nothing',
        v_tbl.table_name, v_tbl.pk_column, v_tbl.table_name, v_tbl.org_column,
        v_tbl.user_column, v_tbl.user_column
      ) using v_orgs;
    else
      execute format(
        'insert into _doomed select %L, %I from public.%I where %I = any($1)
          on conflict do nothing',
        v_tbl.table_name, v_tbl.pk_column, v_tbl.table_name, v_tbl.org_column
      ) using v_orgs;
    end if;
  end loop;

  -- Seed B: everything owned by members whose accounts are being deleted.
  for v_tbl in select * from _user_tables where pk_column is not null loop
    execute format(
      'insert into _doomed select %L, %I from public.%I
        where %I in (select user_id from _auth_to_delete)
        on conflict do nothing',
      v_tbl.table_name, v_tbl.pk_column, v_tbl.table_name, v_tbl.user_column
    );
  end loop;

  -- Seed C: the users mirror rows and the organizations themselves.
  insert into _doomed
    select 'users', d.user_id from _auth_to_delete d
     where exists (select 1 from public.users u where u.id = d.user_id)
    on conflict do nothing;
  insert into _doomed select 'organizations', unnest(v_orgs) on conflict do nothing;

  -- Closure: children of doomed parents die too when their FK would BLOCK
  -- (NO ACTION / RESTRICT) or CASCADE anyway. SET NULL / SET DEFAULT children
  -- survive with a cleared reference (the FK action handles them at delete
  -- time). Only edges that reference the parent's primary key participate.
  v_pass := 0;
  loop
    v_pass := v_pass + 1;
    v_progress := false;
    for v_fk in
      select f.child_table, f.child_column, f.parent_table, cp.pk_column as child_pk
        from _fk f
        join _catalog cp on cp.table_name = f.child_table and cp.pk_column is not null
        join _catalog pp on pp.table_name = f.parent_table and pp.pk_column = f.parent_column
       where f.delete_rule in ('NO ACTION', 'RESTRICT', 'CASCADE')
      union all
      -- organizations is not in the catalog; its pk is known to be id
      select f.child_table, f.child_column, f.parent_table, cp.pk_column
        from _fk f
        join _catalog cp on cp.table_name = f.child_table and cp.pk_column is not null
       where f.parent_table = 'organizations' and f.parent_column = 'id'
         and f.delete_rule in ('NO ACTION', 'RESTRICT', 'CASCADE')
    loop
      execute format(
        'insert into _doomed
           select %L, c.%I from public.%I c
             join _doomed d on d.tbl = %L and d.pk = c.%I
           on conflict do nothing',
        v_fk.child_table, v_fk.child_pk, v_fk.child_table,
        v_fk.parent_table, v_fk.child_column
      );
      get diagnostics v_cnt = row_count;
      if v_cnt > 0 then v_progress := true; end if;
    end loop;
    exit when not v_progress;
    exit when v_pass >= 25;
  end loop;

  -- Rows unshared instead of deleted (report + execution share the query).
  create temp table _unshared (table_name text, rows bigint) on commit drop;
  for v_tbl in select * from _org_tables where user_column is not null and org_nullable loop
    execute format(
      'select count(*) from public.%I
        where %I = any($1) and %I in (select user_id from _surviving)',
      v_tbl.table_name, v_tbl.org_column, v_tbl.user_column
    ) into v_cnt using v_orgs;
    if v_cnt > 0 then
      insert into _unshared values (v_tbl.table_name, v_cnt);
    end if;
  end loop;

  -- -------------------------------------------------------------------------
  -- Execution: FK enforcement stays ON. Delete the doomed set in retry
  -- passes; each pass removes whatever is no longer blocked by children
  -- (cascades and set-nulls fire normally).
  -- -------------------------------------------------------------------------
  if not p_dry_run then
    -- a. Unshare dual-scoped rows owned by surviving members.
    for v_tbl in select * from _org_tables where user_column is not null and org_nullable loop
      execute format(
        'update public.%I set %I = null
          where %I = any($1) and %I in (select user_id from _surviving)',
        v_tbl.table_name, v_tbl.org_column, v_tbl.org_column, v_tbl.user_column
      ) using v_orgs;
    end loop;

    -- b. Constraint-tolerant deletion passes.
    v_pass := 0;
    loop
      v_pass := v_pass + 1;
      v_progress := false;

      for v_tbl in
        select distinct d.tbl, c.pk_column
          from _doomed d
          join _catalog c on c.table_name = d.tbl
         where c.pk_column is not null
      loop
        begin
          execute format(
            'delete from public.%I where %I in (select pk from _doomed where tbl = %L)',
            v_tbl.tbl, v_tbl.pk_column, v_tbl.tbl
          );
          get diagnostics v_cnt = row_count;
          if v_cnt > 0 then v_progress := true; end if;
        exception when foreign_key_violation then
          null;  -- still blocked by a child; the next pass retries
        end;
      end loop;

      -- organizations (not in the catalog).
      begin
        delete from public.organizations where id = any(v_orgs);
        get diagnostics v_cnt = row_count;
        if v_cnt > 0 then v_progress := true; end if;
      exception when foreign_key_violation then
        null;
      end;

      -- Org/user-scoped tables without a uuid pk: delete by predicate.
      for v_tbl in select * from _org_tables where pk_column is null loop
        begin
          if v_tbl.user_column is not null and v_tbl.org_nullable then
            execute format(
              'delete from public.%I
                where %I = any($1)
                  and (%I is null or %I not in (select user_id from _surviving))',
              v_tbl.table_name, v_tbl.org_column, v_tbl.user_column, v_tbl.user_column
            ) using v_orgs;
          else
            execute format('delete from public.%I where %I = any($1)',
                           v_tbl.table_name, v_tbl.org_column) using v_orgs;
          end if;
          get diagnostics v_cnt = row_count;
          if v_cnt > 0 then v_progress := true; end if;
        exception when foreign_key_violation then
          null;
        end;
      end loop;
      for v_tbl in select * from _user_tables where pk_column is null loop
        begin
          execute format(
            'delete from public.%I where %I in (select user_id from _auth_to_delete)',
            v_tbl.table_name, v_tbl.user_column
          );
          get diagnostics v_cnt = row_count;
          if v_cnt > 0 then v_progress := true; end if;
        exception when foreign_key_violation then
          null;
        end;
      end loop;

      exit when not v_progress;
      exit when v_pass >= 50;
    end loop;

    -- c. Verify: no doomed row and no org/member-owned row survives. Any
    --    remainder raises and rolls the whole purge back.
    for v_tbl in
      select distinct d.tbl, c.pk_column
        from _doomed d join _catalog c on c.table_name = d.tbl
       where c.pk_column is not null
    loop
      execute format(
        'select count(*) from public.%I where %I in (select pk from _doomed where tbl = %L)',
        v_tbl.tbl, v_tbl.pk_column, v_tbl.tbl
      ) into v_remaining;
      if v_remaining > 0 then
        raise exception 'admin_purge_org incomplete: % doomed row(s) remain in % (FK deadlock?)',
          v_remaining, v_tbl.tbl;
      end if;
    end loop;
    for v_tbl in select * from _org_tables loop
      execute format('select count(*) from public.%I where %I = any($1)',
                     v_tbl.table_name, v_tbl.org_column)
        into v_remaining using v_orgs;
      if v_remaining > 0 then
        raise exception 'admin_purge_org incomplete: % org-scoped row(s) remain in %',
          v_remaining, v_tbl.table_name;
      end if;
    end loop;
    for v_tbl in select * from _user_tables loop
      execute format(
        'select count(*) from public.%I where %I in (select user_id from _auth_to_delete)',
        v_tbl.table_name, v_tbl.user_column) into v_remaining;
      if v_remaining > 0 then
        raise exception 'admin_purge_org incomplete: % member-owned row(s) remain in %',
          v_remaining, v_tbl.table_name;
      end if;
    end loop;
    if exists (select 1 from public.organizations where id = any(v_orgs)) then
      raise exception 'admin_purge_org incomplete: organization row(s) survived';
    end if;
  end if;

  -- -------------------------------------------------------------------------
  -- Report (same shape in both modes; stored on the closure request by the
  -- edge function and later rendered as the phase-3 certificate)
  -- -------------------------------------------------------------------------
  select jsonb_build_object(
    'dry_run', p_dry_run,
    'closure_request_id', v_req.id,
    'organization', jsonb_build_object('id', v_org.id, 'name', v_org.name),
    'extra_orgs', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.org_id, 'name', e.name) order by e.name)
        from _extra_orgs e
    ), '[]'::jsonb),
    'member_count', (select count(*) from _members),
    'summary', jsonb_build_object(
      'total_rows', (select count(*) from _doomed),
      'tables_affected', (select count(distinct tbl) from _doomed),
      'rows_unshared', coalesce((select sum(rows) from _unshared), 0),
      'auth_users_to_delete', (select count(*) from _auth_to_delete)
    ),
    'tables_affected', coalesce((
      select jsonb_agg(jsonb_build_object('table', tbl, 'rows', total) order by total desc)
        from (select tbl, count(*) as total from _doomed group by tbl) t
    ), '[]'::jsonb),
    'unshared_tables', coalesce((
      select jsonb_agg(jsonb_build_object('table', table_name, 'rows', rows) order by rows desc)
        from _unshared
    ), '[]'::jsonb),
    'auth_users_to_delete', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.user_id, 'email', au.email) order by au.email)
        from _auth_to_delete d
        join auth.users au on au.id = d.user_id
    ), '[]'::jsonb),
    'surviving_members', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.user_id, 'email', au.email) order by au.email)
        from _surviving s
        join auth.users au on au.id = s.user_id
    ), '[]'::jsonb)
  ) into v_report;

  return v_report;
end;
$$;

alter function public.admin_purge_org(uuid, boolean) owner to postgres;
revoke all on function public.admin_purge_org(uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_purge_org(uuid, boolean) to service_role;

comment on function public.admin_purge_org(uuid, boolean) is
  'Grace-gated single-org purge (offboarding phase 2). Dry-run by default; '
  'requires a due org_closure_requests row; refuses internal orgs and orgs '
  'with protected members. Deletes a precomputed doomed row-set in '
  'constraint-tolerant passes with FK enforcement ON (no replica mode: '
  'postgres cannot set session_replication_role from service-role calls). '
  'Storage folders and auth accounts are removed by the org-offboard edge '
  'function around this RPC.';
