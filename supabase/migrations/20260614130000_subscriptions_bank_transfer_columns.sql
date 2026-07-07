-- =============================================================================
-- Bank-transfer payment flow: add the columns the admin verification UI reads.
-- -----------------------------------------------------------------------------
-- src/pages/admin/AdminOrganizations.jsx already filters subscriptions on
--   s.payment_status === 'PENDING'   (line ~108)
-- and renders
--   pendingSub.bank_transfer_proof_url   (line ~196)
-- but neither column existed on public.subscriptions, so the "Verify" dialog
-- could never appear. These columns let the manual bank-transfer loop work:
--   verify-bank-transfer  -> sets payment_status='PENDING' + proof url
--   activate-bank-transfer-> sets payment_status='COMPLETED'
--   reject-bank-transfer  -> sets payment_status='REJECTED'
--
-- Note: subscriptions.status (NOT NULL, default 'pending') is the subscription
-- *lifecycle* (pending/active/past_due/suspended) used by renewals. payment_status
-- is the *payment* state for the admin queue — intentionally separate.
-- =============================================================================

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS bank_transfer_proof_url text;

-- Speeds up the admin queue lookup of orgs awaiting verification.
CREATE INDEX IF NOT EXISTS idx_subscriptions_payment_status
  ON public.subscriptions (payment_status);
