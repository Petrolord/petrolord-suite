-- AS1b — the three assurance tables the AS1 sweep missed.
--
-- AS1 audited every table matching ^(risk_|moc_|doc_|compliance_) and
-- revoked `anon` on all of them. Three tables the module actually uses
-- do not match that pattern and were left alone. Found while auditing
-- Regulatory Compliance for AS3.
--
--   regulatory_obligations   the obligation register itself. The only
--                            genuinely working compliance app in the
--                            module reads and writes it
--                            (complianceRecordsService).
--   regulatory_authorities   the regulator directory beside it.
--   audit_logs               written by SupabaseService and
--                            AdminOrganizationContext, read by the org
--                            admin console. Not an Assurance app, but it
--                            is the platform's audit trail, which is the
--                            worst possible table to leave writable.
--
-- All three DO have RLS enabled with policies, unlike the twenty-three
-- AS1 closed, so this is not an open door. It is the same
-- belt-and-braces AS1 applied to the parent registers: their policies
-- are written FOR ROLE public rather than authenticated, so `anon` is
-- held out only by auth.uid() being null inside the predicate. That is
-- one refactor away from being load bearing.
--
-- `anon` is the role behind the publishable key in the production
-- bundle. Nothing here is public.
--
-- Read live 2026-09-16: all three carry
-- SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER to anon.
-- All three are empty today.
--
-- Also recorded here, because AS3 and the ISO/QA/Lessons waves need it:
-- there are NO iso_*, qa_*, ncr*, lesson* or finding* tables in the
-- database at all. ISO Compliance, Quality Assurance Plan and Lessons
-- Learned do not merely fail to write; they have nowhere to write to.
-- Their waves create schema, they do not just wire up an app.
--
-- Idempotent.

begin;

revoke all on table
  public.regulatory_obligations,
  public.regulatory_authorities,
  public.audit_logs
from anon;

commit;
