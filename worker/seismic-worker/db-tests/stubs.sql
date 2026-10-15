-- Stand-ins for the Supabase objects the qi_jobs migration references. Test use only.
create schema if not exists auth;
create table auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create table public.organizations (id uuid primary key, name text);
create or replace function public.is_org_member(o uuid) returns boolean language sql stable as $$ select o = '00000000-0000-0000-0000-0000000000aa'::uuid $$;
do $$ begin
  create role anon; create role authenticated; create role service_role;
exception when duplicate_object then null; end $$;
grant usage on schema public, auth to anon, authenticated, service_role;
insert into auth.users values ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');
insert into public.organizations values ('00000000-0000-0000-0000-0000000000aa');
-- Supabase grants every new public table to these roles by default; mirror it
-- so the migration's revokes are actually tested.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
create table if not exists public.organization_members (organization_id uuid, user_id uuid, status text);
insert into public.organizations values ('00000000-0000-0000-0000-0000000000bb') on conflict do nothing;
-- Supabase storage and pricing_config stand-ins (seismic storage pool, 2026-10-06)
create schema if not exists storage;
create table storage.objects (bucket_id text, name text, metadata jsonb);
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant usage on schema storage to anon, authenticated, service_role;
create table if not exists public.pricing_config (key text primary key, value jsonb);
update public.organizations set name = 'Org BB' where id = '00000000-0000-0000-0000-0000000000bb';
-- seismic_volumes stand-in for the local workspace migration (20261016100000):
-- the columns and the owner-or-org read rule the replica policies lean on
create table if not exists public.seismic_volumes (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, name text not null default 'v',
  status text not null default 'ready', organization_id uuid);
alter table public.seismic_volumes enable row level security;
create policy "seismic_volumes_select_own_or_org" on public.seismic_volumes for select
  using (auth.uid() = user_id or (organization_id is not null and public.is_org_member(organization_id)));
