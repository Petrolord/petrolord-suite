-- Rollback of 20261017100000_suite_user_journey.sql (Guided Journey, stage 1).
-- Drops only what the migration created; no other table is touched.
-- Idempotent; no transaction lines.
drop function if exists public.suite_journey_mark(text, text);
drop function if exists public.suite_journey_set(text, text[], text);
drop function if exists public.suite_journey_state(uuid, text[]);
drop function if exists public.suite_journey_me();
drop function if exists public.suite_journey_has_row(text, text, uuid);
drop table if exists public.suite_journey_work_sources;
drop table if exists public.suite_user_journey;
drop function if exists public.suite_journey_disciplines();
