-- WT4 cleanup (WellTestAnalysisStudio-STATUS.md, owner approved 2026-07-18):
-- drop the legacy pta_* family behind the deleted mock Well Test Analyzer.
--
-- Live-DB check (WT2 gate, 2026-07-18): pta_files / pta_runs / pta_telemetry
-- are empty; pta_projects holds 2 identical rows of the mock's hardcoded
-- demo output (kh 123.4 md / skin 5.6 / Pi 3510, "Field X Well Test
-- Program", both from the owner's own support/test accounts, March 2026).
-- No repo migration ever created these tables, no repo code references them
-- (the mock was deleted in WT2), and live pg_proc/pg_views show zero
-- dependents; the only FKs are internal to the family. The real studio
-- persists through saved_well_test_projects (20260718160000).
--
-- Discards the 2 mock rows with owner approval. Children first; idempotent.

drop table if exists public.pta_telemetry;
drop table if exists public.pta_files;
drop table if exists public.pta_runs;
drop table if exists public.pta_projects;
