-- EPE Wave A (finding 1.8): run status + error capture.
-- docs/scope/EPE-Industry-Audit.md Band 1. Before this, a failed engine call
-- deleted the epe_runs row (audit-trail loss); now runs carry a status and
-- failed runs keep their row with the engine's error message.
--
-- Backfill semantics: every pre-existing row is a completed run (failures
-- were deleted), so the default 'complete' is also the correct backfill.

alter table public.epe_runs
  add column if not exists status text not null default 'complete'
    check (status in ('running', 'complete', 'failed')),
  add column if not exists error_message text;

comment on column public.epe_runs.status is
  'running | complete | failed. Wave A: failed runs are kept, not deleted.';
comment on column public.epe_runs.error_message is
  'Engine error detail for failed runs (null otherwise).';
