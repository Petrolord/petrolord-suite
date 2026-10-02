-- Organisation sharing for the Geoscience apps' saved records
-- (owner 2026-10-01: second engineer approved; design in
-- docs/scope/OrgSharing-DESIGN-AND-STATUS.md).
--
-- Closes Seismolord U2-008, Earth Modeling U2-014, ReservoirCalc Pro U2-014,
-- the Rock Physics published-gather item, Well Correlation named sections and
-- Basin U2-019 with ONE pattern on seven product tables:
--   seismic_projects, em_models, saved_quickvol_projects, rcp_prospects,
--   rp_projects, geo_correlation_sections, bf_wells
--
-- What a record gains
--   visibility      'private' (default) | 'organization'     the owner's choice
--   organization_id the organisation it is shared with
--   org_access      'view' (default) | 'edit'                 what colleagues may do
--   editing_by / editing_since / editing_expires              the check-out (one editor at a time)
--   version         bumped on every real change; a save made from an older version is refused
--   updated_by / updated_at  stamped by trigger from auth.uid(), never trusted from the client
--   change_note     a transient column: the app sends a short summary with a save, the
--                   trigger moves it into the change log and stores NULL
--
-- Rules (row level security plus two triggers; nothing relies on the UI)
--   read    the owner; or a member of the organisation the record is shared with
--   insert  the owner only, and a record marked 'organization' must carry an
--           organisation the writer belongs to
--   update  the owner; or, when colleagues can edit, a member who HOLDS the
--           unexpired check-out. Only the owner changes visibility, org_access
--           or organization_id. While a colleague holds the check-out the owner
--           cannot change the content (the owner can take over, which is logged).
--   delete  the owner only
--   The check-out is taken, renewed and released only through the three
--   SECURITY DEFINER functions below (row locked with FOR UPDATE); a client
--   update can never set the editing_* columns. It lasts 30 minutes from the
--   last save or renewal.
--
-- Who changed what: public.suite_record_changes, one product-neutral log for
-- the whole wave, written only by trigger (clients have no insert, update or
-- delete). Readable by whoever can read the record, and by the owner after a
-- delete. Field NAMES and a short summary only, never copies of the data.
--
-- Membership is read only through the SECURITY DEFINER helper is_org_member
-- (membership consolidation rule, 2026-07-13). anon is revoked on every table
-- touched. No shared table is changed (organizations is only referenced).
-- Existing rows stay private: applying this changes nobody's access.
-- An app build from before this migration keeps saving (it sends no version,
-- so the stale check passes it; it cannot share).
--
-- Idempotent; no transaction lines (the caller wraps it; `supabase db query
-- -f` sends the file as one statement batch, which is one transaction).

-- ---------------------------------------------------------------------------
-- 1. The tables under these rules (read by the functions below, never by clients)
-- ---------------------------------------------------------------------------
create table if not exists public.suite_record_tables (
    table_name   text primary key,
    shared_when  text not null check (shared_when in ('visibility', 'organization_id')),
    label        text not null
);
comment on table public.suite_record_tables is
    'Record tables under the organisation sharing rules (visibility, check-out, version, change log). shared_when: how a row says it is shared. Read only by the suite_record_* functions; no client access.';
alter table public.suite_record_tables enable row level security;
revoke all on public.suite_record_tables from anon;
revoke all on public.suite_record_tables from authenticated;

insert into public.suite_record_tables (table_name, shared_when, label) values
    ('seismic_projects',         'visibility', 'Seismolord project'),
    ('em_models',                'visibility', 'earth model'),
    ('saved_quickvol_projects',  'visibility', 'ReservoirCalc Pro project'),
    ('rcp_prospects',            'visibility', 'prospect'),
    ('rp_projects',              'visibility', 'Rock Physics project'),
    ('geo_correlation_sections', 'visibility', 'correlation section'),
    ('bf_wells',                 'visibility', 'basin model')
on conflict (table_name) do update set shared_when = excluded.shared_when, label = excluded.label;

