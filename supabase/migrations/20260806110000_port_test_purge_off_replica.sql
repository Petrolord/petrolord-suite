-- =============================================================================
-- admin_purge_test_orgs v2: ported off session_replication_role (debt fix)
-- -----------------------------------------------------------------------------
-- The 20260613120000 original was broken twice over by later platform changes:
--
--   1. It disabled FK enforcement with SET LOCAL session_replication_role,
--      which the postgres role can only do in a direct management-API session.
--      From a service-role call (the admin-cleanup-test-data edge function,
--      its only intended caller) it fails with "permission denied to set
--      parameter" (verified live 2026-08-05 while building admin_purge_org).
--   2. It still queried organization_users / org_members, both DROPPED by the
--      membership consolidation (20260713300000 + 20260714160000), so even a
--      dry run now errors.
--
-- This port adopts the machinery proven in admin_purge_org (20260805150000):
--   * membership from organization_members (+ users.organization_id mirror),
--   * discovery via the pg_catalog RPCs export_table_catalog/export_fk_edges,
--   * a precomputed doomed row-set (FK closure honoring delete rules),
--     deleted in constraint-tolerant retry passes with FK enforcement ON,
--   * member-owned rows of deleted users included (relying on auth-side
--     cascades alone breaks on RESTRICT FKs, e.g. user_profiles),
--   * UNSHARE instead of delete for dual-scoped rows owned by SURVIVING
--     members (nullable org columns only): safer than the original, which
--     deleted a real user's shared assets along with the test org.
--
-- Candidate selection, guard rails, signature and report shape are unchanged:
-- dry-run by default, only inactive non-internal orgs with no protected
-- member, EXECUTE granted to service_role only, auth users returned as ids
-- for the edge function to delete via the Admin API.
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
  v_cutoff   timestamptz := now() - make_interval(days => p_inactivity_days);
  v_tbl      record;
  v_fk       record;
  v_cnt      bigint;
  v_remaining bigint;
  v_pass     integer := 0;
  v_progress boolean;
  v_orgs     uuid[];
  v_report   jsonb;
