-- Well Data Manager U2-012: team editing of organisation wells
-- (owner 2026-10-01, extended scope; docs/scope/OrgSharing-DESIGN-AND-STATUS.md).
-- Apply AFTER 20261002100000_suite_record_sharing.sql (it uses that file's
-- guard, log and check-out functions and the change log table).
--
-- geo_wells keeps its sharing model: a well is shared when organization_id
-- is set (no visibility column; another branch owns the datum columns, so
-- this file adds only the team-editing columns). New on geo_wells:
--   org_access 'view' (default) | 'edit', editing_by / editing_since /
--   editing_expires (the check-out), version, updated_by, change_note.
--
-- Rules
--   geo_wells   read, insert, delete: unchanged. update: the owner; or, when
--               colleagues can edit, a member holding the unexpired check-out.
--               Only the owner changes organization_id or org_access.
--   children    (geo_wells_logs, _tops, _zones, _intervals, _core_images)
--               read: unchanged (through the well). write: the well's owner,
--               unless a colleague holds the unexpired check-out; or the
--               member who holds it. The children follow the parent's lock.
--   wells bucket  the well's owner can read, rewrite and remove every object
--               filed under the well, including curves a colleague uploaded
--               into their own folder while editing; the colleague holding
--               the check-out can rewrite and remove objects under the well
--               (the upload rule is unchanged: everyone uploads under their
--               own user id).
--   change log  the well row logs like every other record; a child statement
--               logs one 'updated' entry on its well ("Tops: 3 added").
--
-- Existing rows keep org_access 'view': applying this changes nobody's access.
-- anon is revoked on the six tables. Idempotent; no transaction lines.

insert into public.suite_record_tables (table_name, shared_when, label)
values ('geo_wells', 'organization_id', 'well')
on conflict (table_name) do update set shared_when = excluded.shared_when, label = excluded.label;

alter table public.geo_wells
    add column if not exists org_access text not null default 'view',
    add column if not exists editing_by uuid,
    add column if not exists editing_since timestamptz,
    add column if not exists editing_expires timestamptz,
    add column if not exists version integer not null default 1,
    add column if not exists updated_by uuid,
    add column if not exists change_note text;

do $$ begin
    if not exists (select 1 from pg_constraint where conrelid = 'public.geo_wells'::regclass and conname = 'geo_wells_org_access_check') then
        alter table public.geo_wells add constraint geo_wells_org_access_check check (org_access in ('view', 'edit'));
    end if;
end $$;

drop trigger if exists suite_record_guard on public.geo_wells;
create trigger suite_record_guard before insert or update on public.geo_wells
    for each row execute function public.suite_record_guard('organization_id');
drop trigger if exists suite_record_log on public.geo_wells;
create trigger suite_record_log after insert or update or delete on public.geo_wells
    for each row execute function public.suite_record_log('organization_id');

-- update: the owner, or the colleague holding the check-out
drop policy if exists "geo_wells_update_own" on public.geo_wells;
drop policy if exists "geo_wells_update_own_or_editor" on public.geo_wells;
create policy "geo_wells_update_own_or_editor" on public.geo_wells
  for update
  using (
    auth.uid() = user_id
    or (organization_id is not null and org_access = 'edit' and public.is_org_member(organization_id)
        and editing_by = auth.uid() and editing_expires > now())
  )
  with check (
    (auth.uid() = user_id and (organization_id is null or public.is_org_member(organization_id)))
    or (organization_id is not null and org_access = 'edit' and public.is_org_member(organization_id)
        and editing_by = auth.uid() and editing_expires > now())
  );

revoke all on public.geo_wells from anon;

-- ---------------------------------------------------------------------------
-- Children: writes follow the well's check-out
-- ---------------------------------------------------------------------------
create or replace function public.suite_record_child_log()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
    what text := coalesce(tg_argv[0], tg_table_name);
    rec record; w record;
begin
    if tg_op = 'DELETE' then
        for rec in select o.well_id, count(*) as n from old_rows o group by o.well_id loop
            select g.organization_id, g.user_id into w from public.geo_wells g where g.id = rec.well_id;
            if found then   -- not when the well itself is being deleted
                perform public.suite_record_log_updated('geo_wells', rec.well_id, w.organization_id, w.user_id,
                                                        format('%s: %s removed', initcap(what), rec.n), jsonb_build_array(what));
            end if;
        end loop;
    else
        for rec in select n.well_id, count(*) as n from new_rows n group by n.well_id loop
            select g.organization_id, g.user_id into w from public.geo_wells g where g.id = rec.well_id;
            if found then
                perform public.suite_record_log_updated('geo_wells', rec.well_id, w.organization_id, w.user_id,
                                                        format('%s: %s %s', initcap(what), rec.n, case tg_op when 'INSERT' then 'added' else 'changed' end),
                                                        jsonb_build_array(what));
            end if;
        end loop;
    end if;
    return null;
