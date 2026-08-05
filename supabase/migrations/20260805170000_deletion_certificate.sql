-- =============================================================================
-- Deletion certificate (offboarding phase 3)
-- -----------------------------------------------------------------------------
-- After a purge completes, the org-offboard edge function issues a Certificate
-- of Data Deletion rendered from org_closure_requests.purge_report: a PDF
-- stored under org-exports/certificates/ and emailed to the requester (their
-- account may no longer exist, so email is the primary delivery).
--
-- The certificate is independently verifiable: /legal/verify-deletion asks
-- for the certificate number AND the verification code (128-bit capability,
-- printed only on the certificate and in the completion email); the
-- org-offboard `verify_certificate` action confirms the attested facts and
-- can mint a short-lived link to re-download the PDF. That verification
-- endpoint is the signature: the facts come from our systems at request time,
-- not from trusting the paper.
-- =============================================================================

alter table public.org_closure_requests
  add column if not exists certificate_no   text,
  add column if not exists verification_code text,
  add column if not exists certificate_path  text;

create unique index if not exists org_closure_requests_certificate_no
  on public.org_closure_requests (certificate_no)
  where certificate_no is not null;

comment on column public.org_closure_requests.certificate_no is
  'Human-readable certificate number (PLD-DC-<year>-<id8>); issued on purge completion.';
comment on column public.org_closure_requests.verification_code is
  'Capability for public verification; printed only on the certificate and completion email.';
comment on column public.org_closure_requests.certificate_path is
  'org-exports object key of the rendered certificate PDF.';
