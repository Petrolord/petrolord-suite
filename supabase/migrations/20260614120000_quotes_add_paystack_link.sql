-- Persist the Paystack hosted-checkout link and transaction reference on each quote.
--
-- generate-quote now calls Paystack's transaction/initialize API server-side and
-- stores the resulting authorization_url here so QuoteDashboard can render a real
-- "Pay Now with Paystack" button (previously it built a fabricated /pay/generic URL
-- only in the function response, which was never persisted -> "Payment link
-- unavailable"). paystack_reference is set to the quote_id at initialize time so
-- verify-paystack-payment can verify the transaction by quote id.

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS paystack_link text,
  ADD COLUMN IF NOT EXISTS paystack_reference text;
