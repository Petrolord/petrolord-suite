-- Scratch fixture reproducing just enough of the Suite database to run
-- the AS3 migration and its RLS pentest for real. Rebuilt from the AS1
-- method (Assurance-ROADMAP, "Method that worked").
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then
    create role authenticated nologin;
  end if;
end $$;
grant usage on schema public to anon, authenticated;

create schema if not exists auth;
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json->>'sub','')::uuid;
$$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),
  user_id uuid,
  role text,
  status text default 'active',
  joined_at timestamptz default now()
);

create or replace function public.my_org_id() returns uuid
language sql stable security definer set search_path to 'public' as $$
  select organization_id from public.organization_members
   where user_id = auth.uid() and status = 'active'
   order by joined_at limit 1;
$$;

create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path to 'public' as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true)::json->>'super','')::boolean,
    false);
$$;

create or replace function public.is_org_member(p_org uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.organization_members
                  where organization_id = p_org and user_id = auth.uid()
                    and status = 'active');
$$;

grant execute on function auth.uid(), public.my_org_id(),
  public.is_super_admin(), public.is_org_member(uuid) to anon, authenticated;

-- AS4: the AS1 schema backfill has foreign keys into auth.users, so the
-- fixture needs the table as well as auth.uid().
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);

-- And `public.users`: several AS1 foreign keys are written unqualified
-- as `REFERENCES users(id)`, which resolves through search_path to the
-- public table, not to auth.users.
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text
);