-- ---------------------------------------------------------------------------
-- 2. The change log
-- ---------------------------------------------------------------------------
create table if not exists public.suite_record_changes (
    id              bigint generated always as identity primary key,
    table_name      text not null,
    record_id       uuid not null,
    organization_id uuid,                -- the organisation the record was shared with at the time, if any
    owner_id        uuid,                -- the record's owner at the time (reads survive a delete)
    changed_by      uuid,                -- auth.uid() of the writer; null for a service write
    changed_at      timestamptz not null default now(),
    action          text not null check (action in
                    ('created', 'updated', 'shared', 'access_changed', 'checked_out', 'released', 'taken_over', 'deleted')),
    summary         text check (summary is null or length(summary) <= 500),
    changed_fields  jsonb not null default '[]'::jsonb check (jsonb_typeof(changed_fields) = 'array'),
    change_count    integer not null default 1   -- saves folded into this row (same author within ten minutes)
);
comment on table public.suite_record_changes is
    'Who changed what on a shared-capable record: written only by the suite_record_log trigger. Names of changed top-level fields and a short summary; never row copies.';
create index if not exists suite_record_changes_record_idx
    on public.suite_record_changes (table_name, record_id, id desc);

alter table public.suite_record_changes enable row level security;
revoke all on public.suite_record_changes from anon;
revoke all on public.suite_record_changes from authenticated;
grant select on public.suite_record_changes to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Guard trigger (BEFORE INSERT OR UPDATE), SECURITY INVOKER on purpose:
--    current_user tells a client request ('authenticated') from the
--    SECURITY DEFINER check-out functions and service writes, and that cannot
--    be forged from a request.
--    TG_ARGV[0]: 'visibility' (default) or 'organization_id' (how the table
--    says a row is shared).
--    SQLSTATEs the app reads: SR001 stale version, SR002 checked out by
--    someone else / no check-out held, SR003 only the owner changes sharing.
-- ---------------------------------------------------------------------------
create or replace function public.suite_record_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
    uid       uuid := auth.uid();
    client    boolean := current_user in ('authenticated', 'anon');
    by_org    boolean := coalesce(tg_argv[0], 'visibility') = 'organization_id';
    o jsonb; n jsonb;
    is_owner boolean; was_edit boolean; now_edit boolean; lock_live boolean; holds boolean;
    sharing_changed boolean; content_changed boolean;
    skip constant text[] := array['visibility', 'org_access', 'organization_id', 'editing_by', 'editing_since',
                                  'editing_expires', 'version', 'updated_by', 'updated_at', 'change_note', 'user_id'];
begin
    -- the save's summary travels to the log trigger and is never stored
    perform set_config('suite.change_note', coalesce(left(new.change_note, 500), ''), true);
    new.change_note := null;

    if tg_op = 'INSERT' then
        if client then
            new.version := 1;
            new.updated_by := uid;
            new.editing_by := null; new.editing_since := null; new.editing_expires := null;
        end if;
        return new;
    end if;

    o := to_jsonb(old); n := to_jsonb(new);
    is_owner := uid is not null and uid = old.user_id;
    was_edit := old.organization_id is not null and old.org_access = 'edit'
                and (by_org or o ->> 'visibility' = 'organization');
    lock_live := old.editing_by is not null and old.editing_expires > now();
    holds := lock_live and old.editing_by = uid;

    if client then
        -- never from a client update: the owner, and the check-out columns
        new.user_id := old.user_id;
        new.editing_by := old.editing_by; new.editing_since := old.editing_since; new.editing_expires := old.editing_expires;
        n := to_jsonb(new);
    end if;

    sharing_changed := (n -> 'visibility') is distinct from (o -> 'visibility')
                       or new.org_access is distinct from old.org_access
                       or new.organization_id is distinct from old.organization_id;
    content_changed := exists (select 1 from jsonb_each(n) e
                               where e.key <> all (skip) and e.value is distinct from o -> e.key);
    now_edit := new.organization_id is not null and new.org_access = 'edit'
                and (by_org or n ->> 'visibility' = 'organization');

    if client then
        -- no silent overwrite: a save names the version it was made from
        if new.version is distinct from old.version then
            raise exception 'A newer version of this record has been saved.'
                using errcode = 'SR001',
                      detail = jsonb_build_object('version', old.version, 'updated_by', old.updated_by, 'updated_at', old.updated_at)::text;
        end if;
        if not is_owner then
            if sharing_changed then
                raise exception 'Only the owner changes how a record is shared.' using errcode = 'SR003';
            end if;
            if not (was_edit and holds) then
                raise exception 'Take this record for editing before saving.'
                    using errcode = 'SR002',
                          detail = jsonb_build_object('editing_by', old.editing_by, 'editing_since', old.editing_since, 'editing_expires', old.editing_expires)::text;
            end if;
        elsif content_changed and was_edit and lock_live and not holds then
            raise exception 'A colleague is editing this record.'
                using errcode = 'SR002',
                      detail = jsonb_build_object('editing_by', old.editing_by, 'editing_since', old.editing_since, 'editing_expires', old.editing_expires)::text;
        end if;
        if not now_edit then
            -- sharing was switched off or to view only: any check-out ends
            new.editing_by := null; new.editing_since := null; new.editing_expires := null;
        elsif holds then
            -- a save by the editor renews the check-out
            new.editing_expires := now() + interval '30 minutes';
        end if;
    end if;

    if content_changed or sharing_changed then
        new.version := old.version + 1;
        new.updated_at := now();
        if uid is not null then new.updated_by := uid; end if;
    else
        -- a check-out change or an empty save is not a new version
        new.version := old.version;
        new.updated_at := old.updated_at;
        new.updated_by := old.updated_by;
    end if;
    return new;
