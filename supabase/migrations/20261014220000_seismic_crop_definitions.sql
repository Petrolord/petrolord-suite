-- Seismolord: named crop definitions (crop before upload, owner-approved
-- 2026-10-14; docs/scope/QI-STATUS.md "Crop before upload").
--
-- NOT APPLIED. File only; the owner applies it (staging shares the production
-- database): supabase db query --linked -f supabase/migrations/20261014220000_seismic_crop_definitions.sql
--
-- public.seismic_crop_definitions: one named crop per row, so every volume of
-- a study (the angle stacks, the velocity volumes, later the gathers) is cut
-- to exactly the same inline and crossline area and lines up trace for trace.
--   id, user_id, organization_id (null = private), name, definition, created_at, updated_at
--   definition  jsonb: { schema: 1, il: {from, to}, xl: {from, to},
--               polygon: [[il, xl], ...] | null, window: {from, to} | null,
--               domain: 'time' | 'depth', decimate: {il, xl}, note }
--               No trace data and no file contents: a few hundred bytes.
--
-- Access (as the 2026-10-14 security hardening): no anon or PUBLIC access at
-- all. The owner reads and writes their rows. A row shared with an
-- organization (organization_id set, and the owner a member of it) is
-- readable by that organization's members; only the owner changes or deletes
-- it. The checks refuse to finish if a PUBLIC or anon policy or grant reads
-- the table.
--
-- What changes for existing data: nothing. The table is new and starts empty.
-- No shared table is changed (organizations and auth.users are only
-- referenced). The app works before this file is applied: crops are then kept
-- in the browser only and the dialog says saving is not switched on yet.
--
-- Idempotent. One DO statement, no transaction lines.

do $crop$
declare
    p record;
    bad text;
    sel constant text := '(user_id = auth.uid() or (organization_id is not null and public.is_org_member(organization_id)))';
    own_ok constant text := '(user_id = auth.uid() and (organization_id is null or public.is_org_member(organization_id)))';
begin
    if to_regprocedure('public.is_org_member(uuid)') is null then
        raise exception 'public.is_org_member(uuid) is missing; apply the organisation sharing migrations first.';
    end if;

    -- 1. The table
    create table if not exists public.seismic_crop_definitions (
        id               uuid primary key default gen_random_uuid(),
        user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
        organization_id  uuid references public.organizations (id) on delete cascade,
        name             text not null check (length(btrim(name)) between 1 and 120),
        definition       jsonb not null check (jsonb_typeof(definition) = 'object' and length(definition::text) <= 20000),
        created_at       timestamptz not null default now(),
        updated_at       timestamptz not null default now()
    );
    comment on table public.seismic_crop_definitions is
        'Seismolord: named, reusable crop definitions (inline and crossline range or polygon, sample window, decimation) applied while reading a SEG-Y before upload, so several volumes of one study are cut to exactly the same area. Owner-scoped; readable by the organisation when shared.';
    create unique index if not exists seismic_crop_definitions_user_name_idx
        on public.seismic_crop_definitions (user_id, lower(btrim(name)));
    create index if not exists seismic_crop_definitions_org_idx
        on public.seismic_crop_definitions (organization_id) where organization_id is not null;

    -- 2. Row level security and grants
    alter table public.seismic_crop_definitions enable row level security;
    revoke all on public.seismic_crop_definitions from public;
    revoke all on public.seismic_crop_definitions from anon;
    grant select, insert, update, delete on public.seismic_crop_definitions to authenticated;

    for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'seismic_crop_definitions' loop
        execute format('drop policy %I on public.seismic_crop_definitions', p.policyname);
    end loop;
    execute 'create policy seismic_crop_definitions_select on public.seismic_crop_definitions for select to authenticated using ' || sel;
    execute 'create policy seismic_crop_definitions_insert on public.seismic_crop_definitions for insert to authenticated with check ' || own_ok;
    execute 'create policy seismic_crop_definitions_update on public.seismic_crop_definitions for update to authenticated using (user_id = auth.uid()) with check ' || own_ok;
    execute 'create policy seismic_crop_definitions_delete on public.seismic_crop_definitions for delete to authenticated using (user_id = auth.uid())';

    -- 3. Checks: nothing reads the table without signing in
    select string_agg(policyname, ', ') into bad from pg_policies
     where schemaname = 'public' and tablename = 'seismic_crop_definitions'
       and (roles && array['public', 'anon']::name[]);
    if bad is not null then
        raise exception 'seismic_crop_definitions has a PUBLIC or anon policy: %', bad;
    end if;
    if has_table_privilege('anon', 'public.seismic_crop_definitions', 'select') then
        raise exception 'anon can still select from seismic_crop_definitions.';
    end if;
    if not (select relrowsecurity from pg_class where oid = 'public.seismic_crop_definitions'::regclass) then
        raise exception 'Row level security is off on seismic_crop_definitions.';
    end if;
end
$crop$;
