-- public.subscriptions as in production (columns from the shared baseline;
-- indexes as read on production 2026-09-28: pkey, payment_status,
-- organization_id, (organization_id, status)).
create table public.subscriptions (
  id uuid default gen_random_uuid() not null primary key,
  organization_id uuid not null,
  modules text[] not null,
  user_limit integer not null,
  start_date date,
  end_date date not null,
  term text not null,
  status text default 'pending' not null,
  quote_details jsonb,
  created_at timestamptz default timezone('utc', now()) not null,
  quote_id uuid,
  billing_period text default 'annual',
  updated_at timestamptz default now(),
  next_renewal_date date,
  renewal_status text default 'pending',
  payment_status text,
  bank_transfer_proof_url text
);
create index subscriptions_payment_status_idx on public.subscriptions (payment_status);
create index subscriptions_organization_id_idx on public.subscriptions (organization_id);
create index subscriptions_org_status_idx on public.subscriptions (organization_id, status);
