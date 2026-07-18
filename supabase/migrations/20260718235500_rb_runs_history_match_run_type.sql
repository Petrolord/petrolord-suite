-- MB5 (2026-07-18): Material Balance Studio pressure history match.
-- rb_runs.run_type gains the 'history_match' value so history-match runs are
-- recorded as what they are instead of masquerading as 'single' regression
-- runs. Backward compatible: existing values remain valid.
-- Idempotent: drop-if-exists + re-add.

alter table public.rb_runs drop constraint if exists rb_runs_run_type_check;
alter table public.rb_runs add constraint rb_runs_run_type_check
  check (run_type = any (array[
    'single'::text,
    'sensitivity'::text,
    'monte_carlo'::text,
    'history_match'::text
  ]));
