-- Project Portability PP5 (docs/scope/ProjectPortability-PLAN.md §4.7):
-- the export ledger behind manifest signatures and Certificates of Export.
--
-- One row per signed .pld package: who exported it, when, the canonical
-- manifest digest the signature covers, the certificate number
-- (PLD-EX-<year>-<id8>, deterministic from the package id) and the
-- verification code the public verify page asks for. Written only by the
-- pld-sign edge function (service role); owners can read their own rows.
-- The certificate PDF lives in the private org-exports bucket at
-- pld-certificates/{package_id}.pdf and is served by signed URL.

create table if not exists public.pld_exports (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  organization_name text,
  exporter_email text,
  package_name text,
  exported_at timestamptz not null,
  platform_sha text,
  manifest_digest text not null,
  signature_key_id text,
  signature_value text,
  certificate_no text not null,
  verification_code uuid not null default gen_random_uuid(),
  certificate_path text,
  tables jsonb not null default '{}'::jsonb,
  blobs integer not null default 0,
  parts integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists pld_exports_certificate_no on public.pld_exports (certificate_no);
create index if not exists pld_exports_user_idx on public.pld_exports (user_id, created_at desc);

alter table public.pld_exports enable row level security;

drop policy if exists pld_exports_owner_read on public.pld_exports;
create policy pld_exports_owner_read on public.pld_exports
  for select to authenticated
  using (user_id = auth.uid());

comment on table public.pld_exports is 'PP5: signed .pld exports with their Certificate of Export number and verification code.';
