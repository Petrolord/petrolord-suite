-- payments was born Paystack-only: paystack_reference is NOT NULL, which makes
-- every Stripe payment insert fail (silently, since the edge fns didn't check
-- the insert error). The reference for a Stripe payment lives in
-- stripe_session_id / stripe_payment_intent instead.
-- organization_id and quote_id stay NOT NULL: every payment must belong to an
-- org and a quote regardless of provider; the Stripe fns now supply them.

alter table public.payments alter column paystack_reference drop not null;
