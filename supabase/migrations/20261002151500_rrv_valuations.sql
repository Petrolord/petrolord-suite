-- Risked Reserves Valuation: saved valuations
-- (Reservoir round of the app upgrade programme, app 4, Step 1;
-- docs/scope/AppUpgrade-Reservoir-PLAN.md, owner question 3, default taken:
-- "a new product-prefixed table rrv_valuations, one row per prospect and
-- user, owner RLS, sharing columns, file only until applied; browser storage
-- stays as the fallback with a visible note").
--
-- Apply AFTER 20261002100000_suite_record_sharing.sql (applied 2026-10-02).
-- This file adds no rule of its own. It creates ONE new product table and
-- puts it under that file's rules, exactly as the seven Geoscience record
-- tables are: the same sharing columns, the same guard and log triggers, the
-- same four policies, a row in suite_record_tables.
--
-- public.rrv_valuations: one saved valuation per prospect and user
--   id               uuid primary key
--   user_id          the owner (auth.users, on delete cascade)
--   prospect_key     which prospect, in the app's words: 'rcp-<prospect id>'
--                    for one handed over by ReservoirCalc Pro, 'own-...' for
--                    one typed in the app. Unique per user.
--   rcp_prospect_id  the rcp_prospects row the volumes came from, when there
--                    is one. Deliberately NOT a foreign key: the valuation
--                    keeps the id it was valued against as provenance after
--                    the prospect is deleted or risked again upstream.
--   name             the prospect's name (the change log reads it)
--   valuation        jsonb: the inputs in one unit system, the handoff block,
--                    identification, input sources
--   schema_version, app_build   the Project Portability stamp (PP0)
--   created_at, updated_at
--   + visibility, organization_id, org_access, editing_by, editing_since,
--     editing_expires, version, updated_by, change_note   (the sharing model)
--
-- Rules (the approved four-policy shape; membership only through the
-- SECURITY DEFINER helper is_org_member):
--   read    the owner; or a member of the organisation the row is shared with
--   insert  the owner only; a shared row must carry an organisation the
--           writer belongs to
--   update  the owner; or, when colleagues can edit, a member who holds the
--           unexpired check-out
--   delete  the owner only
--
-- What changes for existing data: nothing. The table is new and starts
-- empty; no other table's columns, policies or grants are touched. One
-- additive SELECT policy is created on suite_record_changes so that whoever
-- can read a valuation can read its change history (the same thing
-- 20261002100000 section 7 does for its seven tables).
--
-- The app works before this file is applied: it asks the database whether
-- the table exists and keeps valuations in the browser until it does.
--
-- anon is revoked on the table. THE STORAGE LESSON (2026-10-02,
-- 20261002120000): a policy granted to PUBLIC or anon whose expression reads
-- a table anon cannot read makes every anon query of the policied table
-- fail. The table is new, so no policy can read it yet; step 6 checks at
-- apply time all the same and REFUSES TO APPLY if it finds one.
--
-- No shared table is changed (organizations and auth.users are only
-- referenced). Idempotent. No transaction lines: one DO statement, so it
-- applies whole or not at all.

do $rrv$
declare
    t constant text := 'rrv_valuations';
    p record; bad text;
    sel text := '(user_id = auth.uid() or (visibility = ''organization'' and organization_id is not null and public.is_org_member(organization_id)))';
    own_ok text := '(user_id = auth.uid() and (visibility = ''private'' or (organization_id is not null and public.is_org_member(organization_id))))';
    colleague text := '(visibility = ''organization'' and org_access = ''edit'' and organization_id is not null and public.is_org_member(organization_id) and editing_by = auth.uid() and editing_expires > now())';
begin
    -- -----------------------------------------------------------------------
    -- 0. Needs the rules of 20261002100000
    -- -----------------------------------------------------------------------
    if to_regclass('public.suite_record_tables') is null or to_regclass('public.suite_record_changes') is null
       or to_regprocedure('public.suite_record_guard()') is null or to_regprocedure('public.suite_record_log()') is null
       or to_regprocedure('public.is_org_member(uuid)') is null then
        raise exception 'Apply 20261002100000_suite_record_sharing.sql first.';
    end if;

    -- -----------------------------------------------------------------------
    -- 1. The table
    -- -----------------------------------------------------------------------
    create table if not exists public.rrv_valuations (
        id               uuid primary key default gen_random_uuid(),
        user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
        prospect_key     text not null check (length(prospect_key) between 1 and 200),
        rcp_prospect_id  uuid,
        name             text not null check (length(name) between 1 and 300),
        valuation        jsonb not null default '{}'::jsonb check (jsonb_typeof(valuation) = 'object'),
        schema_version   integer not null default 1,
        app_build        text,
        created_at       timestamptz not null default now(),
        updated_at       timestamptz not null default now(),
        constraint rrv_valuations_user_prospect_key unique (user_id, prospect_key)
    );
    comment on table public.rrv_valuations is
        'Risked Reserves Valuation: one saved valuation per prospect and user (inputs, handoff provenance from ReservoirCalc Pro, identification, input sources). Under the organisation sharing rules of 20261002100000.';
    comment on column public.rrv_valuations.prospect_key is
        'Which prospect, in the app''s words: rcp-<rcp_prospects id>, or own-... for one typed in the app. Unique per user.';
    comment on column public.rrv_valuations.rcp_prospect_id is
        'The rcp_prospects row the volumes came from. Not a foreign key on purpose: kept as provenance after the prospect is deleted or risked again.';
    create index if not exists rrv_valuations_user_updated_idx on public.rrv_valuations (user_id, updated_at desc);
    create index if not exists rrv_valuations_rcp_prospect_idx on public.rrv_valuations (rcp_prospect_id) where rcp_prospect_id is not null;

    -- -----------------------------------------------------------------------
    -- 2. It joins the list the check-out functions read
    -- -----------------------------------------------------------------------
    insert into public.suite_record_tables (table_name, shared_when, label) values
        ('rrv_valuations', 'visibility', 'risked valuation')
    on conflict (table_name) do update set shared_when = excluded.shared_when, label = excluded.label;

    -- -----------------------------------------------------------------------
    -- 3. Sharing columns, triggers, the four policies and grants (the section
    --    6 loop body of 20261002100000, for this table)
    -- -----------------------------------------------------------------------
    alter table public.rrv_valuations
        add column if not exists visibility text not null default 'private',
        add column if not exists organization_id uuid references public.organizations (id) on delete set null,
        add column if not exists org_access text not null default 'view',
        add column if not exists editing_by uuid,
        add column if not exists editing_since timestamptz,
        add column if not exists editing_expires timestamptz,
        add column if not exists version integer not null default 1,
        add column if not exists updated_by uuid,
        add column if not exists change_note text;
    if not exists (select 1 from pg_constraint where conrelid = 'public.rrv_valuations'::regclass and conname = 'rrv_valuations_visibility_check') then
        alter table public.rrv_valuations add constraint rrv_valuations_visibility_check check (visibility in ('private', 'organization'));
    end if;
    if not exists (select 1 from pg_constraint where conrelid = 'public.rrv_valuations'::regclass and conname = 'rrv_valuations_org_access_check') then
        alter table public.rrv_valuations add constraint rrv_valuations_org_access_check check (org_access in ('view', 'edit'));
    end if;
    create index if not exists rrv_valuations_shared_org_idx on public.rrv_valuations (organization_id) where visibility = 'organization';

    drop trigger if exists suite_record_guard on public.rrv_valuations;
    create trigger suite_record_guard before insert or update on public.rrv_valuations
        for each row execute function public.suite_record_guard('visibility');
    drop trigger if exists suite_record_log on public.rrv_valuations;
    create trigger suite_record_log after insert or update or delete on public.rrv_valuations
        for each row execute function public.suite_record_log('visibility');

    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
        execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    alter table public.rrv_valuations enable row level security;
    execute format('create policy %I on public.%I for select to authenticated using (%s)', t || '_select_own_or_org', t, sel);
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)', t || '_insert_own', t, own_ok);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = auth.uid() or %s) with check (%s or %s)',
                   t || '_update_own_or_editor', t, colleague, own_ok, colleague);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = auth.uid())', t || '_delete_own', t);

    revoke all on public.rrv_valuations from public;
    revoke all on public.rrv_valuations from anon;
    revoke all on public.rrv_valuations from authenticated;
    grant select, insert, update, delete on public.rrv_valuations to authenticated;

    -- -----------------------------------------------------------------------
    -- 4. The change log of a valuation: whoever can read the valuation (the
    --    sub-select runs under the caller's own row level security). The
    --    owner reads it after a delete through the reader policy of
    --    20261002100000 (owner_id = auth.uid()).
    -- -----------------------------------------------------------------------
    drop policy if exists "suite_record_changes_select_rrv" on public.suite_record_changes;
    create policy "suite_record_changes_select_rrv" on public.suite_record_changes
        for select to authenticated
        using (table_name = 'rrv_valuations' and exists (select 1 from public.rrv_valuations r where r.id = record_id));

    -- -----------------------------------------------------------------------
    -- 5. The storage lesson, enforced: no policy granted to PUBLIC or anon,
    --    in any schema, may read the table anon was just revoked on. If one
    --    exists this migration does not apply (scope that policy to
    --    authenticated first).
    -- -----------------------------------------------------------------------
    select string_agg(format('%I.%I policy %I', pol.schemaname, pol.tablename, pol.policyname), '; ') into bad
    from pg_policies pol
    where (pol.roles && array['public', 'anon']::name[])
      and (coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, '')) ~ '\mrrv_valuations\M';
    if bad is not null then
        raise exception 'Not applied: a policy granted to PUBLIC or anon reads a table this migration revokes anon on (%). Scope it to authenticated first.', bad;
    end if;

    perform pg_notify('pgrst', 'reload schema');
end
$rrv$;
