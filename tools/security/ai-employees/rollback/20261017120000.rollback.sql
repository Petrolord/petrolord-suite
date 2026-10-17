-- Rollback of 20261017120000_ai_email_marketer.sql (the email marketer's
-- register row). The migration changed no constraint, so only the row goes.
--
-- CAUTION: ai_employee_tasks and ai_employee_actions reference the employee
-- with on delete cascade, so deleting the row also deletes its drafts and its
-- action log. To stop the employee without losing the record, pause it
-- instead (the switch at /admin/ai-employees, or the update below).
--   update public.ai_employees set status = 'paused' where slug = 'email-marketer';
-- Idempotent; no transaction lines.
delete from public.ai_employees where slug = 'email-marketer';
