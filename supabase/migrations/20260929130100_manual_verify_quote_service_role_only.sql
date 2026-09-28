-- =============================================================================
-- manual_verify_quote: callable by the service role only
-- -----------------------------------------------------------------------------
-- HELD: owner + second-engineer review (payment path). NOT YET APPLIED.
-- Independent of 20260929130000; either can be applied without the other.
--
-- Found 2026-09-28 while tracing renewals: manual_verify_quote is SECURITY
-- DEFINER and its ACL grants EXECUTE to PUBLIC, anon and authenticated. It does
-- not check that the quote was paid. A signed-in customer who has generated a
-- quote knows its text id and their own organization id, so
-- supabase.rpc('manual_verify_quote', {...}) from the browser grants every app
-- on that quote without paying. No browser code calls it: every caller
-- (verify-paystack-payment, paystack-webhook, activate-bank-transfer,
-- _shared/provision-quote.ts used by the Stripe functions) uses the service
-- role key. Idempotent (REVOKE/GRANT are no-ops when already in that state).
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.manual_verify_quote(text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.manual_verify_quote(text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.manual_verify_quote(text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.manual_verify_quote(text, uuid) TO service_role;
