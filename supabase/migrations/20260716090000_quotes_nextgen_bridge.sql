-- NextGen Expert bridge: Suite-side checkout redemption (owner Q3,
-- locked 2026-07-15). An Expert certification in the NextGen Academy
-- auto-issues a personal, single-use 50% discount code for the
-- certified Suite module (NextGen table academy_suite_bridge_codes).
-- The Suite checkout verifies the code at quote time via the NextGen
-- anon RPC academy_verify_bridge_code and redeems it server-to-server
-- via academy_redeem_bridge_code after payment succeeds.
--
-- This migration adds the quote-side snapshot columns. The code and
-- its lifecycle live in the NextGen project; the Suite only records
-- what was verified, what was discounted, and the redemption outcome.
--
-- bridge_discount_amount is the MONTHLY discount line value in major
-- units (the quote's per-month line item, before the term discount and
-- the term multiplier), matching how generate-quote builds line items.

alter table public.quotes
  add column if not exists bridge_code            text,
  add column if not exists bridge_module          text,
  add column if not exists bridge_discount_pct    integer,
  add column if not exists bridge_discount_amount numeric,
  add column if not exists bridge_redeemed_at     timestamptz,
  add column if not exists bridge_redemption      jsonb;

comment on column public.quotes.bridge_code is
  'NextGen Expert bridge code (PLB-...) applied to this quote; verified against the NextGen project at quote time, redeemed server-to-server on payment.';
comment on column public.quotes.bridge_redemption is
  'Raw academy_redeem_bridge_code response recorded at payment finalization. Non-null means a redemption attempt completed (idempotency guard for the finalizers).';
