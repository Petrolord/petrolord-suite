-- =============================================================================
-- Organization grace-period deletion (offboarding phase 2)
-- -----------------------------------------------------------------------------
-- An org admin schedules account closure from /dashboard/data-export. The org
-- keeps working for a 30-day grace window (deliberate design choice: members
-- can still export their data and any admin can cancel; reversibility is the
-- whole point of the window). After the window a human-triggered purge
-- (org-offboard edge function; pg_cron is not installed on this project)
-- destroys every org-scoped row, member-owned rows of members who belong to
-- no other org, their storage folders, and their auth accounts.
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
--                             Reuses the phase-1 pg_catalog discovery RPCs
--                             (export_table_catalog / export_fk_edges).
--
-- Shared assets of members who survive (they belong to another org) are
-- UNSHARED (org column set to null), not deleted: a two-org member's wells
-- are their property, not the closing org's.
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

-- ---------------------------------------------------------------------------
-- 2. Single-org purge. Modeled on the proven admin_purge_test_orgs
--    (20260613120000): replica-mode deletes + orphan sweep to a fixpoint +
--    verification that rolls everything back if any row survives.
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
  v_report jsonb;
begin
  -- Guard 1: a DUE scheduled closure request must exist. The grace window is
  -- enforced here, in the database, not only in the edge function.
  select * into v_req
    from public.org_closure_requests
   where organization_id = p_org_id
     and status = 'scheduled'
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

  -- Members whose auth account goes with the org (no membership elsewhere)
  -- vs members who survive (their shared assets get unshared, not deleted).
  create temp table _auth_to_delete on commit drop as
    select m.user_id from _members m
     where not exists (
             select 1 from public.organization_members om2
              where om2.user_id = m.user_id
                and om2.organization_id <> p_org_id
           );

  create temp table _surviving on commit drop as
    select m.user_id from _members m
     where m.user_id not in (select user_id from _auth_to_delete);

  -- Discovery: same pg_catalog catalog the export uses. org_closure_requests
  -- and the denylisted platform tables are excluded by construction.
  create temp table _org_tables on commit drop as
    select c.table_name, c.org_column, c.user_column
      from public.export_table_catalog() c
     where c.org_column is not null;

  create temp table _user_tables on commit drop as
    select c.table_name, c.user_column, c.org_column
      from public.export_table_catalog() c
     where c.user_column is not null;

  create temp table _fk on commit drop as
    select * from public.export_fk_edges();

  -- Snapshot counts (drives both the dry-run report and the audit record).
  create temp table _affected (table_name text, column_name text, rows bigint) on commit drop;
  for v_tbl in select * from _org_tables loop
    execute format(
      'insert into _affected select %L, %L, count(*) from public.%I where %I = $1',
      v_tbl.table_name, v_tbl.org_column, v_tbl.table_name, v_tbl.org_column
    ) using p_org_id;
  end loop;
  -- Member-owned rows of leaving users; rows already counted in the org pass
  -- (dual-scoped, org = this org) are excluded to keep the audit total honest.
  for v_tbl in select * from _user_tables loop
    if v_tbl.org_column is not null then
      execute format(
        'insert into _affected select %L, %L, count(*) from public.%I
          where %I in (select user_id from _auth_to_delete)
            and %I is distinct from $1',
        v_tbl.table_name, v_tbl.user_column, v_tbl.table_name,
        v_tbl.user_column, v_tbl.org_column
      ) using p_org_id;
    else
      execute format(
        'insert into _affected select %L, %L, count(*) from public.%I
          where %I in (select user_id from _auth_to_delete)',
        v_tbl.table_name, v_tbl.user_column, v_tbl.table_name, v_tbl.user_column
      );
    end if;
  end loop;

  create temp table _unshared (table_name text, rows bigint) on commit drop;
  for v_tbl in select * from _org_tables where user_column is not null loop
    execute format(
      'select count(*) from public.%I
        where %I = $1 and %I in (select user_id from _surviving)',
      v_tbl.table_name, v_tbl.org_column, v_tbl.user_column
    ) into v_cnt using p_org_id;
    if v_cnt > 0 then
      insert into _unshared values (v_tbl.table_name, v_cnt);
    end if;
  end loop;

  -- -------------------------------------------------------------------------
  -- Execution
  -- -------------------------------------------------------------------------
  if not p_dry_run then
    -- Transaction-local only; cannot leak to the pooled connection.
    set local session_replication_role = 'replica';

    -- a. Unshare dual-scoped rows owned by surviving members.
    for v_tbl in select * from _org_tables where user_column is not null loop
      execute format(
        'update public.%I set %I = null
          where %I = $1 and %I in (select user_id from _surviving)',
        v_tbl.table_name, v_tbl.org_column, v_tbl.org_column, v_tbl.user_column
      ) using p_org_id;
    end loop;

    -- b. Delete every org-scoped row.
    for v_tbl in select * from _org_tables loop
      execute format('delete from public.%I where %I = $1',
                     v_tbl.table_name, v_tbl.org_column) using p_org_id;
    end loop;

    -- c. Delete user-scoped rows of members whose accounts are going away
    --    (their data has no other home; relying on auth-side cascades alone
    --    breaks on RESTRICT FKs, as user_profiles proved live on 2026-08-05).
    for v_tbl in select * from _user_tables loop
      execute format(
        'delete from public.%I where %I in (select user_id from _auth_to_delete)',
        v_tbl.table_name, v_tbl.user_column
      );
    end loop;

    -- d. public.users mirrors, then the organization itself.
    delete from public.users where id in (select user_id from _auth_to_delete);
    delete from public.organizations where id = p_org_id;

    -- e. Orphan sweep to a fixpoint. Replica mode disabled FK cascade
    --    actions, so would-be-cascaded children (org_export_jobs, profile
    --    rows, arbitrary-depth subtrees) all dangle now; the DB had
    --    referential integrity before this transaction, so the only dangling
    --    rows are descendants of what we just deleted.
    v_pass := 0;
    loop
      v_pass := v_pass + 1;
      v_progress := false;
      for v_fk in select * from _fk loop
        execute format(
          'delete from public.%I c
            where c.%I is not null
              and not exists (select 1 from public.%I p where p.%I = c.%I)',
          v_fk.child_table, v_fk.child_column,
          v_fk.parent_table, v_fk.parent_column, v_fk.child_column
        );
        get diagnostics v_cnt = row_count;
        if v_cnt > 0 then v_progress := true; end if;
      end loop;
      exit when v_progress = false;
      exit when v_pass >= 50;
    end loop;

    set local session_replication_role = 'origin';

    -- f. Verify: nothing org-scoped and nothing member-owned survives.
    --    Any remainder raises and rolls the whole purge back.
    for v_tbl in select * from _org_tables loop
      execute format('select count(*) from public.%I where %I = $1',
                     v_tbl.table_name, v_tbl.org_column)
        into v_remaining using p_org_id;
      if v_remaining > 0 then
        raise exception 'admin_purge_org incomplete: % row(s) remain in %.%',
          v_remaining, v_tbl.table_name, v_tbl.org_column;
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
  end if;

  -- -------------------------------------------------------------------------
  -- Report (same shape in both modes; stored on the closure request by the
  -- edge function and later rendered as the phase-3 certificate)
  -- -------------------------------------------------------------------------
  select jsonb_build_object(
    'dry_run', p_dry_run,
    'closure_request_id', v_req.id,
    'organization', jsonb_build_object('id', v_org.id, 'name', v_org.name),
    'member_count', (select count(*) from _members),
    'summary', jsonb_build_object(
      'total_rows', coalesce((select sum(rows) from _affected), 0),
      'tables_affected', (select count(*) from _affected where rows > 0),
      'rows_unshared', coalesce((select sum(rows) from _unshared), 0),
      'auth_users_to_delete', (select count(*) from _auth_to_delete)
    ),
    'tables_affected', coalesce((
      select jsonb_agg(jsonb_build_object('table', table_name, 'column', column_name, 'rows', total)
                       order by total desc)
        from (select table_name, column_name, sum(rows) as total
                from _affected group by table_name, column_name
              having sum(rows) > 0) t
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
  'with protected members. Storage folders and auth accounts are removed by '
  'the org-offboard edge function around this RPC.';
