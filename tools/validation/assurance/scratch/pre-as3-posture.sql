-- The tables as the live database has them: the columns the app reads,
-- RLS on with a `for all to public` is_org_member policy, and the full
-- anon CRUD grant AS1b found. This is the pre-AS3 posture.
create table public.regulatory_authorities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  name text not null,
  acronym text, jurisdiction text, contact_name text,
  email text, phone text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table public.regulatory_obligations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  authority_id uuid references public.regulatory_authorities(id),
  owner_id uuid, title text not null, facility text,
  due_date date, status text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
alter table public.regulatory_authorities enable row level security;
alter table public.regulatory_obligations enable row level security;
create policy "Org Access Authorities" on public.regulatory_authorities
  as permissive for all to public using (public.is_org_member(org_id));
create policy "Org Access Obligations" on public.regulatory_obligations
  as permissive for all to public using (public.is_org_member(org_id));
grant all on public.regulatory_authorities, public.regulatory_obligations
  to anon, authenticated;