begin
  -- ---------------------------------------------------------------------------
  -- 1. Protected users: super-admins + explicit preserve list
  --    (organization_members replaces the dropped legacy role tables)
  -- ---------------------------------------------------------------------------
  create temp table _protected_users on commit drop as
    select u.id
      from auth.users u
     where lower(u.email) = any (select lower(e) from unnest(v_protected_emails) e)
        or coalesce((u.raw_user_meta_data->>'is_super_admin')::boolean, false) = true
    union
    select pu.id from public.users pu where pu.is_super_admin is true
    union
    select om.user_id from public.organization_members om
     where om.role = 'super_admin' and om.user_id is not null;

  -- ---------------------------------------------------------------------------
  -- 2. Membership snapshot (org_id, user_id), captured BEFORE any deletion
  -- ---------------------------------------------------------------------------
  create temp table _members on commit drop as
    select organization_id as org_id, user_id
      from public.organization_members where user_id is not null
    union
    select organization_id, id from public.users where organization_id is not null;

  -- ---------------------------------------------------------------------------
  -- 3. Per-org stats: member count, latest sign-in, any protected member?
  -- ---------------------------------------------------------------------------
  create temp table _org_stats on commit drop as
    select o.id   as org_id,
           o.name,
           o.organization_type,
           o.is_internal,
           count(distinct m.user_id)               as member_count,
           max(au.last_sign_in_at)                 as last_sign_in,
           bool_or(p.id is not null)               as has_protected_member
      from public.organizations o
      left join _members m         on m.org_id = o.id
      left join auth.users au      on au.id = m.user_id
      left join _protected_users p on p.id = m.user_id
     group by o.id, o.name, o.organization_type, o.is_internal;

  -- ---------------------------------------------------------------------------
  -- 4. Candidate orgs: not internal, no protected member, inactive
  -- ---------------------------------------------------------------------------
  create temp table _candidates on commit drop as
    select org_id
      from _org_stats
     where organization_type <> 'internal'
       and is_internal is not true
       and has_protected_member = false
       and (last_sign_in is null or last_sign_in < v_cutoff);

  select coalesce(array_agg(org_id), '{}'::uuid[]) into v_orgs from _candidates;

  -- ---------------------------------------------------------------------------
  -- 5. Membership consequences: auth users to delete (members of candidate
  --    orgs with no membership in a surviving org) vs surviving members
  -- ---------------------------------------------------------------------------
  create temp table _auth_to_delete on commit drop as
    select distinct m.user_id
      from _members m
     where m.org_id = any(v_orgs)
       and m.user_id not in (select id from _protected_users)
       and not exists (
             select 1 from _members m2
              where m2.user_id = m.user_id
                and not (m2.org_id = any(v_orgs))
           );

  create temp table _surviving on commit drop as
    select distinct m.user_id
      from _members m
     where m.org_id = any(v_orgs)
       and m.user_id not in (select user_id from _auth_to_delete);

  -- ---------------------------------------------------------------------------
  -- 6. Discovery (shared pg_catalog RPCs) + org-scoped counts for the report
  -- ---------------------------------------------------------------------------
  create temp table _catalog on commit drop as
    select * from public.export_table_catalog();

  create temp table _org_tables on commit drop as
    select c.table_name, c.org_column, c.user_column, c.pk_column,
           not a.attnotnull as org_nullable
      from _catalog c
      join pg_class pc on pc.relname = c.table_name
      join pg_namespace pn on pn.oid = pc.relnamespace and pn.nspname = 'public'
      join pg_attribute a on a.attrelid = pc.oid and a.attname = c.org_column
     where c.org_column is not null;

  create temp table _user_tables on commit drop as
    select c.table_name, c.user_column, c.pk_column
      from _catalog c where c.user_column is not null;

  create temp table _fk on commit drop as
    select * from public.export_fk_edges();

  create temp table _affected (org_id uuid, table_name text, rows bigint) on commit drop;
  if cardinality(v_orgs) > 0 then
    for v_tbl in select * from _org_tables loop
      execute format(
        'insert into _affected select %I, %L, count(*) from public.%I
          where %I = any($1) group by %I',
        v_tbl.org_column, v_tbl.table_name, v_tbl.table_name,
        v_tbl.org_column, v_tbl.org_column
      ) using v_orgs;
    end loop;
  end if;

  -- ---------------------------------------------------------------------------
  -- 7. Doomed row-set (same construction as admin_purge_org)
  -- ---------------------------------------------------------------------------
  create temp table _doomed (tbl text, pk uuid, primary key (tbl, pk)) on commit drop;
  create temp table _unshared (table_name text, rows bigint) on commit drop;

  if cardinality(v_orgs) > 0 then
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

    for v_tbl in select * from _user_tables where pk_column is not null loop
      execute format(
        'insert into _doomed select %L, %I from public.%I
          where %I in (select user_id from _auth_to_delete)
          on conflict do nothing',
        v_tbl.table_name, v_tbl.pk_column, v_tbl.table_name, v_tbl.user_column
      );
    end loop;

    insert into _doomed
      select 'users', d.user_id from _auth_to_delete d
       where exists (select 1 from public.users u where u.id = d.user_id)
      on conflict do nothing;
    insert into _doomed select 'organizations', unnest(v_orgs) on conflict do nothing;

    -- FK closure: children that would BLOCK or CASCADE die too; SET NULL /
    -- SET DEFAULT children survive with a cleared reference.
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
  end if;

  -- ---------------------------------------------------------------------------
  -- 8. EXECUTION (only when p_dry_run = false); FK enforcement stays ON
  -- ---------------------------------------------------------------------------
  if not p_dry_run and cardinality(v_orgs) > 0 then
    -- a. Unshare dual-scoped rows owned by surviving members.
    for v_tbl in select * from _org_tables where user_column is not null and org_nullable loop
      execute format(
        'update public.%I set %I = null
          where %I = any($1) and %I in (select user_id from _surviving)',
        v_tbl.table_name, v_tbl.org_column, v_tbl.org_column, v_tbl.user_column
      ) using v_orgs;
    end loop;

    -- b. Constraint-tolerant deletion passes over the doomed set.
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
          null;
        end;
      end loop;

      begin
        delete from public.organizations where id = any(v_orgs);
        get diagnostics v_cnt = row_count;
        if v_cnt > 0 then v_progress := true; end if;
      exception when foreign_key_violation then
        null;
      end;

      for v_tbl in select * from _org_tables where pk_column is null loop
        begin
          execute format('delete from public.%I where %I = any($1)',
                         v_tbl.table_name, v_tbl.org_column) using v_orgs;
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

    -- c. Verify; any remainder raises and rolls the whole purge back.
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
        raise exception 'Purge incomplete: % doomed row(s) remain in % (FK deadlock?). Rolling back.',
          v_remaining, v_tbl.tbl;
      end if;
    end loop;
    for v_tbl in select * from _org_tables loop
      execute format('select count(*) from public.%I where %I = any($1)',
                     v_tbl.table_name, v_tbl.org_column)
        into v_remaining using v_orgs;
      if v_remaining > 0 then
        raise exception 'Purge incomplete: % row(s) remain in %.%. Rolling back.',
          v_remaining, v_tbl.table_name, v_tbl.org_column;
      end if;
    end loop;
    if exists (select 1 from public.organizations where id = any(v_orgs)) then
      raise exception 'Purge incomplete: organization row(s) survived. Rolling back.';
    end if;
  end if;

  -- ---------------------------------------------------------------------------
  -- 9. Report (same shape as the original; tables_affected now reflects the
  --    full doomed set, and summary gains rows_unshared)
  -- ---------------------------------------------------------------------------
  select jsonb_build_object(
    'dry_run', p_dry_run,
    'inactivity_days', p_inactivity_days,
    'cutoff', v_cutoff,
    'summary', jsonb_build_object(
      'candidate_org_count', (select count(*) from _candidates),
      'total_dependent_rows', coalesce((select count(*) from _doomed), 0),
      'rows_unshared', coalesce((select sum(rows) from _unshared), 0),
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
          from (select distinct user_id from _members where org_id = s.org_id) m
          join auth.users au on au.id = m.user_id
        ), '[]'::jsonb)
      ) order by s.name)
      from _org_stats s
      where s.org_id in (select org_id from _candidates)
    ), '[]'::jsonb),
    'tables_affected', coalesce((
      select jsonb_agg(jsonb_build_object('table', tbl, 'rows', total) order by total desc)
      from (select tbl, count(*) as total from _doomed group by tbl) t
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
                    when s.organization_type = 'internal' or s.is_internal is true then 'internal org'
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
revoke all on function public.admin_purge_test_orgs(boolean, integer) from public;
revoke all on function public.admin_purge_test_orgs(boolean, integer) from anon;
revoke all on function public.admin_purge_test_orgs(boolean, integer) from authenticated;
grant execute on function public.admin_purge_test_orgs(boolean, integer) to service_role;

comment on function public.admin_purge_test_orgs(boolean, integer) is
  'Dry-run-by-default purge of inactive test orgs + their users. v2 2026-08-06: '
  'ported off session_replication_role (doomed-set deletion with FKs ON, the '
  'admin_purge_org machinery) and off the dropped legacy membership tables. '
  'Returns auth user ids for the admin-cleanup-test-data edge function to '
  'delete via the Admin API.';
