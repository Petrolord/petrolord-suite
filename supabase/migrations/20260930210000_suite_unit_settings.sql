-- Suite unit profile (owner approved 2026-09-30): one Petrel-like unit
-- setup applied across the Suite, changeable later.
--
-- Stored data stays in canonical units (SI in the geoscience registries;
-- rows carry z_unit / xy_unit). This table holds a DISPLAY and INPUT
-- preference only, so changing a profile never alters stored data.
--
-- Two kinds of row:
--   scope 'organization'  the organisation default (one per organisation)
--   scope 'user'          a user's own setting (one per user)
-- Resolution in the app (src/lib/units/profile.js): user setting, then
-- (reserved) project, then organisation default, then the legacy
-- geoscience_settings.depth_unit for depth only, then the built-in
-- 'oilfield' preset. A later Suite Project layer gets its own table.
--
-- profile jsonb shape:
--   { "preset": "oilfield" | "metric" | "custom",
--     "units":  { "<family>": "<unit>", ... },   -- overrides on the preset
--     "version": 1 }
--
-- Access (product table, no change to any shared table; organizations and
-- auth.users are only referenced):
--   organisation row  read: members (is_org_member)
--                     add, change, delete: organisation admins (is_org_admin_of)
--   user row          the user only, for every action
-- anon has no access. RLS uses only the SECURITY DEFINER membership helpers
-- (membership consolidation rule, 2026-07-13).
--
-- Idempotent; no transaction lines (the caller wraps it).

create table if not exists public.suite_unit_settings (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid references public.organizations (id) on delete cascade,
    user_id         uuid references auth.users (id) on delete cascade,
    scope           text not null check (scope in ('organization', 'user')),
    profile         jsonb not null
                    -- coalesce: a missing key makes each test NULL, and a
                    -- NULL check passes, so absence must read as false
                    check (coalesce(
                        jsonb_typeof(profile) = 'object'
                        and profile ->> 'preset' in ('oilfield', 'metric', 'custom')
                        and jsonb_typeof(profile -> 'units') = 'object'
                        and jsonb_typeof(profile -> 'version') = 'number'
                        and pg_column_size(profile) < 8192,
                        false)),
    updated_by      uuid default auth.uid() references auth.users (id) on delete set null,
    app_build       text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    -- exactly the id that matches the scope is set
    constraint suite_unit_settings_scope_ids check (
        (scope = 'organization' and organization_id is not null and user_id is null)
        or (scope = 'user' and user_id is not null and organization_id is null)
    )
);

comment on table public.suite_unit_settings is
    'Suite unit profile: organisation default (scope organization) and per-user setting (scope user). Display and input preference only; stored data stays in canonical units. Members read their organisation row, org admins write it; a user row belongs to that user alone.';

-- one row per organisation, one per user
create unique index if not exists suite_unit_settings_org_key
    on public.suite_unit_settings (organization_id) where scope = 'organization';
create unique index if not exists suite_unit_settings_user_key
    on public.suite_unit_settings (user_id) where scope = 'user';

create or replace function public.suite_unit_settings_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  -- a row never changes scope or owner
  new.scope := old.scope;
  new.organization_id := old.organization_id;
  new.user_id := old.user_id;
  -- the editor is whoever made this change; clearing it is allowed so
  -- deleting that account (on delete set null) goes through
  if new.updated_by is not null and auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists suite_unit_settings_touch on public.suite_unit_settings;
create trigger suite_unit_settings_touch before update on public.suite_unit_settings
  for each row execute function public.suite_unit_settings_touch();

alter table public.suite_unit_settings enable row level security;

drop policy if exists "suite_unit_settings_select" on public.suite_unit_settings;
create policy "suite_unit_settings_select" on public.suite_unit_settings
  for select to authenticated
  using (
    (scope = 'organization' and public.is_org_member(organization_id))
    or (scope = 'user' and user_id = auth.uid())
  );

drop policy if exists "suite_unit_settings_insert" on public.suite_unit_settings;
create policy "suite_unit_settings_insert" on public.suite_unit_settings
  for insert to authenticated
  with check (
    updated_by = auth.uid()
    and (
      (scope = 'organization' and public.is_org_admin_of(organization_id))
      or (scope = 'user' and user_id = auth.uid())
    )
  );

drop policy if exists "suite_unit_settings_update" on public.suite_unit_settings;
create policy "suite_unit_settings_update" on public.suite_unit_settings
  for update to authenticated
  using (
    (scope = 'organization' and public.is_org_admin_of(organization_id))
    or (scope = 'user' and user_id = auth.uid())
  )
  with check (
    (scope = 'organization' and public.is_org_admin_of(organization_id))
    or (scope = 'user' and user_id = auth.uid())
  );

drop policy if exists "suite_unit_settings_delete" on public.suite_unit_settings;
create policy "suite_unit_settings_delete" on public.suite_unit_settings
  for delete to authenticated
  using (
    (scope = 'organization' and public.is_org_admin_of(organization_id))
    or (scope = 'user' and user_id = auth.uid())
  );

-- Supabase default privileges grant new tables to anon and authenticated in
-- full; state the intended privileges explicitly.
revoke all on public.suite_unit_settings from anon;
revoke all on public.suite_unit_settings from authenticated;
grant select, insert, update, delete on public.suite_unit_settings to authenticated;
