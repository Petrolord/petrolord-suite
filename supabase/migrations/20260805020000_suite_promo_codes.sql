-- Suite promo codes: self-serve percentage discounts for early adopters
-- (e.g. FOUNDING50, capped at the first N organizations). Provider-agnostic
-- by design: the discount is applied inside generate-quote (the server-
-- authoritative pricing engine), so it works identically for Stripe,
-- Paystack and bank-transfer payments. Modeled on the proven NextGen
-- bridge-code flow: validate at quote time, burn at payment provisioning.
--
-- Service-role only: RLS enabled with no policies. Codes are created by
-- sales via SQL for now (an admin UI is future scope); customers interact
-- with them only through the verify-promo-code / generate-quote functions.

create table if not exists public.suite_promo_codes (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,             -- stored UPPERCASE
  percent         numeric not null check (percent > 0 and percent <= 100),
  scope           text not null default 'all',      -- 'all' or a master_apps.module name
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  redeemed_count  integer not null default 0,
  expires_at      timestamptz,
  active          boolean not null default true,
  notes           text,
  created_at      timestamptz not null default now()
);

alter table public.suite_promo_codes enable row level security;

-- Atomic redemption counter (service-role only; the optimistic-update
-- alternative can undercount under concurrent redemptions).
create or replace function public.increment_promo_redemption(p_code text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.suite_promo_codes
     set redeemed_count = redeemed_count + 1
   where code = upper(trim(p_code));
$$;

revoke all on function public.increment_promo_redemption(text) from public, anon, authenticated;

-- Snapshot columns on quotes (mirrors the bridge_* column family): the quote
-- records what was promised at quote time; redemption is stamped on payment.
alter table public.quotes add column if not exists promo_code text;
alter table public.quotes add column if not exists promo_scope text;
alter table public.quotes add column if not exists promo_discount_pct numeric;
alter table public.quotes add column if not exists promo_discount_amount numeric;
alter table public.quotes add column if not exists promo_redeemed_at timestamptz;
