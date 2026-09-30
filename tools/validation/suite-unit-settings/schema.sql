-- Minimal Supabase stand-ins for the suite_unit_settings dry run (scratch
-- Postgres only): roles, auth.users + auth.uid(), organizations,
-- organization_members and the SECURITY DEFINER membership helpers exactly
-- as 20260713300000_membership_consolidation.sql defines them.
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
create or replace function public.has_org_role(org_id uuid, roles text[]) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.organization_members om
    where om.organization_id = has_org_role.org_id and om.user_id = auth.uid()
      and coalesce(lower(om.status), 'active') = 'active' and om.role = any (has_org_role.roles));
$$;
create or replace function public.is_org_admin_of(check_org_id uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select public.has_org_role(check_org_id, array['owner','admin','org_admin','super_admin']);
$$;
-- Supabase's default privileges: new public tables are granted in full
alter default privileges in schema public grant all on tables to anon, authenticated;
