-- =============================================================================
-- admin_purge_orphan_users
-- -----------------------------------------------------------------------------
-- Companion to admin_purge_test_orgs for the category that function cannot reach:
-- ORG-LESS users. The org purge walks down from a candidate organization, so a
-- signup that never joined any org (no row in organization_members /
-- organization_users / org_members, and no public.users.organization_id) is
-- invisible to it. On the shared Suite/HSE DB those orphan signups are the bulk
-- of leftover test accounts.
--
-- This applies the SAME policy to org-less users:
--   * inactive: never signed in, OR last_sign_in older than the cutoff,
--   * never a protected email or super-admin (same allow-list as the org purge),
--   * has NO membership in any org-linking table.
--
-- Mechanics mirror admin_purge_test_orgs for consistency and safety:
--   * Dry-run by DEFAULT (returns a report, deletes nothing).
--   * Runs in the RPC's own transaction; any error rolls everything back.
--   * Deletes each target's public.users mirror row with FK enforcement disabled
--     for THIS TRANSACTION ONLY (SET LOCAL session_replication_role='replica' —
--     cannot leak to the pooled connection), then sweeps any row whose
--     single-column FK now points to a removed user to a fixpoint. NOTE: like the
--     org purge, that sweep removes rows the deleted user authored even if they
--     live in a surviving org (e.g. moc_records.created_by). For genuinely
--     org-less test accounts that set is normally empty (verified empty at write
--     time), but the semantics are "remove everything the purged user owns".
--   * Restores FK enforcement and verifies no targeted public.users row survives.
--   * Does NOT delete auth.users itself — returns the ids for the edge function to
--     remove via the supported Admin API (no public table FK-references auth.users,
--     so that delete is unblocked once the public.users mirror is gone).
--   * EXECUTE granted to service_role only; the edge function gates the caller as a
--     super-admin before invoking.
--
-- Returns JSONB:
--   { dry_run, inactivity_days, cutoff,
--     summary: { orphan_user_count },
--     auth_users_to_delete: [ { id, email, last_sign_in_at, created_at } ] }
-- =============================================================================

create or replace function public.admin_purge_orphan_users(
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
  v_cutoff    timestamptz := now() - make_interval(days => p_inactivity_days);
  v_fk        record;
  v_pass      integer := 0;
  v_progress  boolean;
  v_cnt       bigint;
  v_remaining bigint;
  v_report    jsonb;
begin
  -- 1. Protected users: super-admins + explicit preserve list (same as org purge).
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

  -- 2. Every user that belongs to ANY org, via any linking table.
  create temp table _members on commit drop as
    select user_id from public.organization_members where user_id is not null
    union
    select user_id from public.organization_users where user_id is not null
    union
    select user_id from public.org_members where user_id is not null
    union
    select id from public.users where organization_id is not null;

  -- 3. Orphan candidates: org-less, not protected, inactive (or never signed in).
  create temp table _orphans on commit drop as
    select u.id as user_id, u.email, u.last_sign_in_at, u.created_at
      from auth.users u
     where not exists (select 1 from _members m where m.user_id = u.id)
       and u.id not in (select id from _protected_users)
       and (u.last_sign_in_at is null or u.last_sign_in_at < v_cutoff);

  -- 4. Single-column public FK graph (child -> parent) for the orphan sweep.
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
             having count(*) = 1
           );

  -- 5. EXECUTION (only when p_dry_run = false).
  if not p_dry_run then
    set local session_replication_role = 'replica';

    -- 5a. Remove the orphan users' public.users mirror rows.
    delete from public.users where id in (select user_id from _orphans);

    -- 5b. Orphan sweep to a fixpoint: drop any row whose single-column FK now
    --     points to a parent that no longer exists. Cleans descendant rows the
    --     purged users owned, at arbitrary depth. (Empty in the common case.)
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
        if v_cnt > 0 then v_progress := true; end if;
      end loop;
      exit when v_progress = false;
      exit when v_pass >= 50;
    end loop;

    -- 5c. Restore FK enforcement, then verify every targeted mirror row is gone.
    set local session_replication_role = 'origin';

    select count(*) into v_remaining
      from public.users where id in (select user_id from _orphans);
    if v_remaining > 0 then
      raise exception
        'Orphan purge incomplete: % public.users row(s) survived. Rolling back.', v_remaining;
    end if;
  end if;

  -- 6. Report (same shape in dry-run and execution mode).
  select jsonb_build_object(
    'dry_run', p_dry_run,
    'inactivity_days', p_inactivity_days,
    'cutoff', v_cutoff,
    'summary', jsonb_build_object(
      'orphan_user_count', (select count(*) from _orphans)
    ),
    'auth_users_to_delete', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.user_id,
        'email', o.email,
        'last_sign_in_at', o.last_sign_in_at,
        'created_at', o.created_at
      ) order by o.email)
      from _orphans o
    ), '[]'::jsonb)
  ) into v_report;

  return v_report;
end;
$$;

alter function public.admin_purge_orphan_users(boolean, integer) owner to postgres;

revoke all on function public.admin_purge_orphan_users(boolean, integer) from public;
revoke all on function public.admin_purge_orphan_users(boolean, integer) from anon;
revoke all on function public.admin_purge_orphan_users(boolean, integer) from authenticated;
grant execute on function public.admin_purge_orphan_users(boolean, integer) to service_role;

comment on function public.admin_purge_orphan_users(boolean, integer) is
  'Dry-run-by-default purge of inactive, org-less (orphan) users. Same protected '
  'allow-list and transactional safety as admin_purge_test_orgs. Returns auth user '
  'ids to delete via the Admin API. Invoked only by the admin-cleanup-test-data edge function.';
