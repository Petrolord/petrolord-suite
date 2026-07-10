-- =============================================================================
-- admin_purge_test_orgs
-- -----------------------------------------------------------------------------
-- Guarded, DYNAMIC purge of inactive *test* organizations and their users on
-- the Suite/HSE shared database.
--
-- Why dynamic: ~162 public tables reference organizations(id), only ~28 cascade,
-- and some org data lives in NON-org-scoped descendant tables (e.g. the sip_*
-- subtree, and circular trees like tasks/site_locations/rb_runs). A hand-written
-- list would miss tables and fail on RESTRICT FKs. Instead this function:
--   * discovers every org-scoped table from the catalog (FK to organizations +
--     any organization_id/org_id column),
--   * deletes their rows with FK enforcement disabled for the transaction only
--     (SET LOCAL session_replication_role='replica' — cannot leak to the pooled
--     connection), then
--   * sweeps orphaned descendant rows (any row whose single-column FK now points
--     to a missing parent) to a fixpoint, which cleans sip_*/circular subtrees of
--     arbitrary depth without hardcoding,
--   * restores FK enforcement and verifies no org-scoped row survives.
--
-- Safety properties:
--   * Dry-run by DEFAULT (p_dry_run = true). Returns a report, deletes nothing.
--   * Runs inside the RPC's own transaction; ANY error rolls the whole thing
--     back (e.g. a leftover row from a non-org-scoped table aborts the purge).
--   * Protected from deletion: super-admins (by email, public.users.is_super_admin,
--     auth metadata, or super_admin role rows), the explicit preserve list
--     (incl. talent@techtainmentcamp.com), any org with a protected member, and
--     every organization_type = 'internal' org.
--   * Does NOT delete auth.users itself — it returns the orphaned auth user ids
--     so the edge function can remove them via the supported Admin API.
--   * EXECUTE is granted to service_role only; the admin-cleanup-test-data edge
--     function gates the caller as a super-admin before invoking.
--
-- Returns JSONB:
--   { dry_run, inactivity_days, cutoff,
--     summary: { candidate_org_count, total_dependent_rows, auth_users_to_delete },
--     candidate_orgs: [ { org_id, name, organization_type, member_count,
--                         last_sign_in, dependent_rows, members:[...] } ],
--     tables_affected: [ { table, column, rows } ],          -- only rows > 0
--     auth_users_to_delete: [ { id, email, last_sign_in_at } ],
--     excluded_orgs: [ { org_id, name, reason } ] }          -- protected/active
-- =============================================================================

