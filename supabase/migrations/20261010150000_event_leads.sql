-- Event leads (NAPE booth, 2026-10): visitors scan the booth QR code, open
-- petrolord.com/nape, and leave a few details before they are handed over to
-- the Petrolord WhatsApp Business line. A new table: no shared table changes.
--
-- Access:
--   anon and signed-in visitors may INSERT one row at a time, only with
--   consent given and every field within its length; nobody but a platform
--   super admin (public.is_super_admin(), the existing helper the promo code
--   and admin pages use) may read or delete. No update path.
-- Idempotent.

create table if not exists public.event_leads (
  id uuid primary key default gen_random_uuid(),
  event text not null default 'NAPE 2026',
  name text not null,
  phone text not null,
  email text,
  company text,
  role text,
  interests text[] not null default '{}',
  note text,
  consent boolean not null,
  consent_text text not null,
  source text not null default 'qr',
  user_agent text,
  created_at timestamptz not null default now(),
  constraint event_leads_event_len check (char_length(event) between 1 and 60),
  constraint event_leads_name_len check (char_length(name) between 1 and 120),
  constraint event_leads_phone_fmt check (phone ~ '^[1-9][0-9]{7,14}$'),
  constraint event_leads_email_len check (email is null or char_length(email) <= 200),
  constraint event_leads_company_len check (company is null or char_length(company) <= 160),
  constraint event_leads_role_len check (role is null or char_length(role) <= 120),
  constraint event_leads_interests_len check (cardinality(interests) <= 10),
  constraint event_leads_note_len check (note is null or char_length(note) <= 1000),
  constraint event_leads_consent_given check (consent),
  constraint event_leads_consent_text_len check (char_length(consent_text) between 1 and 600),
  constraint event_leads_source check (source in ('qr', 'tablet')),
  constraint event_leads_ua_len check (user_agent is null or char_length(user_agent) <= 300)
);

create index if not exists event_leads_created_idx on public.event_leads (created_at desc);

alter table public.event_leads enable row level security;

drop policy if exists event_leads_insert_visitors on public.event_leads;
create policy event_leads_insert_visitors on public.event_leads
  for insert to anon, authenticated
  with check (consent);

drop policy if exists event_leads_super_admin_read on public.event_leads;
create policy event_leads_super_admin_read on public.event_leads
  for select to authenticated
  using (public.is_super_admin());

drop policy if exists event_leads_super_admin_delete on public.event_leads;
create policy event_leads_super_admin_delete on public.event_leads
  for delete to authenticated
  using (public.is_super_admin());

-- table privileges: visitors insert only; reads and deletes go through the
-- super-admin policies above
revoke all on public.event_leads from anon, authenticated;
grant insert on public.event_leads to anon, authenticated;
grant select, delete on public.event_leads to authenticated;
