-- Stripe payment support (additive, non-breaking).
-- Petrolord runs three payment rails side by side:
--   * Stripe        -> international customers, real USD (foreign entity)
--   * Paystack      -> local Nigerian customers, NGN
--   * bank transfer -> offline / enterprise
-- These columns let a quote/payment record which rail it used and carry the
-- Stripe identifiers. All nullable so existing Paystack/bank-transfer rows are
-- untouched.

-- Quote: the Stripe Checkout Session created for it (mirrors paystack_link/_reference).
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS stripe_session_id  text,
  ADD COLUMN IF NOT EXISTS stripe_checkout_url text;

-- Payment: which provider settled it, plus Stripe references.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS provider            text,   -- 'stripe' | 'paystack' | 'bank_transfer'
  ADD COLUMN IF NOT EXISTS stripe_session_id   text,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent text,
  ADD COLUMN IF NOT EXISTS stripe_customer_id  text;

-- Idempotency: verify-stripe-payment / stripe-webhook look a payment up by session id.
CREATE UNIQUE INDEX IF NOT EXISTS payments_stripe_session_id_key
  ON public.payments (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;
