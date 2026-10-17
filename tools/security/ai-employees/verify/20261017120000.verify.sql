-- Verify 20261017120000_ai_email_marketer.sql. Read-only.
-- Expect: rows=1, step=1, status=active, manager and next manager as below,
-- review_in_days between 29 and 31 (on the day of the apply), kind_check_ok=true.
select
  count(*) as rows,
  max(autonomy_step) as step,
  max(status) as status,
  max(manager_email) as manager,
  max(next_manager_email) as next_manager,
  max(extract(day from next_review_at - now()))::int as review_in_days,
  (select 'email_campaign' ~ '^[a-z][a-z0-9_]{1,63}$') as kind_check_ok
from public.ai_employees
where slug = 'email-marketer';
