-- ReservoirCalc Pro project save was broken: the legacy Horizons-era
-- saved_quickvol_projects table predates 20260708150000 (whose
-- `create table if not exists` was therefore a no-op) and carries two
-- NOT NULL columns the app never sends:
--   * mode          — legacy QuickVol field, no default
--   * results_data  — the app legitimately saves projects with no run yet
-- Every insert failed 23502, so the table has always been empty (verified
-- 0 rows live before this migration).
--
-- Relax the legacy shape: mode gets a default (the app now also sends its
-- calc method), results_data becomes nullable. Both statements are
-- idempotent.

alter table public.saved_quickvol_projects
    alter column mode set default 'deterministic';

alter table public.saved_quickvol_projects
    alter column results_data drop not null;