end $$;
revoke all on function public.suite_record_child_log() from public, anon, authenticated;

do $$
declare
    t text; what text;
    writer text;
begin
    foreach t in array array['geo_wells_logs', 'geo_wells_tops', 'geo_wells_zones', 'geo_wells_intervals', 'geo_wells_core_images'] loop
        what := replace(replace(t, 'geo_wells_', ''), '_', ' ');
        writer := format('exists (select 1 from public.geo_wells w where w.id = %I.well_id and (
            (w.user_id = auth.uid()
             and not (w.organization_id is not null and w.org_access = ''edit'' and w.editing_by is not null
                      and w.editing_by <> auth.uid() and w.editing_expires > now()))
            or (w.organization_id is not null and w.org_access = ''edit'' and public.is_org_member(w.organization_id)
                and w.editing_by = auth.uid() and w.editing_expires > now())))', t);
        execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
        execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
        execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);
        execute format('drop policy if exists %I on public.%I', t || '_insert_writer', t);
        execute format('drop policy if exists %I on public.%I', t || '_update_writer', t);
        execute format('drop policy if exists %I on public.%I', t || '_delete_writer', t);
        execute format('create policy %I on public.%I for insert with check (%s)', t || '_insert_writer', t, writer);
        execute format('create policy %I on public.%I for update using (%s) with check (%s)', t || '_update_writer', t, writer, writer);
        execute format('create policy %I on public.%I for delete using (%s)', t || '_delete_writer', t, writer);

        execute format('drop trigger if exists suite_record_child_log_ins on public.%I', t);
        execute format('drop trigger if exists suite_record_child_log_upd on public.%I', t);
        execute format('drop trigger if exists suite_record_child_log_del on public.%I', t);
        execute format('create trigger suite_record_child_log_ins after insert on public.%I referencing new table as new_rows
                        for each statement execute function public.suite_record_child_log(%L)', t, what);
        execute format('create trigger suite_record_child_log_upd after update on public.%I referencing new table as new_rows
                        for each statement execute function public.suite_record_child_log(%L)', t, what);
        execute format('create trigger suite_record_child_log_del after delete on public.%I referencing old table as old_rows
                        for each statement execute function public.suite_record_child_log(%L)', t, what);

        execute format('revoke all on public.%I from anon', t);
    end loop;
end $$;

-- the well's change log: whoever can read the well
drop policy if exists "suite_record_changes_select_geo_wells" on public.suite_record_changes;
create policy "suite_record_changes_select_geo_wells" on public.suite_record_changes
  for select to authenticated
  using (table_name = 'geo_wells' and exists (select 1 from public.geo_wells r where r.id = record_id));

-- ---------------------------------------------------------------------------
-- wells bucket (path {uploader user id}/{well id}/...). Uploads stay under the
-- uploader's own id (unchanged). Added:
--   the well's owner reads, rewrites and removes every object under the well,
--   including curves a colleague uploaded while editing;
--   the colleague holding the check-out rewrites and removes objects under
--   the well (a curve reorient, a deleted log), whoever uploaded them.
-- ---------------------------------------------------------------------------
do $$
declare
    -- objects.name, qualified: inside the sub-select a bare `name` is geo_wells.name
    owner_of text := 'bucket_id = ''wells'' and exists (
        select 1 from public.geo_wells w
        where w.id::text = (storage.foldername(objects.name))[2] and w.user_id = auth.uid())';
    editor_of text := 'bucket_id = ''wells'' and exists (
        select 1 from public.geo_wells w
        where w.id::text = (storage.foldername(objects.name))[2]
          and w.organization_id is not null and w.org_access = ''edit'' and public.is_org_member(w.organization_id)
          and w.editing_by = auth.uid() and w.editing_expires > now())';
begin
    if to_regclass('storage.objects') is not null then
        drop policy if exists "wells_objects_select_well_owner" on storage.objects;
        drop policy if exists "wells_objects_update_well_owner" on storage.objects;
        drop policy if exists "wells_objects_delete_well_owner" on storage.objects;
        drop policy if exists "wells_objects_update_editor" on storage.objects;
        drop policy if exists "wells_objects_delete_editor" on storage.objects;
        execute format('create policy "wells_objects_select_well_owner" on storage.objects for select to authenticated using (%s)', owner_of);
        execute format('create policy "wells_objects_update_well_owner" on storage.objects for update to authenticated using (%s) with check (%s)', owner_of, owner_of);
        execute format('create policy "wells_objects_delete_well_owner" on storage.objects for delete to authenticated using (%s)', owner_of);
        execute format('create policy "wells_objects_update_editor" on storage.objects for update to authenticated using (%s) with check (%s)', editor_of, editor_of);
        execute format('create policy "wells_objects_delete_editor" on storage.objects for delete to authenticated using (%s)', editor_of);
    end if;
end $$;

notify pgrst, 'reload schema';