end $$;

-- ---------------------------------------------------------------------------
-- 3b. One 'updated' entry: folded into the same author's previous entry when
--     that is the record's latest and under ten minutes old, so an app that
--     saves often does not flood the log. Called only by the log triggers.
-- ---------------------------------------------------------------------------
create or replace function public.suite_record_log_updated(
    p_table text, p_id uuid, p_org uuid, p_owner uuid, p_note text, p_fields jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
    uid uuid := auth.uid();
    last_row public.suite_record_changes%rowtype;
begin
    select * into last_row from public.suite_record_changes c
    where c.table_name = p_table and c.record_id = p_id order by c.id desc limit 1;
    if found and last_row.action = 'updated' and last_row.changed_by is not distinct from uid
       and last_row.changed_at > now() - interval '10 minutes' then
        update public.suite_record_changes c set
            changed_at = now(),
            change_count = c.change_count + 1,
            summary = left(coalesce(p_note, c.summary), 500),
            changed_fields = (select coalesce(jsonb_agg(distinct f order by f), '[]'::jsonb)
                              from jsonb_array_elements_text(c.changed_fields || p_fields) f)
        where c.id = last_row.id;
    else
        insert into public.suite_record_changes (table_name, record_id, organization_id, owner_id, changed_by, action, summary, changed_fields)
        values (p_table, p_id, p_org, p_owner, uid, 'updated', left(p_note, 500), p_fields);
    end if;
end $$;
revoke all on function public.suite_record_log_updated(text, uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Log trigger (AFTER INSERT OR UPDATE OR DELETE), SECURITY DEFINER so it
--    can write the log that clients cannot.
-- ---------------------------------------------------------------------------
create or replace function public.suite_record_log()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
    uid     uuid := auth.uid();
    by_org  boolean := coalesce(tg_argv[0], 'visibility') = 'organization_id';
    note    text := nullif(current_setting('suite.change_note', true), '');
    o jsonb; n jsonb; fields jsonb;
    was_shared boolean; now_shared boolean;
    skip constant text[] := array['visibility', 'org_access', 'organization_id', 'editing_by', 'editing_since',
                                  'editing_expires', 'version', 'updated_by', 'updated_at', 'change_note', 'user_id',
                                  'app_build', 'engine_version', 'schema_version'];
begin
    if tg_op = 'INSERT' then
        n := to_jsonb(new);
        insert into public.suite_record_changes (table_name, record_id, organization_id, owner_id, changed_by, action, summary)
        values (tg_table_name, new.id, new.organization_id, new.user_id, uid, 'created',
                left(coalesce(note, n ->> 'name', n ->> 'project_name'), 500));
        return null;
    elsif tg_op = 'DELETE' then
        o := to_jsonb(old);
        insert into public.suite_record_changes (table_name, record_id, organization_id, owner_id, changed_by, action, summary)
        values (tg_table_name, old.id, old.organization_id, old.user_id, uid, 'deleted',
                left(coalesce(o ->> 'name', o ->> 'project_name'), 500));
        return null;
    end if;

    o := to_jsonb(old); n := to_jsonb(new);
    was_shared := old.organization_id is not null and (by_org or o ->> 'visibility' = 'organization');
    now_shared := new.organization_id is not null and (by_org or n ->> 'visibility' = 'organization');

    -- sharing
    if now_shared and not was_shared then
        insert into public.suite_record_changes (table_name, record_id, organization_id, owner_id, changed_by, action, summary)
        values (tg_table_name, new.id, new.organization_id, new.user_id, uid, 'shared',
                case new.org_access when 'edit' then 'Shared with the organisation: colleagues can edit'
                                    else 'Shared with the organisation: colleagues can view' end);
    elsif was_shared and not now_shared then
        insert into public.suite_record_changes (table_name, record_id, organization_id, owner_id, changed_by, action, summary)
        values (tg_table_name, new.id, old.organization_id, new.user_id, uid, 'access_changed', 'Sharing turned off');
    elsif now_shared and new.org_access is distinct from old.org_access then
        insert into public.suite_record_changes (table_name, record_id, organization_id, owner_id, changed_by, action, summary)
        values (tg_table_name, new.id, new.organization_id, new.user_id, uid, 'access_changed',
                case new.org_access when 'edit' then 'Colleagues can now edit' else 'Colleagues can now view only' end);
    end if;

    -- check-out
    if new.editing_by is distinct from old.editing_by then
        insert into public.suite_record_changes (table_name, record_id, organization_id, owner_id, changed_by, action, summary)
        values (tg_table_name, new.id, new.organization_id, new.user_id, uid,
                case when new.editing_by is null then 'released'
                     when old.editing_by is not null and old.editing_expires > now() then 'taken_over'
                     else 'checked_out' end,
                case when new.editing_by is null and uid is distinct from old.editing_by then 'Editing ended by the owner'
                     when new.editing_by is null then 'Finished editing'
                     when old.editing_by is not null and old.editing_expires > now() then 'The owner took over editing'
                     else 'Started editing' end);
    end if;

    -- content: names of the changed top-level fields
    select jsonb_agg(e.key order by e.key) into fields
    from jsonb_each(n) e where e.key <> all (skip) and e.value is distinct from o -> e.key;
    if fields is not null then
        perform public.suite_record_log_updated(tg_table_name, new.id, new.organization_id, new.user_id, note, fields);
    end if;
    return null;
end $$;
revoke all on function public.suite_record_log() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Check-out functions. SECURITY DEFINER with a fixed search_path; each
--    checks the caller against the row it has locked FOR UPDATE.
--    Result: jsonb {ok, reason?, needed?, editing_by, editing_since, editing_expires, version}
--    reason: not_found | view_only | locked | not_holder
-- ---------------------------------------------------------------------------
create or replace function public.suite_record_lock_row(p_table text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
    cfg public.suite_record_tables%rowtype;
    r jsonb;
begin
    select * into cfg from public.suite_record_tables t where t.table_name = p_table;
    if not found then
        raise exception 'Not a shared record table.' using errcode = '22023';
    end if;
    execute format(
        'select jsonb_build_object(''user_id'', t.user_id, ''organization_id'', t.organization_id, ''org_access'', t.org_access,
                ''editing_by'', t.editing_by, ''editing_since'', t.editing_since, ''editing_expires'', t.editing_expires,
                ''version'', t.version, ''shared'', (t.organization_id is not null and %s),
                ''live'', (t.editing_by is not null and t.editing_expires > now()))
         from public.%I t where t.id = $1 for update',
        case cfg.shared_when when 'organization_id' then 'true' else 't.visibility = ''organization''' end,
        p_table) into r using p_id;
    return r;
end $$;
revoke all on function public.suite_record_lock_row(text, uuid) from public, anon, authenticated;

create or replace function public.suite_record_take(p_table text, p_id uuid, p_take_over boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
    uid uuid := auth.uid();
    r jsonb; is_owner boolean; member boolean; since timestamptz;
begin
    if uid is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
    r := public.suite_record_lock_row(p_table, p_id);
    if r is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
    is_owner := (r ->> 'user_id')::uuid = uid;
    member := (r ->> 'shared')::boolean and public.is_org_member((r ->> 'organization_id')::uuid);
    if not is_owner and not member then
        return jsonb_build_object('ok', false, 'reason', 'not_found');   -- says nothing about a record the caller cannot read
    end if;
    if not ((r ->> 'shared')::boolean and r ->> 'org_access' = 'edit') then
        if is_owner then return jsonb_build_object('ok', true, 'needed', false, 'version', r -> 'version'); end if;
        return jsonb_build_object('ok', false, 'reason', 'view_only');
    end if;
    if (r ->> 'live')::boolean and (r ->> 'editing_by')::uuid <> uid and not (p_take_over and is_owner) then
        return jsonb_build_object('ok', false, 'reason', 'locked', 'editing_by', r -> 'editing_by',
                                  'editing_since', r -> 'editing_since', 'editing_expires', r -> 'editing_expires');
    end if;
    since := case when (r ->> 'live')::boolean and (r ->> 'editing_by')::uuid = uid
                  then (r ->> 'editing_since')::timestamptz else now() end;
    execute format('update public.%I set editing_by = $1, editing_since = $2, editing_expires = now() + interval ''30 minutes'' where id = $3', p_table)
        using uid, since, p_id;
    return jsonb_build_object('ok', true, 'needed', true, 'editing_by', uid, 'editing_since', since,
                              'editing_expires', now() + interval '30 minutes', 'version', r -> 'version');
end $$;

create or replace function public.suite_record_renew(p_table text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
    uid uuid := auth.uid();
    r jsonb;
begin
    if uid is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
    r := public.suite_record_lock_row(p_table, p_id);
    if r is null or not ((r ->> 'live')::boolean and (r ->> 'editing_by')::uuid = uid) then
        return jsonb_build_object('ok', false, 'reason', 'not_holder');
    end if;
    -- still entitled: sharing may have changed since the check-out was taken
    if not ((r ->> 'user_id')::uuid = uid
            or ((r ->> 'shared')::boolean and r ->> 'org_access' = 'edit' and public.is_org_member((r ->> 'organization_id')::uuid))) then
        return jsonb_build_object('ok', false, 'reason', 'not_holder');
    end if;
    execute format('update public.%I set editing_expires = now() + interval ''30 minutes'' where id = $1', p_table) using p_id;
    return jsonb_build_object('ok', true, 'needed', true, 'editing_by', uid, 'editing_since', r -> 'editing_since',
                              'editing_expires', now() + interval '30 minutes', 'version', r -> 'version');
end $$;

create or replace function public.suite_record_release(p_table text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
    uid uuid := auth.uid();
    r jsonb;
begin
    if uid is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
    r := public.suite_record_lock_row(p_table, p_id);
    if r is null or r -> 'editing_by' = 'null'::jsonb then
        return jsonb_build_object('ok', true, 'needed', false);
    end if;
    -- the editor releases their own check-out; the owner may end anyone's
    if (r ->> 'editing_by')::uuid <> uid and (r ->> 'user_id')::uuid <> uid then
        return jsonb_build_object('ok', false, 'reason', 'not_holder');
    end if;
    execute format('update public.%I set editing_by = null, editing_since = null, editing_expires = null where id = $1', p_table) using p_id;
    return jsonb_build_object('ok', true, 'needed', false);
end $$;

revoke all on function public.suite_record_take(text, uuid, boolean) from public, anon;
revoke all on function public.suite_record_renew(text, uuid) from public, anon;
revoke all on function public.suite_record_release(text, uuid) from public, anon;
grant execute on function public.suite_record_take(text, uuid, boolean) to authenticated;
grant execute on function public.suite_record_renew(text, uuid) to authenticated;
grant execute on function public.suite_record_release(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. The seven record tables: columns, triggers, the four policies, grants
-- ---------------------------------------------------------------------------
do $$
declare
    t text;
    p record;
    sel text := '(user_id = auth.uid() or (visibility = ''organization'' and organization_id is not null and public.is_org_member(organization_id)))';
    own_ok text := '(user_id = auth.uid() and (visibility = ''private'' or (organization_id is not null and public.is_org_member(organization_id))))';
    colleague text := '(visibility = ''organization'' and org_access = ''edit'' and organization_id is not null and public.is_org_member(organization_id) and editing_by = auth.uid() and editing_expires > now())';
begin
    foreach t in array array['seismic_projects', 'em_models', 'saved_quickvol_projects', 'rcp_prospects',
                             'rp_projects', 'geo_correlation_sections', 'bf_wells'] loop
        execute format('alter table public.%I
            add column if not exists visibility text not null default ''private'',
            add column if not exists organization_id uuid references public.organizations (id) on delete set null,
            add column if not exists org_access text not null default ''view'',
            add column if not exists editing_by uuid,
            add column if not exists editing_since timestamptz,
            add column if not exists editing_expires timestamptz,
            add column if not exists version integer not null default 1,
            add column if not exists updated_by uuid,
            add column if not exists change_note text', t);
        -- saved_quickvol_projects never had updated_at: existing rows take their creation time
        if not exists (select 1 from information_schema.columns
                       where table_schema = 'public' and table_name = t and column_name = 'updated_at') then
            execute format('alter table public.%I add column updated_at timestamptz', t);
            execute format('update public.%I set updated_at = created_at where updated_at is null', t);
            execute format('alter table public.%I alter column updated_at set default now()', t);
        end if;
        if not exists (select 1 from pg_constraint where conrelid = format('public.%I', t)::regclass and conname = t || '_visibility_check') then
            execute format('alter table public.%I add constraint %I check (visibility in (''private'', ''organization''))', t, t || '_visibility_check');
        end if;
        if not exists (select 1 from pg_constraint where conrelid = format('public.%I', t)::regclass and conname = t || '_org_access_check') then
            execute format('alter table public.%I add constraint %I check (org_access in (''view'', ''edit''))', t, t || '_org_access_check');
        end if;
        execute format('create index if not exists %I on public.%I (organization_id) where visibility = ''organization''', t || '_shared_org_idx', t);

        execute format('drop trigger if exists suite_record_guard on public.%I', t);
        execute format('create trigger suite_record_guard before insert or update on public.%I
                        for each row execute function public.suite_record_guard(''visibility'')', t);
        execute format('drop trigger if exists suite_record_log on public.%I', t);
        execute format('create trigger suite_record_log after insert or update or delete on public.%I
                        for each row execute function public.suite_record_log(''visibility'')', t);

        -- replace the owner-only policies (and the single ALL policy on bf_wells and
        -- saved_quickvol_projects) with the four below. The dormant
        -- "Allow admin full access" policy on saved_quickvol_projects is left as it is.
        for p in select policyname from pg_policies
                 where schemaname = 'public' and tablename = t and policyname <> 'Allow admin full access' loop
            execute format('drop policy %I on public.%I', p.policyname, t);
        end loop;
        execute format('alter table public.%I enable row level security', t);
        execute format('create policy %I on public.%I for select to authenticated using (%s)', t || '_select_own_or_org', t, sel);
        execute format('create policy %I on public.%I for insert to authenticated with check (%s)', t || '_insert_own', t, own_ok);
        execute format('create policy %I on public.%I for update to authenticated using (user_id = auth.uid() or %s) with check (%s or %s)',
                       t || '_update_own_or_editor', t, colleague, own_ok, colleague);
        execute format('create policy %I on public.%I for delete to authenticated using (user_id = auth.uid())', t || '_delete_own', t);

        execute format('revoke all on public.%I from anon', t);
        execute format('revoke all on public.%I from authenticated', t);
        execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Who reads the change log: whoever can read the record (the sub-selects
--    run under the caller's own row level security), and the owner after a
--    delete.
-- ---------------------------------------------------------------------------
drop policy if exists "suite_record_changes_select_reader" on public.suite_record_changes;
create policy "suite_record_changes_select_reader" on public.suite_record_changes
  for select to authenticated
  using (
    owner_id = auth.uid()
    or (table_name = 'seismic_projects'         and exists (select 1 from public.seismic_projects r where r.id = record_id))
    or (table_name = 'em_models'                and exists (select 1 from public.em_models r where r.id = record_id))
    or (table_name = 'saved_quickvol_projects'  and exists (select 1 from public.saved_quickvol_projects r where r.id = record_id))
    or (table_name = 'rcp_prospects'            and exists (select 1 from public.rcp_prospects r where r.id = record_id))
    or (table_name = 'rp_projects'              and exists (select 1 from public.rp_projects r where r.id = record_id))
    or (table_name = 'geo_correlation_sections' and exists (select 1 from public.geo_correlation_sections r where r.id = record_id))
    or (table_name = 'bf_wells'                 and exists (select 1 from public.bf_wells r where r.id = record_id))
  );

notify pgrst, 'reload schema';
