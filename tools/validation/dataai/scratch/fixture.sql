-- Scratch fixture: just enough of the Suite database to apply the D5
-- metering migrations (20260925200000 and 20260926120000) for real: the
-- anon, authenticated and service_role roles, auth.uid(), auth.users,
-- organizations, and the is_org_member / is_super_admin helpers.
create extension if not exists pgcrypto;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid;
$$;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);

create table if not exists public.organizations (id uuid primary key default gen_random_uuid(), name text);
create table if not exists public.organization_members (
  organization_id uuid references public.organizations(id), user_id uuid, status text default 'active'
);
create or replace function public.is_super_admin() returns boolean language sql stable as $$ select false $$;
create or replace function public.is_org_member(org_id uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.organization_members where organization_id = org_id and user_id = auth.uid() and status = 'active');
$$;
grant execute on function auth.uid(), public.is_super_admin(), public.is_org_member(uuid) to anon, authenticated, service_role;

insert into public.organizations (id, name) values
  ('00000000-0000-4000-8000-0000000000a1', 'Org A'),
  ('00000000-0000-4000-8000-0000000000b1', 'Org B'),
  ('00000000-0000-4000-8000-0000000000c1', 'Org C (concurrency)');
insert into auth.users (id) values
  ('00000000-0000-4000-8000-000000000001'), ('00000000-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-000000000003'), ('00000000-0000-4000-8000-000000000004');
