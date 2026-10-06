-- Stand-ins for the Supabase objects the qi_jobs migration references. Test use only.
create schema if not exists auth;
create table auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create table public.organizations (id uuid primary key);
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
