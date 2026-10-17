-- AI employees: the email marketer (owner approved 2026-10-17). Petrolord's
-- second AI employee, in shadow mode like the YouTube channel manager: it
-- drafts each email (subject, preheader, HTML and text, audience, scheduled
-- time) as a task in the approval queue, and nothing is sent until a person
-- approves it at /admin/ai-employees.
--
-- The task kinds it uses (email_campaign, email_newsletter, email_onboarding)
-- already pass ai_employee_tasks_kind, which checks only the format
-- (^[a-z][a-z0-9_]{1,63}$), so no constraint changes here. This file only
-- adds the register row.
--
-- Product tables only (ai_*); no shared table is touched. Idempotent: the
-- seed inserts on conflict do nothing. No transaction wrapper in this file.
-- Rollback: tools/security/ai-employees/rollback/20261017120000.rollback.sql
-- Verify:   tools/security/ai-employees/verify/20261017120000.verify.sql

insert into public.ai_employees (
  slug, role_title, purpose, manager_email, next_manager_email,
  autonomy_step, status, started_at, next_review_at, access_notes
) values (
  'email-marketer',
  'Email marketer',
  'Drafts Petrolord marketing emails for approval: the NAPE 2026 series first, then a monthly newsletter, then welcome and guidance emails for new Suite, HSE and NextGen users. Shadow mode: it proposes and a human approves every email before anything is sent.',
  'ayoasaolu@lordswayenergy.com',
  'seyiojo@lordswayenergy.com',
  1,
  'active',
  now(),
  now() + interval '30 days',
  'Brevo API v3 through a key held root-only on the studio box (/root/.ai-employees.env, BREVO_API_KEY). Sender Petrolord <info@lordswayenergy.com>, reply-to the same. Audiences: the Brevo list of NAPE opt-ins and NAPE 2026 leads (event_leads) with consent and an email, nothing else. Reads event_leads (consenting rows with an email) with the service role; writes proposals to ai_employee_tasks; creates Brevo campaigns only for tasks a super admin approved.'
)
on conflict (slug) do nothing;
