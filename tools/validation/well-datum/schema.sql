-- Minimal Supabase stand-ins for the well datum dry run (scratch Postgres
-- only): roles, auth.users + auth.uid(), organizations, the membership
-- helper, and public.geo_wells with the columns, constraints, policies and
-- grants read from the live database on 2026-10-02, holding the 13 live
-- wells' names, kb_m and units_note (nothing else of theirs).
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema if not exists auth;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;
create table auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated;
create table public.organizations (id uuid primary key, name text);
create table public.organization_members (
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text, status text default 'active');
create or replace function public.is_org_member(org_id uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.organization_members om
    where om.organization_id = is_org_member.org_id and om.user_id = auth.uid()
      and coalesce(lower(om.status), 'active') = 'active');
$$;
alter default privileges in schema public grant all on tables to anon, authenticated;

create table public.geo_wells (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  name text not null,
  uwi text,
  surface_x double precision not null,
  surface_y double precision not null,
  kb_m double precision not null default 0,
  td_md_m double precision,
  crs_note text,
  units_note text,
  deviation jsonb not null default '[]'::jsonb,
  checkshots jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  crs text,
  xy_unit text,
  crs_provenance jsonb,
  checkshots_derived jsonb,
  schema_version integer not null default 1,
  app_build text,
  engine_version text,
  checkshots_provenance jsonb,
  status text,
  constraint geo_wells_status_check check (status is null or status = any (array['planned','drilling','oil','gas','oil_gas','water','dry','injector_water','injector_gas','suspended','abandoned']))
);
alter table public.geo_wells enable row level security;
create policy geo_wells_select_own_or_org on public.geo_wells for select
  using (auth.uid() = user_id or (organization_id is not null and public.is_org_member(organization_id)));
create policy geo_wells_insert_own on public.geo_wells for insert
  with check (auth.uid() = user_id and (organization_id is null or public.is_org_member(organization_id)));
create policy geo_wells_update_own on public.geo_wells for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and (organization_id is null or public.is_org_member(organization_id)));
create policy geo_wells_delete_own on public.geo_wells for delete using (auth.uid() = user_id);

insert into auth.users values ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000b1');
insert into public.geo_wells (user_id, name, surface_x, surface_y, kb_m, units_note) values
  ('00000000-0000-0000-0000-0000000000a1', 'Alaoma-1', 1, 1, 1, null),
  ('00000000-0000-0000-0000-0000000000a1', 'Alaoma-2', 1, 1, 2, null),
  ('00000000-0000-0000-0000-0000000000a1', 'Barracuda_BX-01', 1, 1, 62.01, 'LAS depth unit ft -> m (SI internal)'),
  ('00000000-0000-0000-0000-0000000000a1', 'Lad', 1, 1, 0, 'Deviation: MD metres, azimuths grid north.'),
  ('00000000-0000-0000-0000-0000000000a1', 'Assa 7', 1, 1, 56.0832, 'entered: KB/TD ft, checkshots MD m OWT; stored SI'),
  ('00000000-0000-0000-0000-0000000000a1', 'Assa 7.1', 1, 1, 56.083, 'entered: KB/TD ft, deviation MD ft, tops MD ft, checkshots MD ft OWT; stored SI'),
  ('00000000-0000-0000-0000-0000000000a1', 'BX-1New', 1, 1, 62.01, 'LAS depth unit FT -> m (SI internal)'),
  ('00000000-0000-0000-0000-0000000000a1', 'Assa-06', 1, 1, 56.287416, 'entered: KB/TD ft, deviation MD ft, tops MD ft, checkshots MD ft OWT; stored SI'),
  ('00000000-0000-0000-0000-0000000000a1', 'Barracuda_BX-1', 1, 1, 62.01, 'LAS depth unit ft -> m (SI internal)'),
  ('00000000-0000-0000-0000-0000000000a1', 'Barracuda BX-1', 1, 1, 18.901, 'LAS depth unit FT -> m (SI internal)'),
  ('00000000-0000-0000-0000-0000000000a1', 'Petrolord', 1, 1, 1.998, 'entered: checkshots MD m OWT; stored SI'),
  ('00000000-0000-0000-0000-0000000000a1', 'Petrolord 1', 1, 1, 18.8997, 'entered: checkshots MD m OWT; stored SI'),
  ('00000000-0000-0000-0000-0000000000a1', 'W-3', 1, 1, 7.06063104, 'entered: KB/TD ft; stored SI');
