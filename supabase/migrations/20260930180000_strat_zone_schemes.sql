-- Stratigraphy Studio: organisation-wide biozone schemes (STRAT-U1-028,
-- AppUpgrade U2-008, ST-T1-E1). Owner decision 2026-09-30: create the table.
--
-- Until now a company's zone scheme (zone names with top and base ages and
-- the calibration they come from) lived in one browser's localStorage, so a
-- team could not date biozones from one agreed calibration and the scheme
-- was not in a .pld project package. One row per scheme per organisation.
--
-- Access (product table, no change to any shared table):
--   read            every member of the organisation (is_org_member)
--   add             any member, stamped as the creator
--   change, delete  the creator, or an organisation admin (is_org_admin_of)
-- anon has no access. RLS uses only the SECURITY DEFINER membership helpers
-- (membership consolidation rule, 2026-07-13).
--
-- Idempotent; no transaction lines (the caller wraps it).

create table if not exists public.strat_zone_schemes (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations (id) on delete cascade,
    name            text not null check (length(btrim(name)) between 1 and 120),
    source          text not null check (length(btrim(source)) between 1 and 500),
    chart_version   text,                                  -- ICS chart edition the ages follow, e.g. '2026/06'
    zones           jsonb not null default '[]'::jsonb     -- [{zone, top_ma, base_ma}], base older than top
                    check (jsonb_typeof(zones) = 'array'),
    notes           text,
    created_by      uuid default auth.uid() references auth.users (id) on delete set null,  -- null once the creator's account is deleted: admins manage the row
    app_build       text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

comment on table public.strat_zone_schemes is
    'Stratigraphy Studio organisation-wide biozone schemes (U2-008): zone names with top/base ages (Ma) and their calibration source. Members read; any member adds; the creator or an org admin changes or deletes.';

create unique index if not exists strat_zone_schemes_org_name_key
    on public.strat_zone_schemes (organization_id, lower(btrim(name)));
create index if not exists strat_zone_schemes_org_idx
    on public.strat_zone_schemes (organization_id, updated_at desc);

create or replace function public.strat_zone_schemes_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  -- the creator never changes hands; clearing it is allowed so deleting the
  -- creator's account (on delete set null) goes through
  if new.created_by is not null then new.created_by := old.created_by; end if;
  new.organization_id := old.organization_id; -- a scheme never moves between organisations
  return new;
end $$;

drop trigger if exists strat_zone_schemes_touch on public.strat_zone_schemes;
create trigger strat_zone_schemes_touch before update on public.strat_zone_schemes
  for each row execute function public.strat_zone_schemes_touch();

alter table public.strat_zone_schemes enable row level security;

drop policy if exists "strat_zone_schemes_select_member" on public.strat_zone_schemes;
create policy "strat_zone_schemes_select_member" on public.strat_zone_schemes
  for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "strat_zone_schemes_insert_member" on public.strat_zone_schemes;
create policy "strat_zone_schemes_insert_member" on public.strat_zone_schemes
  for insert to authenticated
  with check (public.is_org_member(organization_id) and created_by = auth.uid());

drop policy if exists "strat_zone_schemes_update_owner_or_admin" on public.strat_zone_schemes;
create policy "strat_zone_schemes_update_owner_or_admin" on public.strat_zone_schemes
  for update to authenticated
  using (created_by = auth.uid() or public.is_org_admin_of(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists "strat_zone_schemes_delete_owner_or_admin" on public.strat_zone_schemes;
create policy "strat_zone_schemes_delete_owner_or_admin" on public.strat_zone_schemes
  for delete to authenticated
  using (created_by = auth.uid() or public.is_org_admin_of(organization_id));

-- Supabase default privileges grant new tables to anon and authenticated in
-- full; state the intended privileges explicitly.
revoke all on public.strat_zone_schemes from anon;
revoke all on public.strat_zone_schemes from authenticated;
grant select, insert, update, delete on public.strat_zone_schemes to authenticated;