create or replace function public.admin_purge_test_orgs(
  p_dry_run boolean default true,
  p_inactivity_days integer default 60
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
  v_cutoff       timestamptz := now() - make_interval(days => p_inactivity_days);
  v_tbl          record;
  v_fk           record;
  v_pass         integer := 0;
  v_progress     boolean;
  v_cnt          bigint;
  v_remaining    bigint;
  v_report       jsonb;
begin
  -- ---------------------------------------------------------------------------
  -- 1. Protected users: super-admins + explicit preserve list
  -- ---------------------------------------------------------------------------
  create temp table _protected_users on commit drop as
    select u.id
      from auth.users u
     where lower(u.email) = any (select lower(e) from unnest(v_protected_emails) e)
        or coalesce((u.raw_user_meta_data->>'is_super_admin')::boolean, false) = true
    union
    select pu.id from public.users pu where pu.is_super_admin is true
    union
    select ou.user_id from public.organization_users ou
     where ou.user_role = 'super_admin' and ou.user_id is not null
    union
    select om.user_id from public.org_members om
     where om.role = 'super_admin' and om.user_id is not null;

  -- ---------------------------------------------------------------------------
  -- 2. Membership snapshot (org_id, user_id) across all linking tables.
  --    Captured BEFORE any deletion so we can derive orphaned auth users later.
  -- ---------------------------------------------------------------------------
  create temp table _members on commit drop as
    select organization_id as org_id, user_id from public.organization_members where user_id is not null
    union
    select organization_id, user_id from public.organization_users where user_id is not null
    union
    select org_id, user_id from public.org_members where user_id is not null
    union
    select organization_id, id from public.users where organization_id is not null;

  -- ---------------------------------------------------------------------------
  -- 3. Per-org stats: member count, latest sign-in, any protected member?
  -- ---------------------------------------------------------------------------
  create temp table _org_stats on commit drop as
    select o.id   as org_id,
           o.name,
           o.organization_type,
           count(distinct m.user_id)               as member_count,
           max(au.last_sign_in_at)                 as last_sign_in,
           bool_or(p.id is not null)               as has_protected_member
      from public.organizations o
      left join _members m         on m.org_id = o.id
      left join auth.users au      on au.id = m.user_id
      left join _protected_users p on p.id = m.user_id
     group by o.id, o.name, o.organization_type;

  -- ---------------------------------------------------------------------------
  -- 4. Candidate orgs: not internal, no protected member, and inactive
  --    (most-recent member sign-in older than cutoff, OR nobody ever signed in)
  -- ---------------------------------------------------------------------------
  create temp table _candidates on commit drop as
    select org_id
      from _org_stats
     where organization_type <> 'internal'
       and has_protected_member = false
       and (last_sign_in is null or last_sign_in < v_cutoff);

  -- ---------------------------------------------------------------------------
  -- 5. Discover every org-scoped BASE TABLE (FK to organizations + name match).
  --    Views are excluded so we never DELETE from a view.
  -- ---------------------------------------------------------------------------
  create temp table _org_tables on commit drop as
    select distinct t.table_schema, t.table_name, x.column_name
      from (
            -- (a) columns literally named organization_id / org_id
            select c.table_schema, c.table_name, c.column_name
              from information_schema.columns c
             where c.table_schema = 'public'
               and c.column_name in ('organization_id', 'org_id')
            union
            -- (b) FK columns that reference public.organizations
            select tc.table_schema, tc.table_name, kcu.column_name
              from information_schema.table_constraints tc
              join information_schema.key_column_usage kcu
                on kcu.constraint_name = tc.constraint_name
               and kcu.constraint_schema = tc.constraint_schema
              join information_schema.constraint_column_usage ccu
                on ccu.constraint_name = tc.constraint_name
               and ccu.constraint_schema = tc.constraint_schema
             where tc.constraint_type = 'FOREIGN KEY'
               and ccu.table_schema = 'public'
               and ccu.table_name = 'organizations'
           ) x
      join information_schema.tables t
        on t.table_schema = x.table_schema
       and t.table_name = x.table_name
       and t.table_type = 'BASE TABLE'
     where x.table_name <> 'organizations';

  -- ---------------------------------------------------------------------------
  -- 5b. Single-column FK graph within public (child -> parent). Drives the
  --     orphan sweep. Composite FKs are excluded (org-domain FKs are all single).
  -- ---------------------------------------------------------------------------
  create temp table _fk on commit drop as
    select tc.table_schema  as child_schema,  tc.table_name  as child_tbl,  kcu.column_name as child_col,
           ccu.table_schema as parent_schema, ccu.table_name as parent_tbl, ccu.column_name as parent_col
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on kcu.constraint_name = tc.constraint_name and kcu.constraint_schema = tc.constraint_schema
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_name = tc.constraint_name and ccu.constraint_schema = tc.constraint_schema
     where tc.constraint_type = 'FOREIGN KEY'
       and tc.table_schema = 'public'
       and ccu.table_schema = 'public'
       and tc.constraint_name in (
             select constraint_name
               from information_schema.key_column_usage
              where constraint_schema = 'public'
              group by constraint_name
             having count(*) = 1     -- single-column FKs only
           );

  -- ---------------------------------------------------------------------------
  -- 6. Snapshot per-org / per-table row counts (one grouped pass per table).
  --    Drives both the dry-run report and the post-delete completeness check.
  -- ---------------------------------------------------------------------------
  create temp table _affected (org_id uuid, table_name text, column_name text, rows bigint)
    on commit drop;

  for v_tbl in select table_schema, table_name, column_name from _org_tables loop
    execute format(
      'insert into _affected (org_id, table_name, column_name, rows)
         select %1$I, %2$L, %3$L, count(*)
           from %4$I.%2$I
          where %1$I in (select org_id from _candidates)
          group by %1$I',
      v_tbl.column_name, v_tbl.table_name, v_tbl.column_name, v_tbl.table_schema
    );
  end loop;

  -- ---------------------------------------------------------------------------
  -- 7. Orphaned auth users: members of candidate orgs who do NOT also belong to
  --    a surviving org, minus protected users. (snapshot-based; valid in both modes)
  -- ---------------------------------------------------------------------------
  create temp table _auth_to_delete on commit drop as
    select distinct m.user_id
      from _members m
     where m.org_id in (select org_id from _candidates)
       and m.user_id is not null
       and m.user_id not in (select id from _protected_users)
       and not exists (
             select 1 from _members m2
              where m2.user_id = m.user_id
                and m2.org_id not in (select org_id from _candidates)
           );

  -- ---------------------------------------------------------------------------
  -- 8. EXECUTION (only when p_dry_run = false)
  -- ---------------------------------------------------------------------------
  if not p_dry_run then
    -- Disable FK enforcement for THIS TRANSACTION ONLY. SET LOCAL auto-resets on
    -- commit/rollback, so it can never leak to other queries on a pooled conn.
    set local session_replication_role = 'replica';

    -- 8a. Delete every org-scoped row directly (order-independent now).
    for v_tbl in select table_schema, table_name, column_name from _org_tables loop
      execute format(
        'delete from %1$I.%2$I where %3$I in (select org_id from _candidates)',
        v_tbl.table_schema, v_tbl.table_name, v_tbl.column_name
      );
    end loop;

    -- 8b. Orphan sweep: delete any row whose single-column FK now points to a
    --     parent that no longer exists. Repeats to a fixpoint, so it cleans
    --     descendant subtrees (sip_*, etc.) of arbitrary depth, incl. circular
    --     and self-referential FKs. Safe because the DB had referential integrity
    --     before the purge, so the ONLY newly-dangling rows are descendants of the
    --     orgs we just deleted.
    v_pass := 0;
    loop
      v_pass := v_pass + 1;
      v_progress := false;

      for v_fk in select * from _fk loop
        execute format(
          'delete from %1$I.%2$I c
             where c.%3$I is not null
               and not exists (select 1 from %4$I.%5$I p where p.%6$I = c.%3$I)',
          v_fk.child_schema, v_fk.child_tbl, v_fk.child_col,
          v_fk.parent_schema, v_fk.parent_tbl, v_fk.parent_col
        );
        get diagnostics v_cnt = row_count;
        if v_cnt > 0 then
          v_progress := true;
        end if;
      end loop;

      exit when v_progress = false;  -- no more orphans
      exit when v_pass >= 50;        -- safety cap
    end loop;

    -- 8c. Tidy any public.users mirror rows for users we're about to remove from
    --     auth (covers members whose own organization_id wasn't a candidate).
    delete from public.users where id in (select user_id from _auth_to_delete);

    -- 8d. Remove the organizations themselves.
    delete from public.organizations where id in (select org_id from _candidates);

    -- 8e. Restore FK enforcement, then verify no org-scoped row survived. Any
    --     remainder raises and rolls the whole transaction back.
    set local session_replication_role = 'origin';

    for v_tbl in select table_schema, table_name, column_name from _org_tables loop
      execute format(
        'select count(*) from %1$I.%2$I where %3$I in (select org_id from _candidates)',
        v_tbl.table_schema, v_tbl.table_name, v_tbl.column_name
      ) into v_remaining;

      if v_remaining > 0 then
        raise exception
          'Purge incomplete: % row(s) remain in %.% (column %). '
          'Rolling back — no changes committed.',
          v_remaining, v_tbl.table_schema, v_tbl.table_name, v_tbl.column_name;
      end if;
    end loop;
  end if;

  -- ---------------------------------------------------------------------------
  -- 9. Build report (same shape in dry-run and execution mode)
  -- ---------------------------------------------------------------------------
  select jsonb_build_object(
    'dry_run', p_dry_run,
    'inactivity_days', p_inactivity_days,
    'cutoff', v_cutoff,
    'summary', jsonb_build_object(
      'candidate_org_count', (select count(*) from _candidates),
      'total_dependent_rows', coalesce((select sum(rows) from _affected), 0),
      'auth_users_to_delete', (select count(*) from _auth_to_delete)
    ),
    'candidate_orgs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'org_id', s.org_id,
        'name', s.name,
        'organization_type', s.organization_type,
        'member_count', s.member_count,
        'last_sign_in', s.last_sign_in,
        'dependent_rows', coalesce((select sum(a.rows) from _affected a where a.org_id = s.org_id), 0),
        'members', coalesce((
          select jsonb_agg(jsonb_build_object(
            'user_id', m.user_id,
            'email', au.email,
            'last_sign_in_at', au.last_sign_in_at
          ) order by au.email)
          from _members m
          join auth.users au on au.id = m.user_id
          where m.org_id = s.org_id
        ), '[]'::jsonb)
      ) order by s.name)
      from _org_stats s
      where s.org_id in (select org_id from _candidates)
    ), '[]'::jsonb),
    'tables_affected', coalesce((
      select jsonb_agg(jsonb_build_object('table', table_name, 'column', column_name, 'rows', total)
                       order by total desc)
      from (
        select table_name, column_name, sum(rows) as total
          from _affected
         group by table_name, column_name
        having sum(rows) > 0
      ) t
    ), '[]'::jsonb),
    'auth_users_to_delete', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.user_id, 'email', au.email, 'last_sign_in_at', au.last_sign_in_at
      ) order by au.email)
      from _auth_to_delete d
      join auth.users au on au.id = d.user_id
    ), '[]'::jsonb),
    'excluded_orgs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'org_id', s.org_id,
        'name', s.name,
        'reason', case
                    when s.organization_type = 'internal' then 'internal org'
                    when s.has_protected_member then 'has protected/super-admin member'
                    else 'active within cutoff'
                  end)
        order by s.name)
      from _org_stats s
      where s.org_id not in (select org_id from _candidates)
    ), '[]'::jsonb)
  ) into v_report;

  return v_report;
end;
$$;

alter function public.admin_purge_test_orgs(boolean, integer) owner to postgres;

-- Lock it down: only the service role (i.e. the edge function) may execute it.
revoke all on function public.admin_purge_test_orgs(boolean, integer) from public;
revoke all on function public.admin_purge_test_orgs(boolean, integer) from anon;
revoke all on function public.admin_purge_test_orgs(boolean, integer) from authenticated;
grant execute on function public.admin_purge_test_orgs(boolean, integer) to service_role;

comment on function public.admin_purge_test_orgs(boolean, integer) is
  'Dry-run-by-default purge of inactive test orgs + their users. Catalog-driven, '
  'transactional, super-admin/internal/preserve-list protected. Returns auth user '
  'ids to delete via the Admin API. Invoked only by the admin-cleanup-test-data edge function.';
