-- HSE Professional expiry reminder emails.
--
-- Companion to 20260810230000 (lapse sweep): the sweep silently downgrades
-- lapsed orgs; this adds the two warning emails in front of it, sent by the
-- hse-expiry-reminders edge function:
--   1. renewal reminder — within 7 days of subscriptions.end_date
--   2. expiry notice — end_date passed, 3-day grace running
-- The stamp columns make sends idempotent (stamped only after a provider
-- accepts the message, so failed sends retry on the next daily run).
--
-- Scheduling: pg_cron + pg_net POST to the edge function daily at 06:30 UTC.
-- The Authorization bearer is the project anon key (public by design — it
-- ships in every SPA bundle); the function itself is harmless to re-invoke.

alter table subscriptions add column if not exists renewal_reminder_sent_at timestamptz;
alter table subscriptions add column if not exists expiry_notice_sent_at timestamptz;

create extension if not exists pg_net;

select cron.schedule(
  'hse-expiry-reminders',
  '30 6 * * *',
  $job$
    select net.http_post(
      url := 'https://ssyckywijlrkgcwvkwlr.supabase.co/functions/v1/hse-expiry-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzeWNreXdpamxya2djd3Zrd2xyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEzMTQwMTYsImV4cCI6MjA2Njg5MDAxNn0.37eckNOnwyE7MimpqBNYddf8pECEtkSiVHVaNv93ZUw'
      ),
      body := '{}'::jsonb
    );
  $job$
);
